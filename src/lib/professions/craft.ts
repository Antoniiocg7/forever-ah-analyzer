/** Datos de mercado de un objeto en una casa. Precios en cobre. */
export type Market = {
  /** Precio mínimo ahora. null = nada en venta. */
  min: number | null;
  /** Mercado ahora (media del 15% de unidades más baratas). */
  market: number | null;
  /** Media del mercado de los últimos 7 días. */
  market7d: number | null;
  qty: number;
  numAuctions: number;
  /** ESTIMACIÓN de ventas por día. null = sin datos. */
  soldPerDay: number | null;
  /** Lo que cobra un vendedor, solo si el objeto lo vende un vendedor. */
  vendorBuy: number | null;
  /** Lo que paga un vendedor por él. */
  vendorSell: number | null;
};

export type RecipeInput = {
  id: number;
  name: string;
  yieldsItem: number | null;
  yieldsQty: number;
  reagents: { itemId: number; qty: number }[];
};

export type Acquire = { unit: number; via: "ah" | "vendor" | "craft"; recipeId?: number };

/** Lo más barato entre comprar en la subasta y comprar a un vendedor. */
export function buyPrice(m: Market | undefined): Acquire | null {
  const ah = m?.market ?? null;
  const vendor = m?.vendorBuy ?? null;
  if (ah === null && vendor === null) return null;
  if (vendor !== null && (ah === null || vendor <= ah)) return { unit: vendor, via: "vendor" };
  return { unit: ah!, via: "ah" };
}

const MAX_PASSES = 6;

/**
 * Coste unitario de fabricar cada objeto con las recetas dadas (las de tus profesiones), eligiendo en
 * cada material lo más barato entre comprarlo y fabricarlo a su vez (p. ej. Thorium Bar desde el
 * mineral). Itera hasta que no baja ningún coste; los ciclos no cuelgan porque solo se aceptan bajadas.
 */
export function craftCosts(recipes: RecipeInput[], markets: ReadonlyMap<number, Market>): Map<number, Acquire> {
  const best = new Map<number, Acquire>();
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (const r of recipes) {
      if (r.yieldsItem === null || r.reagents.length === 0 || r.yieldsQty <= 0) continue;
      let total = 0;
      let complete = true;
      for (const g of r.reagents) {
        const unit = cheapest(g.itemId, markets, best);
        if (!unit) {
          complete = false;
          break;
        }
        total += unit.unit * g.qty;
      }
      if (!complete) continue;
      const unit = total / r.yieldsQty;
      const current = best.get(r.yieldsItem);
      if (!current || unit < current.unit - 0.5) {
        best.set(r.yieldsItem, { unit, via: "craft", recipeId: r.id });
        changed = true;
      }
    }
    if (!changed) break;
  }
  return best;
}

function cheapest(itemId: number, markets: ReadonlyMap<number, Market>, crafted: ReadonlyMap<number, Acquire>): Acquire | null {
  const buy = buyPrice(markets.get(itemId));
  const craft = crafted.get(itemId);
  if (buy && (!craft || buy.unit <= craft.unit)) return buy;
  return craft ?? null;
}

export type ReagentLine = { itemId: number; qty: number; acquire: Acquire | null; total: number | null };

export type Liquidity = "ok" | "thin" | "none" | "unknown";

export type CraftResult = {
  lines: ReagentLine[];
  /** Coste total, null si algún material no tiene precio. */
  cost: number | null;
  /** Coste de los materiales que sí tienen precio. */
  knownCost: number;
  /** Precio unitario de venta prudente: el menor entre el mínimo actual y la media de 7 días. */
  sellUnit: number | null;
  /** Ingreso neto vendiendo en la subasta (ya sin comisión). */
  ahRevenue: number | null;
  vendorRevenue: number | null;
  revenue: number | null;
  sellVia: "ah" | "vendor" | null;
  profit: number | null;
  margin: number | null;
  /** Depósito de publicar el lote a 2 h y a 24 h (se devuelve si se vende). */
  deposit: { h2: number; h24: number } | null;
  liquidity: Liquidity;
  product: Market | null;
};

export type DepositSettings = { deposit_min: number; pct: Record<string, number> };

/**
 * Economía de fabricar una receta una vez.
 * - Materiales: lo más barato entre subasta (mercado actual), vendedor y fabricarlo tú (`crafted`).
 * - Venta: el menor entre el mínimo actual y la media de 7 días, menos la comisión; o a un vendedor
 *   si paga más. Usar el menor evita fiarse de un único listado caro.
 * - El depósito no se resta (se recupera al vender); se muestra aparte.
 */
export function craftEconomics(
  recipe: RecipeInput,
  markets: ReadonlyMap<number, Market>,
  crafted: ReadonlyMap<number, Acquire>,
  ahCut: number,
  deposit?: DepositSettings,
): CraftResult {
  const lines: ReagentLine[] = recipe.reagents.map((g) => {
    // No se usa la propia receta para fabricar su material (evita contar un ciclo como ahorro).
    const craft = crafted.get(g.itemId);
    const own = craft?.recipeId === recipe.id ? undefined : craft;
    const acquire = cheapest(g.itemId, markets, own ? new Map([[g.itemId, own]]) : new Map());
    return { itemId: g.itemId, qty: g.qty, acquire, total: acquire ? Math.round(acquire.unit * g.qty) : null };
  });
  const knownCost = lines.reduce((s, l) => s + (l.total ?? 0), 0);
  const cost = lines.length > 0 && lines.every((l) => l.total !== null) ? knownCost : null;

  const product = recipe.yieldsItem === null ? null : (markets.get(recipe.yieldsItem) ?? null);
  const candidates = [product?.min, product?.market7d].filter((v): v is number => typeof v === "number" && v > 0);
  const sellUnit = candidates.length ? Math.min(...candidates) : null;
  const ahRevenue = sellUnit === null ? null : Math.round(sellUnit * (1 - ahCut) * recipe.yieldsQty);
  const vendorRevenue = product?.vendorSell ? Math.round(product.vendorSell * recipe.yieldsQty) : null;

  let revenue: number | null = null;
  let sellVia: CraftResult["sellVia"] = null;
  if (ahRevenue !== null && (vendorRevenue === null || ahRevenue >= vendorRevenue)) {
    revenue = ahRevenue;
    sellVia = "ah";
  } else if (vendorRevenue !== null) {
    revenue = vendorRevenue;
    sellVia = "vendor";
  }

  const profit = cost !== null && revenue !== null ? revenue - cost : null;
  const vendorSell = product?.vendorSell ?? 0;
  const dep = (pct: number | undefined) => Math.max(deposit?.deposit_min ?? 0, Math.round(vendorSell * (pct ?? 0) * recipe.yieldsQty));

  return {
    lines,
    cost,
    knownCost,
    sellUnit,
    ahRevenue,
    vendorRevenue,
    revenue,
    sellVia,
    profit,
    margin: profit !== null && cost !== null && cost > 0 ? profit / cost : null,
    deposit: deposit && recipe.yieldsItem !== null ? { h2: dep(deposit.pct["2"]), h24: dep(deposit.pct["24"]) } : null,
    liquidity: liquidityOf(product, sellVia),
    product,
  };
}

/**
 * ¿Se puede vender de verdad? Vender a un vendedor siempre es seguro.
 * - none: nada en venta ni ventas estimadas.
 * - thin: 1–2 subastas y menos de 1 venta/día estimada: el precio puede ser de un solo vendedor.
 */
export function liquidityOf(m: Market | null, sellVia: CraftResult["sellVia"] = "ah"): Liquidity {
  if (sellVia === "vendor") return "ok";
  if (!m || (m.qty === 0 && !m.soldPerDay)) return "none";
  if (m.soldPerDay !== null && m.soldPerDay >= 1) return "ok";
  if (m.numAuctions <= 2) return "thin";
  return m.soldPerDay === null ? "unknown" : "ok";
}
