import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionStepsTable = pgTable("session_steps", {
  id: serial("id").primaryKey(),
  session_id: integer("session_id").notNull(),
  step_number: integer("step_number").notNull(),
  role: text("role").notNull(), // "user" | "assistant" | "tool"
  content: text("content"),
  tool_calls: jsonb("tool_calls"), // array of tool call definitions
  tool_call_id: text("tool_call_id"), // which tool call this result belongs to
  tool_name: text("tool_name"),
  tool_result: jsonb("tool_result"),
  model: text("model"),
  tokens_used: integer("tokens_used"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const insertSessionStepSchema = createInsertSchema(sessionStepsTable).omit({ id: true, created_at: true });
export type InsertSessionStep = z.infer<typeof insertSessionStepSchema>;
export type SessionStep = typeof sessionStepsTable.$inferSelect;
