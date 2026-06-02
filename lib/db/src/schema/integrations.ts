import { pgTable, serial, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organization } from "./organizations";

export const integrationsTable = pgTable("integrations", {
  id: serial("id").primaryKey(),
  organization_id: text("organization_id").references(() => organization.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  webhook_url: text("webhook_url"),
  webhook_secret: text("webhook_secret"),
  api_key: text("api_key"),
  config: jsonb("config"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const insertIntegrationSchema = createInsertSchema(integrationsTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;
export type Integration = typeof integrationsTable.$inferSelect;
