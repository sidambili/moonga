import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organization } from "./organizations";

// A project is a child of an organization. Operational data (events, sessions,
// artifacts) is scoped to a project; org-level config (integrations, model
// settings) is scoped to the organization directly.

export const projectsTable = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("projects_organization_slug_unique").on(table.organization_id, table.slug)],
);

export const projectsRelations = relations(projectsTable, ({ one }) => ({
  organization: one(organization, {
    fields: [projectsTable.organization_id],
    references: [organization.id],
  }),
}));

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
