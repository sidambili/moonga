import { Router } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { eventsTable, sessionsTable, integrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function verifySlackRequest(signingSecret: string, timestamp: string, rawBody: string, signature: string): boolean {
  const sigBasestring = `v0:${timestamp}:${rawBody}`;
  const mySignature = "v0=" + crypto.createHmac("sha256", signingSecret).update(sigBasestring).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(mySignature, "utf8"), Buffer.from(signature, "utf8"));
  } catch {
    return false;
  }
}

const GITHUB_EVENT_TYPE_MAP: Record<string, string> = {
  issues: "issues",
  pull_request: "pull_requests",
  release: "releases",
};

async function isAllowedGithubEvent(eventHeader: string | undefined): Promise<{ allowed: boolean; reason?: string }> {
  if (!eventHeader) return { allowed: false, reason: "Missing X-GitHub-Event header" };

  const configKey = GITHUB_EVENT_TYPE_MAP[eventHeader];
  if (!configKey) return { allowed: false, reason: `Event type '${eventHeader}' is not supported` };

  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.provider, "github"));
    const config = (row?.config ?? {}) as Record<string, unknown>;
    const eventTypes = (config.event_types ?? {}) as Record<string, boolean>;

    // Default to allowing all if not configured (backward compatible)
    if (Object.keys(eventTypes).length === 0) return { allowed: true };

    if (!eventTypes[configKey]) {
      return { allowed: false, reason: `Event type '${eventHeader}' is disabled in GitHub integration config` };
    }
    return { allowed: true };
  } catch {
    // If DB fails, allow through to avoid dropping events silently
    return { allowed: true };
  }
}

function detectSeverity(source: string, payload: Record<string, unknown>): string {
  if (source === "sentry" || source === "betterstack") {
    const level = (payload.level as string | undefined) || "";
    if (level === "fatal" || level === "critical") return "critical";
    if (level === "error") return "high";
    if (level === "warning") return "medium";
    return "low";
  }
  return "low";
}

function detectEventType(source: string, payload: Record<string, unknown>): string {
  if (source === "github") {
    const action = payload.action as string | undefined;
    if (payload.pull_request) return action === "opened" ? "pr_opened" : "issue_updated";
    if (payload.commits) return "push";
    return "issue_updated";
  }
  if (source === "linear") {
    const action = payload.action as string | undefined;
    return action === "create" ? "ticket_created" : "ticket_updated";
  }
  if (source === "sentry") return "error";
  if (source === "betterstack") return "anomaly";
  if (source === "slack") return "issue_updated";
  return "issue_updated";
}

function extractTitle(source: string, payload: Record<string, unknown>): string {
  if (source === "github" && payload.pull_request) return (payload.pull_request as Record<string, unknown>).title as string || "GitHub PR";
  if (source === "github" && payload.head_commit) return `Push: ${(payload.head_commit as Record<string, unknown>).message as string || "commit"}`;
  if (source === "linear") return (payload.data as Record<string, unknown>)?.title as string || "Linear ticket";
  if (source === "sentry") {
    const err = ((payload.data as Record<string, unknown>)?.error as Record<string, unknown> | undefined);
    return (err?.title as string) || "Sentry error";
  }
  if (source === "betterstack") return "Better Stack alert";
  if (source === "slack") {
    const slackEvent = payload.event as Record<string, unknown> | undefined;
    const rawText = (slackEvent?.text as string | undefined) ?? "";
    const text = rawText.replace(/<@[A-Z0-9]+>\s*/g, "").trim();
    return text.slice(0, 100) || "Slack message";
  }
  return `${source} event`;
}

function getLinearTeamName(payload: Record<string, unknown>): string | undefined {
  const data = payload.data as Record<string, unknown> | undefined;
  const team = data?.team as Record<string, unknown> | undefined;
  return team?.name as string | undefined;
}

async function getLinearConfig(): Promise<{ linear_team_names?: string; default_repo?: string }> {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.provider, "linear"));
    if (row?.config) {
      return row.config as { linear_team_names?: string; default_repo?: string };
    }
  } catch {
    // ignore
  }
  return {};
}

async function isEngineeringTeam(teamName: string | undefined): Promise<boolean> {
  if (!teamName) return false;
  const config = await getLinearConfig();
  const allowed = (config.linear_team_names ?? "Engineering")
    .split(",")
    .map((s) => s.trim().toLowerCase());
  return allowed.includes(teamName.toLowerCase());
}

async function getLinearRepoId(): Promise<string | undefined> {
  const config = await getLinearConfig();
  return config.default_repo || undefined;
}

function shouldProcessLinearEvent(payload: Record<string, unknown>): { process: boolean; reason?: string } {
  const action = payload.action as string | undefined;

  if (action === "create") {
    return { process: true };
  }

  return { process: false, reason: `Linear action '${action}' is not processed — only new issues are handled` };
}

async function ingestWebhook(source: string, payload: Record<string, unknown>, repoId?: string) {
  const eventType = detectEventType(source, payload);
  const severity = detectSeverity(source, payload);
  const title = extractTitle(source, payload);

  const [event] = await db.insert(eventsTable).values({
    source,
    event_type: eventType,
    severity,
    status: "new",
    title,
    repo_id: repoId ?? null,
    payload_raw: payload,
  }).returning();

  const objective = (source === "linear" || eventType === "ticket_created") ? "plan" : "diagnose";

  const [session] = await db.insert(sessionsTable).values({
    event_id: event.id,
    objective,
    status: "pending",
    model_used: null,
  }).returning();

  await db.update(eventsTable).set({ session_id: session.id, status: "processing" }).where(eq(eventsTable.id, event.id)).returning();

  return { event, session };
}

router.post("/github", async (req, res) => {
  const eventHeader = req.headers["x-github-event"] as string | undefined;
  const { allowed, reason } = await isAllowedGithubEvent(eventHeader);
  if (!allowed) {
    return res.status(202).json({ accepted: false, reason });
  }
  const { event, session } = await ingestWebhook("github", req.body);
  return res.status(202).json({ accepted: true, event_id: event.id, message: `Session ${session.id} created` });
});

router.post("/linear", async (req, res) => {
  const teamName = getLinearTeamName(req.body);
  if (!await isEngineeringTeam(teamName)) {
    return res.status(202).json({
      accepted: false,
      reason: `Team '${teamName ?? "unknown"}' is not in the engineering list`,
    });
  }

  const { process, reason } = shouldProcessLinearEvent(req.body);
  if (!process) {
    return res.status(202).json({ accepted: false, reason });
  }

  const { event, session } = await ingestWebhook("linear", req.body, await getLinearRepoId());
  return res.status(202).json({ accepted: true, event_id: event.id, message: `Session ${session.id} created` });
});

router.post("/sentry", async (req, res) => {
  const { event, session } = await ingestWebhook("sentry", req.body);
  res.status(202).json({ accepted: true, event_id: event.id, message: `Session ${session.id} created` });
});

router.post("/betterstack", async (req, res) => {
  const { event, session } = await ingestWebhook("betterstack", req.body);
  res.status(202).json({ accepted: true, event_id: event.id, message: `Session ${session.id} created` });
});

router.post("/slack", async (req, res) => {
  if (req.body.type === "url_verification") {
    return res.json({ challenge: req.body.challenge });
  }

  const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.provider, "slack"));
  if (!row?.enabled) {
    return res.status(202).json({ accepted: false, reason: "Slack integration disabled" });
  }

  const rawBody = (req as unknown as Record<string, unknown> & { rawBody?: string }).rawBody ?? "";
  const signature = req.headers["x-slack-signature"] as string | undefined;
  const timestamp = req.headers["x-slack-request-timestamp"] as string | undefined;

  if (row.webhook_secret && signature && timestamp) {
    const now = Math.floor(Date.now() / 1000);
    const ts = Number(timestamp);
    if (Number.isNaN(ts) || Math.abs(now - ts) > 300) {
      return res.status(400).json({ accepted: false, reason: "Request timestamp too old or invalid" });
    }
    if (!verifySlackRequest(row.webhook_secret, timestamp, rawBody, signature)) {
      return res.status(400).json({ accepted: false, reason: "Invalid Slack signature" });
    }
  }

  const { event, session } = await ingestWebhook("slack", req.body);
  return res.status(202).json({ accepted: true, event_id: event.id, message: `Session ${session.id} created` });
});

export default router;
