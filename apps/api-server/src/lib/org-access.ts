import type { Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, member } from "@workspace/db";

/**
 * Authorization helpers for org-scoped routes.
 *
 * The codebase's authz model is tenant ownership, not RBAC: a request may only
 * touch data in the org it is active in, and that active org is one better-auth
 * has already verified the user is a member of (setActive enforces membership).
 * These helpers make that gate explicit on each handler — read needs membership,
 * writes need an owner/admin role.
 *
 * `requireAuth` populates res.locals.{userId,activeOrganizationId}.
 */

export type OrgRole = "owner" | "admin" | "member";

/** The caller's membership row in their active org, or null if none/no active org. */
export async function getActiveMembership(
  res: Response,
): Promise<{ role: OrgRole } | null> {
  const userId = res.locals.userId as string | undefined;
  const orgId = res.locals.activeOrganizationId as string | null | undefined;
  if (!userId || !orgId) return null;

  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
    .limit(1);
  return row ? { role: row.role as OrgRole } : null;
}

/** True if the caller can mutate org-level resources (owner or admin). */
export function canManageOrg(membership: { role: OrgRole } | null): boolean {
  return membership?.role === "owner" || membership?.role === "admin";
}
