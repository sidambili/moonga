import { pgTable, serial, text, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playbooksTable } from "./playbooks";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  event_id: integer("event_id").notNull(),
  objective: text("objective").notNull(),
  status: text("status").notNull().default("pending"),
  model_used: text("model_used"),
  context_snapshot: jsonb("context_snapshot"),
  output_summary: text("output_summary"),
  confidence_score: real("confidence_score"),
  failure_reason: text("failure_reason"),
  total_tokens: integer("total_tokens"),
  total_prompt_tokens: integer("total_prompt_tokens"),
  total_completion_tokens: integer("total_completion_tokens"),
  total_cost: real("total_cost"),
  prompt_token_cost: real("prompt_token_cost"),
  completion_token_cost: real("completion_token_cost"),
  cached_tokens: integer("cached_tokens"),
  cached_cost: real("cached_cost"),
  tool_calls_count: integer("tool_calls_count"),
  step_count: integer("step_count"),
  duration_ms: integer("duration_ms"),
  playbook_id: integer("playbook_id").references(() => playbooksTable.id, { onDelete: "set null" }),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
