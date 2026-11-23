import type { GameEvent } from "./calendar";
import type { DealSettings } from "./pricing/deals";
import { bestReset, DEFAULT_RESET, type Ladder, type Reset } from "./pricing/reset";
import { supabaseAdmin, type LatestPriceRow } from "./supabase";

const PAGE = 1000;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Ajustes de chollos: umbrales, comisión de la casa y depósito, desde `settings`. */
export async function dealSettings(faction: string): Promise<DealSettings & { cutConfirmed: boolean }> {
  const rows = unwrap<{ key: string; value: unknown }[]>(
    await supabaseAdmin().from("settings").select("key, value").in("key", ["ah_cut", "deposit", "deals"]),
  );
  const get = (k: string) => rows.find((r) => r.key === k)?.value as Record<string, unknown> | undefined;
  const cut = get("ah_cut")?.[faction];
  const deals = get("deals") ?? {};
  return {
    cut: typeof cut === "number" ? cut : 0.05,
    cutConfirmed: typeof cut === "number",
    minSoldPerDay: typeof deals.min_sold_per_day === "number" ? deals.min_sold_per_day : 5,
    minMarket: typeof deals.min_market === "number" ? deals.min_market : 10000,
    deposit: (get("deposit") as DealSettings["deposit"]) ?? { deposit_min: 100, pct: { "24": 0.6 } },
  };
}

/** Candidatos a revender: por debajo de su mediana, con mercado y ventas suficientes. */
export async function flipCandidates(houseId: number, s: DealSettings): Promise<LatestPriceRow[]> {
  return unwrap(
    await supabaseAdmin()
      .from("latest_item_prices")
      .select("*")
      .eq("house_id", houseId)
      .gte("discount", 0.05)
      .gte("market_7d", s.minMarket)
      .gte("sold_per_day", s.minSoldPerDay)
      .order("discount", { ascending: false })
      .limit(300),
  );
}

/** Subastas por debajo de lo que paga el vendedor, por ganancia total. */
export async function vendorFlips(houseId: number): Promise<LatestPriceRow[]> {
  return unwrap(
    await supabaseAdmin()
      .from("latest_item_prices")
      .select("*")
      .eq("house_id", houseId)
      .gt("vendor_profit", 0)
      .order("vendor_profit", { ascending: false })
      .limit(40),
  );
}

/** Objetos con mercado de cierta entidad (≥ 20s), para clasificarlos por categoría. */
export async function marketableItems(houseId: number): Promise<LatestPriceRow[]> {
  const out: LatestPriceRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = unwrap<LatestPriceRow[]>(
      await supabaseAdmin()
        .from("latest_item_prices")
        .select("*")
        .eq("house_id", houseId)
        .gte("market_7d", 2000)
        .not("name_en", "is", null)
        .order("item_id")
        .range(from, from + PAGE - 1),
    );
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

export async function calendarEvents(): Promise<GameEvent[]> {
  const row = unwrap<{ value: GameEvent[] } | null>(await supabaseAdmin().from("settings").select("value").eq("key", "calendar").maybeSingle());
  return Array.isArray(row?.value) ? row.value : [];
}

export type ResetCandidate = { row: LatestPriceRow; reset: Reset };

/**
 * Mejores resets de mercado con el presupuesto dado: objetos que se venden (≥ 3/día) y valen algo
 * (≥ 10s), con su escalera de precios actual.
 */
export const RESET_KINDS = {
  materiales: { label: "Materiales", classes: ["Trade Goods", "Reagent", "Gem"] },
  consumibles: { label: "Consumibles", classes: ["Consumable"] },
  todo: { label: "Todo", classes: null },
} as const;
export type ResetKind = keyof typeof RESET_KINDS;

export async function resetCandidates(houseId: number, s: DealSettings, budget: number, kind: ResetKind = "materiales"): Promise<ResetCandidate[]> {
  const classes = RESET_KINDS[kind].classes;
  const rows: LatestPriceRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabaseAdmin()
      .from("latest_item_prices")
      .select("*")
      .eq("house_id", houseId)
      .gte("sold_per_day", 3)
      .gte("p15_market", 1000)
      .gte("num_auctions", 2);
    if (classes) query = query.in("class", [...classes]);
    const page = unwrap<LatestPriceRow[]>(await query.order("item_id").range(from, from + PAGE - 1));
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const ladders = new Map<number, Ladder>();
  for (let i = 0; i < rows.length; i += 300) {
    const ids = rows.slice(i, i + 300).map((r) => r.item_id);
    const page = unwrap<{ item_id: number; ladder: Ladder | null }[]>(
      await supabaseAdmin().from("item_prices_latest").select("item_id, ladder").eq("house_id", houseId).in("item_id", ids),
    );
    for (const p of page) if (p.ladder) ladders.set(p.item_id, p.ladder);
  }

  const settings = { ...DEFAULT_RESET, cut: s.cut, budget, depositPct: s.deposit.pct["24"] ?? DEFAULT_RESET.depositPct };
  const out: ResetCandidate[] = [];
  for (const row of rows) {
    const ladder = ladders.get(row.item_id);
    const market = row.market_7d ?? row.p15_market;
    if (!ladder || !market) continue;
    const reset = bestReset({ ladder, market, soldPerDay: row.sold_per_day, listedPerDay: row.listed_per_day, vendorSell: row.vendor_sell }, settings);
    if (reset) out.push({ row, reset });
  }
  return out.sort((a, b) => b.reset.expectedProfit - a.reset.expectedProfit);
}
