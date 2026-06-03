import { Router } from "express";
import { z } from "zod/v4";
import { and, eq, ne } from "drizzle-orm";
import { db, projectsTable, session as authSession } from "@workspace/db";
import { newId, uniqueSlug } from "@workspace/utils";
import { logger } from "../lib/logger";
import { getActiveMembership, canManageOrg } from "../lib/org-access";

// Projects are children of an organization. Every handler is gated by both
// requireAuth (mounted in routes/index.ts) and explicit org-ownership here:
// reads need active-org membership, writes need an owner/admin role, and every
// query is scoped to the caller's active org so a project from another org can
// never be read, renamed, or activated.

const router = Router();

const bodySchema = z.object({ name: z.string().trim().min(1).max(100) });

function toPublic(row: typeof projectsTable.$inferSelect) {
  return {
    id: row.id,
    organization_id: row.organization_id,
    name: row.name,
    slug: row.slug,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function asyncHandler(fn: (req: any, res: any) => Promise<any>) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      logger.error({ err }, "Unhandled projects route error");
      if (res.headersSent) {
        return next(err);
      }
      return res.status(500).json({ error: "internal_error" });
    });
  };
}

function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && err.code === "23505";
}

/** A unique project slug within one organization. */
function uniqueProjectSlug(orgId: string, name: string, excludeProjectId?: string): Promise<string> {
  const exists = async (slug: string) => {
    const [row] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(
        excludeProjectId
          ? and(
              eq(projectsTable.organization_id, orgId),
              eq(projectsTable.slug, slug),
              ne(projectsTable.id, excludeProjectId),
            )
          : and(eq(projectsTable.organization_id, orgId), eq(projectsTable.slug, slug)),
      )
      .limit(1);
    return Boolean(row);
  };
  return uniqueSlug(name, exists, { fallback: "project" });
}

async function insertProject(orgId: string, name: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const slug = await uniqueProjectSlug(orgId, name);
    try {
      const [row] = await db
        .insert(projectsTable)
        .values({ id: newId(), organization_id: orgId, name, slug })
        .returning();
      return row;
    } catch (err) {
      if (isUniqueViolation(err) && attempt === 0) continue;
      throw err;
    }
  }
  throw new Error("Failed to insert project");
}

/** Load a project that belongs to the caller's active org, or null. */
async function getOwnedProject(res: any, projectId: string) {
  const orgId = res.locals.activeOrganizationId as string | null;
  if (!orgId) return null;
  const [row] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.organization_id, orgId)))
    .limit(1);
  return row ?? null;
}

// List projects in the active org + the caller's active project id.
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const membership = await getActiveMembership(res);
    if (!membership) return res.status(403).json({ error: "forbidden" });

    const rows = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.organization_id, res.locals.activeOrganizationId))
      .orderBy(projectsTable.created_at);

    // Only echo activeProjectId if it belongs to the active org — after an org
    // switch the session may still point at the previous org's project.
    const activeProjectId = (res.locals.activeProjectId as string | null) ?? null;
    const validActiveId = rows.some((r) => r.id === activeProjectId) ? activeProjectId : null;

    return res.json({
      items: rows.map(toPublic),
      activeProjectId: validActiveId,
    });
  }),
);

// Create a project in the active org (owner/admin only).
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const membership = await getActiveMembership(res);
    if (!canManageOrg(membership)) return res.status(403).json({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "validation_error", details: parsed.error.issues });
    }
    const orgId = res.locals.activeOrganizationId as string;
    let row: typeof projectsTable.$inferSelect;
    try {
      row = await insertProject(orgId, parsed.data.name);
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: "duplicate_slug" });
      throw err;
    }
    return res.status(201).json(toPublic(row));
  }),
);

// Rename a project (owner/admin only).
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const membership = await getActiveMembership(res);
    if (!canManageOrg(membership)) return res.status(403).json({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "validation_error", details: parsed.error.issues });
    }
    const existing = await getOwnedProject(res, req.params.id);
    if (!existing) return res.status(404).json({ error: "not_found" });

    const slug = await uniqueProjectSlug(existing.organization_id, parsed.data.name, existing.id);
    let row: typeof projectsTable.$inferSelect;
    try {
      [row] = await db
        .update(projectsTable)
        .set({ name: parsed.data.name, slug, updated_at: new Date() })
        .where(eq(projectsTable.id, existing.id))
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: "duplicate_slug" });
      throw err;
    }
    return res.json(toPublic(row));
  }),
);

// Switch the caller's active project (any member of the active org).
router.post(
  "/:id/activate",
  asyncHandler(async (req, res) => {
    const membership = await getActiveMembership(res);
    if (!membership) return res.status(403).json({ error: "forbidden" });

    const existing = await getOwnedProject(res, req.params.id);
    if (!existing) return res.status(404).json({ error: "not_found" });

    await db
      .update(authSession)
      .set({ activeProjectId: existing.id })
      .where(eq(authSession.id, res.locals.sessionId));
    return res.json({ activeProjectId: existing.id });
  }),
);

export default router;
