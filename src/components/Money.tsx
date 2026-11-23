/**
 * Precio con las monedas del juego: oro, plata y cobre en su color (como en la subasta).
 * Mismas reglas que formatMoney: el cobre solo se muestra por debajo de 1 oro.
 */
export function Money({ value, className = "" }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined) return <span className={`text-muted ${className}`}>—</span>;
  const negative = value < 0;
  const c = Math.abs(Math.round(value));
  const g = Math.floor(c / 10000);
  const s = Math.floor((c % 10000) / 100);
  const rest = c % 100;
  const parts: [string, "g" | "s" | "c"][] = [];
  if (g > 0) parts.push([g.toLocaleString("es-ES"), "g"]);
  if (s > 0 || g > 0) parts.push([String(s), "s"]);
  if (g === 0) parts.push([String(rest), "c"]);
  return (
    <span className={`font-mono whitespace-nowrap tabular-nums ${className}`}>
      {negative && "−"}
      {parts.map(([n, unit], i) => (
        <span key={unit}>
          {i > 0 && " "}
          {n}
          <span className={`money-${unit} text-[0.85em] font-semibold`}>{unit}</span>
        </span>
      ))}
    </span>
  );
}
