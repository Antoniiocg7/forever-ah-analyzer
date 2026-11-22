import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AutoSubmitForm } from "@/components/AutoSubmitForm";
import { GameContextBanner } from "@/components/GameContextBanner";
import { HouseTabs } from "@/components/HouseTabs";
import { ItemIcon } from "@/components/ItemIcon";
import { Loading, NoHousesNotice, SetupNotice } from "@/components/notices";
import { isConfigured } from "@/lib/env";
import { pick, type Lang } from "@/lib/lang";
import { nameLang } from "@/lib/lang-server";
import { formatMoney, parseMoney } from "@/lib/money";
import { ACTIVITY_CLASS, ACTIVITY_LABEL, type Activity } from "@/lib/pricing/activity";
import {
  hoursSinceLastIngest,
  ITEM_CLASSES,
  itemClassNames,
  PAGE_SIZE,
  PRICE_SORTS,
  searchPrices,
  trackedHouses,
  type PriceSort,
} from "@/lib/queries";
import type { LatestPriceRow } from "@/lib/supabase";

/** Búsquedas rápidas para Minería, Herrería y First Aid. */
const QUICK = ["Ore", "Bar", "Stone", "Cloth", "Bandage"];
const ACTIVITIES: Activity[] = ["high", "normal", "low"];

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<Loading />}>
      <Explorer searchParams={searchParams} />
    </Suspense>
  );
}

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

async function Explorer({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  await connection();
  if (!isConfigured()) return <SetupNotice />;

  const sp = await searchParams;
  const q = str(sp.q);
  const sort: PriceSort = str(sp.sort) in PRICE_SORTS ? (str(sp.sort) as PriceSort) : "sold";
  const cls = (ITEM_CLASSES as readonly string[]).includes(str(sp.tipo)) ? str(sp.tipo) : "";
  const activity = (ACTIVITIES as string[]).includes(str(sp.mercado)) ? (str(sp.mercado) as Activity) : undefined;
  const minPrice = parseMoney(str(sp.desde));
  const maxPrice = parseMoney(str(sp.hasta));
  const page = Math.max(0, Math.floor(Number(str(sp.pagina)) || 0));

  const houses = await trackedHouses();
  if (houses.length === 0) return <NoHousesNotice />;
  const house = houses.find((h) => String(h.id) === sp.house) ?? houses[0];
  const lang = await nameLang();
  const [result, staleHours, classNames] = await Promise.all([
    searchPrices(house.id, { q, sort, cls, activity, minPrice, maxPrice, page, lang }),
    hoursSinceLastIngest(),
    itemClassNames(),
  ]);
  const hasMore = result.length > PAGE_SIZE;
  const rows = result.slice(0, PAGE_SIZE);
  const updated = rows[0]?.fetched_at;
  const filtersOn = Boolean(cls || activity || minPrice || maxPrice);

  const params = (over: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | number | null> = {
      house: house.id,
      q,
      sort: sort === "sold" ? null : sort,
      tipo: cls || null,
      mercado: activity ?? null,
      desde: str(sp.desde) || null,
      hasta: str(sp.hasta) || null,
      pagina: null,
      ...over,
    };
    for (const [k, v] of Object.entries(base)) if (v !== null && v !== "") p.set(k, String(v));
    return `/?${p}`;
  };
  const chip = (active: boolean) => `min-h-9 shrink-0 rounded-full border px-3 py-1.5 ${active ? "border-gold text-gold" : "border-line text-muted hover:text-fg"}`;

  return (
    <div className="space-y-4">
      <Suspense>
        <GameContextBanner compact />
      </Suspense>

      <AutoSubmitForm action="/" className="space-y-3" role="search">
        <input type="hidden" name="house" value={house.id} />
        <div className="flex gap-2">
          <input className="input" type="search" name="q" defaultValue={q} placeholder="Busca un objeto o su ID (en inglés o español)" enterKeyHint="search" aria-label="Buscar objeto" />
          <button className="btn shrink-0">Buscar</button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="text-xs text-muted">
            Ordenar
            <select name="sort" defaultValue={sort} className="input mt-1 text-sm">
              {(Object.keys(PRICE_SORTS) as PriceSort[]).map((s) => (
                <option key={s} value={s}>
                  {PRICE_SORTS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Tipo
            <select name="tipo" defaultValue={cls} className="input mt-1 text-sm">
              <option value="">Todos</option>
              {ITEM_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {classNames.get(c) ?? c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Mercado
            <select name="mercado" defaultValue={activity ?? ""} className="input mt-1 text-sm">
              <option value="">Todos</option>
              {ACTIVITIES.map((a) => (
                <option key={a} value={a}>
                  {ACTIVITY_LABEL[a][0].toUpperCase() + ACTIVITY_LABEL[a].slice(1)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted">
            <label>
              Desde
              <input name="desde" defaultValue={str(sp.desde)} placeholder="1g" className="input mt-1 px-2 text-sm" aria-label="Precio mínimo" />
            </label>
            <label>
              Hasta
              <input name="hasta" defaultValue={str(sp.hasta)} placeholder="50g" className="input mt-1 px-2 text-sm" aria-label="Precio máximo" />
            </label>
          </div>
        </div>
      </AutoSubmitForm>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 text-sm">
        {QUICK.map((term) => (
          <Link key={term} href={params({ q: q === term ? "" : term })} className={chip(q === term)}>
            {term}
          </Link>
        ))}
        {filtersOn && (
          <Link href={params({ tipo: null, mercado: null, desde: null, hasta: null })} className="min-h-9 shrink-0 rounded-full border border-bad/60 px-3 py-1.5 text-bad">
            Quitar filtros ✕
          </Link>
        )}
      </div>

      {staleHours !== null && staleHours > 2.5 && (
        <p className="card text-sm text-bad">
          La última descarga de precios fue hace {Math.round(staleHours)} h: no están al día. Revisa el disparador horario (README, “Ingesta
          horaria”).
        </p>
      )}

      <HouseTabs houses={houses} current={house.id} hrefFor={(id) => params({ house: id })} />

      {rows.length === 0 ? (
        <p className="card text-sm text-muted">
          {q || filtersOn
            ? "Nada en venta con esa búsqueda y esos filtros."
            : sort === "deals"
              ? "Ahora mismo nada está claramente por debajo de su precio habitual (al menos un 10% y con mercado de 1g o más)."
              : sort === "rising" || sort === "falling"
                ? "La tendencia semanal necesita al menos 3 días de datos."
                : "Aún no hay datos de esta casa."}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted">
            {page > 0 ? `Del ${page * PAGE_SIZE + 1} al ${page * PAGE_SIZE + rows.length}` : hasMore ? `Los ${PAGE_SIZE} primeros` : `${rows.length} objetos`} · {PRICE_SORTS[sort].toLowerCase()}
            {updated && ` · precios de ${new Date(updated).toLocaleString("es-ES", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" })}`}
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {rows.map((r) => (
              <li key={r.item_id}>
                <PriceRow row={r} houseId={house.id} lang={lang} showTrend={sort === "rising" || sort === "falling"} />
              </li>
            ))}
          </ul>
          <div className="flex justify-between gap-2 text-sm">
            {page > 0 ? (
              <Link href={params({ pagina: page - 1 || null })} className={chip(false)}>
                ← Anteriores
              </Link>
            ) : (
              <span />
            )}
            {hasMore && (
              <Link href={params({ pagina: page + 1 })} className={chip(false)}>
                Siguientes {PAGE_SIZE} →
              </Link>
            )}
          </div>
          <p className="text-xs text-muted">
            Vendidos/día: ESTIMACIÓN a partir de las subastas que desaparecen sin caducar (sin contar las que se cancelan para rebajarlas).
            Mientras no hay una semana de datos se usan las últimas 24 h.
          </p>
        </>
      )}
    </div>
  );
}

function PriceRow({ row: r, houseId, lang, showTrend }: { row: LatestPriceRow; houseId: number; lang: Lang; showTrend: boolean }) {
  // Variación del mínimo actual frente a la mediana de 7 días (solo si es apreciable).
  const pct = r.discount === null ? null : Math.round(-r.discount * 100);
  const showPct = pct !== null && Math.abs(pct) >= 5;

  return (
    <Link href={`/item/${r.item_id}?house=${houseId}`} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-surface-2">
      <div className="flex min-w-0 items-center gap-3">
        <ItemIcon src={r.icon_url} quality={r.quality} />
        <div className="min-w-0">
          <p className={`truncate font-medium q-${r.quality ?? "COMMON"}`}>{pick(r.name_en, r.name_es, lang) ?? `Objeto #${r.item_id}`}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {r.activity && <span className={`rounded border px-1.5 py-px ${ACTIVITY_CLASS[r.activity]}`}>{ACTIVITY_LABEL[r.activity]}</span>}
            {r.sold_per_day !== null ? (
              <span className="font-mono text-fg">
                ≈{r.sold_per_day.toLocaleString("es-ES")}
                <span className="font-sans text-muted"> vendidos/día</span>
              </span>
            ) : (
              <span>ventas: sin datos</span>
            )}
            <span>· {r.qty.toLocaleString("es-ES")} en venta</span>
            {showTrend && r.trend !== null && (
              <span className={r.trend >= 0 ? "text-bad" : "text-good"}>
                · semana {r.trend >= 0 ? "+" : "−"}
                {Math.abs(Math.round(r.trend * 100))}%
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right font-mono text-sm">
        <p className="text-gold">{formatMoney(r.min_buyout)}</p>
        <p className="text-xs text-muted">
          {showPct && (
            <span className={pct! < 0 ? "text-good" : "text-bad"}>
              {pct! > 0 ? "+" : "−"}
              {Math.abs(pct!)}%{" "}
            </span>
          )}
          {r.market_7d !== null ? `7 d ${formatMoney(r.market_7d)}` : `merc. ${formatMoney(r.p15_market)}`}
        </p>
      </div>
    </Link>
  );
}
