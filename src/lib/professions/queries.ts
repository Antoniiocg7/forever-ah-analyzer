import { supabaseAdmin } from "../supabase";
import type { DepositSettings, Market, RecipeInput } from "./craft";

const PAGE = 1000;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export type ProfessionSummary = { slug: string; name: string; recipes: number };

export async function professionSummaries(): Promise<ProfessionSummary[]> {
  return unwrap(await supabaseAdmin().from("profession_summary").select("*").order("name"));
}

export type RecipeRow = {
  id: number;
  profession: string;
  profession_slug: string;
  name_en: string;
  category: string | null;
  tier: string | null;
  skill_req: number | null;
  yields_item: number | null;
  yields_qty: number;
  recipe_reagents: { item_id: number; qty: number }[];
};

/** Todas las recetas de una o varias profesiones, con sus materiales. */
export async function recipesFor(slugs: string | string[]): Promise<RecipeRow[]> {
  const list = Array.isArray(slugs) ? slugs : [slugs];
  if (list.length === 0) return [];
  const out: RecipeRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = unwrap<RecipeRow[]>(
      await supabaseAdmin()
        .from("recipes")
        .select("id, profession, profession_slug, name_en, category, tier, skill_req, yields_item, yields_qty, recipe_reagents(item_id, qty)")
        .in("profession_slug", list)
        .order("id")
        .range(from, from + PAGE - 1),
    );
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

export const toRecipeInput = (r: RecipeRow): RecipeInput => ({
  id: r.id,
  name: r.name_en,
  yieldsItem: r.yields_item,
  yieldsQty: Number(r.yields_qty),
  reagents: r.recipe_reagents.map((g) => ({ itemId: g.item_id, qty: g.qty })),
});

export type ItemInfo = { name: string | null; quality: string | null; icon: string | null };

type ItemRow = {
  id: number;
  name_en: string | null;
  quality: string | null;
  icon_url: string | null;
  vendor_sell: number | null;
  vendor_buy: number | null;
  vendor_sold: boolean;
};
type PriceRow = { item_id: number; min_buyout: number; p15_market: number; qty: number; num_auctions: number; fetched_at: string };
type StatRow = { item_id: number; market_7d: number | null; sold_per_day: number | null };

/** Mercado (precio actual, mediana de 7 días, ventas estimadas, vendedor) e info de un conjunto de objetos. */
export async function marketData(houseId: number, itemIds: number[]) {
  const markets = new Map<number, Market>();
  const info = new Map<number, ItemInfo>();
  let updatedAt: string | null = null;
  const db = supabaseAdmin();

  const parts = await Promise.all(
    chunks(itemIds, 300).map(async (part) => {
      const [items, prices, stats] = await Promise.all([
        db.from("items").select("id, name_en, quality, icon_url, vendor_sell, vendor_buy, vendor_sold").in("id", part),
        db.from("item_prices_latest").select("item_id, min_buyout, p15_market, qty, num_auctions, fetched_at").eq("house_id", houseId).in("item_id", part),
        db.from("item_market_7d").select("item_id, market_7d, sold_per_day").eq("house_id", houseId).in("item_id", part),
      ]);
      return { items: unwrap<ItemRow[]>(items), prices: unwrap<PriceRow[]>(prices), stats: unwrap<StatRow[]>(stats) };
    }),
  );

  const priceMap = new Map<number, PriceRow>();
  const statMap = new Map<number, StatRow>();
  const itemMap = new Map<number, ItemRow>();
  for (const p of parts) {
    for (const r of p.prices) {
      priceMap.set(r.item_id, r);
      updatedAt = r.fetched_at;
    }
    for (const r of p.stats) statMap.set(r.item_id, r);
    for (const r of p.items) itemMap.set(r.id, r);
  }

  for (const id of itemIds) {
    const item = itemMap.get(id);
    const price = priceMap.get(id);
    const stat = statMap.get(id);
    info.set(id, { name: item?.name_en ?? null, quality: item?.quality ?? null, icon: item?.icon_url || null });
    markets.set(id, {
      min: price?.min_buyout ?? null,
      market: price?.p15_market ?? null,
      market7d: stat?.market_7d ?? null,
      qty: price?.qty ?? 0,
      numAuctions: price?.num_auctions ?? 0,
      soldPerDay: stat?.sold_per_day ?? null,
      vendorBuy: item?.vendor_sold ? item.vendor_buy : null,
      vendorSell: item?.vendor_sell || null,
    });
  }
  return { markets, info, updatedAt };
}

export type EconomySettings = {
  cut: number;
  cutConfirmed: boolean;
  deposit: DepositSettings;
  myProfessions: string[];
};

/** Comisión de la casa (según su facción), depósito y profesiones del jugador, desde `settings`. */
export async function economySettings(faction: string): Promise<EconomySettings> {
  const rows = unwrap<{ key: string; value: unknown }[]>(
    await supabaseAdmin().from("settings").select("key, value").in("key", ["ah_cut", "deposit", "my_professions"]),
  );
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const cuts = (get("ah_cut") ?? {}) as Record<string, number | null>;
  const cut = cuts[faction];
  const deposit = (get("deposit") ?? { deposit_min: 100, pct: { "2": 0.05, "8": 0.2, "24": 0.6 } }) as DepositSettings;
  const mine = get("my_professions");
  return {
    cut: typeof cut === "number" ? cut : 0.05,
    cutConfirmed: typeof cut === "number",
    deposit,
    myProfessions: Array.isArray(mine) ? mine.filter((s): s is string => typeof s === "string") : [],
  };
}

export type RecipeLink = { id: number; name: string; profession: string; slug: string; qty?: number };

/** Recetas que fabrican un objeto y recetas que lo usan como material. */
export async function recipesForItem(itemId: number): Promise<{ makes: RecipeLink[]; uses: RecipeLink[] }> {
  const db = supabaseAdmin();
  type R = { id: number; name_en: string; profession: string; profession_slug: string };
  const [makes, uses] = await Promise.all([
    db.from("recipes").select("id, name_en, profession, profession_slug").eq("yields_item", itemId).order("name_en"),
    db.from("recipe_reagents").select("qty, recipes(id, name_en, profession, profession_slug)").eq("item_id", itemId).limit(200),
  ]);
  const toLink = (r: R, qty?: number): RecipeLink => ({ id: r.id, name: r.name_en, profession: r.profession, slug: r.profession_slug, qty });
  return {
    makes: unwrap<R[]>(makes).map((r) => toLink(r)),
    uses: unwrap<{ qty: number; recipes: R | null }[]>(uses as never)
      .filter((u) => u.recipes)
      .map((u) => toLink(u.recipes!, u.qty))
      .sort((a, b) => a.profession.localeCompare(b.profession) || a.name.localeCompare(b.name)),
  };
}
