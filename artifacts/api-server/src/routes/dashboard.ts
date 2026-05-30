import { Router } from "express";
import { db } from "@workspace/db";
import { eventsTable, sessionsTable, artifactsTable } from "@workspace/db";
import { sql, eq, gte, desc } from "drizzle-orm";

const router = Router();

router.get("/summary", async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      [{ total_events }],
      [{ pending_review }],
      [{ sessions_running }],
      [{ approved_today }],
      [{ events_today }],
      [{ critical_open }],
    ] = await Promise.all([
      db.select({ total_events: sql<number>`count(*)::int` }).from(eventsTable),
      db.select({ pending_review: sql<number>`count(*)::int` }).from(artifactsTable).where(eq(artifactsTable.approval_state, "draft")),
      db.select({ sessions_running: sql<number>`count(*)::int` }).from(sessionsTable).where(eq(sessionsTable.status, "running")),
      db.select({ approved_today: sql<number>`count(*)::int` }).from(artifactsTable).where(sql`approval_state = 'approved' AND created_at >= ${today}`),
      db.select({ events_today: sql<number>`count(*)::int` }).from(eventsTable).where(gte(eventsTable.created_at, today)),
      db.select({ critical_open: sql<number>`count(*)::int` }).from(eventsTable).where(sql`severity = 'critical' AND status != 'processed'`),
    ]);

    res.json({
      total_events,
      pending_review,
      sessions_running,
      approved_today,
      events_today,
      critical_open,
    });
  } catch {
    res.status(500).json({ error: "Failed to get dashboard summary" });
  }
});

router.get("/recent-activity", async (_req, res) => {
  try {
    const events = await db.select().from(eventsTable).orderBy(desc(eventsTable.created_at)).limit(20);
    const items = events.map((e) => ({
      id: e.id,
      type: "event",
      title: e.title || `${e.source} ${e.event_type}`,
      timestamp: e.created_at.toISOString(),
      source: e.source,
      severity: e.severity,
      status: e.status,
    }));
    res.json(items);
  } catch {
    res.status(500).json({ error: "Failed to get recent activity" });
  }
});

router.get("/severity-breakdown", async (_req, res) => {
  try {
    const rows = await db
      .select({
        severity: eventsTable.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(eventsTable)
      .groupBy(eventsTable.severity);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to get severity breakdown" });
  }
});

router.get("/source-breakdown", async (_req, res) => {
  try {
    const rows = await db
      .select({
        source: eventsTable.source,
        count: sql<number>`count(*)::int`,
      })
      .from(eventsTable)
      .groupBy(eventsTable.source);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to get source breakdown" });
  }
});

export default router;
