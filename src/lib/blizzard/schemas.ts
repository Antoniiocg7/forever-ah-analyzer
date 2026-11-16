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

const href = z.object({ href: z.string() }).optional();

export const houseSchema = z.object({
  id: z.number(),
  name: localized.optional(),
  auctions: href, // algunas casas (112, 115, 118) no lo traen
  commodities: href,
});
export type House = z.infer<typeof houseSchema>;

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

/** IDs conocidos (noviembre 2026) por si el índice cambia de forma. */
export const KNOWN_HOUSE_IDS = [110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 123, 124, 125];

/** Saca los IDs de casa del índice sin asumir el nombre de la propiedad. */
export function extractHouseIds(index: unknown): number[] {
  if (index && typeof index === "object") {
    for (const value of Object.values(index as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const ids = value
        .map((v) => (v && typeof v === "object" ? (v as { id?: unknown }).id : undefined))
        .filter((id): id is number => typeof id === "number");
      if (ids.length > 0) return ids;
    }
  }
  return KNOWN_HOUSE_IDS;
}

export function factionFromName(name: string | undefined): "alliance" | "horde" | "neutral" | "unknown" {
  const n = (name ?? "").toLowerCase();
  if (n.includes("alliance")) return "alliance";
  if (n.includes("horde")) return "horde";
  if (n.includes("blackwater")) return "neutral";
  return "unknown";
}
