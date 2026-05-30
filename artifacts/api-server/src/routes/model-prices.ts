import { Router } from "express";
import { db } from "@workspace/db";
import { modelPricesTable } from "@workspace/db";
import { eq, like, and, sql } from "drizzle-orm";
import { seedModelPrices } from "../lib/model-prices";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { provider, search } = req.query as Record<string, string>;
    let rows = await db.select().from(modelPricesTable);

    if (provider) {
      rows = rows.filter((r) => r.provider === provider);
    }
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((r) =>
        r.model_slug.toLowerCase().includes(s) ||
        (r.display_name?.toLowerCase().includes(s) ?? false),
      );
    }

    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Failed to list model prices" });
  }
});

router.get("/:slug", async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(modelPricesTable)
      .where(eq(modelPricesTable.model_slug, req.params.slug));
    if (!row) return res.status(404).json({ error: "Model price not found" });
    return res.json(row);
  } catch {
    return res.status(500).json({ error: "Failed to get model price" });
  }
});

router.put("/:slug", async (req, res) => {
  try {
    const {
      display_name, provider, input_rate, output_rate,
      cached_input_rate, cached_output_rate, pricing_unit, released_at,
      context_window, is_active,
    } = req.body;

    const [existing] = await db
      .select()
      .from(modelPricesTable)
      .where(eq(modelPricesTable.model_slug, req.params.slug));

    if (existing) {
      const update: Partial<typeof modelPricesTable.$inferInsert> = { updated_at: new Date() };
      if (display_name !== undefined) update.display_name = display_name;
      if (provider !== undefined) update.provider = provider;
      if (input_rate !== undefined) update.input_rate = input_rate;
      if (output_rate !== undefined) update.output_rate = output_rate;
      if (cached_input_rate !== undefined) update.cached_input_rate = cached_input_rate;
      if (cached_output_rate !== undefined) update.cached_output_rate = cached_output_rate;
      if (pricing_unit !== undefined) update.pricing_unit = pricing_unit;
      if (released_at !== undefined) update.released_at = released_at ? new Date(released_at) : null;
      if (context_window !== undefined) update.context_window = context_window;
      if (is_active !== undefined) update.is_active = is_active;

      const [updated] = await db
        .update(modelPricesTable)
        .set(update)
        .where(eq(modelPricesTable.model_slug, req.params.slug))
        .returning();
      return res.json(updated);
    }

    const [created] = await db.insert(modelPricesTable).values({
      model_slug: req.params.slug,
      display_name: display_name ?? null,
      provider: provider ?? null,
      input_rate: input_rate ?? 0,
      output_rate: output_rate ?? 0,
      cached_input_rate: cached_input_rate ?? null,
      cached_output_rate: cached_output_rate ?? null,
      pricing_unit: pricing_unit ?? "1M",
      released_at: released_at ? new Date(released_at) : null,
      context_window: context_window ?? null,
      is_active: is_active ?? true,
    }).returning();

    return res.status(201).json(created);
  } catch {
    return res.status(500).json({ error: "Failed to upsert model price" });
  }
});

router.delete("/:slug", async (req, res) => {
  try {
    await db.delete(modelPricesTable).where(eq(modelPricesTable.model_slug, req.params.slug));
    return res.status(204).send();
  } catch {
    return res.status(500).json({ error: "Failed to delete model price" });
  }
});

router.post("/seed", async (_req, res) => {
  try {
    await seedModelPrices();
    const rows = await db.select().from(modelPricesTable);
    return res.json({ message: "Seeded default model prices", count: rows.length });
  } catch (err) {
    return res.status(500).json({ error: "Failed to seed model prices" });
  }
});

export default router;
