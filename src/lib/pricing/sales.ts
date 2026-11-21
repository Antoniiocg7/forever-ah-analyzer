import { gunzipSync, gzipSync } from "node:zlib";
import type { Listing } from "../blizzard/client";
import type { TimeLeft } from "../blizzard/schemas";

/** Estado compacto de una subasta: [auctionId, itemId, qty, timeLeft]. */
export type CompactAuction = [number, number, number, TimeLeft];

export const toCompact = (listings: Listing[]): CompactAuction[] =>
  listings.map((l) => [l.auctionId, l.itemId, l.qty, l.timeLeft]);

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
 * ESTIMACIÓN de unidades vendidas por objeto entre dos snapshots separados `gapMs`.
 * - Subasta que desaparece y aún le quedaba más tiempo que el hueco → no pudo caducar: se cuenta
 *   como vendida (también cuenta una cancelación; la API no permite distinguirlas).
 * - Subasta que sigue pero con menos unidades (commodities) → la diferencia se cuenta como vendida.
 * - Subasta que desaparece y pudo caducar en el hueco → no se cuenta.
 * Devuelve null si el hueco es demasiado grande para estimar nada.
 */
export function estimateSales(prev: CompactAuction[], curr: Listing[], gapMs: number): Map<number, number> | null {
  if (!(gapMs > 0) || gapMs > MAX_GAP_MS) return null;

  const current = new Map<number, number>();
  for (const l of curr) current.set(l.auctionId, l.qty);

  const sold = new Map<number, number>();
  const add = (itemId: number, n: number) => sold.set(itemId, (sold.get(itemId) ?? 0) + n);

  for (const [auctionId, itemId, qty, timeLeft] of prev) {
    const nowQty = current.get(auctionId);
    if (nowQty === undefined) {
      if ((MIN_REMAINING_MS[timeLeft] ?? 0) > gapMs) add(itemId, qty);
    } else if (nowQty < qty) {
      add(itemId, qty - nowQty);
    }
  }
  return sold;
}
