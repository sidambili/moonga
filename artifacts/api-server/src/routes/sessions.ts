import { Router } from "express";
import { db } from "@workspace/db";
import { sessionsTable, eventsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { status, limit = "50", offset = "0" } = req.query as Record<string, string>;
    const limitN = Math.min(Number(limit) || 50, 200);
    const offsetN = Number(offset) || 0;

    const conditions = [];
    if (status) conditions.push(eq(sessionsTable.status, status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ count }]] = await Promise.all([
      db.select({
        session: sessionsTable,
        event: eventsTable,
      })
        .from(sessionsTable)
        .leftJoin(eventsTable, eq(sessionsTable.event_id, eventsTable.id))
        .where(where)
        .orderBy(desc(sessionsTable.created_at))
        .limit(limitN)
        .offset(offsetN),
      db.select({ count: sql<number>`count(*)::int` }).from(sessionsTable).where(where),
    ]);

    const items = rows.map(({ session, event }) => ({ ...session, event }));
    res.json({ items, total: count });
  } catch {
    res.status(500).json({ error: "Failed to list sessions" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [row] = await db.select({ session: sessionsTable, event: eventsTable })
      .from(sessionsTable)
      .leftJoin(eventsTable, eq(sessionsTable.event_id, eventsTable.id))
      .where(eq(sessionsTable.id, id));

    if (!row) return res.status(404).json({ error: "Session not found" });
    res.json({ ...row.session, event: row.event });
  } catch {
    res.status(500).json({ error: "Failed to get session" });
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
    res.json({ ...updated, event });
  } catch {
    res.status(500).json({ error: "Failed to retry session" });
  }
});

export default router;
