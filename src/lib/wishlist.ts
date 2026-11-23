/** Lista de deseos de equipo: ranuras y qué hacer con cada pieza según su precio. */

export const SLOTS = {
  head: "Cabeza",
  neck: "Cuello",
  shoulder: "Hombros",
  back: "Capa",
  chest: "Pecho",
  wrist: "Muñecas",
  hands: "Manos",
  waist: "Cintura",
  legs: "Piernas",
  feet: "Pies",
  finger: "Anillo",
  trinket: "Abalorio",
  twohand: "Arma a dos manos",
  mainhand: "Arma a una mano",
  offhand: "Escudo / mano izq.",
  relic: "Libram",
  other: "Otro",
} as const;
export type Slot = keyof typeof SLOTS;

export const PRIORITY = { 1: "Alta", 2: "Media", 3: "Baja" } as const;

export type WishPrice = {
  /** Más barato ahora (null = no hay en venta). */
  min: number | null;
  /** Precio normal (mediana de 7 días). */
  market7d: number | null;
  /** Mínimo diario más bajo de los últimos 30 días. */
  low30: number | null;
  /** Tu precio máximo (null = sin límite). */
  maxPrice: number | null;
  /** ¿Se ha visto alguna vez en la subasta? */
  everSeen: boolean;
};

export type WishAdvice = { label: string; className: string; action: "buy" | "wait" | "absent" | "watch"; rank: number };

/**
 * Qué hacer con una pieza:
 * - nunca en la subasta: probablemente se liga al recogerla (BoP), hay que conseguirla jugando;
 * - no está ahora: esperar a que aparezca;
 * - por debajo de tu máximo, o en el precio más bajo del mes, o un 15% por debajo de lo normal: comprar;
 * - por encima de tu máximo o > 15% sobre lo normal: esperar;
 * - si no: precio normal.
 */
export function wishAdvice(p: WishPrice): WishAdvice {
  if (!p.everSeen) return { label: "Nunca ha salido en la subasta: seguramente se liga al recogerla (BoP)", className: "text-muted", action: "absent", rank: 4 };
  if (p.min === null) return { label: "Ahora no hay ninguna en venta", className: "text-muted", action: "absent", rank: 3 };
  if (p.maxPrice !== null && p.min <= p.maxPrice) return { label: "¡Por debajo de tu precio máximo: cómprala!", className: "text-good", action: "buy", rank: 0 };
  if (p.maxPrice !== null && p.min > p.maxPrice * 1.0) {
    const over = Math.round((p.min / p.maxPrice - 1) * 100);
    return { label: `${over}% por encima de tu máximo: espera`, className: "text-bad", action: "wait", rank: 2 };
  }
  if (p.low30 !== null && p.min <= p.low30) return { label: "El precio más bajo del último mes: buen momento", className: "text-good", action: "buy", rank: 1 };
  if (p.market7d !== null && p.min <= p.market7d * 0.85) return { label: "Más barata de lo normal: buen momento", className: "text-good", action: "buy", rank: 1 };
  if (p.market7d !== null && p.min > p.market7d * 1.15) return { label: "Más cara de lo normal: espera", className: "text-bad", action: "wait", rank: 2 };
  return { label: "Precio normal", className: "text-muted", action: "watch", rank: 2 };
}
