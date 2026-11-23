import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Loading, SetupNotice } from "@/components/notices";
import { PageIntro } from "@/components/PageIntro";
import { adminTokenRequired } from "@/lib/admin";
import { isConfigured } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { allHouses, houseProbes } from "@/lib/queries";
import { REFERENCE_ITEMS } from "@/lib/reference-items";
import type { HouseRow } from "@/lib/supabase";
import { saveHouseLabel } from "./actions";

const MESSAGES: Record<string, { text: string; ok: boolean }> = {
  ok: { text: "Guardado. La próxima descarga horaria ya incluye esa casa.", ok: true },
  token: { text: "La contraseña de administración no es correcta.", ok: false },
  invalid: { text: "Datos no válidos.", ok: false },
};

const COLUMNS = [
  { faction: "alliance", title: "Alianza", label: "Alliance · PvP", color: "text-[#5b9cf0]" },
  { faction: "horde", title: "Horda", label: "Horde · PvP", color: "text-bad" },
  { faction: "neutral", title: "Blackwater", label: "Blackwater · PvP", color: "text-gold" },
] as const;

export default function Page({ searchParams }: PageProps<"/admin/houses">) {
  return (
    <div className="space-y-4">
      <PageIntro
        title="Ajustes"
        summary="Qué casas de subastas se siguen y los avisos al móvil. Normalmente solo se toca una vez."
      />
      <Link href="/alerts" className="card flex items-center justify-between gap-3 active:bg-surface-2">
        <span>
          <span className="block font-medium">Alertas de Telegram</span>
          <span className="block text-sm text-muted">Avisos al móvil de chollos, precios que vigilas y buenos momentos para subir profesiones.</span>
        </span>
        <span className="shrink-0 text-gold" aria-hidden>
          →
        </span>
      </Link>
      <Link href="/ayuda" className="card flex items-center justify-between gap-3 active:bg-surface-2">
        <span>
          <span className="block font-medium">Ayuda y glosario</span>
          <span className="block text-sm text-muted">Para qué sirve cada apartado y qué significa cada número.</span>
        </span>
        <span className="shrink-0 text-gold" aria-hidden>
          →
        </span>
      </Link>
      <h2 className="pt-2 font-medium">Casas de subastas</h2>
      <p className="-mt-2 text-sm text-muted">
        Para cada grupo verás el precio de unos materiales comunes en cada casa. Compáralos con lo que ves en tu subasta del juego y pulsa
        “Esta es mi…” en la que coincida. Las marcadas se descargan cada hora.
      </p>
      <Suspense fallback={<Loading />}>
        <Houses searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

type Group = { index: number; houses: (HouseRow | undefined)[] };

/**
 * La API da 15 casas: 5 de Alianza, 5 de Horda y 5 de Blackwater, una de cada por tipo de reino.
 * Se agrupan por posición en cada facción (1.ª de Alianza con 1.ª de Horda y 1.ª de Blackwater…).
 * Es una deducción por el orden de los IDs: la API no dice qué casa va con cuál.
 */
function groupHouses(houses: HouseRow[]): Group[] {
  const byFaction = COLUMNS.map((c) => houses.filter((h) => h.faction === c.faction).sort((a, b) => a.id - b.id));
  const n = Math.max(...byFaction.map((f) => f.length), 0);
  return Array.from({ length: n }, (_, i) => ({ index: i + 1, houses: byFaction.map((f) => f[i]) }));
}

async function Houses({ searchParams }: Pick<PageProps<"/admin/houses">, "searchParams">) {
  await connection();
  if (!isConfigured()) return <SetupNotice />;

  const [sp, houses, probes] = await Promise.all([searchParams, allHouses(), houseProbes()]);
  const msg = typeof sp.msg === "string" ? MESSAGES[sp.msg] : undefined;
  const price = new Map(probes.map((p) => [`${p.house_id}:${p.item_id}`, p.min_buyout]));
  const needToken = adminTokenRequired();

  if (houses.length === 0) {
    return (
      <p className="card text-sm text-muted">
        Aún no hay casas. Ejecuta <code>pnpm discover</code> en el Mac para descargarlas.
      </p>
    );
  }

  const tracked = houses.filter((h) => h.tracked);
  const groups = groupHouses(houses);
  const active = groups.filter((g) => g.houses.some((h) => (h?.auction_count ?? 0) > 0));
  const empty = groups.filter((g) => !active.includes(g));
  const missingNeutral = !tracked.some((h) => h.faction === "neutral");

  return (
    <div className="space-y-5">
      {msg && <p className={`card text-sm ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}

      <section className="card space-y-2">
        <h2 className="text-sm font-medium">Tus casas</h2>
        {tracked.length === 0 ? (
          <p className="text-sm text-muted">Ninguna todavía. Marca abajo tu casa de Alianza.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {tracked.map((h) => (
              <li key={h.id} className="flex justify-between gap-3">
                <span>{h.label}</span>
                <span className="font-mono text-muted">
                  #{h.id} · {h.auction_count?.toLocaleString("es-ES") ?? "?"} subastas
                </span>
              </li>
            ))}
          </ul>
        )}
        {missingNeutral && tracked.length > 0 && (
          <p className="text-xs text-gold">
            Te falta la de Blackwater (la neutral), necesaria para comparar precios entre facciones. Suele ser la del mismo grupo que tu
            casa de Alianza.
          </p>
        )}
      </section>

      <details className="text-sm text-muted">
        <summary className="cursor-pointer py-1">¿Por qué hay tantas casas?</summary>
        <p className="mt-2">
          Blizzard publica 15 casas para Forever: una de Alianza, una de Horda y una de Blackwater por cada tipo de reino. La API no dice
          cuál es PvP; por eso aquí ves el precio mínimo de unos materiales comunes en cada una, para que lo compares con lo que ves en
          tu subasta. Los grupos se deducen del orden de los números de casa.
        </p>
      </details>

      {active.map((g) => (
        <GroupCard key={g.index} group={g} price={price} needToken={needToken} />
      ))}

      {empty.length > 0 && (
        <p className="text-xs text-muted">
          {empty.length === 1 ? "Un grupo vacío" : `${empty.length} grupos vacíos`} (sin subastas):{" "}
          {empty.flatMap((g) => g.houses.filter(Boolean).map((h) => `#${h!.id}`)).join(", ")}.
        </p>
      )}
    </div>
  );
}

function GroupCard({ group, price, needToken }: { group: Group; price: Map<string, number | null>; needToken: boolean }) {
  const mine = group.houses.some((h) => h?.tracked);
  return (
    <section className={`card space-y-3 ${mine ? "border-gold" : ""}`}>
      <h2 className="flex items-center justify-between text-sm font-medium">
        Grupo {group.index}
        {mine && <span className="rounded-full border border-gold px-2 py-0.5 text-xs text-gold">el tuyo</span>}
      </h2>

      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[320px] text-sm">
          <thead>
            <tr className="text-left">
              <th className="pb-2 font-normal text-muted"></th>
              {COLUMNS.map((c, i) => {
                const h = group.houses[i];
                return (
                  <th key={c.faction} className="pb-2 pl-3 text-right font-normal">
                    <span className={c.color}>{c.title}</span>
                    <span className="block font-mono text-[11px] text-muted">
                      {h ? `#${h.id}` : "—"}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="font-mono">
            {REFERENCE_ITEMS.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="py-1 pr-2 font-sans text-muted">{item.name}</td>
                {group.houses.map((h, i) => (
                  <td key={i} className="py-1 pl-3 text-right">
                    {h ? formatMoney(price.get(`${h.id}:${item.id}`)) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {COLUMNS.map((c, i) => {
          const h = group.houses[i];
          if (!h || !h.auction_count) return null;
          const isMarked = h.label === c.label;
          return (
            <form key={c.faction} action={saveHouseLabel} className="flex gap-2">
              <input type="hidden" name="houseId" value={h.id} />
              <input type="hidden" name="label" value={isMarked ? "" : c.label} />
              {needToken && (
                <input name="token" type="password" required placeholder="Contraseña" className="input min-w-0" autoComplete="current-password" aria-label="Contraseña de administración" />
              )}
              <button
                title={isMarked ? "Dejar de descargar esta casa" : `Marcar esta casa como tu ${c.title} y descargar sus precios cada hora`}
                className={`min-h-11 w-full rounded-lg border px-3 text-sm ${isMarked ? "border-gold text-gold" : "border-line text-fg active:bg-surface-2"}`}
              >
                {isMarked ? `✓ Sigues esta (${c.title}) · dejar de seguir` : `Esta es mi ${c.title}`}
              </button>
            </form>
          );
        })}
      </div>
    </section>
  );
}
