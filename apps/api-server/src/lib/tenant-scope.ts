import type { Response } from "express";
import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db, projectsTable } from "@workspace/db";

/**
 * Read-time tenant scoping for operational data (events / sessions / artifacts).
 *
 * These tables are scoped to a project via a nullable `project_id`; an org owns
 * many projects. To scope by the caller's active org we match any project_id that
 * belongs to that org, via a correlated subquery so it stays a single statement.
 *
 * NULL project_id is deliberately included: webhooks don't yet stamp project_id
 * (the write-scoping layer is unbuilt), so excluding NULL would hide all incoming
 * data from every org. Including it keeps this purely additive and migration-safe
 * — backfilled/stamped rows scope correctly, unstamped rows remain visible until
 * write-scoping lands.
 *
 * Returns `undefined` when there is no active org (no scoping → current behavior).
 * `requireAuth` populates `res.locals.activeOrganizationId`.
 */
export function tenantScope(res: Response, projectIdColumn: PgColumn): SQL | undefined {
  const organizationId = res.locals.activeOrganizationId as string | null | undefined;
  if (!organizationId) return undefined;

  const orgProjectIds = db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(eq(projectsTable.organization_id, organizationId));

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
