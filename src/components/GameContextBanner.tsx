import { connection } from "next/server";
import { gameContext } from "@/lib/calendar";
import { calendarEvents } from "@/lib/deals-queries";
import { isConfigured } from "@/lib/env";

/** Franja con el día de juego, el próximo evento y qué suele pasar con los precios en esta etapa. */
export async function GameContextBanner({ compact = false }: { compact?: boolean }) {
  await connection();
  if (!isConfigured()) return null;
  const ctx = gameContext(await calendarEvents().catch(() => []));
  if (ctx.day === null && !ctx.next) return null;

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
      {!compact && ctx.tips.map((t) => <p key={t} className="text-xs text-muted">{t}</p>)}
    </section>
  );
}
