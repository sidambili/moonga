import { Router } from "express";
import { db } from "@workspace/db";
import { eventsTable, sessionsTable, integrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

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
  if (source === "linear") return "ticket_created";
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
  if (source === "slack") return "Slack message";
  return `${source} event`;
}

function getLinearTeamName(payload: Record<string, unknown>): string | undefined {
  const data = payload.data as Record<string, unknown> | undefined;
  const team = data?.team as Record<string, unknown> | undefined;
  return team?.name as string | undefined;
}

function isEngineeringTeam(teamName: string | undefined): boolean {
  if (!teamName) return false;
  const allowed = (process.env.LINEAR_ENG_TEAM_NAMES ?? "Engineering")
    .split(",")
    .map((s) => s.trim().toLowerCase());
  return allowed.includes(teamName.toLowerCase());
}

function getLinearRepoId(): string | undefined {
  return process.env.LINEAR_DEFAULT_REPO;
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

  await db.update(eventsTable).set({ session_id: session.id, status: "processing" }).returning();

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
  if (!isEngineeringTeam(teamName)) {
    return res.status(202).json({
      accepted: false,
      reason: `Team '${teamName ?? "unknown"}' is not in the engineering list`,
    });
  }
  const { event, session } = await ingestWebhook("linear", req.body, getLinearRepoId());
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
  const { event, session } = await ingestWebhook("slack", req.body);
  return res.status(202).json({ accepted: true, event_id: event.id, message: `Session ${session.id} created` });
});

export default router;
