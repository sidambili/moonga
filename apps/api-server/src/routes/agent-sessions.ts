import { Router } from "express";
import { db } from "@workspace/db";
import { agentSessionsTable, eventsTable, agentSessionStepsTable, playbooksTable } from "@workspace/db";
import { eq, desc, and, sql, lt } from "drizzle-orm";
import { logger } from "../lib/logger";
import { subscribeToSession } from "../lib/session-stream";
import { tenantScope, withTenantScope } from "../lib/tenant-scope";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { status, limit = "50", cursor } = req.query as Record<string, string>;
    const limitN = Math.min(Number(limit) || 50, 200);
    const cursorN = cursor ? Number(cursor) : undefined;

    const conditions = [];
    const scope = tenantScope(res, agentSessionsTable.project_id);
    if (scope) conditions.push(scope);
    if (status) conditions.push(eq(agentSessionsTable.status, status));
    if (cursorN) conditions.push(lt(agentSessionsTable.id, cursorN));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const stepStats = db
      .select({
        session_id: agentSessionStepsTable.session_id,
        computed_step_count: sql<number>`count(*)::int`.as("computed_step_count"),
      })
      .from(agentSessionStepsTable)
      .groupBy(agentSessionStepsTable.session_id)
      .as("step_stats");

    const rows = await db
      .select({
        session: agentSessionsTable,
        event: eventsTable,
        computed_step_count: stepStats.computed_step_count,
        playbook_name: playbooksTable.name,
      })
      .from(agentSessionsTable)
      .leftJoin(eventsTable, eq(agentSessionsTable.event_id, eventsTable.id))
      .leftJoin(stepStats, eq(agentSessionsTable.id, stepStats.session_id))
      .leftJoin(playbooksTable, eq(agentSessionsTable.playbook_id, playbooksTable.id))
      .where(where)
      .orderBy(desc(agentSessionsTable.id))
      .limit(limitN + 1);

    const hasMore = rows.length > limitN;
    const pageRows = hasMore ? rows.slice(0, limitN) : rows;
    const items = pageRows.map(({ session, event, computed_step_count, playbook_name }) => ({
      ...session,
      event,
      step_count: session.step_count ?? computed_step_count,
      playbook_name: playbook_name ?? null,
    }));
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return res.json({ items, nextCursor, hasMore });
  } catch (err) {
    logger.error({ err }, "Failed to list sessions");
    return res.status(500).json({ error: "Failed to list sessions" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const stepStats = db
      .select({
        session_id: agentSessionStepsTable.session_id,
        computed_step_count: sql<number>`count(*)::int`.as("computed_step_count"),
      })
      .from(agentSessionStepsTable)
      .where(eq(agentSessionStepsTable.session_id, id))
      .groupBy(agentSessionStepsTable.session_id)
      .as("step_stats");

    const [row] = await db
      .select({
        session: agentSessionsTable,
        event: eventsTable,
        computed_step_count: stepStats.computed_step_count,
        playbook_name: playbooksTable.name,
      })
      .from(agentSessionsTable)
      .leftJoin(eventsTable, eq(agentSessionsTable.event_id, eventsTable.id))
      .leftJoin(stepStats, eq(agentSessionsTable.id, stepStats.session_id))
      .leftJoin(playbooksTable, eq(agentSessionsTable.playbook_id, playbooksTable.id))
      .where(withTenantScope(res, agentSessionsTable.project_id, eq(agentSessionsTable.id, id)));

    if (!row) return res.status(404).json({ error: "Session not found" });
    return res.json({ ...row.session, event: row.event, step_count: row.session.step_count ?? row.computed_step_count, playbook_name: row.playbook_name ?? null });
  } catch (err) {
    logger.error({ err }, "Failed to get session");
    return res.status(500).json({ error: "Failed to get session" });
  }
});

router.post("/:id/retry", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [updated] = await db.update(agentSessionsTable)
      .set({
        status: "pending",
        total_tokens: null,
        total_prompt_tokens: null,
        total_completion_tokens: null,
        total_cost: null,
        prompt_token_cost: null,
        completion_token_cost: null,
        cached_tokens: null,
        cached_cost: null,
        tool_calls_count: null,
        step_count: null,
        duration_ms: null,
        updated_at: new Date(),
      })
      .where(eq(agentSessionsTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Session not found" });

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, updated.event_id));
    return res.json({ ...updated, event, step_count: 0 });
  } catch (err) {
    logger.error({ err }, "Failed to retry session");
    return res.status(500).json({ error: "Failed to retry session" });
  }
});

router.post("/:id/rerun", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [original] = await db.select().from(agentSessionsTable).where(eq(agentSessionsTable.id, id));
    if (!original) return res.status(404).json({ error: "Session not found" });

    const [session] = await db.insert(agentSessionsTable).values({
      event_id: original.event_id,
      objective: original.objective,
      status: "pending",
      model_used: null,
    }).returning();

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, original.event_id));
    return res.json({ ...session, event, step_count: 0 });
  } catch (err) {
    logger.error({ err }, "Failed to rerun session");
    return res.status(500).json({ error: "Failed to rerun session" });
  }
});

router.get("/:id/steps", async (req, res) => {
  try {
    const id = Number(req.params.id);
    // Don't expose steps for a session outside the active org.
    const [sess] = await db
      .select({ id: agentSessionsTable.id })
      .from(agentSessionsTable)
      .where(withTenantScope(res, agentSessionsTable.project_id, eq(agentSessionsTable.id, id)));
    if (!sess) return res.status(404).json({ error: "Session not found" });

    const steps = await db
      .select()
      .from(agentSessionStepsTable)
      .where(eq(agentSessionStepsTable.session_id, id))
      .orderBy(agentSessionStepsTable.step_number);
    return res.json(steps);
  } catch (err) {
    logger.error({ err }, "Failed to get session steps");
    return res.status(500).json({ error: "Failed to get session steps" });
  }
});

router.get("/:id/stream", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send a keep-alive comment immediately
  res.write(":ok\n\n");

  const unsubscribe = subscribeToSession(id, (step) => {
    res.write(`data: ${JSON.stringify(step)}\n\n`);
  });

  req.on("close", () => {
    unsubscribe();
    res.end();
  });
});

export default router;
