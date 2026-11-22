/**
 * Nivel de mercado de un objeto según sus ventas estimadas por día y su stock.
 * Los mismos umbrales están en la vista SQL latest_item_prices (columna activity): si cambias uno,
 * cambia el otro (migración 20261122060000).
 * - high (mucho mercado): ≥ 500 ventas/día, o ≥ 20 y vende al menos la mitad de su stock al día.
 * - normal: ≥ 5 ventas/día.
 * - low (poco mercado): menos de 5.
 */
export type Activity = "high" | "normal" | "low";

export function marketActivity(soldPerDay: number | null | undefined, qty: number): Activity | null {
  if (soldPerDay === null || soldPerDay === undefined) return null;
  if (soldPerDay >= 500 || (soldPerDay >= 20 && soldPerDay >= qty * 0.5)) return "high";
  if (soldPerDay >= 5) return "normal";
  return "low";
}

export const ACTIVITY_LABEL: Record<Activity, string> = { high: "mucho mercado", normal: "mercado normal", low: "poco mercado" };
export const ACTIVITY_CLASS: Record<Activity, string> = {
  high: "border-good/60 text-good",
  normal: "border-line text-muted",
  low: "border-bad/60 text-bad",
};
