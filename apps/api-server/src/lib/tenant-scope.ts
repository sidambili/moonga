import type { Response } from "express";
import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db, projectsTable } from "@workspace/db";

/**
 * Read-time tenant scoping for operational data (events / sessions / artifacts).
 *
 * These tables are scoped to a project via a nullable `project_id`; an org owns
 * many projects. Two modes, driven by the caller's session:
 *
 *  - Active project set ("scoped view") → match exactly that project_id, but only
 *    if it belongs to the active org (the inArray subquery guards against a stale
 *    id left over from a previous org). NULL rows are excluded — they belong to no
 *    project, so they don't show under a single-project view.
 *  - No active project ("All Projects") → match any project_id in the active org,
 *    plus NULL. NULL is included because pre-routing / unmapped webhooks may still
 *    land unstamped; keeping them visible is migration-safe.
 *
 * Returns `undefined` when there is no active org (no scoping → current behavior).
 * `requireAuth` populates `res.locals.activeOrganizationId` / `activeProjectId`.
 */
export function tenantScope(res: Response, projectIdColumn: PgColumn): SQL | undefined {
  const organizationId = res.locals.activeOrganizationId as string | null | undefined;
  if (!organizationId) return undefined;

  const orgProjectIds = db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(eq(projectsTable.organization_id, organizationId));

  const activeProjectId = res.locals.activeProjectId as string | null | undefined;
  if (activeProjectId) {
    return and(eq(projectIdColumn, activeProjectId), inArray(projectIdColumn, orgProjectIds));
  }

  return or(inArray(projectIdColumn, orgProjectIds), isNull(projectIdColumn));
}

/** `and(...)` of an optional tenant scope with the route's other conditions. */
export function withTenantScope(
  res: Response,
  projectIdColumn: PgColumn,
  ...conditions: (SQL | undefined)[]
): SQL | undefined {
  return and(tenantScope(res, projectIdColumn), ...conditions);
}
