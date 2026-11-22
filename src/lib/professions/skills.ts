import type { SupabaseClient } from "@supabase/supabase-js";
import type { BlizzardClient } from "../blizzard/client";
import { chunks, fetchItems, must } from "../ingest";
import { estimateSkill, fitSkillModel, type SkillModel } from "./leveling";

/**
 * Niveles de Classic para recetas de instructor que la estimación no resuelve bien: las fundiciones
 * (Smelt Copper saldría a 45 y es la primera receta) y las vendas (su nivel de objeto es 1).
 * Forever ha cambiado algunos niveles, así que son aproximados; los oficiales de la API mandan.
 */
const CLASSIC_SKILLS: Record<string, number> = {
  "Mining|Smelt Copper": 1,
  "Mining|Smelt Tin": 65,
  "Mining|Smelt Bronze": 65,
  "Mining|Smelt Silver": 75,
  "Mining|Smelt Iron": 125,
  "Mining|Smelt Gold": 155,
  "Mining|Smelt Steel": 165,
  "Mining|Smelt Mithril": 175,
  "Mining|Smelt Truesilver": 230,
  "Mining|Smelt Dark Iron": 230,
  "Mining|Smelt Thorium": 250,
  "First Aid|Linen Bandage": 1,
  "First Aid|Heavy Linen Bandage": 40,
  "First Aid|Wool Bandage": 80,
  "First Aid|Heavy Wool Bandage": 115,
  "First Aid|Silk Bandage": 150,
  "First Aid|Heavy Silk Bandage": 180,
  "First Aid|Mageweave Bandage": 210,
  "First Aid|Heavy Mageweave Bandage": 240,
  "First Aid|Runecloth Bandage": 260,
  "First Aid|Heavy Runecloth Bandage": 290,
};

/** Con menos puntos oficiales que esto, una profesión usa el modelo conjunto de todas. */
const MIN_POINTS_PER_PROFESSION = 8;
const PAGE = 1000;

type RecipeRow = {
  id: number;
  profession: string;
  profession_slug: string;
  name_en: string;
  source: string;
  yields_item: number | null;
  skill_source: string | null;
};
type ItemRow = {
  id: number;
  source: string;
  class: string | null;
  subclass: string | null;
  item_level: number | null;
  teaches_skill: number | null;
  teaches_item: number | null;
};

async function selectAll<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await must(fetchPage(from, from + PAGE - 1));
    out.push(...(page ?? []));
    if (!page || page.length < PAGE) break;
  }
  return out;
}

/**
 * Rellena `recipes.skill_req`:
 * - 'item': nivel oficial del objeto que enseña la receta (planos, patrones…), solo de static-forever
 *   (Forever ha cambiado niveles: Plans: Thorium Armor pide 225, en Classic 250).
 * - 'classic': nivel conocido de Classic (fundiciones y vendas), aproximado.
 * - 'estimate': ajuste lineal sobre el nivel del objeto fabricado, calibrado con los oficiales.
 * - 'manual': corrección del usuario; nunca se sobrescribe.
 */
export async function syncSkillLevels(db: SupabaseClient, blizzard: BlizzardClient, log: (m: string) => void = console.log) {
  const recipes = await selectAll<RecipeRow>((a, b) =>
    db.from("recipes").select("id, profession, profession_slug, name_en, source, yields_item, skill_source").order("id").range(a, b),
  );

  // 1. Objetos a (re)consultar: productos sin nivel de objeto y objetos-receta sin datos de enseñanza.
  const products = new Set(recipes.map((r) => r.yields_item).filter((x): x is number => x !== null));
  let items = await selectAll<ItemRow>((a, b) =>
    db.from("items").select("id, source, class, subclass, item_level, teaches_skill, teaches_item").order("id").range(a, b),
  );
  const known = new Map(items.map((i) => [i.id, i]));
  const todo = new Set<number>();
  for (const id of products) {
    const it = known.get(id);
    if (!it || (it.item_level === null && it.source !== "none")) todo.add(id);
  }
  for (const it of items) if (it.class === "Recipe" && it.teaches_skill === null && it.source !== "none") todo.add(it.id);
  if (todo.size) {
    log(`Consultando ${todo.size} objetos en la API…`);
    await fetchItems(db, blizzard, [...todo]);
    items = await selectAll<ItemRow>((a, b) =>
      db.from("items").select("id, source, class, subclass, item_level, teaches_skill, teaches_item").order("id").range(a, b),
    );
  }
  const byId = new Map(items.map((i) => [i.id, i]));

  // 2. Niveles oficiales: profesión (subclase del objeto-receta) + objeto fabricado → nivel.
  const official = new Map<string, { skill: number; itemId: number }>();
  for (const it of items) {
    if (it.source !== "blizzard" || it.teaches_skill === null || it.teaches_item === null || !it.subclass) continue;
    const key = `${it.subclass}|${it.teaches_item}`;
    const cur = official.get(key);
    if (!cur || it.teaches_skill < cur.skill) official.set(key, { skill: it.teaches_skill, itemId: it.id });
  }

  // 3. Calibración: por profesión si hay datos suficientes; si no, conjunta.
  const pointsBy = new Map<string, { itemLevel: number; skill: number }[]>();
  const all: { itemLevel: number; skill: number }[] = [];
  for (const r of recipes) {
    if (r.yields_item === null) continue;
    const off = official.get(`${r.profession}|${r.yields_item}`);
    const lvl = byId.get(r.yields_item)?.item_level;
    if (!off || !lvl) continue;
    const p = { itemLevel: lvl, skill: off.skill };
    all.push(p);
    pointsBy.set(r.profession, [...(pointsBy.get(r.profession) ?? []), p]);
  }
  const pooled = fitSkillModel(all);
  const modelFor = (profession: string): SkillModel | null => {
    const pts = pointsBy.get(profession) ?? [];
    return pts.length >= MIN_POINTS_PER_PROFESSION ? fitSkillModel(pts) : pooled;
  };

  // 4. Escribir (las correcciones manuales no se tocan).
  const updates: Record<string, unknown>[] = [];
  const stats = new Map<string, { item: number; estimate: number; none: number; model: SkillModel | null }>();
  for (const r of recipes) {
    const st = stats.get(r.profession) ?? { item: 0, estimate: 0, none: 0, model: modelFor(r.profession) };
    stats.set(r.profession, st);
    if (r.skill_source === "manual") continue;
    const base = { id: r.id, profession: r.profession, profession_slug: r.profession_slug, name_en: r.name_en, source: r.source };
    const off = r.yields_item === null ? undefined : official.get(`${r.profession}|${r.yields_item}`);
    const lvl = r.yields_item === null ? null : byId.get(r.yields_item)?.item_level;
    const classic = CLASSIC_SKILLS[`${r.profession}|${r.name_en}`];
    if (off) {
      updates.push({ ...base, skill_req: off.skill, skill_source: "item", learned_from_item: off.itemId });
      st.item++;
    } else if (classic !== undefined) {
      updates.push({ ...base, skill_req: classic, skill_source: "classic", learned_from_item: null });
      st.estimate++;
    } else if (lvl && lvl > 1 && st.model) {
      updates.push({ ...base, skill_req: estimateSkill(st.model, lvl), skill_source: "estimate", learned_from_item: null });
      st.estimate++;
    } else {
      st.none++;
    }
  }
  for (const part of chunks(updates, 500)) await must(db.from("recipes").upsert(part));

  for (const [p, s] of [...stats].sort()) {
    const m = s.model ? `nivel ≈ ${s.model.a.toFixed(0)} + ${s.model.b.toFixed(2)} × nivel de objeto (${s.model.points} puntos)` : "sin modelo";
    log(`${p}: ${s.item} oficiales, ${s.estimate} estimadas, ${s.none} sin nivel · ${m}`);
  }
  return { official: updates.filter((u) => u.skill_source === "item").length, estimated: updates.filter((u) => u.skill_source === "estimate").length };
}
