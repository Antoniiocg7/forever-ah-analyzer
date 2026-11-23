import Link from "next/link";
import { connection } from "next/server";
import { gameContext } from "@/lib/calendar";
import { calendarEvents } from "@/lib/deals-queries";
import { isConfigured } from "@/lib/env";
import { nextSeasonalEvent } from "@/lib/seasonal-queries";

/** Franja con el día de juego, los próximos hitos y (si no es compacta) qué suele pasar con los precios. */
export async function GameContextBanner({ compact = false }: { compact?: boolean }) {
  await connection();
  if (!isConfigured()) return null;
  const [events, seasonal] = await Promise.all([calendarEvents().catch(() => []), nextSeasonalEvent().catch(() => null)]);
  const ctx = gameContext(events);
  if (ctx.day === null && !ctx.next && !seasonal) return null;
  const st = seasonal?.timing;

  return (
    <section className="card-accent space-y-3 p-3 sm:p-4" aria-label="Momento del juego">
      <div className="flex flex-wrap gap-2">
        {ctx.day !== null && <Pill icon="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" label={`Día ${ctx.day}`} sub="de WoW Forever" />}
        {ctx.next && (
          <Pill
            icon="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"
            label={`${ctx.next.daysUntil} ${ctx.next.daysUntil === 1 ? "día" : "días"}`}
            sub={ctx.next.kind === "raid" ? "para las raids" : ctx.next.name}
            title={ctx.next.name}
            strong
          />
        )}
        {seasonal && st && (
          <Link href="/deals?tab=events" className="contents">
            <Pill
              icon="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z"
              label={st.phase === "during" ? "En curso" : `${st.daysUntil} días`}
              sub={seasonal.name}
              link
            />
          </Link>
        )}
      </div>
      {!compact && ctx.tips.length > 0 && (
        <details className="group border-t border-gold/15 pt-2">
          <summary className="flex min-h-8 items-center gap-1.5 text-xs font-medium text-gold">
            Qué significa para los precios
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <ul className="space-y-1.5 pt-1">
            {ctx.tips.map((t) => (
              <li key={t} className="flex gap-2 text-xs leading-relaxed text-muted">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Pill({ icon, label, sub, title, strong, link }: { icon: string; label: string; sub: string; title?: string; strong?: boolean; link?: boolean }) {
  return (
    <span
      title={title ?? sub}
      className={`flex min-w-0 items-center gap-2 rounded-xl border border-line bg-surface/80 py-1.5 pr-3 pl-2 ${link ? "transition-colors hover:border-gold/50" : ""}`}
    >
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${strong ? "bg-gold/15 text-gold" : "bg-surface-3 text-muted"}`}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={icon} />
        </svg>
      </span>
      <span className="min-w-0 leading-tight">
        <span className={`block text-sm font-semibold ${strong ? "text-gold" : ""}`}>{label}</span>
        <span className={`block max-w-[11rem] truncate text-[11px] ${link ? "text-gold/80" : "text-muted"}`}>{sub}</span>
      </span>
    </span>
  );
}
