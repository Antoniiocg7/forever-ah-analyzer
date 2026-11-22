import { cheapest, craftCosts, craftEconomics, liquidityOf, type Acquire, type Market, type RecipeInput } from "./craft";
import { cheapestRoute, colorAt, colorsFor, SALE_PROBABILITY, type Chances, type ColorOffsets, type Colors, type Route } from "./leveling";
import { toRecipeInput, type RecipeRow } from "./queries";

export type PlanSettings = { cut: number; colorOffsets: ColorOffsets; chances: Chances };

export type PlanRecipe = {
  recipe: RecipeRow;
  colors: Colors;
  /** Materiales por fabricación. */
  cost: number;
  /** Lo que esperas recuperar vendiendo el producto (vendedor seguro, o subasta × probabilidad de venta). */
  resale: number;
  /** Planos/patrones: precio en la subasta, o null si no están en venta. */
  learnCost: number | null;
  lines: { itemId: number; qty: number; acquire: Acquire | null }[];
};

export type ShoppingLine = {
  itemId: number;
  qty: number;
  unit: number;
  via: Acquire["via"];
  recipeId?: number;
  /** Unidades en venta ahora (solo para lo que se compra en la subasta). */
  available: number | null;
  /** Precio actual frente a su mediana de 7 días (0,2 = un 20% más barato). null si no aplica. */
  discount: number | null;
};

export type Plan = {
  route: Route;
  byId: Map<number, PlanRecipe>;
  shopping: ShoppingLine[];
  plansToBuy: { recipeId: number; itemId: number; price: number }[];
  materials: number;
  resale: number;
  /** Coste de la misma ruta calculado con las medianas de 7 días, para saber si ahora es buen momento. */
  medianCost: number | null;
  /** Recetas descartadas por falta de nivel o de precio. */
  skipped: { noSkill: number; noPrice: number; unlistedPlans: number };
};

/** Mercado "de una semana normal": precio actual sustituido por la mediana de 7 días. */
function medianMarkets(markets: ReadonlyMap<number, Market>): Map<number, Market> {
  const out = new Map<number, Market>();
  for (const [id, m] of markets) {
    out.set(id, m.market7d ? { ...m, market: m.market7d, min: m.market7d } : m);
  }
  return out;
}

function candidates(
  recipes: RecipeRow[],
  craftable: RecipeRow[],
  markets: ReadonlyMap<number, Market>,
  s: PlanSettings,
  includeUnlistedPlans: boolean,
  sellOnAh: boolean,
) {
  const craftedFor = craftedBySkill(recipes, craftable, markets);
  const out: PlanRecipe[] = [];
  const skipped = { noSkill: 0, noPrice: 0, unlistedPlans: 0 };
  for (const recipe of recipes) {
    if (recipe.skill_req === null) {
      skipped.noSkill++;
      continue;
    }
    const econ = craftEconomics(toRecipeInput(recipe), markets, craftedFor(recipe.skill_req), s.cut);
    if (econ.cost === null) {
      skipped.noPrice++;
      continue;
    }
    let learnCost: number | null = 0;
    if (recipe.learned_from_item !== null) {
      learnCost = markets.get(recipe.learned_from_item)?.min ?? null;
      if (learnCost === null) {
        skipped.unlistedPlans++;
        if (!includeUnlistedPlans) continue;
      }
    }
    // Por defecto solo cuenta lo que paga el vendedor (seguro). Vender en la subasta todo lo que
    // fabricas al subir es optimista: el mercado no absorbe 90 piezas iguales.
    const probSale = SALE_PROBABILITY[liquidityOf(econ.product, "ah")];
    const ahPart = sellOnAh ? Math.round((econ.ahRevenue ?? 0) * probSale) : 0;
    const resale = Math.max(econ.vendorRevenue ?? 0, ahPart);
    out.push({
      recipe,
      colors: colorsFor({ skillReq: recipe.skill_req, orange: recipe.orange, yellow: recipe.yellow, green: recipe.green, grey: recipe.grey }, s.colorOffsets),
      cost: econ.cost,
      resale,
      learnCost,
      lines: econ.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, acquire: l.acquire })),
    });
  }
  return { list: out, skipped, craftedFor };
}

/**
 * Coste de fabricar intermedios según el nivel de la receta que los usa: de la propia profesión solo
 * cuentan las recetas de nivel ≤ al de esa receta (a nivel 150 no puedes hacer un intermedio de 250).
 * Las de tus otras profesiones cuentan todas: la web no sabe qué nivel tienes en ellas.
 */
function craftedBySkill(recipes: RecipeRow[], craftable: RecipeRow[], markets: ReadonlyMap<number, Market>) {
  const slug = recipes[0]?.profession_slug;
  const cache = new Map<number, Map<number, Acquire>>();
  return (skill: number) => {
    let m = cache.get(skill);
    if (!m) {
      const usable = craftable.filter((r) => r.profession_slug !== slug || (r.skill_req !== null && r.skill_req <= skill));
      m = craftCosts(usable.map(toRecipeInput), markets);
      cache.set(skill, m);
    }
    return m;
  };
}

const toRoute = (list: PlanRecipe[], from: number, to: number, chances: Chances) =>
  cheapestRoute(
    from,
    to,
    list.map((c) => ({ id: c.recipe.id, colors: c.colors, netPerCraft: c.cost - c.resale, learnCost: c.learnCost ?? 0 })),
    chances,
  );

/**
 * Plan para subir una profesión de `from` a `to`: ruta más barata, lista de la compra (marcando lo
 * que está barato frente a su mediana) y comparación con el coste en una semana normal.
 * Los materiales que ya tengas se valoran a lo que sacarías vendiéndolos (coste de oportunidad).
 */
export function buildPlan(args: {
  recipes: RecipeRow[];
  craftable: RecipeRow[];
  markets: ReadonlyMap<number, Market>;
  settings: PlanSettings;
  from: number;
  to: number;
  includeUnlistedPlans: boolean;
  /** Contar lo que recuperas vendiendo los productos en la subasta (si no, solo al vendedor). */
  sellOnAh: boolean;
}): Plan {
  const { recipes, craftable, markets, settings, from, to, includeUnlistedPlans, sellOnAh } = args;
  const { list, skipped, craftedFor } = candidates(recipes, craftable, markets, settings, includeUnlistedPlans, sellOnAh);
  const craftableById = new Map<number, RecipeInput>(craftable.map((r) => [r.id, toRecipeInput(r)]));
  const route = toRoute(list, from, to, settings.chances);
  const byId = new Map(list.map((c) => [c.recipe.id, c]));

  // Lista de la compra: fabricaciones esperadas (redondeadas hacia arriba) × materiales.
  const shop = new Map<string, ShoppingLine>();
  let materials = 0;
  let resale = 0;
  const plansToBuy: Plan["plansToBuy"] = [];
  for (const step of route.steps) {
    const c = byId.get(step.recipeId)!;
    const crafts = Math.ceil(step.crafts - 1e-9);
    materials += c.cost * crafts;
    resale += c.resale * crafts;
    if (c.recipe.learned_from_item !== null && c.learnCost && !plansToBuy.some((p) => p.recipeId === c.recipe.id)) {
      plansToBuy.push({ recipeId: c.recipe.id, itemId: c.recipe.learned_from_item, price: c.learnCost });
    }
    const crafted = craftedFor(c.recipe.skill_req ?? 0);
    for (const l of c.lines) {
      if (l.acquire) addToShop(shop, markets, craftableById, crafted, l.itemId, l.qty * crafts, l.acquire, 0);
    }
  }

  // ¿Buen momento? La misma búsqueda con las medianas de 7 días.
  const median = candidates(recipes, craftable, medianMarkets(markets), settings, includeUnlistedPlans, sellOnAh);
  const medianRoute = toRoute(median.list, from, to, settings.chances);
  const medianCost = medianRoute.reached === route.reached && Number.isFinite(medianRoute.cost) ? medianRoute.cost : null;

  return {
    route,
    byId,
    shopping: [...shop.values()].sort((a, b) => b.unit * b.qty - a.unit * a.qty),
    plansToBuy,
    materials: Math.round(materials),
    resale: Math.round(resale),
    medianCost,
    skipped,
  };
}

const MAX_DEPTH = 5;

/**
 * Añade a la lista de la compra `qty` unidades de un material. Si sale más barato fabricarlo, se
 * apunta como "fabricar" y se añaden también sus materiales (p. ej. Thorium Bar → Thorium Ore),
 * en cadena, para que la lista diga todo lo que hay que comprar.
 */
export function addToShop(
  shop: Map<string, ShoppingLine>,
  markets: ReadonlyMap<number, Market>,
  recipes: ReadonlyMap<number, RecipeInput>,
  crafted: ReadonlyMap<number, Acquire>,
  itemId: number,
  qty: number,
  acquire: Acquire,
  depth = 0,
) {
  const key = `${itemId}|${acquire.via}`;
  const cur = shop.get(key);
  if (cur) cur.qty += qty;
  else {
    const m = markets.get(itemId);
    const discount = acquire.via === "ah" && m?.market && m.market7d ? 1 - m.market / m.market7d : null;
    shop.set(key, { itemId, qty, unit: acquire.unit, via: acquire.via, recipeId: acquire.recipeId, discount, available: acquire.via === "ah" ? (m?.qty ?? 0) : null });
  }
  if (acquire.via !== "craft" || acquire.recipeId === undefined || depth >= MAX_DEPTH) return;
  const r = recipes.get(acquire.recipeId);
  if (!r || r.yieldsQty <= 0) return;
  const batches = Math.ceil(qty / r.yieldsQty - 1e-9);
  for (const g of r.reagents) {
    // No se usa la misma receta para su propio material (evita bucles).
    const own = crafted.get(g.itemId);
    const sub = cheapest(g.itemId, markets, own && own.recipeId !== r.id ? new Map([[g.itemId, own]]) : new Map());
    if (sub) addToShop(shop, markets, recipes, crafted, g.itemId, g.qty * batches, sub, depth + 1);
  }
}

export { colorAt };
