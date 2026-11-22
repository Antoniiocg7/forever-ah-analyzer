import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { GameContextBanner } from "@/components/GameContextBanner";
import { HouseTabs } from "@/components/HouseTabs";
import { ItemIcon } from "@/components/ItemIcon";
import { Loading, NoHousesNotice, SetupNotice } from "@/components/notices";
import { isConfigured } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { hoursSinceLastIngest, PRICE_SORTS, searchPrices, trackedHouses, type PriceSort } from "@/lib/queries";
import type { LatestPriceRow } from "@/lib/supabase";

/** Búsquedas rápidas para Minería, Herrería y First Aid. */
const QUICK = ["Ore", "Bar", "Stone", "Cloth", "Bandage"];

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<Loading />}>
      <Explorer searchParams={searchParams} />
    </Suspense>
  );
}

async function Explorer({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  await connection();
  if (!isConfigured()) return <SetupNotice />;

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const sort: PriceSort = typeof sp.sort === "string" && sp.sort in PRICE_SORTS ? (sp.sort as PriceSort) : "sold";
  const houses = await trackedHouses();
  if (houses.length === 0) return <NoHousesNotice />;
  const house = houses.find((h) => String(h.id) === sp.house) ?? houses[0];
  const [rows, staleHours] = await Promise.all([searchPrices(house.id, q, sort), hoursSinceLastIngest()]);
  const updated = rows[0]?.fetched_at;

  const href = (over: { house?: number; sort?: PriceSort; q?: string }) => {
    const p = new URLSearchParams();
    p.set("house", String(over.house ?? house.id));
    const query = over.q ?? q;
    if (query) p.set("q", query);
    const s = over.sort ?? sort;
    if (s !== "sold") p.set("sort", s);
    return `/?${p}`;
  };
  const chip = (active: boolean) => `min-h-9 shrink-0 rounded-full border px-3 py-1.5 ${active ? "border-gold text-gold" : "border-line text-muted"}`;

  return (
    <div className="space-y-4">
      <form action="/" className="flex gap-2" role="search">
        <input type="hidden" name="house" value={house.id} />
        {sort !== "sold" && <input type="hidden" name="sort" value={sort} />}
        <input className="input" type="search" name="q" defaultValue={q} placeholder="Busca un objeto o su ID" enterKeyHint="search" aria-label="Buscar objeto" />
        <button className="btn shrink-0">Buscar</button>
      </form>

      <Suspense>
        <GameContextBanner compact />
      </Suspense>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 text-sm">
        {QUICK.map((term) => (
          <Link key={term} href={href({ q: q === term ? "" : term })} className={chip(q === term)}>
            {term}
          </Link>
        ))}
      </div>

      {staleHours !== null && staleHours > 2.5 && (
        <p className="card text-sm text-bad">
          La última descarga de precios fue hace {Math.round(staleHours)} h: no están al día. Revisa el disparador horario (README, “Ingesta
          horaria”).
        </p>
      )}

      <HouseTabs houses={houses} current={house.id} hrefFor={(id) => href({ house: id })} />

      <div className="-mx-4 flex gap-2 overflow-x-auto border-b border-line px-4 pb-3 text-sm">
        {(Object.keys(PRICE_SORTS) as PriceSort[]).map((s) => (
          <Link key={s} href={href({ sort: s })} className={chip(s === sort)}>
            {PRICE_SORTS[s]}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="card text-sm text-muted">
          {q
            ? `Nada en venta que coincida con “${q}”.`
            : sort === "deals"
              ? "Ahora mismo nada está claramente por debajo de su precio habitual (al menos un 10% y con mercado de 1g o más)."
              : "Aún no hay datos de esta casa. Ejecuta pnpm ingest."}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted">
            {rows.length === 50 ? "Los 50 primeros" : `${rows.length} objetos`}
            {updated && ` · precios de ${new Date(updated).toLocaleString("es-ES", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" })}`}
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {rows.map((r) => (
              <li key={r.item_id}>
                <PriceRow row={r} houseId={house.id} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function PriceRow({ row: r, houseId }: { row: LatestPriceRow; houseId: number }) {
  // Variación del mínimo actual frente a la mediana de 7 días (solo si es apreciable).
  const pct = r.discount === null ? null : Math.round(-r.discount * 100);
  const showPct = pct !== null && Math.abs(pct) >= 5;

  return (
    <Link href={`/item/${r.item_id}?house=${houseId}`} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-surface-2">
      <div className="flex min-w-0 items-center gap-3">
        <ItemIcon src={r.icon_url} quality={r.quality} />
        <div className="min-w-0">
          <p className={`truncate font-medium q-${r.quality ?? "COMMON"}`}>{r.name_en ?? `Objeto #${r.item_id}`}</p>
          <p className="truncate text-xs text-muted">
            {r.qty.toLocaleString("es-ES")} en venta
            {r.sold_per_day !== null && ` · ≈${r.sold_per_day.toLocaleString("es-ES")} vendidos/día`}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right font-mono text-sm">
        <p className="text-gold">{formatMoney(r.min_buyout)}</p>
        <p className="text-xs text-muted">
          {showPct && <span className={pct! < 0 ? "text-good" : "text-bad"}>{pct! > 0 ? "+" : "−"}{Math.abs(pct!)}% </span>}
          {r.market_7d !== null ? `7 d ${formatMoney(r.market_7d)}` : `merc. ${formatMoney(r.p15_market)}`}
        </p>
      </div>
    </Link>
  );
}
