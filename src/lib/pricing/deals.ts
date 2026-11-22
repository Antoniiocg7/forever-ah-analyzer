import type { Listing } from "../blizzard/client";

/** Un chollo para revender: precio a ≤ 85% de la mediana de 7 días. */
export const DEAL_PRICE_RATIO = 0.85;

export type Depth = { dealUnits: number; dealCost: number; vendorUnits: number; vendorProfit: number };

/**
 * Profundidad por objeto a partir de cada subasta (solo compra directa):
 * - dealUnits/dealCost: unidades a ≤ 85% de su mediana de 7 días y lo que cuesta comprarlas todas.
 * - vendorUnits/vendorProfit: unidades por debajo de lo que paga el vendedor y la ganancia segura.
 */
export function computeDepth(
  listings: Listing[],
  market7d: ReadonlyMap<number, number>,
  vendorSell: ReadonlyMap<number, number>,
): Map<number, Depth> {
  const out = new Map<number, Depth>();
  const get = (id: number) => {
    let d = out.get(id);
    if (!d) out.set(id, (d = { dealUnits: 0, dealCost: 0, vendorUnits: 0, vendorProfit: 0 }));
    return d;
  };
  for (const l of listings) {
    if (l.unitPrice === null) continue;
    const m = market7d.get(l.itemId);
    if (m && l.unitPrice <= m * DEAL_PRICE_RATIO) {
      const d = get(l.itemId);
      d.dealUnits += l.qty;
      d.dealCost += l.unitPrice * l.qty;
    }
    const v = vendorSell.get(l.itemId);
    if (v && l.unitPrice < v) {
      const d = get(l.itemId);
      d.vendorUnits += l.qty;
      d.vendorProfit += (v - l.unitPrice) * l.qty;
    }
  }
  return out;
}

export type DealSettings = {
  cut: number;
  minSoldPerDay: number;
  minMarket: number;
  deposit: { deposit_min: number; pct: Record<string, number> };
};

export type DealInput = {
  min: number;
  market7d: number | null;
  soldPerDay: number | null;
  qty: number;
  vendorSell: number | null;
  dealUnits: number;
  dealCost: number;
};

export type Deal = {
  discount: number;
  /** Ganancia esperada por unidad revendiendo a la mediana: neto − precio − depósito × prob. de no venderse. */
  profitPerUnit: number;
  /** Ganancia esperada comprando todas las unidades del chollo. */
  depthProfit: number;
  /** Probabilidad de que no se venda en 24 h (ventas/día frente al stock). */
  pNoSale: number;
  deposit: number;
  /** Días que tardarías en vender las unidades del chollo al ritmo actual. */
  daysToSell: number | null;
};

/**
 * Puntuación de un chollo para comprar y revender (CLAUDE.md, Fase 2). null si no cumple:
 * mercado de 7 días ≥ minMarket, ventas ≥ minSoldPerDay, y que salga a cuenta tras comisión y depósito.
 * - discount = 1 − mínimo / mediana 7 días
 * - profitPerUnit = mediana × (1 − comisión) − mínimo − depósito(24 h) × prob. de no venderse
 */
export function scoreDeal(d: DealInput, s: DealSettings): Deal | null {
  if (!d.market7d || d.market7d < s.minMarket) return null;
  if (d.soldPerDay === null || d.soldPerDay < s.minSoldPerDay) return null;
  const discount = 1 - d.min / d.market7d;
  if (discount <= 0) return null;

  const pNoSale = Math.min(1, Math.max(0, 1 - d.soldPerDay / Math.max(d.qty, 1)));
  const deposit = Math.max(s.deposit.deposit_min, Math.round((d.vendorSell ?? 0) * (s.deposit.pct["24"] ?? 0)));
  const net = d.market7d * (1 - s.cut);
  const profitPerUnit = Math.round(net - d.min - deposit * pNoSale);
  if (profitPerUnit <= 0) return null;

  const units = d.dealUnits > 0 ? d.dealUnits : 1;
  const cost = d.dealUnits > 0 ? d.dealCost : d.min;
  const depthProfit = Math.round(units * (net - deposit * pNoSale) - cost);
  return { discount, profitPerUnit, depthProfit, pNoSale, deposit, daysToSell: units / d.soldPerDay };
}
