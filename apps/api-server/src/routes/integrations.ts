import { Router } from "express";
import { Octokit } from "octokit";
import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getLinearClient } from "../lib/integrations/linear-client";

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
  const orgId = res.locals.activeOrganizationId as string | null;
  if (!orgId) return res.status(400).json({ error: "No active organization" });
  try {
    const rows = await db
      .select()
      .from(integrationsTable)
      .where(eq(integrationsTable.organization_id, orgId));
    return res.json(rows.map(toPublic));
  } catch {
    return res.status(500).json({ error: "Failed to list integrations" });
  }
});

router.get("/:provider", async (req, res) => {
  const orgId = res.locals.activeOrganizationId as string | null;
  if (!orgId) return res.status(400).json({ error: "No active organization" });
  try {
    const [row] = await db
      .select()
      .from(integrationsTable)
      .where(
        and(
          eq(integrationsTable.organization_id, orgId),
          eq(integrationsTable.provider, req.params.provider),
        ),
      );
    if (!row) return res.status(404).json({ error: "Integration not found" });
    return res.json(toPublic(row));
  } catch {
    return res.status(500).json({ error: "Failed to get integration" });
  }
});

router.put("/:provider", async (req, res) => {
  const orgId = res.locals.activeOrganizationId as string | null;
  if (!orgId) return res.status(400).json({ error: "No active organization" });
  try {
    const { provider } = req.params;
    const { enabled, api_key, webhook_secret, config } = req.body;

    const [existing] = await db
      .select()
      .from(integrationsTable)
      .where(
        and(
          eq(integrationsTable.organization_id, orgId),
          eq(integrationsTable.provider, provider),
        ),
      );

    if (existing) {
      const update: Partial<typeof integrationsTable.$inferInsert> = {
        updated_at: new Date(),
      };
      if (enabled !== undefined) update.enabled = enabled;
      if (api_key !== undefined) update.api_key = api_key;
      if (webhook_secret !== undefined) update.webhook_secret = webhook_secret;
      if (config !== undefined) update.config = config;

      const [updated] = await db
        .update(integrationsTable)
        .set(update)
        .where(
          and(
            eq(integrationsTable.organization_id, orgId),
            eq(integrationsTable.provider, provider),
          ),
        )
        .returning();
      return res.json(toPublic(updated));
    }

    const [created] = await db
      .insert(integrationsTable)
      .values({
        organization_id: orgId,
        provider,
        enabled: enabled ?? false,
        api_key: api_key ?? null,
        webhook_secret: webhook_secret ?? null,
        config: config ?? null,
      })
      .returning();
    return res.json(toPublic(created));
  } catch {
    return res.status(500).json({ error: "Failed to upsert integration" });
  }
});

router.get("/:provider/repos", async (req, res) => {
  const orgId = res.locals.activeOrganizationId as string | null;
  if (!orgId) return res.status(400).json({ error: "No active organization" });
  try {
    const [row] = await db
      .select()
      .from(integrationsTable)
      .where(
        and(
          eq(integrationsTable.organization_id, orgId),
          eq(integrationsTable.provider, req.params.provider),
        ),
      );
    if (!row) return res.status(404).json({ error: "Integration not found" });
    if (!row.api_key) return res.status(400).json({ error: "No API key configured for this provider" });

    const client = new Octokit({ auth: row.api_key });
    const { data: repos } = await client.rest.repos.listForAuthenticatedUser({
      sort: "updated",
      per_page: 100,
    });

    const result = repos.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      name: r.name,
      owner: r.owner.login,
      private: r.private,
    }));

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: "Failed to list repositories", message: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/:provider/teams", async (req, res) => {
  const orgId = res.locals.activeOrganizationId as string | null;
  if (!orgId) return res.status(400).json({ error: "No active organization" });
  try {
    const { provider } = req.params;
    if (provider !== "linear") {
      return res.status(400).json({ error: "Team listing is only supported for Linear" });
    }

    const [row] = await db
      .select()
      .from(integrationsTable)
      .where(
        and(
          eq(integrationsTable.organization_id, orgId),
          eq(integrationsTable.provider, provider),
        ),
      );
    if (!row) return res.status(404).json({ error: "Integration not found" });

    const linear = await getLinearClient();
    if (!linear) {
      return res.status(503).json({ error: "Linear is not configured or missing API key" });
    }

    const teamsConn = await linear.teams();
    const teamNodes = [];
    let conn = teamsConn;
    while (conn) {
      teamNodes.push(...conn.nodes);
      if (conn.pageInfo.hasNextPage) {
        conn = await conn.fetchNext();
      } else {
        break;
      }
    }
    const teams = teamNodes.map((t) => ({ id: t.id, name: t.name }));
    return res.json(teams);
  } catch (err) {
    return res.status(500).json({ error: "Failed to list teams", message: err instanceof Error ? err.message : String(err) });
  }
});

router.delete("/:provider", async (req, res) => {
  const orgId = res.locals.activeOrganizationId as string | null;
  if (!orgId) return res.status(400).json({ error: "No active organization" });
  try {
    await db
      .delete(integrationsTable)
      .where(
        and(
          eq(integrationsTable.organization_id, orgId),
          eq(integrationsTable.provider, req.params.provider),
        ),
      );
    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: "Failed to delete integration" });
  }
});

export default router;
