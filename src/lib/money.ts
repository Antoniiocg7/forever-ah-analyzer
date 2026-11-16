/** Formatea cobre como "12g 34s 56c". */
export function formatMoney(copper: number | null | undefined): string {
  if (copper === null || copper === undefined) return "—";
  const sign = copper < 0 ? "-" : "";
  const c = Math.abs(Math.round(copper));
  const g = Math.floor(c / 10000);
  const s = Math.floor((c % 10000) / 100);
  const rest = c % 100;
  const parts: string[] = [];
  if (g > 0) parts.push(`${g.toLocaleString("es-ES")}g`);
  if (s > 0 || g > 0) parts.push(`${s}s`);
  if (g === 0) parts.push(`${rest}c`);
  return sign + parts.join(" ");
}
