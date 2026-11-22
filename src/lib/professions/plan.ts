import { craftCosts, craftEconomics, liquidityOf, type Acquire, type Market } from "./craft";
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
  const crafted = craftCosts(craftable.map(toRecipeInput), markets);
  const out: PlanRecipe[] = [];
  const skipped = { noSkill: 0, noPrice: 0, unlistedPlans: 0 };
  for (const recipe of recipes) {
    if (recipe.skill_req === null) {
      skipped.noSkill++;
      continue;
    }
    const econ = craftEconomics(toRecipeInput(recipe), markets, crafted, s.cut);
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
  return { list: out, skipped };
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
  const { list, skipped } = candidates(recipes, craftable, markets, settings, includeUnlistedPlans, sellOnAh);
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
    for (const l of c.lines) {
      if (!l.acquire) continue;
      const key = `${l.itemId}|${l.acquire.via}`;
      const cur = shop.get(key);
      if (cur) cur.qty += l.qty * crafts;
      else {
        const m = markets.get(l.itemId);
        const discount = l.acquire.via === "ah" && m?.market && m.market7d ? 1 - m.market / m.market7d : null;
        shop.set(key, { itemId: l.itemId, qty: l.qty * crafts, unit: l.acquire.unit, via: l.acquire.via, recipeId: l.acquire.recipeId, discount });
      }
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

export { colorAt };
