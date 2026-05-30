import { pgTable, serial, text, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  event_id: integer("event_id").notNull(),
  objective: text("objective").notNull(),
  status: text("status").notNull().default("pending"),
  model_used: text("model_used"),
  context_snapshot: jsonb("context_snapshot"),
  output_summary: text("output_summary"),
  confidence_score: real("confidence_score"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
