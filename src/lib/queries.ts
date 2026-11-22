import { supabaseAdmin, type HouseRow, type LatestPriceRow } from "./supabase";

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function allHouses(): Promise<HouseRow[]> {
  return unwrap(await supabaseAdmin().from("houses").select("*").order("id"));
}

export async function trackedHouses(): Promise<HouseRow[]> {
  const houses = unwrap<HouseRow[]>(await supabaseAdmin().from("houses").select("*").eq("tracked", true).order("id"));
  // La de Alianza primero: es la casa principal del usuario.
  return houses.sort((a, b) => Number(b.faction === "alliance") - Number(a.faction === "alliance"));
}

export type ProbeRow = { house_id: number; item_id: number; min_buyout: number | null; qty: number };

export async function houseProbes(): Promise<ProbeRow[]> {
  return unwrap(await supabaseAdmin().from("house_probe").select("house_id, item_id, min_buyout, qty"));
}

export const PRICE_SORTS = { sold: "Más vendidos", deals: "Por debajo de su precio", stock: "Más stock" } as const;
export type PriceSort = keyof typeof PRICE_SORTS;

/** Mercado mínimo (de settings.deals) para que un objeto cuente como ganga: evita la morralla de cobre. */
async function dealsMinMarket(): Promise<number> {
  const row = unwrap<{ value: { min_market?: number } } | null>(
    await supabaseAdmin().from("settings").select("value").eq("key", "deals").maybeSingle(),
  );
  return row?.value?.min_market ?? 10000;
}

/**
 * Lista de precios de una casa.
 * - sold: más vendidos (ventas estimadas/día); sin estimación, por stock.
 * - deals: mínimo actual al menos un 10% por debajo de su mediana de 7 días.
 * - stock: más unidades en venta.
 */
export async function searchPrices(houseId: number, q: string, sort: PriceSort = "sold"): Promise<LatestPriceRow[]> {
  let query = supabaseAdmin().from("latest_item_prices").select("*").eq("house_id", houseId);
  const term = q.trim();
  if (/^\d+$/.test(term)) query = query.eq("item_id", Number(term));
  else if (term) {
    // Busca en inglés y en español a la vez. Se quitan los caracteres que rompen el filtro `or`.
    const safe = term.replace(/[,()*%_\\]/g, " ").trim();
    if (safe) query = query.or(`name_en.ilike.*${safe}*,name_es.ilike.*${safe}*`);
  }

  if (sort === "deals") {
    query = query.gte("discount", 0.1).gte("market_7d", await dealsMinMarket()).order("discount", { ascending: false });
  } else if (sort === "sold") {
    query = query.order("sold_per_day", { ascending: false, nullsFirst: false }).order("qty", { ascending: false });
  } else {
    query = query.order("qty", { ascending: false });
  }
  return unwrap(await query.limit(50));
}

export async function latestPrice(houseId: number, itemId: number): Promise<LatestPriceRow | null> {
  return unwrap(
    await supabaseAdmin().from("latest_item_prices").select("*").eq("house_id", houseId).eq("item_id", itemId).maybeSingle(),
  );
}

export type ItemRow = {
  id: number;
  name_en: string | null;
  name_es: string | null;
  quality: string | null;
  icon_url: string | null;
  vendor_sell: number | null;
  vendor_buy: number | null;
  vendor_sold: boolean;
  class: string | null;
  subclass: string | null;
};

export async function itemById(itemId: number): Promise<ItemRow | null> {
  return unwrap(
    await supabaseAdmin().from("items").select("id, name_en, name_es, quality, icon_url, vendor_sell, vendor_buy, vendor_sold, class, subclass").eq("id", itemId).maybeSingle(),
  );
}

/** Traducción inglés → español de los tipos de objeto (clase y subclase). */
export async function itemClassNames(): Promise<Map<string, string>> {
  const rows = unwrap<{ en: string; es: string }[]>(await supabaseAdmin().from("item_class_names").select("en, es"));
  return new Map(rows.map((r) => [r.en, r.es]));
}

export type PricePoint = { t: number; min: number | null; market: number | null; qty: number; sold: number | null };

/** Serie horaria de los últimos 7 días (hora de los datos, no de la descarga). */
export async function hourlySeries(houseId: number, itemId: number): Promise<PricePoint[]> {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const snaps = unwrap<{ id: number; fetched_at: string; data_at: string | null }[]>(
    await supabaseAdmin().from("snapshots").select("id, fetched_at, data_at").eq("house_id", houseId).gte("fetched_at", since).limit(500),
  );
  if (snaps.length === 0) return [];
  const time = new Map(snaps.map((s) => [s.id, new Date(s.data_at ?? s.fetched_at).getTime()]));
  type Row = { snapshot_id: number; min_buyout: number | null; p15_market: number | null; qty: number; est_sold: number | null };
  const rows = unwrap<Row[]>(
    await supabaseAdmin()
      .from("item_prices_hourly")
      .select("snapshot_id, min_buyout, p15_market, qty, est_sold")
      .eq("item_id", itemId)
      .in("snapshot_id", [...time.keys()]),
  );
  return rows
    .map((r) => ({ t: time.get(r.snapshot_id)!, min: r.min_buyout, market: r.p15_market, qty: r.qty, sold: r.est_sold }))
    .sort((a, b) => a.t - b.t);
}

/** Horas desde la última ingesta, para avisar si se ha parado. null si nunca ha habido ninguna. */
export async function hoursSinceLastIngest(): Promise<number | null> {
  const rows = unwrap<{ fetched_at: string }[]>(
    await supabaseAdmin().from("snapshots").select("fetched_at").order("fetched_at", { ascending: false }).limit(1),
  );
  return rows[0] ? (Date.now() - new Date(rows[0].fetched_at).getTime()) / 3_600_000 : null;
}

export async function dailySeries(houseId: number, itemId: number): Promise<PricePoint[]> {
  type Row = { day: string; min: number | null; avg_market: number | null; avg_qty: number; est_sold: number | null };
  const rows = unwrap<Row[]>(
    await supabaseAdmin()
      .from("item_prices_daily")
      .select("day, min, avg_market, avg_qty, est_sold")
      .eq("house_id", houseId)
      .eq("item_id", itemId)
      .order("day", { ascending: false })
      .limit(30),
  );
  return rows
    .map((r) => ({ t: new Date(`${r.day}T12:00:00Z`).getTime(), min: r.min, market: r.avg_market, qty: r.avg_qty, sold: r.est_sold }))
    .reverse();
}
