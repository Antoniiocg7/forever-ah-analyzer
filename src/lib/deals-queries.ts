import type { GameEvent } from "./calendar";
import type { DealSettings } from "./pricing/deals";
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
