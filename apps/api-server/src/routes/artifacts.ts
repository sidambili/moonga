import { Router } from "express";
import { db } from "@workspace/db";
import { artifactsTable, sessionsTable, eventsTable } from "@workspace/db";
import { eq, desc, and, lt } from "drizzle-orm";
import { postLinearComment } from "../lib/integrations/linear-client";
import { logger } from "../lib/logger";
import { tenantScope, withTenantScope } from "../lib/tenant-scope";

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
    const { approval_state, session_id, limit = "50", cursor } = req.query as Record<string, string>;
    const limitN = Math.min(Number(limit) || 50, 200);
    const cursorN = cursor ? Number(cursor) : undefined;

    const conditions = [];
    const scope = tenantScope(res, artifactsTable.project_id);
    if (scope) conditions.push(scope);
    if (approval_state) conditions.push(eq(artifactsTable.approval_state, approval_state));
    if (session_id) conditions.push(eq(artifactsTable.session_id, Number(session_id)));
    if (cursorN) conditions.push(lt(artifactsTable.id, cursorN));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        artifact: artifactsTable,
        session: sessionsTable,
        event: eventsTable,
      })
      .from(artifactsTable)
      .leftJoin(sessionsTable, eq(artifactsTable.session_id, sessionsTable.id))
      .leftJoin(eventsTable, eq(sessionsTable.event_id, eventsTable.id))
      .where(where)
      .orderBy(desc(artifactsTable.id))
      .limit(limitN + 1);

    const hasMore = rows.length > limitN;
    const pageRows = hasMore ? rows.slice(0, limitN) : rows;
    const items = pageRows.map(({ artifact, session, event }) => ({
      ...artifact,
      session: session ? { ...session, event } : null,
    }));
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return res.json({ items, nextCursor, hasMore });
  } catch {
    return res.status(500).json({ error: "Failed to list artifacts" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [artifact] = await db
      .select()
      .from(artifactsTable)
      .where(withTenantScope(res, artifactsTable.project_id, eq(artifactsTable.id, id)));
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

router.post("/:id/post-to-linear", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [artifact] = await db.select().from(artifactsTable).where(eq(artifactsTable.id, id));
    if (!artifact) return res.status(404).json({ error: "Artifact not found" });

    const hydrated = await hydrateArtifact(artifact);
    const ticketId = hydrated.session?.event?.ticket_id;
    if (!ticketId) {
      return res.status(400).json({ error: "No Linear ticket associated with this artifact's session" });
    }

    await postLinearComment(ticketId, artifact.content);

    const [updated] = await db.update(artifactsTable)
      .set({ synced_to_linear_at: new Date() })
      .where(eq(artifactsTable.id, id))
      .returning();

    logger.info({ artifactId: id, ticketId }, "Posted artifact to Linear");
    return res.json(await hydrateArtifact(updated));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err, artifactId: req.params.id }, "Failed to post artifact to Linear");
    return res.status(500).json({ error: "Failed to post to Linear", message: msg });
  }
});

export default router;
