import { Router } from "express";
import { db } from "@workspace/db";
import { skillsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res) => {
  const rows = await db.select().from(skillsTable).orderBy(skillsTable.id);
  return res.json(rows);
});

router.post("/", async (req, res) => {
  const { slug, name, content } = req.body as { slug: string; name: string; content: string };
  const [row] = await db
    .insert(skillsTable)
    .values({ slug, name, content, source: "user" })
    .returning();
  return res.status(201).json(row);
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const [existing] = await db.select().from(skillsTable).where(eq(skillsTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "not_found" });

  const { name, content, is_active } = req.body as {
    name?: string;
    content?: string;
    is_active?: boolean;
  };

  const update =
    existing.source === "system"
      ? { content: content ?? existing.content, is_active: is_active ?? existing.is_active, updated_at: new Date() }
      : { name: name ?? existing.name, content: content ?? existing.content, is_active: is_active ?? existing.is_active, updated_at: new Date() };

  const [row] = await db.update(skillsTable).set(update).where(eq(skillsTable.id, id)).returning();
  return res.json(row);
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const [existing] = await db.select().from(skillsTable).where(eq(skillsTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (existing.source === "system") return res.status(403).json({ error: "system_skills_cannot_be_deleted" });

  await db.delete(skillsTable).where(eq(skillsTable.id, id));
  return res.status(204).send();
});

export default router;
