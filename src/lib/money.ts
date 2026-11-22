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

/**
 * Lee un precio escrito a mano: "1g 20s 5c", "1g20s", "35s", "1,5" o "1.5" (oro). Devuelve cobre,
 * o null si no se entiende.
 */
export function parseMoney(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  const plain = s.replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(plain)) return Math.round(Number(plain) * 10000);
  // El oro puede llevar separador de miles, como lo escribe formatMoney ("1.234g").
  const m = /^(?:(\d{1,3}(?:\.\d{3})*|\d+)g)?(?:(\d+)s)?(?:(\d+)c)?$/.exec(s);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number((m[1] ?? "0").replace(/\./g, "")) * 10000 + Number(m[2] ?? 0) * 100 + Number(m[3] ?? 0);
}
