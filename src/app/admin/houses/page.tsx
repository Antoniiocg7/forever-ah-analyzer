import { connection } from "next/server";
import { Suspense } from "react";
import { Loading, SetupNotice } from "@/components/notices";
import { isConfigured } from "@/lib/env";
import { HOUSE_LABELS } from "@/lib/house-labels";
import { formatMoney } from "@/lib/money";
import { allHouses, houseProbes } from "@/lib/queries";
import { REFERENCE_ITEMS } from "@/lib/reference-items";
import { saveHouseLabel } from "./actions";

const MESSAGES: Record<string, { text: string; ok: boolean }> = {
  ok: { text: "Guardado.", ok: true },
  token: { text: "La contraseña de administración no es correcta.", ok: false },
  invalid: { text: "Datos no válidos.", ok: false },
};

const FACTION: Record<string, string> = { alliance: "Alianza", horde: "Horda", neutral: "Neutral (Blackwater)", unknown: "Desconocida" };

export default function Page({ searchParams }: PageProps<"/admin/houses">) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Casas de subastas</h1>
        <p className="mt-1 text-sm text-muted">
          La API devuelve las mismas 15 casas para todos los rulesets. Compara estos precios mínimos con los que ves en el juego
          y marca cuál es tu casa de Alianza PvP y cuál la de Blackwater PvP.
        </p>
      </div>
      <Suspense fallback={<Loading />}>
        <Houses searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Houses({ searchParams }: Pick<PageProps<"/admin/houses">, "searchParams">) {
  await connection();
  if (!isConfigured()) return <SetupNotice />;

  const [sp, houses, probes] = await Promise.all([searchParams, allHouses(), houseProbes()]);
  const msg = typeof sp.msg === "string" ? MESSAGES[sp.msg] : undefined;
  const probeMap = new Map(probes.map((p) => [`${p.house_id}:${p.item_id}`, p]));

  if (houses.length === 0) {
    return (
      <p className="card text-sm text-muted">
        Aún no hay casas. Ejecuta <code>pnpm discover</code> en el Mac para descargarlas.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {msg && <p className={`card text-sm ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}

      {houses.map((h) => (
        <section key={h.id} className={`card space-y-3 ${h.tracked ? "border-gold" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">
                {h.name} <span className="font-mono text-sm text-muted">#{h.id}</span>
              </h2>
              <p className="text-xs text-muted">
                {FACTION[h.faction]} · {h.auction_count?.toLocaleString("es-ES") ?? "?"} subastas
                {h.probed_at && ` · ${new Date(h.probed_at).toLocaleString("es-ES", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" })}`}
              </p>
            </div>
            {h.label && <span className="shrink-0 rounded-full border border-gold px-2 py-0.5 text-xs text-gold">{h.label}</span>}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {REFERENCE_ITEMS.map((item) => {
              const p = probeMap.get(`${h.id}:${item.id}`);
              return (
                <div key={item.id} className="flex justify-between gap-2">
                  <dt className="truncate text-muted">{item.name}</dt>
                  <dd className="shrink-0 font-mono">{formatMoney(p?.min_buyout)}</dd>
                </div>
              );
            })}
          </dl>

          <form action={saveHouseLabel} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input type="hidden" name="houseId" value={h.id} />
            <select name="label" defaultValue={h.label ?? ""} className="input" aria-label="Etiqueta">
              <option value="">Sin marcar</option>
              {HOUSE_LABELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <input name="token" type="password" required placeholder="Contraseña" className="input" autoComplete="current-password" aria-label="Contraseña de administración" />
            <button className="btn">Guardar</button>
          </form>
        </section>
      ))}
    </div>
  );
}
