import OpenAI from "openai";
import { db } from "@workspace/db";
import { sessionsTable, eventsTable, artifactsTable, modelSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 10_000;
const MAX_PAYLOAD_CHARS = 2_000;

async function getModelSettings() {
  const rows = await db.select().from(modelSettingsTable).limit(1);
  return rows[0] ?? null;
}

function buildPrompt(
  objective: string,
  source: string,
  eventType: string,
  title: string,
  payload: unknown,
): string {
  const payloadStr = JSON.stringify(payload, null, 2).slice(0, MAX_PAYLOAD_CHARS);

  if (objective === "diagnose") {
    return `You are an expert SRE. Analyze this inbound engineering event and produce a concise diagnosis.

Source: ${source}
Event type: ${eventType}
Title: ${title}
Payload:
${payloadStr}

Respond with:
1. Root cause assessment
2. Severity justification
3. Recommended immediate actions
4. Estimated resolution time

Be concise (max 300 words). On the very last line write exactly: CONFIDENCE: <0.0–1.0>`;
  }

  return `You are an expert engineering project manager. Analyze this ticket/task and produce an action plan.

Source: ${source}
Event type: ${eventType}
Title: ${title}
Payload:
${payloadStr}

Respond with:
1. Objective summary
2. Key tasks (numbered)
3. Dependencies or blockers
4. Estimated complexity (Low / Medium / High)

Be concise (max 300 words). On the very last line write exactly: CONFIDENCE: <0.0–1.0>`;
}

function parseOutput(text: string): { summary: string; confidence: number } {
  const match = text.match(/CONFIDENCE:\s*([\d.]+)\s*$/im);
  const confidence = match
    ? Math.min(1, Math.max(0, parseFloat(match[1])))
    : 0.75;
  const summary = text.replace(/CONFIDENCE:\s*[\d.]+\s*$/im, "").trim();
  return { summary, confidence };
}

async function processSession(sessionId: number): Promise<void> {
  await db
    .update(sessionsTable)
    .set({ status: "running", updated_at: new Date() })
    .where(eq(sessionsTable.id, sessionId));

  const [row] = await db
    .select({ session: sessionsTable, event: eventsTable })
    .from(sessionsTable)
    .leftJoin(eventsTable, eq(sessionsTable.event_id, eventsTable.id))
    .where(eq(sessionsTable.id, sessionId));

  if (!row?.event) {
    await db
      .update(sessionsTable)
      .set({ status: "failed", updated_at: new Date() })
      .where(eq(sessionsTable.id, sessionId));
    logger.warn({ sessionId }, "Session has no associated event — marked failed");
    return;
  }

  const settings = await getModelSettings();

  if (!settings?.api_key) {
    await db
      .update(sessionsTable)
      .set({ status: "pending", updated_at: new Date() })
      .where(eq(sessionsTable.id, sessionId));
    logger.warn(
      { sessionId },
      "No API key in model settings — session left pending until key is configured",
    );
    return;
  }

  const { session, event } = row;
  const model =
    session.objective === "plan"
      ? (settings.plan_model ?? "gpt-4o")
      : (settings.triage_model ?? "gpt-4o-mini");

  const client = new OpenAI({
    apiKey: settings.api_key,
    baseURL: settings.base_url ?? undefined,
  });

  const prompt = buildPrompt(
    session.objective,
    event.source,
    event.event_type,
    event.title ?? "Untitled",
    event.payload_raw,
  );

  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1024,
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  const { summary, confidence } = parseOutput(raw);

  await db
    .update(sessionsTable)
    .set({
      status: "needs_review",
      output_summary: summary,
      confidence_score: confidence,
      model_used: model,
      updated_at: new Date(),
    })
    .where(eq(sessionsTable.id, sessionId));

  const artifactType = session.objective === "plan" ? "action_plan" : "diagnosis";
  await db.insert(artifactsTable).values({
    session_id: sessionId,
    type: artifactType,
    content: summary,
    approval_state: "draft",
  });

  await db
    .update(eventsTable)
    .set({ status: "needs_review" })
    .where(eq(eventsTable.id, event.id));

  logger.info({ sessionId, model, confidence }, "Session completed → needs_review");
}

async function pollPendingSessions(): Promise<void> {
  try {
    const pending = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.status, "pending"))
      .limit(5);

    for (const session of pending) {
      try {
        await processSession(session.id);
      } catch (err) {
        logger.error({ err, sessionId: session.id }, "Failed to process session");
        try {
          await db
            .update(sessionsTable)
            .set({ status: "failed", updated_at: new Date() })
            .where(eq(sessionsTable.id, session.id));
        } catch (dbErr) {
          logger.error({ dbErr }, "Failed to mark session as failed");
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "Agent worker poll error");
  }
}

export function startAgentWorker(): void {
  logger.info("Agent worker started — polling every 10s for pending sessions");
  void pollPendingSessions();
  setInterval(() => void pollPendingSessions(), POLL_INTERVAL_MS);
}
