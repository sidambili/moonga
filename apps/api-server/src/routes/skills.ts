import { Router } from "express";
import { db } from "@workspace/db";
import { skillsTable, insertSkillSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

function asyncHandler(fn: (req: any, res: any) => Promise<any>) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      logger.error({ err }, "Unhandled route error");
      res.status(500).json({ error: "Internal Server Error", message: err?.message });
    });
  };
}

function validateId(param: string): number | null {
  const id = Number(param);
  if (!Number.isInteger(id) || !Number.isFinite(id) || id <= 0) return null;
  return id;
}

router.get("/", asyncHandler(async (_req, res) => {
  const rows = await db.select().from(skillsTable).orderBy(skillsTable.id);
  return res.json(rows);
}));

router.post("/", asyncHandler(async (req, res) => {
  const parsed = insertSkillSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.issues });
  }
  const { slug, name, content } = parsed.data;
  try {
    const [row] = await db
      .insert(skillsTable)
      .values({ slug, name, content, source: "user" })
      .returning();
    return res.status(201).json(row);
  } catch (err: any) {
    if (err?.code === "23505" || err?.message?.includes("unique constraint")) {
      return res.status(409).json({ error: "duplicate_slug", message: err?.message });
    }
    throw err;
  }
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  const id = validateId(req.params["id"]);
  if (!id) return res.status(400).json({ error: "invalid_id" });
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
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const id = validateId(req.params["id"]);
  if (!id) return res.status(400).json({ error: "invalid_id" });
  const [existing] = await db.select().from(skillsTable).where(eq(skillsTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (existing.source === "system") return res.status(403).json({ error: "system_skills_cannot_be_deleted" });

  await db.delete(skillsTable).where(eq(skillsTable.id, id));
  return res.status(204).send();
}));

export default router;
