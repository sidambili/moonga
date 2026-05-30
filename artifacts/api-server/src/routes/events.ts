import { Router } from "express";
import { db } from "@workspace/db";
import { eventsTable, sessionsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { source, severity, status, limit = "50", offset = "0" } = req.query as Record<string, string>;
    const limitN = Math.min(Number(limit) || 50, 200);
    const offsetN = Number(offset) || 0;

    const conditions = [];
    if (source) conditions.push(eq(eventsTable.source, source));
    if (severity) conditions.push(eq(eventsTable.severity, severity));
    if (status) conditions.push(eq(eventsTable.status, status));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [{ count }]] = await Promise.all([
      db.select().from(eventsTable).where(where).orderBy(desc(eventsTable.created_at)).limit(limitN).offset(offsetN),
      db.select({ count: sql<number>`count(*)::int` }).from(eventsTable).where(where),
    ]);

    res.json({ items, total: count });
  } catch (err) {
    res.status(500).json({ error: "Failed to list events" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, id));
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
  } catch {
    res.status(500).json({ error: "Failed to get event" });
  }
});

export default router;
