import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

// A project source binds an external resource (a Linear team, a GitHub repo) to a
// project, so inbound webhooks can be routed to the right project. The credential
// to talk to that provider still lives org-level on `integrations` — a source is
// pure routing, not auth. `(provider, external_id)` is unique so a given external
// resource maps to exactly one project (deterministic webhook routing).

export const projectSourcesTable = pgTable(
  "project_sources",
  {
    id: text("id").primaryKey(),
    project_id: text("project_id")
      .notNull()
      .references(() => projectsTable.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "linear" | "github" | ...
    external_id: text("external_id").notNull(), // linear team id, github repo full_name, ...
    label: text("label"), // human-friendly name shown in the UI
    // Custom instructions injected into the agent context when this source triggers a session.
    // Use this to tell the agent how/when to use this repo, coding conventions, escalation rules, etc.
    notes: text("notes"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("project_sources_provider_external_id_unique").on(t.provider, t.external_id)],
);

export const projectSourcesRelations = relations(projectSourcesTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [projectSourcesTable.project_id],
    references: [projectsTable.id],
  }),
}));

export const projectSourceCreateSchema = z.object({
  project_id: z.string().min(1),
  provider: z.string().min(1).max(40),
  external_id: z.string().trim().min(1).max(200),
  label: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const projectSourceUpdateSchema = z.object({
  label: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

export type ProjectSource = typeof projectSourcesTable.$inferSelect;
