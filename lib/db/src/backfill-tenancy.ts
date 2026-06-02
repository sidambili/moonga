/**
 * One-time backfill for the org/project foundation.
 *
 * Safe to run repeatedly (idempotent). Creates a single default organization +
 * project, makes every existing user an owner, and stamps existing rows:
 *   - operational data (events/sessions/artifacts) -> default project
 *   - org config (integrations/model_settings) + user-authored playbooks/skills
 *     -> default org   (system playbooks/skills stay global / NULL)
 *
 * Run after `pnpm --filter @workspace/db run push`:
 *   pnpm --filter @workspace/db run backfill
 */
import "./load-env"; // must precede ./index, which throws if DATABASE_URL is unset
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, pool } from "./index";
import {
  organization,
  member,
  projectsTable,
  user,
  eventsTable,
  sessionsTable,
  artifactsTable,
  integrationsTable,
  modelSettingsTable,
  playbooksTable,
  skillsTable,
} from "./schema";

const DEFAULT_SLUG = "default";

async function main() {
  // 1. Default organization
  let [org] = await db
    .select()
    .from(organization)
    .where(eq(organization.slug, DEFAULT_SLUG))
    .limit(1);
  if (!org) {
    [org] = await db
      .insert(organization)
      .values({ id: randomUUID(), name: "Default", slug: DEFAULT_SLUG })
      .returning();
    console.log(`created default organization ${org.id}`);
  }

  // 2. Default project under that org
  let [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.organization_id, org.id))
    .limit(1);
  if (!project) {
    [project] = await db
      .insert(projectsTable)
      .values({ id: randomUUID(), organization_id: org.id, name: "Default", slug: DEFAULT_SLUG })
      .returning();
    console.log(`created default project ${project.id}`);
  }

  // 3. Make every existing user an owner of the default org
  const users = await db.select({ id: user.id, email: user.email }).from(user);
  for (const u of users) {
    const [existing] = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, org.id), eq(member.userId, u.id)))
      .limit(1);
    if (!existing) {
      await db.insert(member).values({
        id: randomUUID(),
        organizationId: org.id,
        userId: u.id,
        role: "owner",
      });
      console.log(`added ${u.email} as owner`);
    }
  }

  // 4. Operational data -> default project
  await db.update(eventsTable).set({ project_id: project.id }).where(isNull(eventsTable.project_id));
  await db.update(sessionsTable).set({ project_id: project.id }).where(isNull(sessionsTable.project_id));
  await db.update(artifactsTable).set({ project_id: project.id }).where(isNull(artifactsTable.project_id));

  // 5. Org-level config -> default org (system playbooks/skills stay global)
  await db.update(integrationsTable).set({ organization_id: org.id }).where(isNull(integrationsTable.organization_id));
  await db.update(modelSettingsTable).set({ organization_id: org.id }).where(isNull(modelSettingsTable.organization_id));
  await db
    .update(playbooksTable)
    .set({ organization_id: org.id })
    .where(and(isNull(playbooksTable.organization_id), eq(playbooksTable.source, "user")));
  await db
    .update(skillsTable)
    .set({ organization_id: org.id })
    .where(and(isNull(skillsTable.organization_id), eq(skillsTable.source, "user")));

  console.log("tenancy backfill complete");
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
