/** Eventos de temporada: en qué fase están y qué hacer con los objetos que piden. */

export type Occurrence = { starts: string; ends: string; place: string | null };

export type Phase = "during" | "soon" | "far" | "past";

export type EventTiming = {
  occ: Occurrence;
  phase: Phase;
  /** Días hasta que empieza (0 si ya ha empezado). */
  daysUntil: number;
  /** Días que le quedan si está en curso. */
  daysLeft: number;
};

const DAY = 86_400_000;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Ventana en la que conviene comprar antes de que empiece. */
export const BUY_WINDOW_DAYS = 21;

/** La aparición en curso o la próxima; si todas han pasado, la última (fase "past"). null sin fechas. */
export function eventTiming(dates: Occurrence[], now = Date.now()): EventTiming | null {
  if (dates.length === 0) return null;
  const sorted = [...dates].sort((a, b) => day(a.starts) - day(b.starts));
  for (const occ of sorted) {
    const start = day(occ.starts);
    const end = day(occ.ends) + DAY; // el último día cuenta entero
    if (now >= start && now < end) return { occ, phase: "during", daysUntil: 0, daysLeft: Math.ceil((end - now) / DAY) };
    if (now < start) {
      const daysUntil = Math.ceil((start - now) / DAY);
      return { occ, phase: daysUntil <= BUY_WINDOW_DAYS ? "soon" : "far", daysUntil, daysLeft: 0 };
    }
  }
  return { occ: sorted[sorted.length - 1], phase: "past", daysUntil: 0, daysLeft: 0 };
}

export type EventAdvice = { label: string; className: string; action: "buy" | "sell" | "wait" | "watch" };

/**
 * Qué hacer con un objeto del evento según la fase y su precio frente a lo normal:
 * - en curso: vender (es cuando más se pide);
 * - faltan ≤ 21 días: comprar si aún está a su precio normal o por debajo; si ya ha subido > 15%, tarde;
 * - lejos: vigilar. Si la vez anterior no subió (< 5%), se avisa.
 */
export function eventAdvice(t: EventTiming, price: { min: number | null; market7d: number | null }, pastUplift: number | null): EventAdvice {
  const noUplift = pastUplift !== null && pastUplift < 0.05;
  if (t.phase === "during") return { label: "Vende ahora: es cuando más se pide", className: "text-good", action: "sell" };
  if (t.phase === "past") return { label: "Ya pasó", className: "text-muted", action: "watch" };
  if (t.phase === "far") return { label: "Aún falta: vigilar", className: "text-muted", action: "watch" };
  if (price.min === null || price.market7d === null) return { label: "Sin precio en la subasta", className: "text-muted", action: "watch" };
  if (noUplift) return { label: "La última vez no subió: sin prisa", className: "text-muted", action: "watch" };
  const ratio = price.min / price.market7d;
  if (ratio <= 1) return { label: "Compra ahora: aún está a precio normal", className: "text-good", action: "buy" };
  if (ratio > 1.15) return { label: "Ya ha subido: tarde para comprar", className: "text-bad", action: "wait" };
  return { label: "Compra si baja un poco", className: "text-gold", action: "wait" };
}

/**
 * Cuánto subió el precio durante una aparición pasada frente a las 2 semanas anteriores
 * (media de la mediana diaria). null si no hay al menos 3 días en cada tramo.
 */
export function pastUplift(daily: { day: string; market: number | null }[], occ: Occurrence): number | null {
  const start = day(occ.starts);
  const end = day(occ.ends);
  const before: number[] = [];
  const during: number[] = [];
  for (const d of daily) {
    if (d.market === null) continue;
    const t = day(d.day);
    if (t >= start - 14 * DAY && t < start) before.push(d.market);
    else if (t >= start && t <= end) during.push(d.market);
  }
  if (before.length < 3 || during.length < 3) return null;
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return avg(during) / avg(before) - 1;
}
