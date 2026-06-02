import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organization } from "./organizations";

export const modelSettingsTable = pgTable("model_settings", {
  id: serial("id").primaryKey(),
  organization_id: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("openai"),
  triage_model: text("triage_model").notNull().default("gpt-4o-mini"),
  plan_model: text("plan_model").notNull().default("gpt-4o"),
  api_key: text("api_key"),
  base_url: text("base_url"),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const insertModelSettingsSchema = createInsertSchema(modelSettingsTable).omit({ id: true, updated_at: true });
export type InsertModelSettings = z.infer<typeof insertModelSettingsSchema>;
export type ModelSettings = typeof modelSettingsTable.$inferSelect;
