import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const eventsTable = pgTable("events", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  event_type: text("event_type").notNull(),
  severity: text("severity").notNull().default("low"),
  status: text("status").notNull().default("new"),
  // Why a terminal-status event was closed: resolved | duplicate | wont_fix | escalated.
  resolution: text("resolution"),
  service: text("service"),
  repo_id: text("repo_id"),
  ticket_id: text("ticket_id"),
  title: text("title"),
  payload_raw: jsonb("payload_raw").notNull().default({}),
  session_id: integer("session_id"),
  project_id: text("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const insertEventSchema = createInsertSchema(eventsTable).omit({ id: true, created_at: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof eventsTable.$inferSelect;
