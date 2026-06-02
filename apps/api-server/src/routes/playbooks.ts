import { Router } from "express";
import { db } from "@workspace/db";
import { playbooksTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res) => {
  const rows = await db
    .select()
    .from(playbooksTable)
    .orderBy(playbooksTable.objective, playbooksTable.id);
  return res.json(rows);
});

router.post("/", async (req, res) => {
  const { slug, name, objective, trigger_source, instructions } = req.body as {
    slug: string;
    name: string;
    objective: string;
    trigger_source?: string | null;
    instructions: string;
  };
  const [row] = await db
    .insert(playbooksTable)
    .values({ slug, name, objective, trigger_source: trigger_source ?? null, instructions, source: "user" })
    .returning();
  return res.status(201).json(row);
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const [existing] = await db.select().from(playbooksTable).where(eq(playbooksTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "not_found" });

  const { name, instructions, trigger_source, is_active } = req.body as {
    name?: string;
    instructions?: string;
    trigger_source?: string | null;
    is_active?: boolean;
  };

  const update =
    existing.source === "system"
      ? { instructions: instructions ?? existing.instructions, is_active: is_active ?? existing.is_active, updated_at: new Date() }
      : { name: name ?? existing.name, instructions: instructions ?? existing.instructions, trigger_source: trigger_source !== undefined ? trigger_source : existing.trigger_source, is_active: is_active ?? existing.is_active, updated_at: new Date() };

  const [row] = await db.update(playbooksTable).set(update).where(eq(playbooksTable.id, id)).returning();
  return res.json(row);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const [existing] = await db.select().from(playbooksTable).where(eq(playbooksTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (existing.source === "system") return res.status(403).json({ error: "system_playbooks_cannot_be_deleted" });

  await db.delete(playbooksTable).where(eq(playbooksTable.id, id));
  return res.status(204).send();
});

export default router;
