import { Router } from "express";
import { db } from "@workspace/db";
import { artifactsTable, sessionsTable, eventsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";

const router = Router();

async function hydrateArtifact(artifact: typeof artifactsTable.$inferSelect) {
  const [row] = await db.select({ session: sessionsTable, event: eventsTable })
    .from(sessionsTable)
    .leftJoin(eventsTable, eq(sessionsTable.event_id, eventsTable.id))
    .where(eq(sessionsTable.id, artifact.session_id));
  return { ...artifact, session: row ? { ...row.session, event: row.event } : null };
}

router.get("/", async (req, res) => {
  try {
    const { approval_state, session_id, limit = "50", offset = "0" } = req.query as Record<string, string>;
    const limitN = Math.min(Number(limit) || 50, 200);
    const offsetN = Number(offset) || 0;

    const conditions = [];
    if (approval_state) conditions.push(eq(artifactsTable.approval_state, approval_state));
    if (session_id) conditions.push(eq(artifactsTable.session_id, Number(session_id)));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, [{ count }]] = await Promise.all([
      db.select().from(artifactsTable).where(where).orderBy(desc(artifactsTable.created_at)).limit(limitN).offset(offsetN),
      db.select({ count: sql<number>`count(*)::int` }).from(artifactsTable).where(where),
    ]);

    const hydrated = await Promise.all(items.map(hydrateArtifact));
    return res.json({ items: hydrated, total: count });
  } catch {
    return res.status(500).json({ error: "Failed to list artifacts" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [artifact] = await db.select().from(artifactsTable).where(eq(artifactsTable.id, id));
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });
    return res.json(await hydrateArtifact(artifact));
  } catch {
    return res.status(500).json({ error: "Failed to get artifact" });
  }
});

router.post("/:id/approve", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [updated] = await db.update(artifactsTable)
      .set({ approval_state: "approved" })
      .where(eq(artifactsTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Artifact not found" });

    await db.update(sessionsTable)
      .set({ status: "approved", updated_at: new Date() })
      .where(eq(sessionsTable.id, updated.session_id));

    return res.json(await hydrateArtifact(updated));
  } catch {
    return res.status(500).json({ error: "Failed to approve artifact" });
  }
});

router.post("/:id/reject", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [updated] = await db.update(artifactsTable)
      .set({ approval_state: "rejected" })
      .where(eq(artifactsTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Artifact not found" });

    await db.update(sessionsTable)
      .set({ status: "rejected", updated_at: new Date() })
      .where(eq(sessionsTable.id, updated.session_id));

    return res.json(await hydrateArtifact(updated));
  } catch {
    return res.status(500).json({ error: "Failed to reject artifact" });
  }
});

router.patch("/:id/edit", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });

    const [updated] = await db.update(artifactsTable)
      .set({ content, approval_state: "edited" })
      .where(eq(artifactsTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Artifact not found" });

    return res.json(await hydrateArtifact(updated));
  } catch {
    return res.status(500).json({ error: "Failed to edit artifact" });
  }
});

export default router;
