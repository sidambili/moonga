import { pgTable, serial, text, integer, timestamp, jsonb, real, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { eventsTable } from "./events";
import { playbooksTable } from "./playbooks";
import { projectsTable } from "./projects";

export const agentSessionsTable = pgTable("agent_sessions", {
  id: serial("id").primaryKey(),
  event_id: integer("event_id").notNull().references(() => eventsTable.id, { onDelete: "cascade" }),
  objective: text("objective").notNull(),
  status: text("status").notNull().default("pending"),
  model_used: text("model_used"),
  context_snapshot: jsonb("context_snapshot"),
  output_summary: text("output_summary"),
  confidence_score: real("confidence_score"),
  failure_reason: text("failure_reason"),
  // Triage-only escalation signals. needs_plan is the guarded recommendation
  // (suppressed for duplicates / low confidence); duplicate_of holds the
  // identifier of the issue this duplicates, if any. Drive the human "Escalate
  // to Plan" gate — triage no longer auto-spawns Plan sessions.
  needs_plan: boolean("needs_plan"),
  duplicate_of: text("duplicate_of"),
  // Set when the duplicate was actioned in Linear (relation + canceled state).
  // Gates the "Mark Duplicate" button so it can't fire repeat comments/relations.
  marked_duplicate_at: timestamp("marked_duplicate_at"),
  total_tokens: integer("total_tokens"),
  total_prompt_tokens: integer("total_prompt_tokens"),
  total_completion_tokens: integer("total_completion_tokens"),
  total_cost: real("total_cost"),
  prompt_token_cost: real("prompt_token_cost"),
  completion_token_cost: real("completion_token_cost"),
  cached_tokens: integer("cached_tokens"),
  // Realized cache-read savings (USD) reported by OpenRouter via usage.cache_discount,
  // not an estimate. Null when the upstream reported cache hits but no discount.
  cached_cost: real("cached_cost"),
  tool_calls_count: integer("tool_calls_count"),
  step_count: integer("step_count"),
  duration_ms: integer("duration_ms"),
  // Set on sessions created via the "Re-plan" action — holds the critic's review
  // text so the plan agent can address it. Also gates the critic pass (skip when set).
  critique_context: text("critique_context"),
  playbook_id: integer("playbook_id").references(() => playbooksTable.id, { onDelete: "set null" }),
  project_id: text("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("agent_sessions_event_id_idx").on(table.event_id),
  index("agent_sessions_status_idx").on(table.status),
  index("agent_sessions_project_id_idx").on(table.project_id),
]);

export const insertAgentSessionSchema = createInsertSchema(agentSessionsTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertAgentSession = z.infer<typeof insertAgentSessionSchema>;
export type AgentSession = typeof agentSessionsTable.$inferSelect;
