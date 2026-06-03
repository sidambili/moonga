import { Router } from "express";
import { db } from "@workspace/db";
import { sessionsTable, eventsTable, sessionStepsTable, playbooksTable } from "@workspace/db";
import { eq, desc, and, sql, lt } from "drizzle-orm";
import { logger } from "../lib/logger";
import { tenantScope, withTenantScope } from "../lib/tenant-scope";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { status, limit = "50", cursor } = req.query as Record<string, string>;
    const limitN = Math.min(Number(limit) || 50, 200);
    const cursorN = cursor ? Number(cursor) : undefined;

    const conditions = [];
    const scope = tenantScope(res, sessionsTable.project_id);
    if (scope) conditions.push(scope);
    if (status) conditions.push(eq(sessionsTable.status, status));
    if (cursorN) conditions.push(lt(sessionsTable.id, cursorN));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const stepStats = db
      .select({
        session_id: sessionStepsTable.session_id,
        computed_step_count: sql<number>`count(*)::int`.as("computed_step_count"),
      })
      .from(sessionStepsTable)
      .groupBy(sessionStepsTable.session_id)
      .as("step_stats");

    const rows = await db
      .select({
        session: sessionsTable,
        event: eventsTable,
        computed_step_count: stepStats.computed_step_count,
        playbook_name: playbooksTable.name,
      })
      .from(sessionsTable)
      .leftJoin(eventsTable, eq(sessionsTable.event_id, eventsTable.id))
      .leftJoin(stepStats, eq(sessionsTable.id, stepStats.session_id))
      .leftJoin(playbooksTable, eq(sessionsTable.playbook_id, playbooksTable.id))
      .where(where)
      .orderBy(desc(sessionsTable.id))
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
        session_id: sessionStepsTable.session_id,
        computed_step_count: sql<number>`count(*)::int`.as("computed_step_count"),
      })
      .from(sessionStepsTable)
      .where(eq(sessionStepsTable.session_id, id))
      .groupBy(sessionStepsTable.session_id)
      .as("step_stats");

    const [row] = await db
      .select({
        session: sessionsTable,
        event: eventsTable,
        computed_step_count: stepStats.computed_step_count,
        playbook_name: playbooksTable.name,
      })
      .from(sessionsTable)
      .leftJoin(eventsTable, eq(sessionsTable.event_id, eventsTable.id))
      .leftJoin(stepStats, eq(sessionsTable.id, stepStats.session_id))
      .leftJoin(playbooksTable, eq(sessionsTable.playbook_id, playbooksTable.id))
      .where(withTenantScope(res, sessionsTable.project_id, eq(sessionsTable.id, id)));

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
    const [updated] = await db.update(sessionsTable)
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
      .where(eq(sessionsTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Session not found" });

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, updated.event_id));
    return res.json({ ...updated, event, step_count: 0 });
  } catch (err) {
    logger.error({ err }, "Failed to retry session");
    return res.status(500).json({ error: "Failed to retry session" });
  }
});

router.get("/:id/steps", async (req, res) => {
  try {
    const id = Number(req.params.id);
    // Don't expose steps for a session outside the active org.
    const [sess] = await db
      .select({ id: sessionsTable.id })
      .from(sessionsTable)
      .where(withTenantScope(res, sessionsTable.project_id, eq(sessionsTable.id, id)));
    if (!sess) return res.status(404).json({ error: "Session not found" });

    const steps = await db
      .select()
      .from(sessionStepsTable)
      .where(eq(sessionStepsTable.session_id, id))
      .orderBy(sessionStepsTable.step_number);
    return res.json(steps);
  } catch (err) {
    logger.error({ err }, "Failed to get session steps");
    return res.status(500).json({ error: "Failed to get session steps" });
  }
});

export default router;
