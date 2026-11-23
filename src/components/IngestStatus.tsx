import { connection } from "next/server";
import { isConfigured } from "@/lib/env";
import { hoursSinceLastIngest } from "@/lib/queries";

/** Antigüedad de los datos: punto verde al día, ámbar con algún retraso, rojo si la descarga se ha parado. */
export async function IngestStatus() {
  await connection();
  if (!isConfigured()) return null;
  const hours = await hoursSinceLastIngest().catch(() => null);
  if (hours === null) return null;

  const label = hours < 1 ? `${Math.max(1, Math.round(hours * 60))} min` : `${Math.round(hours)} h`;
  const tone = hours <= 1.5 ? "bg-good" : hours <= 3 ? "bg-gold" : "bg-bad";
  return (
    <span className="inline-flex items-center gap-1.5" title="Los precios se descargan de Blizzard cada hora. Verde: al día · ámbar: con retraso · rojo: la descarga se ha parado">
      <span className="relative flex h-1.5 w-1.5" aria-hidden>
        {hours <= 1.5 && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${tone}`} />}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${tone}`} />
      </span>
      <span className="hidden sm:inline">precios de</span> hace {label}
    </span>
  );
}
