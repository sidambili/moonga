/**
 * Tenancy provisioning — the business logic for giving a user an organization +
 * project. DB-coupled, so it lives in @workspace/db beside the schema and the
 * one-time backfill ([backfill-tenancy.ts]) that performs the same inserts.
 */
import { eq } from "drizzle-orm";
import { newId, uniqueSlug } from "@workspace/utils";
import { db } from "./index";
import { organization, member, projectsTable } from "./schema";

export interface ProvisionUser {
  id: string;
  name?: string | null;
  email: string;
}

/** True if an organization with this slug already exists. */
async function orgSlugExists(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1);
  return Boolean(row);
}

/** A unique organization slug derived from a user's name/email. */
export function uniqueOrgSlug(base: string): Promise<string> {
  return uniqueSlug(base, orgSlugExists, { fallback: "org" });
}

/** The id of the user's first-owned (oldest) organization, or null if none. */
export async function getUserPrimaryOrgId(userId: string): Promise<string | null> {
  const [m] = await db
    .select({ orgId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(member.createdAt)
    .limit(1);
  return m?.orgId ?? null;
}

/**
 * Provision a personal organization + default project for a freshly created user
 * and make them its owner. Idempotent: a no-op if the user already belongs to an
 * org. Throws on failure — callers (e.g. the signup hook) should let it bubble so a
 * half-provisioned user is never created.
 */
export async function provisionDefaultTenancy(user: ProvisionUser): Promise<void> {
  if (await getUserPrimaryOrgId(user.id)) return;

  const orgId = newId();
  const slug = await uniqueOrgSlug(user.name || user.email.split("@")[0] || "org");

  await db.transaction(async (tx) => {
    await tx.insert(organization).values({ id: orgId, name: "Default", slug });
    await tx.insert(member).values({
      id: newId(),
      organizationId: orgId,
      userId: user.id,
      role: "owner",
    });
    await tx.insert(projectsTable).values({
      id: newId(),
      organization_id: orgId,
      name: "Default",
      slug: "default",
    });
  });
}
