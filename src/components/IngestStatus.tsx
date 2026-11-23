import { connection } from "next/server";
import { isConfigured } from "@/lib/env";
import { hoursSinceLastIngest } from "@/lib/queries";

/** Píldora con la antigüedad de los datos: verde al día, ámbar con algún retraso, roja si la ingesta se ha parado. */
export async function IngestStatus() {
  await connection();
  if (!isConfigured()) return null;
  const hours = await hoursSinceLastIngest().catch(() => null);
  if (hours === null) return null;

  const label = hours < 1 ? `hace ${Math.max(1, Math.round(hours * 60))} min` : `hace ${Math.round(hours)} h`;
  const tone = hours <= 1.5 ? "bg-good" : hours <= 3 ? "bg-gold" : "bg-bad";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted" title="Los precios se descargan de Blizzard cada hora. Verde: al día · ámbar: con retraso · rojo: la descarga se ha parado">
      <span className={`h-1.5 w-1.5 rounded-full ${tone}`} aria-hidden />
      <span className="hidden sm:inline">precios de</span>
      {label}
    </span>
  );
}
