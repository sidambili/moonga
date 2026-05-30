import { Router } from "express";
import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function maskKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

function toPublic(row: typeof integrationsTable.$inferSelect) {
  return {
    id: row.id,
    provider: row.provider,
    enabled: row.enabled,
    webhook_url: row.webhook_url,
    webhook_secret: row.webhook_secret ? "••••••••" : null,
    api_key_masked: maskKey(row.api_key),
    config: row.config,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

router.get("/", async (_req, res) => {
  try {
    const rows = await db.select().from(integrationsTable);
    res.json(rows.map(toPublic));
  } catch {
    res.status(500).json({ error: "Failed to list integrations" });
  }
});

router.get("/:provider", async (req, res) => {
  try {
    const [row] = await db.select().from(integrationsTable).where(eq(integrationsTable.provider, req.params.provider));
    if (!row) return res.status(404).json({ error: "Integration not found" });
    res.json(toPublic(row));
  } catch {
    res.status(500).json({ error: "Failed to get integration" });
  }
});

router.put("/:provider", async (req, res) => {
  try {
    const { provider } = req.params;
    const { enabled, api_key, webhook_secret, config } = req.body;

    const [existing] = await db.select().from(integrationsTable).where(eq(integrationsTable.provider, provider));

    if (existing) {
      const update: Partial<typeof integrationsTable.$inferInsert> = {
        updated_at: new Date(),
      };
      if (enabled !== undefined) update.enabled = enabled;
      if (api_key !== undefined) update.api_key = api_key;
      if (webhook_secret !== undefined) update.webhook_secret = webhook_secret;
      if (config !== undefined) update.config = config;

      const [updated] = await db.update(integrationsTable).set(update).where(eq(integrationsTable.provider, provider)).returning();
      return res.json(toPublic(updated));
    }

    const [created] = await db.insert(integrationsTable).values({
      provider,
      enabled: enabled ?? false,
      api_key: api_key ?? null,
      webhook_secret: webhook_secret ?? null,
      config: config ?? null,
    }).returning();
    res.json(toPublic(created));
  } catch {
    res.status(500).json({ error: "Failed to upsert integration" });
  }
});

router.delete("/:provider", async (req, res) => {
  try {
    await db.delete(integrationsTable).where(eq(integrationsTable.provider, req.params.provider));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete integration" });
  }
});

export default router;
