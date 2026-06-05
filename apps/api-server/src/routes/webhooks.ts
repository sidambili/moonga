import { Router } from "express";
import crypto from "crypto";
import { db, getOrgDefaultProjectId } from "@workspace/db";
import { eventsTable, agentSessionsTable, integrationsTable, projectSourcesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { GITHUB_EVENT_TYPE_MAP } from "@workspace/constants";

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

function verifyLinearRequest(secret: string, rawBody: string, signature: string): boolean {
  const expected = crypto.createHmac("sha256", secret.trim()).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature.trim(), "utf8"));
  } catch {
    return false;
  }
}

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
  if (source === "linear") {
    const data = payload.data as Record<string, unknown> | undefined;
    const priority = typeof data?.priority === "number" ? data.priority : null;
    if (priority == null) return "low";
    if (priority >= 3) return "critical";
    if (priority === 2) return "high";
    if (priority === 1) return "medium";
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

function getLinearTeamId(payload: Record<string, unknown>): string | undefined {
  const data = payload.data as Record<string, unknown> | undefined;
  const team = data?.team as Record<string, unknown> | undefined;
  return team?.id as string | undefined;
}

async function getLinearConfig(): Promise<{ linear_team_ids?: string; linear_team_names?: string; default_repo?: string; webhook_secret?: string }> {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.provider, "linear"));
    if (row?.config) {
      return {
        ...row.config as { linear_team_ids?: string; linear_team_names?: string; default_repo?: string },
        webhook_secret: row.webhook_secret ?? undefined,
      };
    }
    if (row?.webhook_secret) {
      return { webhook_secret: row.webhook_secret };
    }
  } catch {
    // ignore
  }
  return {};
}

async function isEngineeringTeam(
  teamName: string | undefined,
  teamId: string | undefined,
  prefetchedConfig?: { linear_team_ids?: string; linear_team_names?: string; default_repo?: string }
): Promise<{ allowed: boolean; reason?: string }> {
  const config = prefetchedConfig ?? await getLinearConfig();

  // If linear_team_ids is configured, use it. Empty string means "allow all".
  if (config.linear_team_ids !== undefined) {
    const teamIdsConfig = config.linear_team_ids.trim();
    if (!teamIdsConfig) {
      return { allowed: true };
    }
    if (!teamId) {
      return { allowed: false, reason: "No team ID present in webhook payload" };
    }
    const allowedIds = teamIdsConfig.split(",").map((s) => s.trim());
    if (allowedIds.includes(teamId)) {
      return { allowed: true };
    }
    return { allowed: false, reason: `Team ID '${teamId}' is not in the allowed teams list` };
  }

  // Fall back to legacy team names
  const teamNamesConfig = config.linear_team_names?.trim();
  if (!teamNamesConfig) {
    return { allowed: true };
  }

  if (!teamName) {
    return { allowed: false, reason: "No team name present in webhook payload" };
  }

  const allowed = teamNamesConfig.split(",").map((s) => s.trim().toLowerCase());
  if (allowed.includes(teamName.toLowerCase())) {
    return { allowed: true };
  }

  return { allowed: false, reason: `Team '${teamName}' is not in the allowed teams list` };
}

function shouldProcessLinearEvent(payload: Record<string, unknown>): { process: boolean; reason?: string } {
  const action = payload.action as string | undefined;

  if (action === "create") {
    return { process: true };
  }

  return { process: false, reason: `Linear action '${action}' is not processed — only new issues are handled` };
}

function extractLinearTicketId(payload: Record<string, unknown>): string | undefined {
  const data = payload.data as Record<string, unknown> | undefined;
  const id = data?.id as string | undefined;
  return id || undefined;
}

/**
 * The external resource id a webhook should be routed by — the key we match
 * against project_sources. Linear routes by team id, GitHub by repo full_name.
 * Other sources have no binding key yet, so they fall back to the org default.
 */
function extractSourceExternalId(source: string, payload: Record<string, unknown>): string | undefined {
  if (source === "linear") return getLinearTeamId(payload);
  if (source === "github") {
    const repo = payload.repository as Record<string, unknown> | undefined;
    return (repo?.full_name as string | undefined) || undefined;
  }
  return undefined;
}

/**
 * Resolve the project a webhook's data belongs to. Webhooks are unauthenticated,
 * so there's no active session to read. Two-step routing:
 *   1. project_sources binding — the external resource (Linear team / GitHub repo)
 *      explicitly mapped to a project. This is how two repos reach two projects.
 *   2. fallback — the source's integration names an org; use that org's default
 *      project. Keeps unmapped resources flowing into a sensible bucket.
 * Returns null when nothing resolves; read-scoping (tenant-scope.ts) keeps NULL
 * project_id rows visible, so an unrouted webhook still surfaces.
 */
async function resolveWebhookProjectId(
  source: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const externalId = extractSourceExternalId(source, payload);
  if (externalId) {
    try {
      const [binding] = await db
        .select({ projectId: projectSourcesTable.project_id })
        .from(projectSourcesTable)
        .where(and(eq(projectSourcesTable.provider, source), eq(projectSourcesTable.external_id, externalId)))
        .limit(1);
      if (binding?.projectId) return binding.projectId;
    } catch {
      // fall through to the org-default fallback
    }
  }

  try {
    const [row] = await db
      .select({ orgId: integrationsTable.organization_id })
      .from(integrationsTable)
      .where(eq(integrationsTable.provider, source))
      .limit(1);
    if (!row?.orgId) return null;
    return await getOrgDefaultProjectId(row.orgId);
  } catch {
    return null;
  }
}

async function ingestWebhook(source: string, payload: Record<string, unknown>, repoId?: string) {
  const eventType = detectEventType(source, payload);
  const severity = detectSeverity(source, payload);
  const title = extractTitle(source, payload);
  const ticketId = source === "linear" ? extractLinearTicketId(payload) : undefined;
  const projectId = await resolveWebhookProjectId(source, payload);

  const [event] = await db.insert(eventsTable).values({
    source,
    event_type: eventType,
    severity,
    status: "new",
    title,
    repo_id: repoId ?? null,
    ticket_id: ticketId ?? null,
    payload_raw: payload,
    project_id: projectId,
  }).returning();

  const objective = (source === "linear" || eventType === "ticket_created") ? "plan" : "diagnose";

  const [session] = await db.insert(agentSessionsTable).values({
    event_id: event.id,
    objective,
    status: "pending",
    model_used: null,
    project_id: projectId,
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
  const linearConfig = await getLinearConfig();

  if (linearConfig.webhook_secret) {
    const signature = req.headers["linear-signature"] as string | undefined;
    const rawBody = (req as unknown as Record<string, unknown> & { rawBody?: string }).rawBody ?? "";
    if (!signature || !verifyLinearRequest(linearConfig.webhook_secret, rawBody, signature)) {
      return res.status(400).json({ accepted: false, reason: "Invalid Linear signature" });
    }
  }

  const teamName = getLinearTeamName(req.body);
  const teamId = getLinearTeamId(req.body);
  const teamCheck = await isEngineeringTeam(teamName, teamId, linearConfig);
  if (!teamCheck.allowed) {
    return res.status(202).json({ accepted: false, reason: teamCheck.reason });
  }

  const { process, reason } = shouldProcessLinearEvent(req.body);
  if (!process) {
    return res.status(202).json({ accepted: false, reason });
  }

  const repoId = linearConfig.default_repo || undefined;
  const { event, session } = await ingestWebhook("linear", req.body, repoId);
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
