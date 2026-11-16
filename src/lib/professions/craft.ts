export type Price = { min: number; market: number };

export type RecipeInput = {
  yieldsItem: number | null;
  yieldsQty: number;
  reagents: { itemId: number; qty: number }[];
};

export type CraftResult = {
  /** Coste de comprar todos los materiales en la subasta. null si falta el precio de alguno. */
  cost: number | null;
  /** Coste parcial: solo los materiales que sí tienen precio. */
  knownCost: number;
  /** Materiales sin ninguna unidad en venta. */
  missing: number[];
  /** Ingreso neto vendiendo en la subasta (ya descontada la comisión). null si no hay precio. */
  ahRevenue: number | null;
  /** Ingreso vendiendo a un vendedor. null si no se conoce. */
  vendorRevenue: number | null;
  /** Mejor de los dos ingresos, y por dónde. */
  revenue: number | null;
  sellVia: "ah" | "vendor" | null;
  profit: number | null;
  /** Beneficio sobre el coste (0.25 = 25%). */
  margin: number | null;
};

/**
 * Coste y beneficio de fabricar una receta una vez.
 * - Materiales: se compran al precio de mercado (media del 15% más barato), más realista que el
 *   mínimo cuando hacen falta varias unidades.
 * - Venta: al mínimo actual del producto (para vender hay que igualarlo o bajarlo), menos la comisión.
 * - No incluye el depósito de publicación ni materiales que venda un vendedor más baratos.
 */
export function craftEconomics(
  recipe: RecipeInput,
  prices: ReadonlyMap<number, Price>,
  vendorSell: ReadonlyMap<number, number>,
  ahCut: number,
): CraftResult {
  let knownCost = 0;
  const missing: number[] = [];
  for (const r of recipe.reagents) {
    const p = prices.get(r.itemId);
    if (p) knownCost += p.market * r.qty;
    else missing.push(r.itemId);
  }
  const cost = missing.length === 0 && recipe.reagents.length > 0 ? knownCost : null;

  const product = recipe.yieldsItem === null ? undefined : prices.get(recipe.yieldsItem);
  const vendor = recipe.yieldsItem === null ? undefined : vendorSell.get(recipe.yieldsItem);
  const ahRevenue = product ? Math.round(product.min * (1 - ahCut) * recipe.yieldsQty) : null;
  const vendorRevenue = vendor ? Math.round(vendor * recipe.yieldsQty) : null;

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
  return {
    cost,
    knownCost,
    missing,
    ahRevenue,
    vendorRevenue,
    revenue,
    sellVia,
    profit,
    margin: profit !== null && cost !== null && cost > 0 ? profit / cost : null,
  };
}
