import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, projectsTable, projectSourcesTable, projectSourceCreateSchema } from "@workspace/db";
import { newId } from "@workspace/utils";
import { logger } from "../lib/logger";
import { getActiveMembership, canManageOrg } from "../lib/org-access";

// Project sources map external resources (Linear team, GitHub repo) to a project.
// Gated like projects: reads need active-org membership, writes need owner/admin,
// and every row is reached only through a project in the caller's active org.

const router = Router();

function asyncHandler(fn: (req: any, res: any) => Promise<any>) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      logger.error({ err }, "Unhandled project-sources route error");
      if (res.headersSent) return next(err);
      return res.status(500).json({ error: "internal_error" });
    });
  };
}

function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && err.code === "23505";
}

function toPublic(row: typeof projectSourcesTable.$inferSelect & { project_name?: string }) {
  return {
    id: row.id,
    project_id: row.project_id,
    project_name: row.project_name ?? null,
    provider: row.provider,
    external_id: row.external_id,
    label: row.label,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/** True if the project belongs to the caller's active org. */
async function projectInActiveOrg(res: any, projectId: string): Promise<boolean> {
  const orgId = res.locals.activeOrganizationId as string | null;
  if (!orgId) return false;
  const [row] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.organization_id, orgId)))
    .limit(1);
  return Boolean(row);
}

// List every source under a project in the active org.
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const membership = await getActiveMembership(res);
    if (!membership) return res.status(403).json({ error: "forbidden" });

    const rows = await db
      .select({
        id: projectSourcesTable.id,
        project_id: projectSourcesTable.project_id,
        provider: projectSourcesTable.provider,
        external_id: projectSourcesTable.external_id,
        label: projectSourcesTable.label,
        created_at: projectSourcesTable.created_at,
        updated_at: projectSourcesTable.updated_at,
        project_name: projectsTable.name,
      })
      .from(projectSourcesTable)
      .innerJoin(projectsTable, eq(projectSourcesTable.project_id, projectsTable.id))
      .where(eq(projectsTable.organization_id, res.locals.activeOrganizationId))
      .orderBy(projectSourcesTable.created_at);

    return res.json(rows.map(toPublic));
  }),
);

// Bind an external resource to a project (owner/admin only).
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const membership = await getActiveMembership(res);
    if (!canManageOrg(membership)) return res.status(403).json({ error: "forbidden" });

    const parsed = projectSourceCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "validation_error", details: parsed.error.issues });
    }
    if (!(await projectInActiveOrg(res, parsed.data.project_id))) {
      return res.status(404).json({ error: "project_not_found" });
    }

    try {
      const [row] = await db
        .insert(projectSourcesTable)
        .values({
          id: newId(),
          project_id: parsed.data.project_id,
          provider: parsed.data.provider,
          external_id: parsed.data.external_id,
          label: parsed.data.label ?? null,
        })
        .returning();
      return res.status(201).json(toPublic(row));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: "source_already_mapped" });
      }
      throw err;
    }
  }),
);

// Remove a binding (owner/admin only).
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const membership = await getActiveMembership(res);
    if (!canManageOrg(membership)) return res.status(403).json({ error: "forbidden" });

    const [existing] = await db
      .select({ id: projectSourcesTable.id, project_id: projectSourcesTable.project_id })
      .from(projectSourcesTable)
      .where(eq(projectSourcesTable.id, req.params.id))
      .limit(1);
    if (!existing || !(await projectInActiveOrg(res, existing.project_id))) {
      return res.status(404).json({ error: "not_found" });
    }

    await db.delete(projectSourcesTable).where(eq(projectSourcesTable.id, existing.id));
    return res.status(204).send();
  }),
);

export default router;
