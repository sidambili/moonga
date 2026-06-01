import { Router } from "express";
import { db } from "@workspace/db";
import { eventsTable } from "@workspace/db";
import { eq, desc, and, lt } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { source, severity, status, limit = "50", cursor } = req.query as Record<string, string>;
    const limitN = Math.min(Number(limit) || 50, 200);
    const cursorN = cursor ? Number(cursor) : undefined;

    const conditions = [];
    if (source) conditions.push(eq(eventsTable.source, source));
    if (severity) conditions.push(eq(eventsTable.severity, severity));
    if (status) conditions.push(eq(eventsTable.status, status));
    if (cursorN) conditions.push(lt(eventsTable.id, cursorN));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(eventsTable)
      .where(where)
      .orderBy(desc(eventsTable.id))
      .limit(limitN + 1);

    const hasMore = rows.length > limitN;
    const items = hasMore ? rows.slice(0, limitN) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return res.json({ items, nextCursor, hasMore });
  } catch (err) {
    return res.status(500).json({ error: "Failed to list events" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, id));
    if (!event) return res.status(404).json({ error: "Event not found" });
    return res.json(event);
  } catch {
    return res.status(500).json({ error: "Failed to get event" });
  }
});

export default router;
