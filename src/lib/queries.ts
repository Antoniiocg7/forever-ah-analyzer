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

export async function searchPrices(houseId: number, q: string): Promise<LatestPriceRow[]> {
  let query = supabaseAdmin().from("latest_item_prices").select("*").eq("house_id", houseId);
  const term = q.trim();
  if (/^\d+$/.test(term)) query = query.eq("item_id", Number(term));
  else if (term) query = query.ilike("name_en", `%${term.replace(/[%_\\]/g, "\\$&")}%`);
  return unwrap(await query.order("qty", { ascending: false }).limit(50));
}

export async function latestPrice(houseId: number, itemId: number): Promise<LatestPriceRow | null> {
  return unwrap(
    await supabaseAdmin().from("latest_item_prices").select("*").eq("house_id", houseId).eq("item_id", itemId).maybeSingle(),
  );
}

export type ItemRow = { id: number; name_en: string | null; quality: string | null; vendor_sell: number | null; class: string | null; subclass: string | null };

export async function itemById(itemId: number): Promise<ItemRow | null> {
  return unwrap(
    await supabaseAdmin().from("items").select("id, name_en, quality, vendor_sell, class, subclass").eq("id", itemId).maybeSingle(),
  );
}

export type PricePoint = { t: number; min: number; market: number; qty: number; sold: number | null };

export async function hourlySeries(houseId: number, itemId: number): Promise<PricePoint[]> {
  type Row = { min_buyout: number; p15_market: number; qty: number; est_sold: number | null; snapshots: { fetched_at: string } };
  const rows = unwrap<Row[]>(
    (await supabaseAdmin()
      .from("item_prices_hourly")
      .select("min_buyout, p15_market, qty, est_sold, snapshots!inner(house_id, fetched_at)")
      .eq("item_id", itemId)
      .eq("snapshots.house_id", houseId)
      .limit(400)) as never,
  );
  return rows
    .map((r) => ({ t: new Date(r.snapshots.fetched_at).getTime(), min: r.min_buyout, market: r.p15_market, qty: r.qty, sold: r.est_sold }))
    .sort((a, b) => a.t - b.t);
}

export async function dailySeries(houseId: number, itemId: number): Promise<PricePoint[]> {
  type Row = { day: string; min: number; avg_market: number; avg_qty: number; est_sold: number | null };
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
