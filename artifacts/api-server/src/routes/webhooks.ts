import { Router } from "express";
import { db } from "@workspace/db";
import { eventsTable, sessionsTable } from "@workspace/db";

const router = Router();

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
  const { event, session } = await ingestWebhook("github", req.body);
  res.status(202).json({ accepted: true, event_id: event.id, message: `Session ${session.id} created` });
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
