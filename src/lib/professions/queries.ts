import { supabaseAdmin } from "../supabase";
import type { Price } from "./craft";

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
  name_en: string;
  category: string | null;
  tier: string | null;
  skill_req: number | null;
  yields_item: number | null;
  yields_qty: number;
  recipe_reagents: { item_id: number; qty: number }[];
};

/** Todas las recetas de una profesión, con sus materiales. */
export async function recipesFor(slug: string): Promise<RecipeRow[]> {
  const out: RecipeRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = unwrap<RecipeRow[]>(
      await supabaseAdmin()
        .from("recipes")
        .select("id, profession, name_en, category, tier, skill_req, yields_item, yields_qty, recipe_reagents(item_id, qty)")
        .eq("profession_slug", slug)
        .order("id")
        .range(from, from + PAGE - 1),
    );
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

export type ItemInfo = { name: string | null; quality: string | null };

/** Precios actuales, precio de vendedor y nombres de un conjunto de objetos en una casa. */
export async function itemData(houseId: number, itemIds: number[]) {
  const prices = new Map<number, Price>();
  const vendorSell = new Map<number, number>();
  const info = new Map<number, ItemInfo>();
  let updatedAt: string | null = null;

  await Promise.all(
    chunks(itemIds, 300).map(async (part) => {
      const [priceRows, itemRows] = await Promise.all([
        supabaseAdmin().from("latest_item_prices").select("item_id, min_buyout, p15_market, fetched_at").eq("house_id", houseId).in("item_id", part),
        supabaseAdmin().from("items").select("id, name_en, quality, vendor_sell").in("id", part),
      ]);
      for (const r of unwrap<{ item_id: number; min_buyout: number; p15_market: number; fetched_at: string }[]>(priceRows)) {
        prices.set(r.item_id, { min: r.min_buyout, market: r.p15_market });
        updatedAt = r.fetched_at;
      }
      for (const r of unwrap<{ id: number; name_en: string | null; quality: string | null; vendor_sell: number | null }[]>(itemRows)) {
        info.set(r.id, { name: r.name_en, quality: r.quality });
        if (r.vendor_sell) vendorSell.set(r.id, r.vendor_sell);
      }
    }),
  );
  return { prices, vendorSell, info, updatedAt: updatedAt as string | null };
}

/** Comisión de venta de una casa según su facción. `confirmed` es false si en settings está a null. */
export async function ahCutFor(faction: string): Promise<{ cut: number; confirmed: boolean }> {
  const row = unwrap<{ value: Record<string, number | null> } | null>(
    await supabaseAdmin().from("settings").select("value").eq("key", "ah_cut").maybeSingle(),
  );
  const cut = row?.value?.[faction];
  return typeof cut === "number" ? { cut, confirmed: true } : { cut: 0.05, confirmed: false };
}
