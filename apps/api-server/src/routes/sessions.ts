import { Router } from "express";
import { db } from "@workspace/db";
import { sessionsTable, eventsTable, sessionStepsTable } from "@workspace/db";
import { eq, desc, and, sql, lt } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { status, limit = "50", cursor } = req.query as Record<string, string>;
    const limitN = Math.min(Number(limit) || 50, 200);
    const cursorN = cursor ? Number(cursor) : undefined;

    const conditions = [];
    if (status) conditions.push(eq(sessionsTable.status, status));
    if (cursorN) conditions.push(lt(sessionsTable.id, cursorN));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const stepStats = db
      .select({
        session_id: sessionStepsTable.session_id,
        step_count: sql<number>`count(*)::int`.as("step_count"),
        total_cost: sql<number>`coalesce(sum(${sessionStepsTable.cost}), 0)`.as("total_cost"),
      })
      .from(sessionStepsTable)
      .groupBy(sessionStepsTable.session_id)
      .as("step_stats");

    const rows = await db
      .select({
        session: sessionsTable,
        event: eventsTable,
        step_count: stepStats.step_count,
        total_cost: stepStats.total_cost,
      })
      .from(sessionsTable)
      .leftJoin(eventsTable, eq(sessionsTable.event_id, eventsTable.id))
      .leftJoin(stepStats, eq(sessionsTable.id, stepStats.session_id))
      .where(where)
      .orderBy(desc(sessionsTable.id))
      .limit(limitN + 1);

    const hasMore = rows.length > limitN;
    const pageRows = hasMore ? rows.slice(0, limitN) : rows;
    const items = pageRows.map(({ session, event, step_count, total_cost }) => ({
      ...session,
      event,
      step_count,
      total_cost,
    }));
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return res.json({ items, nextCursor, hasMore });
  } catch {
    return res.status(500).json({ error: "Failed to list sessions" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const stepStats = db
      .select({
        session_id: sessionStepsTable.session_id,
        step_count: sql<number>`count(*)::int`.as("step_count"),
        total_cost: sql<number>`coalesce(sum(${sessionStepsTable.cost}), 0)`.as("total_cost"),
      })
      .from(sessionStepsTable)
      .where(eq(sessionStepsTable.session_id, id))
      .groupBy(sessionStepsTable.session_id)
      .as("step_stats");

    const [row] = await db
      .select({
        session: sessionsTable,
        event: eventsTable,
        step_count: stepStats.step_count,
        total_cost: stepStats.total_cost,
      })
      .from(sessionsTable)
      .leftJoin(eventsTable, eq(sessionsTable.event_id, eventsTable.id))
      .leftJoin(stepStats, eq(sessionsTable.id, stepStats.session_id))
      .where(eq(sessionsTable.id, id));

    if (!row) return res.status(404).json({ error: "Session not found" });
    return res.json({ ...row.session, event: row.event, step_count: row.step_count, total_cost: row.total_cost });
  } catch {
    return res.status(500).json({ error: "Failed to get session" });
  }
});

router.post("/:id/retry", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [updated] = await db.update(sessionsTable)
      .set({ status: "pending", updated_at: new Date() })
      .where(eq(sessionsTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Session not found" });

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, updated.event_id));
    return res.json({ ...updated, event, step_count: 0, total_cost: null });
  } catch {
    return res.status(500).json({ error: "Failed to retry session" });
  }
});

router.get("/:id/steps", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const steps = await db
      .select()
      .from(sessionStepsTable)
      .where(eq(sessionStepsTable.session_id, id))
      .orderBy(sessionStepsTable.step_number);
    return res.json(steps);
  } catch {
    return res.status(500).json({ error: "Failed to get session steps" });
  }
});

export default router;
