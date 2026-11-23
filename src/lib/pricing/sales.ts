import { gunzipSync, gzipSync } from "node:zlib";
import type { Listing } from "../blizzard/client";
import type { TimeLeft } from "../blizzard/schemas";

/**
 * Estado compacto de una subasta: [auctionId, itemId, qty, timeLeft, precio unitario].
 * El precio (null = solo puja) falta en estados guardados antes del 22-11-2026.
 */
export type CompactAuction = [number, number, number, TimeLeft, (number | null)?];

export const toCompact = (listings: Listing[]): CompactAuction[] =>
  listings.map((l) => [l.auctionId, l.itemId, l.qty, l.timeLeft, l.unitPrice]);

/** Codifica el estado como gzip+base64: ~270k subastas caben en ~2 MB y se guardan en milisegundos. */
export const encodeState = (auctions: CompactAuction[]): string => gzipSync(JSON.stringify(auctions)).toString("base64");
export const decodeState = (state: string): CompactAuction[] => JSON.parse(gunzipSync(Buffer.from(state, "base64")).toString("utf8"));

const MIN = 60 * 1000;
/**
 * Tiempo mínimo que le quedaba a una subasta según su `time_left` (tramos de Classic):
 * SHORT < 30 min, MEDIUM 30 min–2 h, LONG 2–12 h, VERY_LONG 12–48 h.
 */
export const MIN_REMAINING_MS: Record<TimeLeft, number> = {
  SHORT: 0,
  MEDIUM: 30 * MIN,
  LONG: 120 * MIN,
  VERY_LONG: 720 * MIN,
  UNKNOWN: 0,
};

/** Con un hueco mayor, ni las VERY_LONG son fiables: no se estima. */
export const MAX_GAP_MS = MIN_REMAINING_MS.VERY_LONG;

/**
 * ESTIMACIÓN de reposición por objeto: oferta NETA que entra entre dos snapshots,
 * stock de ahora − stock de antes + vendidas. No se cuentan las subastas con ID nuevo porque quien
 * cancela y vuelve a publicar cada hora (guerra de rebajas) contaría las mismas unidades una y otra
 * vez: con eso Copper Ore salía con 4.900 "nuevas" por hora teniendo 6.300 en venta.
 */
export function estimateListings(prev: CompactAuction[], curr: Listing[], sold: ReadonlyMap<number, number>): Map<number, number> {
  const delta = new Map<number, number>();
  const add = (id: number, n: number) => delta.set(id, (delta.get(id) ?? 0) + n);
  for (const [, itemId, qty] of prev) add(itemId, -qty);
  for (const l of curr) add(l.itemId, l.qty);
  for (const [itemId, n] of sold) add(itemId, n);
  const out = new Map<number, number>();
  for (const [itemId, n] of delta) if (n > 0) out.set(itemId, n);
  return out;
}

/**
 * ESTIMACIÓN de unidades vendidas por objeto entre dos snapshots separados `gapMs`.
 * - Subasta que sigue pero con menos unidades (commodities) → la diferencia se cuenta como vendida:
 *   una compra parcial no puede ser una cancelación.
 * - Subasta que desaparece y aún le quedaba más tiempo que el hueco (no pudo caducar) → vendida solo
 *   si su precio no superaba el mínimo que queda ahora. Quien compra se lleva lo más barato; quien
 *   cancela para volver a publicar más barato lo hace porque le han rebajado, o sea, su subasta ya no
 *   era la más barata. Sin este filtro las recolocaciones inflaban las ventas (Copper Ore salía a
 *   27.000/día con 4.800 en venta). Si el objeto se ha agotado, cuenta.
 * - Subasta que desaparece y pudo caducar en el hueco → no se cuenta.
 * Devuelve null si el hueco es demasiado grande para estimar nada.
 */
export function estimateSales(prev: CompactAuction[], curr: Listing[], gapMs: number): Map<number, number> | null {
  if (!(gapMs > 0) || gapMs > MAX_GAP_MS) return null;

  const current = new Map<number, number>();
  const minNow = new Map<number, number>();
  for (const l of curr) {
    current.set(l.auctionId, l.qty);
    if (l.unitPrice !== null) {
      const m = minNow.get(l.itemId);
      if (m === undefined || l.unitPrice < m) minNow.set(l.itemId, l.unitPrice);
    }
  }

  const sold = new Map<number, number>();
  const add = (itemId: number, n: number) => sold.set(itemId, (sold.get(itemId) ?? 0) + n);

  for (const [auctionId, itemId, qty, timeLeft, price] of prev) {
    const nowQty = current.get(auctionId);
    if (nowQty === undefined) {
      if ((MIN_REMAINING_MS[timeLeft] ?? 0) <= gapMs) continue; // pudo caducar
      if (price === null) continue; // solo puja: no se puede comprar directamente
      const min = minNow.get(itemId);
      if (price === undefined || min === undefined || price <= min) add(itemId, qty);
    } else if (nowQty < qty) {
      add(itemId, qty - nowQty);
    }
  }
  return sold;
}
