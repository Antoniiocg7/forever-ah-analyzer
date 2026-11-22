import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { GameContextBanner } from "@/components/GameContextBanner";
import { HouseTabs } from "@/components/HouseTabs";
import { ItemIcon } from "@/components/ItemIcon";
import { Loading, NoHousesNotice, SetupNotice } from "@/components/notices";
import { CATEGORY_LABEL, categorize, gameContext, type Category } from "@/lib/calendar";
import { calendarEvents, dealSettings, flipCandidates, marketableItems, vendorFlips } from "@/lib/deals-queries";
import { isConfigured } from "@/lib/env";
import { pick, type Lang } from "@/lib/lang";
import { nameLang } from "@/lib/lang-server";
import { formatMoney } from "@/lib/money";
import { scoreDeal } from "@/lib/pricing/deals";
import { trackedHouses } from "@/lib/queries";
import type { LatestPriceRow } from "@/lib/supabase";

const TABS = { flip: "Revender", vendor: "Vender al vendedor", invest: "Invertir" } as const;
type Tab = keyof typeof TABS;

export default function Page({ searchParams }: PageProps<"/deals">) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Chollos</h1>
        <p className="mt-1 text-sm text-muted">Qué comprar ahora para ganar oro. Las compras se hacen a mano en el juego.</p>
      </div>
      <Suspense>
        <GameContextBanner />
      </Suspense>
      <Suspense fallback={<Loading />}>
        <Deals searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Deals({ searchParams }: Pick<PageProps<"/deals">, "searchParams">) {
  await connection();
  if (!isConfigured()) return <SetupNotice />;
  const sp = await searchParams;
  const tab: Tab = typeof sp.tab === "string" && sp.tab in TABS ? (sp.tab as Tab) : "flip";
  const houses = await trackedHouses();
  if (houses.length === 0) return <NoHousesNotice />;
  const house = houses.find((h) => String(h.id) === sp.house) ?? houses[0];
  const href = (over: { tab?: Tab; house?: number }) => `/deals?house=${over.house ?? house.id}&tab=${over.tab ?? tab}`;
  const chip = (active: boolean) => `min-h-9 shrink-0 rounded-full border px-3 py-1.5 ${active ? "border-gold text-gold" : "border-line text-muted"}`;

  return (
    <div className="space-y-4">
      <HouseTabs houses={houses} current={house.id} hrefFor={(id) => href({ house: id })} />
      <div className="-mx-4 flex gap-2 overflow-x-auto border-b border-line px-4 pb-3 text-sm">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link key={t} href={href({ tab: t })} className={chip(t === tab)}>
            {TABS[t]}
          </Link>
        ))}
      </div>
      {tab === "flip" && <FlipList houseId={house.id} faction={house.faction} />}
      {tab === "vendor" && <VendorList houseId={house.id} />}
      {tab === "invest" && <InvestList houseId={house.id} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

async function FlipList({ houseId, faction }: { houseId: number; faction: string }) {
  const lang = await nameLang();
  const s = await dealSettings(faction);
  const rows = (await flipCandidates(houseId, s))
    .map((r) => ({
      r,
      deal: scoreDeal(
        { min: r.min_buyout, market7d: r.market_7d, soldPerDay: r.sold_per_day, qty: r.qty, vendorSell: r.vendor_sell, dealUnits: r.deal_units, dealCost: r.deal_cost },
        s,
      ),
    }))
    .filter((x): x is { r: LatestPriceRow; deal: NonNullable<typeof x.deal> } => x.deal !== null)
    .sort((a, b) => b.deal.depthProfit - a.deal.depthProfit)
    .slice(0, 40);

  return (
    <>
      {!s.cutConfirmed && <p className="card text-sm text-bad">La comisión de esta casa está sin confirmar: se usa un 5% provisional.</p>}
      {rows.length === 0 ? (
        <p className="card text-sm text-muted">
          Ahora mismo nada cumple las condiciones: al menos {formatMoney(s.minMarket)} de mercado, {s.minSoldPerDay} ventas al día
          estimadas y beneficio tras la comisión y el depósito. Las ventas por día necesitan unas 6 horas seguidas de datos; si acabas de
          activar la descarga horaria, vuelve más tarde.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map(({ r, deal }) => (
            <li key={r.item_id}>
              <Link href={`/item/${r.item_id}?house=${houseId}`} className="block space-y-1 px-4 py-3 active:bg-surface-2">
                <div className="flex items-center justify-between gap-3">
                  <ItemTitle row={r} lang={lang} />
                  <div className="shrink-0 text-right font-mono text-sm">
                    <p className="text-good">+{formatMoney(deal.depthProfit)}</p>
                    <p className="text-xs text-muted">−{Math.round(deal.discount * 100)}%</p>
                  </div>
                </div>
                <p className="text-xs text-muted">
                  Compra {r.deal_units > 0 ? `${r.deal_units} uds por ${formatMoney(r.deal_cost)}` : `1 ud a ${formatMoney(r.min_buyout)}`} · revende a{" "}
                  {formatMoney(r.market_7d)} · +{formatMoney(deal.profitPerUnit)}/ud · ≈{r.sold_per_day} vendidos/día
                  {deal.daysToSell !== null && deal.daysToSell > 1 && ` · ${Math.ceil(deal.daysToSell)} días en venderlo todo`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        Beneficio = revender a la mediana de 7 días menos la comisión del {Math.round(s.cut * 100)}%, menos el depósito de 24 h por la
        probabilidad de no venderse. “Compra X uds” son las que están a ≤85% de la mediana. Las ventas son estimadas.
      </p>
    </>
  );
}

async function VendorList({ houseId }: { houseId: number }) {
  const lang = await nameLang();
  const rows = await vendorFlips(houseId);
  return (
    <>
      {rows.length === 0 ? (
        <p className="card text-sm text-muted">Ahora mismo no hay nada en la subasta por debajo de lo que paga el vendedor.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map((r) => (
            <li key={r.item_id}>
              <Link href={`/item/${r.item_id}?house=${houseId}`} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-surface-2">
                <div className="min-w-0">
                  <ItemTitle row={r} lang={lang} />
                  <p className="mt-1 text-xs text-muted">
                    {r.vendor_units} uds desde {formatMoney(r.min_buyout)} · el vendedor paga {formatMoney(r.vendor_sell)}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-sm text-good">+{formatMoney(r.vendor_profit)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        Ganancia segura: compras en la subasta y vendes al vendedor (sin comisión ni depósito). Suelen ser céntimos por unidad; mira el total.
      </p>
    </>
  );
}

type Advice = { label: string; className: string; rank: number };

/** Recomendación para los objetos de raid según su precio frente a la mediana y su tendencia. */
function adviceFor(r: LatestPriceRow, raidSoon: boolean): Advice {
  const trend = r.trend ?? 0;
  const discount = r.discount ?? 0;
  if (trend >= 0.15) return { label: "Ya ha subido", className: "text-bad", rank: 4 };
  // Si se está desplomando, mejor esperar a que se estabilice que comprar a mitad de caída.
  if (trend <= -0.25) return { label: "Bajando: espera", className: "text-gold", rank: 3 };
  if (raidSoon && discount >= 0 && trend <= 0.1) return { label: "Comprar ahora", className: "text-good", rank: 1 };
  return { label: "Vigilar", className: "text-muted", rank: 2 };
}

async function InvestList({ houseId }: { houseId: number }) {
  const lang = await nameLang();
  const [items, events] = await Promise.all([marketableItems(houseId), calendarEvents()]);
  const ctx = gameContext(events);
  const raid = events.find((e) => e.kind === "raid" && ctx.next?.date === e.date);
  const raidSoon = raid !== undefined && (ctx.next?.daysUntil ?? 999) <= 45;

  const groups = new Map<Category, { r: LatestPriceRow; advice: Advice }[]>();
  for (const r of items) {
    const cat = categorize(r.name_en);
    if (cat !== "raid-consumable" && cat !== "raid-material") continue;
    const list = groups.get(cat) ?? [];
    list.push({ r, advice: adviceFor(r, raidSoon) });
    groups.set(cat, list);
  }
  for (const list of groups.values()) list.sort((a, b) => a.advice.rank - b.advice.rank || (b.r.discount ?? 0) - (a.r.discount ?? 0));

  return (
    <>
      <p className="text-sm text-muted">
        {raidSoon
          ? `Objetos que suelen subir antes de abrir raids (faltan ${ctx.next!.daysUntil} días). “Comprar ahora” = por debajo de su mediana y estable esta semana; “Bajando” = ha caído más de un 25% en la semana, mejor esperar.`
          : "No hay una apertura de raids cerca en el calendario: esta lista solo enseña cómo están los objetos de raid."}
      </p>
      {(["raid-consumable", "raid-material"] as const).map((cat) => {
        const list = groups.get(cat) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={cat} className="space-y-2">
            <h2 className="text-sm font-medium text-muted">{CATEGORY_LABEL[cat]}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {list.slice(0, 30).map(({ r, advice }) => (
                <li key={r.item_id}>
                  <Link href={`/item/${r.item_id}?house=${houseId}`} className="flex items-center justify-between gap-3 px-4 py-3 active:bg-surface-2">
                    <div className="min-w-0">
                      <ItemTitle row={r} lang={lang} />
                      <p className="mt-1 text-xs text-muted">
                        <span className={advice.className}>{advice.label}</span> · mediana {formatMoney(r.market_7d)}
                        {r.trend !== null && ` · semana ${r.trend >= 0 ? "+" : "−"}${Math.abs(Math.round(r.trend * 100))}%`}
                        {r.sold_per_day !== null && ` · ≈${r.sold_per_day}/día`} · {r.qty} en venta
                      </p>
                    </div>
                    <div className="shrink-0 text-right font-mono text-sm">
                      <p className="text-gold">{formatMoney(r.min_buyout)}</p>
                      {r.discount !== null && Math.abs(r.discount) >= 0.03 && (
                        <p className={`text-xs ${r.discount > 0 ? "text-good" : "text-bad"}`}>
                          {r.discount > 0 ? "−" : "+"}
                          {Math.abs(Math.round(r.discount * 100))}%
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-xs text-muted">
        Es una heurística basada en lo que suele pasar en los lanzamientos de Classic, no una predicción. La tendencia necesita al menos 3
        días de datos. Para vender cerca de la apertura, publica unos días antes.
      </p>
    </>
  );
}

function ItemTitle({ row: r, lang }: { row: LatestPriceRow; lang: Lang }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <ItemIcon src={r.icon_url} quality={r.quality} />
      <span className={`truncate font-medium q-${r.quality ?? "COMMON"}`}>{pick(r.name_en, r.name_es, lang) ?? `Objeto #${r.item_id}`}</span>
    </span>
  );
}
