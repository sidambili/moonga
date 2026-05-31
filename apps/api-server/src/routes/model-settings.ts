import { Router } from "express";
import { db } from "@workspace/db";
import { modelSettingsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

async function getOrCreate() {
  const rows = await db.select().from(modelSettingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(modelSettingsTable).values({}).returning();
  return created;
}

function toPublic(row: typeof modelSettingsTable.$inferSelect) {
  return {
    id: row.id,
    provider: row.provider,
    triage_model: row.triage_model,
    plan_model: row.plan_model,
    api_key_set: !!row.api_key,
    base_url: row.base_url,
    updated_at: row.updated_at.toISOString(),
  };
}

router.get("/", async (_req, res) => {
  try {
    const row = await getOrCreate();
    res.json(toPublic(row));
  } catch {
    res.status(500).json({ error: "Failed to get model settings" });
  }
});

router.put("/", async (req, res) => {
  try {
    const { provider, triage_model, plan_model, api_key, base_url } = req.body;
    const row = await getOrCreate();

    const update: Partial<typeof modelSettingsTable.$inferInsert> = {
      updated_at: new Date(),
    };
    if (provider !== undefined) update.provider = provider;
    if (triage_model !== undefined) update.triage_model = triage_model;
    if (plan_model !== undefined) update.plan_model = plan_model;
    if (api_key !== undefined) update.api_key = api_key;
    if (base_url !== undefined) update.base_url = base_url;

    const [updated] = await db.update(modelSettingsTable).set(update).where(sql`id = ${row.id}`).returning();
    res.json(toPublic(updated));
  } catch {
    res.status(500).json({ error: "Failed to update model settings" });
  }
});

export default router;
