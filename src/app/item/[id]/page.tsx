import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HouseTabs } from "@/components/HouseTabs";
import { ItemIcon } from "@/components/ItemIcon";
import { Loading, NoHousesNotice, SetupNotice } from "@/components/notices";
import { PriceChart } from "@/components/PriceChart";
import { isConfigured } from "@/lib/env";
import { pick, wowheadItemUrl, type Lang } from "@/lib/lang";
import { nameLang } from "@/lib/lang-server";
import { formatMoney } from "@/lib/money";
import { recipesForItem, type RecipeLink } from "@/lib/professions/queries";
import { dailySeries, hourlySeries, itemById, itemClassNames, latestPrice, trackedHouses } from "@/lib/queries";

export default function Page(props: PageProps<"/item/[id]">) {
  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-muted">
        ← Precios
      </Link>
      <Suspense fallback={<Loading />}>
        <ItemView {...props} />
      </Suspense>
    </div>
  );
}

async function ItemView({ params, searchParams }: PageProps<"/item/[id]">) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) notFound();
  if (!isConfigured()) return <SetupNotice />;

  const houses = await trackedHouses();
  if (houses.length === 0) return <NoHousesNotice />;
  const house = houses.find((h) => String(h.id) === sp.house) ?? houses[0];

  const [item, latest, hourly, daily, recipes, lang, classNames] = await Promise.all([
    itemById(itemId),
    latestPrice(house.id, itemId),
    hourlySeries(house.id, itemId),
    dailySeries(house.id, itemId),
    recipesForItem(itemId),
    nameLang(),
    itemClassNames(),
  ]);
  const typeName = (en: string | null | undefined) => (en ? (lang === "es" ? (classNames.get(en) ?? en) : en) : null);

  // Ventas por día: media de 7 días ya calculada; si no hay, la de los días disponibles.
  const soldDays = daily.filter((d) => d.sold !== null);
  const soldPerDay =
    latest?.sold_per_day ?? (soldDays.length ? Math.round(soldDays.reduce((s, d) => s + (d.sold ?? 0), 0) / soldDays.length) : null);

  const stats: { label: string; value: string }[] = [
    { label: "Mínimo ahora", value: formatMoney(latest?.min_buyout) },
    { label: "Mercado ahora", value: formatMoney(latest?.p15_market) },
    { label: "Mediana 7 días", value: formatMoney(latest?.market_7d) },
    { label: "En venta", value: latest ? `${latest.qty.toLocaleString("es-ES")} uds · ${latest.num_auctions} subastas` : "—" },
    { label: "Ventas/día (est.)", value: soldPerDay === null ? "sin datos aún" : `≈ ${soldPerDay.toLocaleString("es-ES")}` },
    {
      label: "Vendedor",
      value: [item?.vendor_sold && item.vendor_buy ? `vende a ${formatMoney(item.vendor_buy)}` : null, item?.vendor_sell ? `paga ${formatMoney(item.vendor_sell)}` : null]
        .filter(Boolean)
        .join(" · ") || "—",
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className={`flex items-center gap-3 text-xl font-semibold q-${item?.quality ?? "COMMON"}`}>
          <ItemIcon src={item?.icon_url || null} quality={item?.quality} size={36} />
          {pick(item?.name_en, item?.name_es, lang) ?? `Objeto #${itemId}`}
        </h1>
        <p className="text-xs text-muted">
          ID {itemId}
          {item?.class && ` · ${typeName(item.class)}${item.subclass ? ` / ${typeName(item.subclass)}` : ""}`}
          {lang === "es" && item?.name_es && item.name_en && ` · ${item.name_en}`}
        </p>
        <a
          href={wowheadItemUrl(itemId, lang)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm text-muted hover:text-fg"
        >
          Ver en Wowhead ↗
        </a>
      </div>

      <HouseTabs houses={houses} current={house.id} hrefFor={(h) => `/item/${itemId}?house=${h}`} />

      <dl className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <dt className="text-xs text-muted">{s.label}</dt>
            <dd className="mt-1 font-mono text-base">{s.value}</dd>
          </div>
        ))}
      </dl>

      {!latest && <p className="card text-sm text-muted">Ahora mismo no hay ninguna unidad en venta en esta casa.</p>}

      <PriceChart hourly={hourly} daily={daily} />

      <RecipeList title="Se fabrica con" recipes={recipes.makes} houseId={house.id} lang={lang} />
      <RecipeList title="Se usa en" recipes={recipes.uses} houseId={house.id} lang={lang} showQty />

      <p className="text-xs text-muted">
        “Mercado” es la media del 15% de unidades más baratas. Las ventas son una estimación por diferencia entre snapshots: la
        API no publica ventas reales.
      </p>
    </div>
  );
}

function RecipeList({ title, recipes, houseId, lang, showQty }: { title: string; recipes: RecipeLink[]; houseId: number; lang: Lang; showQty?: boolean }) {
  if (recipes.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted">
        {title} <span className="font-normal">({recipes.length})</span>
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm">
        {recipes.map((r) => (
          <li key={r.id}>
            <Link
              href={`/professions/${r.slug}?house=${houseId}&q=${encodeURIComponent(r.name)}`}
              className="flex items-center justify-between gap-3 px-4 py-2.5 active:bg-surface-2"
            >
              <span className="min-w-0 truncate">
                {showQty && r.qty ? <span className="text-muted">{r.qty} × en </span> : null}
                {pick(r.name, r.nameEs, lang)}
              </span>
              <span className="shrink-0 text-xs text-muted">{pick(r.profession, r.professionEs, lang)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
