import { formatMoney } from "../money";
import { esc } from "../telegram";

/** Qué avisar y cuándo (settings.alerts). */
export type AlertSettings = {
  enabled: boolean;
  /** Beneficio mínimo de un chollo para avisar, en cobre. */
  minDealProfit: number;
  /** Máximo de avisos de chollos por ejecución (las demás se quedan para el resumen). */
  maxPerRun: number;
  /** Hora (Polonia) del resumen diario. */
  dailyHour: number;
  lang: "en" | "es";
  /** Profesiones a vigilar: avisa si subir de `from` a `to` está barato. */
  leveling: { slug: string; from: number; to: number }[];
};

export const DEFAULT_ALERTS: AlertSettings = { enabled: true, minDealProfit: 50000, maxPerRun: 5, dailyHour: 9, lang: "en", leveling: [] };

/** Horas de antispam por tipo (CLAUDE.md: como mucho una alerta por objeto cada 6 h). */
export const COOLDOWN_HOURS = { deal: 6, watch: 6, leveling: 24 } as const;

export type Alert = { key: string; kind: "deal" | "watch" | "leveling" | "digest" | "test"; itemId?: number; html: string };

export type DealCandidate = {
  itemId: number;
  name: string;
  min: number;
  market7d: number;
  units: number;
  cost: number;
  depthProfit: number;
  soldPerDay: number;
};

export type WatchCandidate = { itemId: number; name: string; target: number; direction: "below" | "above"; min: number | null };

export type LevelingCandidate = { slug: string; name: string; from: number; to: number; cost: number; medianCost: number };

const link = (base: string, path: string, text: string) => `<a href="${esc(base + path)}">${esc(text)}</a>`;

/** Chollos para revender que superan el beneficio mínimo y no se han avisado en 6 h. */
export function dealAlerts(deals: DealCandidate[], s: AlertSettings, recent: ReadonlySet<string>, base: string): Alert[] {
  return deals
    .filter((d) => d.depthProfit >= s.minDealProfit && !recent.has(`deal:${d.itemId}`))
    .sort((a, b) => b.depthProfit - a.depthProfit)
    .slice(0, s.maxPerRun)
    .map((d) => ({
      key: `deal:${d.itemId}`,
      kind: "deal",
      itemId: d.itemId,
      html:
        `💰 <b>Chollo</b>: ${link(base, `/item/${d.itemId}`, d.name)}\n` +
        `Compra ${d.units} por ${formatMoney(d.cost)} (desde ${formatMoney(d.min)}) y revende a ${formatMoney(d.market7d)}.\n` +
        `Beneficio estimado: <b>+${formatMoney(d.depthProfit)}</b> · ≈${d.soldPerDay} vendidos/día`,
    }));
}

/** Objetos de la lista de seguimiento que cruzan su precio objetivo. */
export function watchAlerts(items: WatchCandidate[], recent: ReadonlySet<string>, base: string): Alert[] {
  return items
    .filter((w) => w.min !== null && (w.direction === "below" ? w.min <= w.target : w.min >= w.target) && !recent.has(`watch:${w.itemId}`))
    .map((w) => ({
      key: `watch:${w.itemId}`,
      kind: "watch",
      itemId: w.itemId,
      html:
        `🔔 ${link(base, `/item/${w.itemId}`, w.name)} está a <b>${formatMoney(w.min)}</b>\n` +
        `Tu aviso: ${w.direction === "below" ? "por debajo de" : "por encima de"} ${formatMoney(w.target)}`,
    }));
}

/** Avisa si subir una profesión cuesta un 15% menos que en una semana normal (CLAUDE.md, Fase 4). */
export function levelingAlerts(results: LevelingCandidate[], recent: ReadonlySet<string>, base: string): Alert[] {
  return results
    .filter((r) => r.medianCost > 0 && r.cost <= r.medianCost * 0.85 && !recent.has(`leveling:${r.slug}`))
    .map((r) => ({
      key: `leveling:${r.slug}`,
      kind: "leveling",
      html:
        `📉 <b>Buen momento para subir ${esc(r.name)}</b> (${r.from} → ${r.to})\n` +
        `Ahora cuesta ${formatMoney(r.cost)}, un ${Math.round((1 - r.cost / r.medianCost) * 100)}% menos que una semana normal (${formatMoney(r.medianCost)}).\n` +
        link(base, `/professions/${r.slug}/plan?from=${r.from}&to=${r.to}`, "Ver la ruta y la lista de la compra"),
    }));
}

/** Fecha y hora en Polonia. */
export function warsawNow(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** Clave del resumen de hoy si ya toca enviarlo (a partir de la hora elegida, una vez al día). */
export function digestKeyDue(now: Date, dailyHour: number, sent: ReadonlySet<string>): string | null {
  const { date, hour } = warsawNow(now);
  const key = `digest:${date}`;
  return hour >= dailyHour && !sent.has(key) ? key : null;
}

export function digestHtml(args: {
  base: string;
  day: number | null;
  next: { name: string; daysUntil: number } | null;
  deals: DealCandidate[];
  buys: { itemId: number; name: string; min: number; market7d: number }[];
  leveling: LevelingCandidate[];
  hoursSinceIngest: number | null;
}): string {
  const { base } = args;
  const lines: string[] = ["☀️ <b>Resumen de la subasta</b>"];
  if (args.day !== null || args.next) {
    lines.push([args.day !== null ? `Día ${args.day}` : null, args.next ? `${esc(args.next.name)} en ${args.next.daysUntil} días` : null].filter(Boolean).join(" · "));
  }
  if (args.hoursSinceIngest !== null && args.hoursSinceIngest > 2.5) lines.push(`⚠️ La última descarga fue hace ${Math.round(args.hoursSinceIngest)} h.`);

  lines.push("", "<b>Mejores chollos para revender</b>");
  if (args.deals.length === 0) lines.push("Ninguno ahora mismo.");
  for (const d of args.deals.slice(0, 5)) lines.push(`• ${link(base, `/item/${d.itemId}`, d.name)}: +${formatMoney(d.depthProfit)} (${d.units} uds)`);

  if (args.buys.length) {
    lines.push("", "<b>Para las raids: comprar ahora</b>");
    for (const b of args.buys.slice(0, 5)) lines.push(`• ${link(base, `/item/${b.itemId}`, b.name)}: ${formatMoney(b.min)} (mediana ${formatMoney(b.market7d)})`);
  }
  if (args.leveling.length) {
    lines.push("", "<b>Subir profesiones</b>");
    for (const l of args.leveling) {
      const pct = l.medianCost > 0 ? Math.round((l.cost / l.medianCost - 1) * 100) : 0;
      lines.push(`• ${esc(l.name)} ${l.from}→${l.to}: ${formatMoney(l.cost)} (${pct > 0 ? "+" : ""}${pct}% frente a lo normal)`);
    }
  }
  lines.push("", link(base, "/deals", "Abrir chollos"));
  return lines.join("\n");
}
