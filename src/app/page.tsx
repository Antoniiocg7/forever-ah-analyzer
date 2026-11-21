import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { HouseTabs } from "@/components/HouseTabs";
import { ItemIcon } from "@/components/ItemIcon";
import { Loading, NoHousesNotice, SetupNotice } from "@/components/notices";
import { isConfigured } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { hoursSinceLastIngest, searchPrices, trackedHouses } from "@/lib/queries";

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Precios</h1>
      <Suspense fallback={<Loading />}>
        <Explorer searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Explorer({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  await connection();
  if (!isConfigured()) return <SetupNotice />;

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const houses = await trackedHouses();
  if (houses.length === 0) return <NoHousesNotice />;
  const house = houses.find((h) => String(h.id) === sp.house) ?? houses[0];
  const [rows, staleHours] = await Promise.all([searchPrices(house.id, q), hoursSinceLastIngest()]);
  const updated = rows[0]?.fetched_at;

  return (
    <div className="space-y-4">
      <form action="/" className="flex gap-2">
        <input type="hidden" name="house" value={house.id} />
        <input className="input" type="search" name="q" defaultValue={q} placeholder="Copper Ore, o un ID de objeto" enterKeyHint="search" />
        <button className="btn shrink-0">Buscar</button>
      </form>

      {staleHours !== null && staleHours > 2.5 && (
        <p className="card text-sm text-bad">
          La última ingesta fue hace {Math.round(staleHours)} h: los precios no están al día. Revisa el disparador horario (README, “Ingesta
          horaria”).
        </p>
      )}

      <HouseTabs houses={houses} current={house.id} hrefFor={(id) => `/?house=${id}${q ? `&q=${encodeURIComponent(q)}` : ""}`} />

      {rows.length === 0 ? (
        <p className="card text-sm text-muted">
          {q ? `Nada en venta que coincida con “${q}”.` : "Aún no hay datos de esta casa. Ejecuta pnpm ingest."}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted">
            {q ? `${rows.length} resultados` : "Los 50 objetos con más unidades en venta"}
            {updated && ` · actualizado ${new Date(updated).toLocaleString("es-ES", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" })}`}
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {rows.map((r) => (
              <li key={r.item_id}>
                <Link href={`/item/${r.item_id}?house=${house.id}`} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-surface-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <ItemIcon src={r.icon_url} quality={r.quality} />
                    <div className="min-w-0">
                      <p className={`truncate font-medium q-${r.quality ?? "COMMON"}`}>{r.name_en ?? `Objeto #${r.item_id}`}</p>
                      <p className="text-xs text-muted">
                        {r.qty.toLocaleString("es-ES")} uds · {r.num_auctions} subastas
                        {r.sold_per_day !== null && ` · ≈${r.sold_per_day.toLocaleString("es-ES")}/día`}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right font-mono text-sm">
                    <p className="text-gold">{formatMoney(r.min_buyout)}</p>
                    <p className="text-xs text-muted">7 d {formatMoney(r.market_7d ?? r.p15_market)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
