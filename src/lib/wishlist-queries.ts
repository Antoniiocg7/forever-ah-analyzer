import type { Slot } from "./wishlist";
import { supabaseAdmin, type LatestPriceRow } from "./supabase";

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export type WishRow = {
  item_id: number;
  slot: Slot | null;
  priority: 1 | 2 | 3;
  max_price: number | null;
  note: string | null;
  obtained: boolean;
};

export type WishItem = WishRow & {
  name_en: string | null;
  name_es: string | null;
  quality: string | null;
  icon_url: string | null;
  item_level: number | null;
  required_level: number | null;
  latest: LatestPriceRow | null;
  low30: number | null;
  everSeen: boolean;
};

export async function wishFor(itemId: number): Promise<WishRow | null> {
  return unwrap(await supabaseAdmin().from("wishlist").select("item_id, slot, priority, max_price, note, obtained").eq("item_id", itemId).maybeSingle());
}

/** La lista entera con los datos del objeto, su precio de ahora y el mínimo de 30 días en esa casa. */
export async function wishlist(houseId: number): Promise<WishItem[]> {
  const db = supabaseAdmin();
  const rows = unwrap<WishRow[]>(await db.from("wishlist").select("item_id, slot, priority, max_price, note, obtained").order("created_at"));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.item_id);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const [items, latest, daily] = await Promise.all([
    db.from("items").select("id, name_en, name_es, quality, icon_url, item_level, required_level").in("id", ids),
    db.from("latest_item_prices").select("*").eq("house_id", houseId).in("item_id", ids),
    db.from("item_prices_daily").select("item_id, min").eq("house_id", houseId).in("item_id", ids).gte("day", since),
  ]);
  type I = { id: number; name_en: string | null; name_es: string | null; quality: string | null; icon_url: string | null; item_level: number | null; required_level: number | null };
  const itemMap = new Map(unwrap<I[]>(items).map((i) => [i.id, i]));
  const latestMap = new Map(unwrap<LatestPriceRow[]>(latest).map((r) => [r.item_id, r]));
  const low = new Map<number, number>();
  const seen = new Set<number>();
  for (const d of unwrap<{ item_id: number; min: number | null }[]>(daily)) {
    seen.add(d.item_id);
    if (d.min !== null && (!low.has(d.item_id) || d.min < low.get(d.item_id)!)) low.set(d.item_id, Number(d.min));
  }
  return rows.map((r) => {
    const i = itemMap.get(r.item_id);
    const l = latestMap.get(r.item_id) ?? null;
    return {
      ...r,
      max_price: r.max_price === null ? null : Number(r.max_price),
      name_en: i?.name_en ?? null,
      name_es: i?.name_es ?? null,
      quality: i?.quality ?? null,
      icon_url: i?.icon_url ?? null,
      item_level: i?.item_level ?? null,
      required_level: i?.required_level ?? null,
      latest: l,
      low30: low.get(r.item_id) ?? null,
      everSeen: l !== null || seen.has(r.item_id),
    };
  });
}
