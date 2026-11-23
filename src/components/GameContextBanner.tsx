import Link from "next/link";
import { connection } from "next/server";
import { gameContext } from "@/lib/calendar";
import { calendarEvents } from "@/lib/deals-queries";
import { isConfigured } from "@/lib/env";
import { nextSeasonalEvent } from "@/lib/seasonal-queries";

/** Franja con el día de juego, el próximo evento y qué suele pasar con los precios en esta etapa. */
export async function GameContextBanner({ compact = false }: { compact?: boolean }) {
  await connection();
  if (!isConfigured()) return null;
  const [events, seasonal] = await Promise.all([calendarEvents().catch(() => []), nextSeasonalEvent().catch(() => null)]);
  const ctx = gameContext(events);
  if (ctx.day === null && !ctx.next && !seasonal) return null;
  const st = seasonal?.timing;

  return (
    <section className="card space-y-1.5 border-gold/40 text-sm">
      <p className="font-medium">
        {ctx.day !== null && <>Día {ctx.day} de WoW Forever</>}
        {ctx.next && (
          <span className="text-gold">
            {ctx.day !== null && " · "}
            {ctx.next.name} en {ctx.next.daysUntil} {ctx.next.daysUntil === 1 ? "día" : "días"}
          </span>
        )}
      </p>
      {seasonal && st && (
        <p className="text-xs">
          <Link href="/deals?tab=events" className="text-gold underline">
            {seasonal.name}
          </Link>{" "}
          <span className="text-muted">
            {st.phase === "during"
              ? `en curso (quedan ${st.daysLeft} días): buen momento para vender lo que piden sus misiones.`
              : `en ${st.daysUntil} días${st.phase === "soon" ? ": compra ya lo que piden sus misiones si sigue barato." : "."}`}
          </span>
        </p>
      )}
      {!compact && ctx.tips.map((t) => <p key={t} className="text-xs text-muted">{t}</p>)}
    </section>
  );
}
