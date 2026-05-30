import OpenAI from "openai";
import { db } from "@workspace/db";
import { sessionsTable, sessionStepsTable, artifactsTable, eventsTable, integrationsTable, modelSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { GITHUB_TOOLS, executeToolCalls, type ToolCall, type ToolResult } from "./github-tools";

const MAX_STEPS = 10;
const MAX_PAYLOAD_CHARS = 2_000;

interface StepRecord {
  role: "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  tool_name?: string;
  tool_result?: unknown;
}

async function getModelSettings() {
  const rows = await db.select().from(modelSettingsTable).limit(1);
  return rows[0] ?? null;
}

async function getGithubToken(): Promise<string | undefined> {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.provider, "github"));
    if (row?.enabled && row.api_key) {
      return row.api_key;
    }
  } catch {
    // ignore
  }
  return undefined;
}

async function persistStep(
  sessionId: number,
  stepNumber: number,
  record: StepRecord,
  model?: string,
  tokensUsed?: number,
) {
  await db.insert(sessionStepsTable).values({
    session_id: sessionId,
    step_number: stepNumber,
    role: record.role,
    content: record.content ?? null,
    tool_calls: record.tool_calls ? record.tool_calls as unknown[] : null,
    tool_call_id: record.tool_call_id ?? null,
    tool_name: record.tool_name ?? null,
    tool_result: record.tool_result ? record.tool_result as unknown[] : null,
    model: model ?? null,
    tokens_used: tokensUsed ?? null,
  });
}

function buildSystemPrompt(): string {
  return `You are an expert SRE and engineering analyst. You have access to GitHub tools to inspect repositories, files, commits, pull requests, and issues.

When you need additional context, use the available tools. For example:
- To understand a bug report, fetch relevant files and recent commits.
- To review a PR, get the PR details and changed files.
- To diagnose a deployment failure, check recent commits and diffs.

Always be concise. Avoid unnecessary tool calls. If the provided event payload is sufficient, answer directly.`;
}

function buildInitialMessages(
  objective: string,
  source: string,
  eventType: string,
  title: string,
  payload: unknown,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const payloadStr = JSON.stringify(payload, null, 2).slice(0, MAX_PAYLOAD_CHARS);

  let userPrompt: string;
  if (objective === "diagnose") {
    userPrompt = `Analyze this inbound engineering event and produce a concise diagnosis.

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
  } else {
    userPrompt = `Analyze this ticket/task and produce an action plan.

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

  return [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: userPrompt },
  ];
}

function parseOutput(text: string): { summary: string; confidence: number } {
  const match = text.match(/CONFIDENCE:\s*([\d.]+)\s*$/im);
  const confidence = match
    ? Math.min(1, Math.max(0, parseFloat(match[1])))
    : 0.75;
  const summary = text.replace(/CONFIDENCE:\s*[\d.]+\s*$/im, "").trim();
  return { summary, confidence };
}

export async function runAgentSession(sessionId: number): Promise<void> {
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
    logger.warn({ sessionId }, "No API key in model settings — session left pending");
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
    defaultHeaders: settings.base_url ? { "HTTP-Referer": "https://oncident.io" } : undefined,
  });

  const githubToken = await getGithubToken();
  const messages = buildInitialMessages(
    session.objective,
    event.source,
    event.event_type,
    event.title ?? "Untitled",
    event.payload_raw,
  );

  // Persist the initial user message as step 0
  await persistStep(sessionId, 0, {
    role: "user",
    content: messages[messages.length - 1].content as string,
  });

  let stepCount = 0;
  let finalText = "";
  let finalConfidence = 0.75;

  try {
    while (stepCount < MAX_STEPS) {
      stepCount++;

      const completion = await client.chat.completions.create({
        model,
        messages,
        tools: GITHUB_TOOLS,
        tool_choice: "auto",
        max_tokens: 2048,
      });

      const choice = completion.choices[0];
      const message = choice.message;
      const tokensUsed = completion.usage?.total_tokens;

      // Persist assistant message
      await persistStep(sessionId, stepCount, {
        role: "assistant",
        content: message.content ?? undefined,
        tool_calls: message.tool_calls as ToolCall[] | undefined,
      }, model, tokensUsed);

      if (message.tool_calls && message.tool_calls.length > 0) {
        // Execute tools
        const toolCalls = message.tool_calls as ToolCall[];
        const toolResults = await executeToolCalls(
          toolCalls,
          githubToken,
          event.payload_raw as Record<string, unknown>,
        );

        // Add assistant message with tool calls to conversation
        messages.push({
          role: "assistant",
          content: message.content ?? null,
          tool_calls: message.tool_calls as OpenAI.Chat.ChatCompletionMessageToolCall[],
        });

        // Add tool results to conversation and persist each
        for (const tr of toolResults) {
          messages.push({
            role: "tool",
            tool_call_id: tr.tool_call_id,
            content: tr.content,
          });

          const matchingCall = toolCalls.find((tc) => tc.id === tr.tool_call_id);
          await persistStep(sessionId, stepCount, {
            role: "tool",
            content: tr.content,
            tool_call_id: tr.tool_call_id,
            tool_name: matchingCall?.function?.name,
            tool_result: tr,
          });
        }
      } else {
        // Final answer — no more tool calls
        finalText = message.content ?? "";
        const parsed = parseOutput(finalText);
        finalText = parsed.summary;
        finalConfidence = parsed.confidence;
        break;
      }
    }

    if (stepCount >= MAX_STEPS) {
      logger.warn({ sessionId }, "Agent reached max steps without final answer");
      finalText = finalText || "Analysis stopped after reaching the maximum number of reasoning steps.";
    }
  } catch (err) {
    logger.error({ err, sessionId }, "Agent loop failed");
    await db
      .update(sessionsTable)
      .set({ status: "failed", updated_at: new Date() })
      .where(eq(sessionsTable.id, sessionId));
    return;
  }

  // Update session with final result
  await db
    .update(sessionsTable)
    .set({
      status: "needs_review",
      output_summary: finalText,
      confidence_score: finalConfidence,
      model_used: model,
      updated_at: new Date(),
    })
    .where(eq(sessionsTable.id, sessionId));

  // Create artifact
  const artifactType = session.objective === "plan" ? "action_plan" : "diagnosis";
  await db.insert(artifactsTable).values({
    session_id: sessionId,
    type: artifactType,
    content: finalText,
    approval_state: "draft",
  });

  // Update event status
  await db
    .update(eventsTable)
    .set({ status: "needs_review" })
    .where(eq(eventsTable.id, event.id));

  logger.info({ sessionId, model, confidence: finalConfidence, steps: stepCount }, "Session completed → needs_review");
}
