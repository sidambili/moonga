import { pgTable, serial, text, real, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const modelPricesTable = pgTable("model_prices", {
  id: serial("id").primaryKey(),
  model_slug: text("model_slug").notNull().unique(),
  display_name: text("display_name"),
  provider: text("provider"),
  // Manual override rates (the source of truth until an API fetch happens)
  input_rate: real("input_rate").notNull(),
  output_rate: real("output_rate").notNull(),
  // Cached rates fetched from external provider APIs (e.g. OpenRouter). Null until fetched.
  cached_input_rate: real("cached_input_rate"),
  cached_output_rate: real("cached_output_rate"),
  // Pricing unit: "1M" = per 1,000,000 tokens, "1K" = per 1,000 tokens
  pricing_unit: text("pricing_unit").notNull().default("1M"),
  context_window: integer("context_window"),
  is_active: boolean("is_active").notNull().default(true),
  // When the model was publicly released (null if unknown)
  released_at: timestamp("released_at"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

export const insertModelPriceSchema = createInsertSchema(modelPricesTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertModelPrice = z.infer<typeof insertModelPriceSchema>;
export type ModelPrice = typeof modelPricesTable.$inferSelect;
