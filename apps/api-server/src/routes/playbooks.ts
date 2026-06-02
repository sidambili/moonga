import { Router } from "express";
import { db } from "@workspace/db";
import { playbooksTable, insertPlaybookSchema } from "@workspace/db";
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
  const rows = await db
    .select()
    .from(playbooksTable)
    .orderBy(playbooksTable.objective, playbooksTable.id);
  return res.json(rows);
}));

router.post("/", asyncHandler(async (req, res) => {
  const parsed = insertPlaybookSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "validation_error", details: parsed.error.issues });
  }
  const { slug, name, objective, trigger_source, instructions } = parsed.data;
  try {
    const [row] = await db
      .insert(playbooksTable)
      .values({ slug, name, objective, trigger_source: trigger_source ?? null, instructions, source: "user" })
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
      : { name: name ?? existing.name, instructions: instructions ?? existing.instructions, trigger_source: (trigger_source !== undefined ? trigger_source : existing.trigger_source) as ("linear" | "github" | "sentry" | null), is_active: is_active ?? existing.is_active, updated_at: new Date() };

  const [row] = await db.update(playbooksTable).set(update).where(eq(playbooksTable.id, id)).returning();
  return res.json(row);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const id = validateId(req.params["id"]);
  if (!id) return res.status(400).json({ error: "invalid_id" });
  const [existing] = await db.select().from(playbooksTable).where(eq(playbooksTable.id, id)).limit(1);
  if (!existing) return res.status(404).json({ error: "not_found" });
  if (existing.source === "system") return res.status(403).json({ error: "system_playbooks_cannot_be_deleted" });

  await db.delete(playbooksTable).where(eq(playbooksTable.id, id));
  return res.status(204).send();
}));

export default router;
