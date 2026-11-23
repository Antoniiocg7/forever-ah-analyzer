import type { Listing } from "../blizzard/client";
import type { CompactAuction } from "./sales";

/**
 * Resets de otros jugadores: entre dos descargas alguien compra todo lo barato de un objeto y el
 * mínimo salta muy por encima de lo normal.
 */

export type DetectedReset = {
  itemId: number;
  prevMin: number;
  newMin: number;
  market: number;
  /** Unidades que había por debajo del nuevo mínimo (lo que se llevó quien resetea). */
  units: number;
  /** Lo que costaba comprarlas. */
  cost: number;
};

export const RESET_RULES = {
  /** El nuevo mínimo es al menos un 25% más alto que el anterior… */
  jump: 1.25,
  /** …y al menos un 15% por encima del precio normal. */
  overMarket: 1.15,
  /** Solo objetos de 10s o más. */
  minMarket: 1000,
  /**
   * Al menos 10 unidades compradas y 10g gastados. Con 3 uds / 1g salían ~36 "resets" por hora, casi
   * todos alguien comprando 3–8 piezas de equipo baratas (una compra normal, no un reset).
   */
  minUnits: 10,
  minCost: 100000,
  /** Al menos la mitad de lo barato desapareció como venta (no cancelado ni caducado). */
  soldShare: 0.5,
} as const;

/** Mínimo por objeto (solo compra directa). */
function minByItem(rows: Iterable<{ itemId: number; price: number | null | undefined }>): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of rows) {
    if (r.price == null) continue;
    const m = out.get(r.itemId);
    if (m === undefined || r.price < m) out.set(r.itemId, r.price);
  }
  return out;
}

/**
 * Detecta resets entre el estado anterior y el actual.
 * `market`: precio normal (mediana de 7 días) por objeto. `sold`: ventas estimadas de esta hora.
 */
export function detectResets(
  prev: CompactAuction[],
  curr: Listing[],
  market: ReadonlyMap<number, number>,
  sold: ReadonlyMap<number, number>,
): DetectedReset[] {
  const prevMin = minByItem(prev.map(([, itemId, , , price]) => ({ itemId, price })));
  const currMin = minByItem(curr.map((l) => ({ itemId: l.itemId, price: l.unitPrice })));

  // Candidatos: el mínimo ha saltado muy por encima del anterior y de lo normal.
  const candidates = new Map<number, { prevMin: number; newMin: number; market: number; units: number; cost: number }>();
  for (const [itemId, newMin] of currMin) {
    const m = market.get(itemId);
    const p = prevMin.get(itemId);
    if (!m || m < RESET_RULES.minMarket || p === undefined) continue;
    if (newMin >= p * RESET_RULES.jump && newMin >= m * RESET_RULES.overMarket) {
      candidates.set(itemId, { prevMin: p, newMin, market: m, units: 0, cost: 0 });
    }
  }
  if (candidates.size === 0) return [];

  // Lo que había por debajo del nuevo mínimo.
  for (const [, itemId, qty, , price] of prev) {
    const c = candidates.get(itemId);
    if (!c || price == null || price >= c.newMin) continue;
    c.units += qty;
    c.cost += qty * price;
  }

  const out: DetectedReset[] = [];
  for (const [itemId, c] of candidates) {
    if (c.units < RESET_RULES.minUnits || c.cost < RESET_RULES.minCost) continue;
    if ((sold.get(itemId) ?? 0) < c.units * RESET_RULES.soldShare) continue;
    out.push({ itemId, ...c });
  }
  return out;
}

export type ResetStatus = "open" | "held" | "failed";

/** Horas que tiene que aguantar un reset para darlo por bueno. */
export const HOLD_HOURS = 24;

/**
 * Estado de un reset abierto con el mínimo de ahora: se ha caído si el mínimo vuelve a estar cerca
 * de lo de antes (≤ 10% sobre el mínimo anterior o ≤ 5% sobre lo normal); aguanta si pasan 24 h.
 * Si el objeto se ha agotado (min null) sigue abierto.
 */
export function resetStatus(e: { prevMin: number; market: number; detectedAt: Date }, min: number | null, now: Date): ResetStatus {
  if (min !== null && min <= Math.max(e.prevMin * 1.1, e.market * 1.05)) return "failed";
  if (now.getTime() - e.detectedAt.getTime() >= HOLD_HOURS * 3600_000) return "held";
  return "open";
}
