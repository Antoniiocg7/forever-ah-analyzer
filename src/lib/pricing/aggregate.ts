import type { Listing } from "../blizzard/client";
import { buildLadder, type Ladder } from "./reset";

export type ItemAggregate = {
  itemId: number;
  minBuyout: number;
  /** Media del 15% de unidades más baratas. */
  p15Market: number;
  /** Mediana ponderada por unidades. */
  median: number;
  qty: number;
  numAuctions: number;
  /** Escalera de precios (primeros escalones), para resets y cebos. */
  ladder: Ladder;
};

/** Los listados por encima de este múltiplo de la mediana no cuentan. */
export const OUTLIER_FACTOR = 100;
export const MARKET_SHARE = 0.15;

type Priced = { price: number; qty: number };

function weightedMedian(sorted: Priced[], totalQty: number): number {
  let seen = 0;
  for (const l of sorted) {
    seen += l.qty;
    if (seen * 2 >= totalQty) return l.price;
  }
  return sorted[sorted.length - 1].price;
}

export function aggregateItem(itemId: number, listings: Priced[]): ItemAggregate | null {
  const priced = listings.filter((l) => l.price > 0 && l.qty > 0).sort((a, b) => a.price - b.price);
  if (priced.length === 0) return null;

  const rawQty = priced.reduce((s, l) => s + l.qty, 0);
  const rawMedian = weightedMedian(priced, rawQty);
  const kept = priced.filter((l) => l.price <= rawMedian * OUTLIER_FACTOR);
  const qty = kept.reduce((s, l) => s + l.qty, 0);

  let remaining = Math.max(1, Math.ceil(qty * MARKET_SHARE));
  const marketUnits = remaining;
  let marketSum = 0;
  for (const l of kept) {
    const take = Math.min(l.qty, remaining);
    marketSum += take * l.price;
    remaining -= take;
    if (remaining === 0) break;
  }

  const median = weightedMedian(kept, qty);
  return {
    itemId,
    minBuyout: kept[0].price,
    p15Market: Math.round(marketSum / marketUnits),
    median,
    qty,
    numAuctions: kept.length,
    ladder: buildLadder(kept, median),
  };
}

/** Agrega por objeto. Las subastas solo con puja (sin compra directa) se ignoran. */
export function aggregateListings(listings: Listing[]): Map<number, ItemAggregate> {
  const byItem = new Map<number, Priced[]>();
  for (const l of listings) {
    if (l.unitPrice === null) continue;
    const arr = byItem.get(l.itemId);
    if (arr) arr.push({ price: l.unitPrice, qty: l.qty });
    else byItem.set(l.itemId, [{ price: l.unitPrice, qty: l.qty }]);
  }
  const out = new Map<number, ItemAggregate>();
  for (const [itemId, arr] of byItem) {
    const agg = aggregateItem(itemId, arr);
    if (agg) out.set(itemId, agg);
  }
  return out;
}
