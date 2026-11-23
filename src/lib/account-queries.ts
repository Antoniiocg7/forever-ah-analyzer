import type { LedgerRow } from "./ledger-stats";
import { supabaseAdmin } from "./supabase";

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export type CharacterRow = { key: string; name: string; realm: string | null; faction: string | null; money: number | null; bank_at: string | null; updated_at: string };
export type InventoryRow = { char_key: string; item_id: number; place: "bags" | "bank"; qty: number; bound: boolean };
type ItemInfo = { name_en: string | null; name_es: string | null; quality: string | null; icon_url: string | null };

/** Todo lo de "Mi oro": personajes, inventario, libro (más reciente primero) y precios para valorarlo. */
export async function myAccount(houseId: number | null) {
  const db = supabaseAdmin();
  const [chars, inv, ledger] = await Promise.all([
    db.from("my_characters").select("key, name, realm, faction, money, bank_at, updated_at").order("name"),
    db.from("my_inventory").select("char_key, item_id, place, qty, bound"),
    db.from("my_ledger").select("at, kind, item_id, name, qty, price, cut, deposit").order("at", { ascending: false }).limit(5000),
  ]);
  const characters = unwrap<CharacterRow[]>(chars).map((c) => ({ ...c, money: c.money === null ? null : Number(c.money) }));
  const inventory = unwrap<InventoryRow[]>(inv);
  const rows = unwrap<LedgerRow[]>(ledger).map((r) => ({ ...r, price: Number(r.price), cut: Number(r.cut), deposit: Number(r.deposit) }));

  const ids = [...new Set([...inventory.map((r) => r.item_id), ...rows.flatMap((r) => (r.item_id === null ? [] : [r.item_id]))])];
  const items = new Map<number, ItemInfo>();
  const market = new Map<number, number>();
  for (let i = 0; i < ids.length; i += 300) {
    const part = ids.slice(i, i + 300);
    const [it, pr] = await Promise.all([
      db.from("items").select("id, name_en, name_es, quality, icon_url").in("id", part),
      houseId === null ? Promise.resolve({ data: [], error: null }) : db.from("latest_item_prices").select("item_id, market_7d, p15_market").eq("house_id", houseId).in("item_id", part),
    ]);
    for (const r of unwrap<(ItemInfo & { id: number })[]>(it)) items.set(r.id, r);
    for (const r of unwrap<{ item_id: number; market_7d: number | null; p15_market: number | null }[]>(pr)) {
      const m = r.market_7d ?? r.p15_market;
      if (m) market.set(r.item_id, Number(m));
    }
  }
  const inventoryValue = inventory.reduce((t, r) => t + (r.bound ? 0 : r.qty * (market.get(r.item_id) ?? 0)), 0);
  return { characters, inventory, ledger: rows, items, market, inventoryValue };
}
