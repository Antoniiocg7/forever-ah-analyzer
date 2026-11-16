import type { Listing } from "../blizzard/client";
import type { TimeLeft } from "../blizzard/schemas";

/** Estado compacto de una subasta: [auctionId, itemId, qty, timeLeft]. */
export type CompactAuction = [number, number, number, TimeLeft];

export const toCompact = (listings: Listing[]): CompactAuction[] =>
  listings.map((l) => [l.auctionId, l.itemId, l.qty, l.timeLeft]);

/** Con más de este hueco entre snapshots, una subasta LONG pudo caducar: no se estima. */
export const MAX_GAP_MS = 2 * 60 * 60 * 1000;

/** Con snapshots horarios, solo estas no pueden haber caducado entre uno y el siguiente. */
const CANNOT_HAVE_EXPIRED: ReadonlySet<TimeLeft> = new Set<TimeLeft>(["LONG", "VERY_LONG"]);

/**
 * ESTIMACIÓN de unidades vendidas por objeto entre dos snapshots consecutivos.
 * - Subasta que desaparece y le quedaban >2 h → se cuenta como vendida (puede ser una cancelación).
 * - Subasta que sigue pero con menos unidades (commodities) → la diferencia se cuenta como vendida.
 * - Subasta que desaparece con SHORT/MEDIUM/UNKNOWN → pudo caducar, no se cuenta.
 */
export function estimateSales(prev: CompactAuction[], curr: Listing[]): Map<number, number> {
  const current = new Map<number, number>();
  for (const l of curr) current.set(l.auctionId, l.qty);

  const sold = new Map<number, number>();
  const add = (itemId: number, n: number) => sold.set(itemId, (sold.get(itemId) ?? 0) + n);

  for (const [auctionId, itemId, qty, timeLeft] of prev) {
    const nowQty = current.get(auctionId);
    if (nowQty === undefined) {
      if (CANNOT_HAVE_EXPIRED.has(timeLeft)) add(itemId, qty);
    } else if (nowQty < qty) {
      add(itemId, qty - nowQty);
    }
  }
  return sold;
}
