import { db } from "@workspace/db";
import { modelPricesTable } from "@workspace/db";
import { eq, like, and } from "drizzle-orm";
import { logger } from "./logger";

const DEFAULT_INPUT_RATE = 2.5;
const DEFAULT_OUTPUT_RATE = 10.0;

interface ModelPrice {
  inputRate: number;
  outputRate: number;
  // Discounted rate for cache-read (cached prompt) tokens. Null when unknown —
  // callers fall back to a provider-typical multiple of inputRate.
  cachedInputRate: number | null;
  // "1M" (per 1,000,000 tokens) or "1K" (per 1,000 tokens).
  unit: string;
}

type PriceRow = typeof modelPricesTable.$inferSelect;

function toModelPrice(row: PriceRow): ModelPrice {
  return {
    inputRate: row.input_rate,
    outputRate: row.output_rate,
    cachedInputRate: row.cached_input_rate ?? null,
    unit: row.pricing_unit ?? "1M",
  };
}

export async function getModelPrice(model: string): Promise<ModelPrice> {
  const m = model.toLowerCase().trim();

  // 1. Exact match
  const [exact] = await db
    .select()
    .from(modelPricesTable)
    .where(and(eq(modelPricesTable.model_slug, m), eq(modelPricesTable.is_active, true)))
    .limit(1);

  if (exact) {
    return toModelPrice(exact);
  }

  // 2. Substring match (model slug contains the query, or vice versa)
  const rows = await db
    .select()
    .from(modelPricesTable)
    .where(and(like(modelPricesTable.model_slug, `%${m}%`), eq(modelPricesTable.is_active, true)))
    .limit(1);

  if (rows.length > 0) {
    return toModelPrice(rows[0]);
  }

  // 3. Reverse substring match (query contains model slug)
  const allRows = await db
    .select()
    .from(modelPricesTable)
    .where(eq(modelPricesTable.is_active, true));

  for (const row of allRows) {
    if (m.includes(row.model_slug.toLowerCase())) {
      return toModelPrice(row);
    }
  }

  logger.warn({ model }, "No price found for model — using default fallback");
  return { inputRate: DEFAULT_INPUT_RATE, outputRate: DEFAULT_OUTPUT_RATE, cachedInputRate: null, unit: "1M" };
}

export async function estimateCost(
  model: string,
  usage: { promptTokens: number; completionTokens: number },
): Promise<number> {
  const { inputRate, outputRate, unit } = await getModelPrice(model);
  const divisor = unit === "1K" ? 1_000 : 1_000_000;
  const promptCost = (usage.promptTokens / divisor) * inputRate;
  const completionCost = (usage.completionTokens / divisor) * outputRate;
  return parseFloat((promptCost + completionCost).toFixed(6));
}

const DEFAULT_PRICES: Array<{ model_slug: string; display_name: string; provider: string; input_rate: number; output_rate: number; context_window: number; pricing_unit: string }> = [
  { model_slug: "gpt-4.1", display_name: "GPT-4.1", provider: "openai", input_rate: 2.0, output_rate: 8.0, context_window: 1_000_000, pricing_unit: "1M" },
  { model_slug: "gpt-4.1-mini", display_name: "GPT-4.1 Mini", provider: "openai", input_rate: 0.40, output_rate: 1.60, context_window: 1_000_000, pricing_unit: "1M" },
  { model_slug: "gpt-4.1-nano", display_name: "GPT-4.1 Nano", provider: "openai", input_rate: 0.10, output_rate: 0.40, context_window: 1_000_000, pricing_unit: "1M" },
  { model_slug: "o3", display_name: "o3", provider: "openai", input_rate: 10.0, output_rate: 40.0, context_window: 200_000, pricing_unit: "1M" },
  { model_slug: "o4-mini", display_name: "o4-mini", provider: "openai", input_rate: 1.10, output_rate: 4.40, context_window: 200_000, pricing_unit: "1M" },
  { model_slug: "claude-sonnet-4", display_name: "Claude 4 Sonnet", provider: "anthropic", input_rate: 3.0, output_rate: 15.0, context_window: 200_000, pricing_unit: "1M" },
  { model_slug: "claude-opus-4", display_name: "Claude 4 Opus", provider: "anthropic", input_rate: 15.0, output_rate: 75.0, context_window: 200_000, pricing_unit: "1M" },
  { model_slug: "claude-sonnet-4-1", display_name: "Claude 4.1 Sonnet", provider: "anthropic", input_rate: 1.0, output_rate: 5.0, context_window: 200_000, pricing_unit: "1M" },
  { model_slug: "gemini-2.5-pro", display_name: "Gemini 2.5 Pro", provider: "google", input_rate: 1.25, output_rate: 10.0, context_window: 1_000_000, pricing_unit: "1M" },
  { model_slug: "gemini-2.5-flash", display_name: "Gemini 2.5 Flash", provider: "google", input_rate: 0.075, output_rate: 0.30, context_window: 1_000_000, pricing_unit: "1M" },
  { model_slug: "deepseek-v3", display_name: "DeepSeek-V3", provider: "deepseek", input_rate: 0.27, output_rate: 1.10, context_window: 64_000, pricing_unit: "1M" },
  { model_slug: "deepseek-r1", display_name: "DeepSeek-R1", provider: "deepseek", input_rate: 0.55, output_rate: 2.19, context_window: 64_000, pricing_unit: "1M" },
  { model_slug: "deepseek-v4-pro", display_name: "DeepSeek V4 Pro", provider: "deepseek", input_rate: 0.435, output_rate: 0.87, context_window: 1_000_000, pricing_unit: "1M" },
  { model_slug: "grok-3", display_name: "Grok 3", provider: "xai", input_rate: 3.0, output_rate: 15.0, context_window: 131_072, pricing_unit: "1M" },
  { model_slug: "gpt-5.5", display_name: "GPT-5.5", provider: "openai", input_rate: 5.0, output_rate: 30.0, context_window: 256_000, pricing_unit: "1M" },
  { model_slug: "gpt-5.4-mini", display_name: "GPT-5.4 Mini", provider: "openai", input_rate: 0.75, output_rate: 4.50, context_window: 256_000, pricing_unit: "1M" },
  { model_slug: "gpt-5.4-nano", display_name: "GPT-5.4 Nano", provider: "openai", input_rate: 0.20, output_rate: 1.25, context_window: 256_000, pricing_unit: "1M" },
  { model_slug: "claude-opus-4-7", display_name: "Claude 4.7 Opus", provider: "anthropic", input_rate: 5.0, output_rate: 25.0, context_window: 1_000_000, pricing_unit: "1M" },
  { model_slug: "claude-sonnet-4-6", display_name: "Claude 4.6 Sonnet", provider: "anthropic", input_rate: 3.0, output_rate: 15.0, context_window: 1_000_000, pricing_unit: "1M" },
  { model_slug: "claude-haiku-4-5", display_name: "Claude 4.5 Haiku", provider: "anthropic", input_rate: 1.0, output_rate: 5.0, context_window: 200_000, pricing_unit: "1M" },
  { model_slug: "gemini-3.1-pro", display_name: "Gemini 3.1 Pro", provider: "google", input_rate: 2.0, output_rate: 12.0, context_window: 2_000_000, pricing_unit: "1M" },
  { model_slug: "gemini-3.5-flash", display_name: "Gemini 3.5 Flash", provider: "google", input_rate: 1.50, output_rate: 9.0, context_window: 1_000_000, pricing_unit: "1M" },
  { model_slug: "deepseek-v3-2", display_name: "DeepSeek-V3.2", provider: "deepseek", input_rate: 0.14, output_rate: 0.28, context_window: 64_000, pricing_unit: "1M" },
  { model_slug: "deepseek-r1", display_name: "DeepSeek-R1", provider: "deepseek", input_rate: 0.55, output_rate: 2.19, context_window: 64_000, pricing_unit: "1M" },
  { model_slug: "qwen-plus", display_name: "Qwen Plus", provider: "alibaba", input_rate: 0.26, output_rate: 0.78, context_window: 1_000_000, pricing_unit: "1M" },
  { model_slug: "qwen3-max", display_name: "Qwen3 Max", provider: "alibaba", input_rate: 0.359, output_rate: 1.434, context_window: 128_000, pricing_unit: "1M" },
  { model_slug: "kimi-k2-6", display_name: "Kimi K2.6", provider: "moonshot", input_rate: 0.95, output_rate: 4.00, context_window: 262_144, pricing_unit: "1M" },
  { model_slug: "kimi-k2-5", display_name: "Kimi K2.5", provider: "moonshot", input_rate: 0.60, output_rate: 3.00, context_window: 262_144, pricing_unit: "1M" },
  { model_slug: "glm-5-1", display_name: "GLM-5.1", provider: "zhipu", input_rate: 0.98, output_rate: 3.08, context_window: 203_000, pricing_unit: "1M" },
  { model_slug: "glm-4-7", display_name: "GLM-4.7", provider: "zhipu", input_rate: 0.39, output_rate: 1.75, context_window: 200_000, pricing_unit: "1M" }
];

export async function seedModelPrices(): Promise<void> {
  let inserted = 0;
  for (const p of DEFAULT_PRICES) {
    const result = await db.insert(modelPricesTable).values({
      model_slug: p.model_slug,
      display_name: p.display_name,
      provider: p.provider,
      input_rate: p.input_rate,
      output_rate: p.output_rate,
      pricing_unit: p.pricing_unit,
      context_window: p.context_window,
      is_active: true,
    }).onConflictDoNothing({ target: modelPricesTable.model_slug });
    if (result.rowCount) inserted += result.rowCount;
  }
  if (inserted > 0) logger.info({ inserted }, "Seeded missing model prices");
}
