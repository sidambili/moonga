import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const artifactsTable = pgTable("artifacts", {
  id: serial("id").primaryKey(),
  session_id: integer("session_id").notNull(),
  type: text("type").notNull(),
  content: text("content").notNull(),
  approval_state: text("approval_state").notNull().default("draft"),
  synced_to_linear_at: timestamp("synced_to_linear_at"),
  project_id: text("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const insertArtifactSchema = createInsertSchema(artifactsTable).omit({ id: true, created_at: true });
export type InsertArtifact = z.infer<typeof insertArtifactSchema>;
export type Artifact = typeof artifactsTable.$inferSelect;
