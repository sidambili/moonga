import { pgTable, serial, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organization } from "./organizations";

export const objectiveEnum = pgEnum("objective", ["diagnose", "plan"]);
export const triggerSourceEnum = pgEnum("trigger_source", ["linear", "github", "sentry"]);
export const playbookSourceEnum = pgEnum("playbook_source", ["system", "user"]);

export const playbooksTable = pgTable("playbooks", {
  id: serial("id").primaryKey(),
  // NULL = global/system default shared across orgs; non-null = org-owned.
  organization_id: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  objective: objectiveEnum("objective").notNull(),
  trigger_source: triggerSourceEnum("trigger_source"),
  instructions: text("instructions").notNull(),
  source: playbookSourceEnum("source").notNull().default("user"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPlaybookSchema = createInsertSchema(playbooksTable)
  .omit({ id: true, created_at: true, updated_at: true })
  .extend({
    objective: z.enum(["diagnose", "plan"]),
    trigger_source: z.enum(["linear", "github", "sentry"]).nullable().optional(),
    source: z.enum(["system", "user"]).default("user"),
  });

export type InsertPlaybook = z.infer<typeof insertPlaybookSchema>;
export type Playbook = typeof playbooksTable.$inferSelect;
