import { z } from "zod";

// La API de Forever no está documentada: todo lo que no sea imprescindible es opcional.

const idRef = z.union([z.number(), z.object({ id: z.number() }).transform((o) => o.id)]);

export const TIME_LEFT = ["SHORT", "MEDIUM", "LONG", "VERY_LONG"] as const;
export type TimeLeft = (typeof TIME_LEFT)[number] | "UNKNOWN";

const timeLeft = z
  .string()
  .optional()
  .transform((v): TimeLeft => ((TIME_LEFT as readonly string[]).includes(v ?? "") ? (v as TimeLeft) : "UNKNOWN"));

/** Una subasta, sea commodity (`unit_price`) o de objeto (`buyout` por el lote entero). */
export const rawAuctionSchema = z.object({
  id: z.number(),
  item: idRef,
  quantity: z.number().optional().default(1),
  unit_price: z.number().optional(),
  buyout: z.number().optional(),
  bid: z.number().optional(),
  time_left: timeLeft,
});
export type RawAuction = z.infer<typeof rawAuctionSchema>;

export const auctionsResponseSchema = z.object({
  auctions: z.array(z.unknown()).optional().default([]),
});

const localized = z.union([
  z.string(),
  z.record(z.string(), z.string()).transform((r) => r.en_US ?? r.en_GB ?? Object.values(r)[0] ?? ""),
]);

export const hrefSchema = z.object({ href: z.string() });

export const rulesetIndexSchema = z.object({
  rulesets: z.array(z.object({ id: z.number(), name: localized.optional() })).optional().default([]),
});

export const itemSchema = z.object({
  id: z.number(),
  name: localized.optional(),
  quality: z.object({ type: z.string() }).optional(),
  sell_price: z.number().optional(),
  purchase_price: z.number().optional(),
  item_class: z.object({ name: localized.optional() }).optional(),
  item_subclass: z.object({ name: localized.optional() }).optional(),
});

export const mediaSchema = z.object({
  assets: z.array(z.object({ key: z.string(), value: z.string() })).optional().default([]),
});

const named = z.object({ id: z.number(), name: localized.optional() });

export const professionIndexSchema = z.object({ professions: z.array(named).optional().default([]) });
export const professionSchema = z.object({ id: z.number(), name: localized.optional(), skill_tiers: z.array(named).optional().default([]) });
export const skillTierSchema = z.object({
  name: localized.optional(),
  categories: z
    .array(z.object({ name: localized.optional(), recipes: z.array(named).optional().default([]) }))
    .optional()
    .default([]),
});

const quantity = z
  .object({ value: z.number().optional(), minimum: z.number().optional(), maximum: z.number().optional() })
  .transform((q) => q.value ?? (q.minimum !== undefined && q.maximum !== undefined ? (q.minimum + q.maximum) / 2 : (q.minimum ?? q.maximum ?? 1)));

export const recipeSchema = z.object({
  id: z.number(),
  name: localized.optional(),
  crafted_item: idRef.optional(),
  alliance_crafted_item: idRef.optional(),
  horde_crafted_item: idRef.optional(),
  crafted_quantity: quantity.optional(),
  reagents: z
    .array(z.object({ reagent: idRef, quantity: z.number().optional().default(1) }))
    .optional()
    .default([]),
});

/** IDs conocidos (noviembre 2026) por si el índice cambia de forma. */
export const KNOWN_HOUSE_IDS = [110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 123, 124, 125];

/** Saca las casas del índice sin asumir el nombre de la propiedad. */
export function extractHouses(index: unknown): { id: number; name: string | undefined }[] {
  if (index && typeof index === "object") {
    for (const value of Object.values(index as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const houses = value.flatMap((v) => {
        const parsed = z.object({ id: z.number(), name: localized.optional() }).safeParse(v);
        return parsed.success ? [{ id: parsed.data.id, name: parsed.data.name }] : [];
      });
      if (houses.length > 0) return houses;
    }
  }
  return KNOWN_HOUSE_IDS.map((id) => ({ id, name: undefined }));
}

export function factionFromName(name: string | undefined): "alliance" | "horde" | "neutral" | "unknown" {
  const n = (name ?? "").toLowerCase();
  if (n.includes("alliance")) return "alliance";
  if (n.includes("horde")) return "horde";
  if (n.includes("blackwater")) return "neutral";
  return "unknown";
}
