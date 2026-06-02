import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playbooksTable = pgTable("playbooks", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  objective: text("objective").notNull(),       // "diagnose" | "plan"
  trigger_source: text("trigger_source"),        // "linear" | "github" | "sentry" | null = any
  instructions: text("instructions").notNull(),
  source: text("source").notNull().default("user"), // "system" | "user"
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPlaybookSchema = createInsertSchema(playbooksTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertPlaybook = z.infer<typeof insertPlaybookSchema>;
export type Playbook = typeof playbooksTable.$inferSelect;
