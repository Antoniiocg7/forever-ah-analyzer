import type { SupabaseClient } from "@supabase/supabase-js";
import type { BlizzardClient } from "../blizzard/client";
import { chunks, must, storeItems } from "../ingest";

export const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type RecipeRef = { id: number; name: string; category: string | null; categoryEs: string | null; tier: string | null };

/**
 * Descarga de static-forever todas las recetas de todas las profesiones y las guarda.
 * La API no da el nivel de habilidad ni los colores de skill-up: esos campos quedan vacíos.
 */
export async function syncRecipes(db: SupabaseClient, blizzard: BlizzardClient, log: (msg: string) => void = console.log) {
  const professions = await blizzard.professions();
  if (professions.length === 0) throw new Error("static-forever no devolvió ninguna profesión en /data/wow/profession/index");

  let total = 0;
  let withoutItem = 0;
  let failed = 0;
  const itemIds = new Set<number>();

  for (const prof of professions) {
    const name = prof.name ?? `Profession ${prof.id}`;
    if (name.includes("[DNT]")) continue; // profesiones internas de prueba de Blizzard
    const detail = await blizzard.profession(prof.id);
    const refs = new Map<number, RecipeRef>();
    for (const tier of detail?.skill_tiers ?? []) {
      const t = await blizzard.skillTier(prof.id, tier.id);
      for (const cat of t?.categories ?? []) {
        for (const r of cat.recipes) {
          refs.set(r.id, { id: r.id, name: r.name ?? `Recipe ${r.id}`, category: cat.name.en, categoryEs: cat.name.es, tier: t?.name ?? tier.name ?? null });
        }
      }
    }
    if (refs.size === 0) {
      log(`${name}: sin recetas`);
      continue;
    }

    const recipes: Record<string, unknown>[] = [];
    const reagents: { recipe_id: number; item_id: number; qty: number }[] = [];
    for (const batch of chunks([...refs.values()], 10)) {
      const details = await Promise.all(batch.map((ref) => blizzard.recipe(ref.id).catch(() => null)));
      batch.forEach((ref, i) => {
        const d = details[i];
        if (!d) {
          failed++;
          return;
        }
        // El usuario juega Alianza: si el objeto cambia según la facción, vale el de Alianza.
        const yieldsItem = d.crafted_item ?? d.alliance_crafted_item ?? d.horde_crafted_item ?? null;
        if (yieldsItem === null) withoutItem++;
        else itemIds.add(yieldsItem);
        recipes.push({
          id: ref.id,
          profession: name,
          profession_es: detail?.name_es ?? null,
          profession_slug: slugify(name),
          name_en: d.name ?? ref.name,
          name_es: d.name_es ?? null,
          category: ref.category,
          category_es: ref.categoryEs,
          tier: ref.tier,
          yields_item: yieldsItem,
          yields_qty: d.crafted_quantity ?? 1,
          source: "blizzard",
        });
        const merged = new Map<number, number>();
        for (const r of d.reagents) merged.set(r.reagent, (merged.get(r.reagent) ?? 0) + r.quantity);
        for (const [itemId, qty] of merged) {
          reagents.push({ recipe_id: ref.id, item_id: itemId, qty });
          itemIds.add(itemId);
        }
      });
    }

    const ids = recipes.map((r) => r.id as number);
    for (const part of chunks(recipes, 500)) await must(db.from("recipes").upsert(part));
    for (const part of chunks(ids, 200)) await must(db.from("recipe_reagents").delete().in("recipe_id", part));
    for (const part of chunks(reagents, 500)) await must(db.from("recipe_reagents").insert(part));
    total += recipes.length;
    log(`${name}: ${recipes.length} recetas`);
  }

  const items = await storeItems(db, blizzard, [...itemIds]);
  return { professions: professions.length, recipes: total, withoutItem, failed, items };
}
