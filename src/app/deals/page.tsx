import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { GameContextBanner } from "@/components/GameContextBanner";
import { Hint } from "@/components/Hint";
import { HouseTabs } from "@/components/HouseTabs";
import { ItemIcon } from "@/components/ItemIcon";
import { Loading, NoHousesNotice, SetupNotice } from "@/components/notices";
import { PageIntro } from "@/components/PageIntro";
import { CATEGORY_LABEL, categorize, gameContext, investAdvice as adviceFor, type Advice, type Category } from "@/lib/calendar";
import { calendarEvents, dealSettings, flipCandidates, marketableItems, RESET_KINDS, resetCandidates, vendorFlips, type ResetKind } from "@/lib/deals-queries";
import { isConfigured } from "@/lib/env";
import { pick, type Lang } from "@/lib/lang";
import { nameLang } from "@/lib/lang-server";
import { formatMoney, parseMoney } from "@/lib/money";
import { ACTIVITY_CLASS, ACTIVITY_LABEL } from "@/lib/pricing/activity";
import { scoreDeal } from "@/lib/pricing/deals";
import { DEFAULT_RESET } from "@/lib/pricing/reset";
import { trackedHouses } from "@/lib/queries";
import type { LatestPriceRow } from "@/lib/supabase";

const TABS = {
  flip: {
    label: "Comprar y revender",
    desc: "Objetos que ahora están por debajo de su precio normal. Los compras y los vuelves a publicar más caros en la subasta.",
  },
  reset: {
    label: "Resetear mercado",
    desc: "Comprar todo lo barato de un objeto hasta el siguiente “muro” de precio y volver a publicarlo más caro. Solo sale a cuenta si se vende bien y nadie repone enseguida.",
  },
  vendor: {
    label: "Comprar y vender al NPC",
    desc: "Objetos que en la subasta cuestan menos de lo que te paga un vendedor del juego. Ganancia segura, sin comisión ni depósito.",
  },
  invest: {
    label: "Guardar para raids",
    desc: "Consumibles y materiales de raid que suelen subir antes de que abran las raids. Compra barato ahora y vende cerca de la apertura.",
  },
} as const;
type Tab = keyof typeof TABS;

export default function Page({ searchParams }: PageProps<"/deals">) {
  return (
    <div className="space-y-4">
      <PageIntro
        title="Chollos"
        summary="Qué comprar ahora para ganar oro. Las compras las haces tú a mano en el juego."
        steps={[
          "Elige el tipo de chollo en las pestañas: revender, vender al NPC o guardar para raids.",
          "La cifra verde es lo que ganarías en total; debajo, cuánto más barato está que su precio normal.",
          "Toca un objeto para ver su historial antes de comprar: si el precio lleva días bajando, puede seguir bajando.",
          <>
            ¿No quieres estar mirando? Activa las{" "}
            <Link href="/alerts" className="text-gold underline">
              alertas de Telegram
            </Link>{" "}
            y te avisa cuando aparezca un chollo.
          </>,
        ]}
      />
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
  const budgetParam = typeof sp.presupuesto === "string" ? sp.presupuesto : "";
  const budget = parseMoney(budgetParam) ?? 5_000_000; // 500g
  const kind: ResetKind = typeof sp.tipo === "string" && sp.tipo in RESET_KINDS ? (sp.tipo as ResetKind) : "materiales";
  const href = (over: { tab?: Tab; house?: number }) =>
    `/deals?house=${over.house ?? house.id}&tab=${over.tab ?? tab}${budgetParam ? `&presupuesto=${encodeURIComponent(budgetParam)}` : ""}`;
  const chip = (active: boolean) => `min-h-9 shrink-0 rounded-full border px-3 py-1.5 ${active ? "border-gold text-gold" : "border-line text-muted"}`;

  return (
    <div className="space-y-4">
      <HouseTabs houses={houses} current={house.id} hrefFor={(id) => href({ house: id })} />
      <div className="-mx-4 flex gap-2 overflow-x-auto border-b border-line px-4 pb-3 text-sm">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link key={t} href={href({ tab: t })} className={chip(t === tab)} title={TABS[t].desc} aria-current={t === tab ? "page" : undefined}>
            {TABS[t].label}
          </Link>
        ))}
      </div>
      <p className="text-sm text-muted">{TABS[tab].desc}</p>
      {tab === "flip" && <FlipList houseId={house.id} faction={house.faction} />}
      {tab === "reset" && <ResetList houseId={house.id} faction={house.faction} budget={budget} budgetParam={budgetParam} kind={kind} />}
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
      <p className="flex items-center gap-1 text-xs text-muted">
        Ordenados por lo que ganas en total
        <Hint label="Cómo leer cada chollo">
          <b>Compra X uds por Y</b>: unidades que están baratas (≤ 85% de su precio normal) y lo que cuestan todas juntas.
          <br />
          <b>Revende a</b>: su precio normal (mediana de 7 días). <b>/ud</b>: lo que ganas por unidad tras la comisión.
          <br />
          <b>Días en venderlo todo</b>: según lo que se vende al día; si son muchos, compra menos.
        </Hint>
      </p>
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
                  <div className="shrink-0 text-right font-mono text-sm" title="Ganancia total si compras todas las unidades baratas y las revendes a su precio normal">
                    <p className="text-good">
                      +{formatMoney(deal.depthProfit)}
                      <span className="font-sans text-xs text-muted"> ganas</span>
                    </p>
                    <p className="font-sans text-xs text-muted">{Math.round(deal.discount * 100)}% más barato</p>
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
        <b>Cómo se calcula</b>: beneficio = revender a la mediana de 7 días menos la comisión del {Math.round(s.cut * 100)}%, menos el depósito de 24 h por la
        probabilidad de no venderse. “Compra X uds” son las que están a ≤85% de la mediana. Las ventas son estimadas.
      </p>
    </>
  );
}

const DEFAULT_HORIZON = DEFAULT_RESET.horizonDays;

const RISK = {
  low: { label: "riesgo bajo", className: "border-good/60 text-good" },
  medium: { label: "riesgo medio", className: "border-gold/60 text-gold" },
  high: { label: "riesgo alto", className: "border-bad/60 text-bad" },
} as const;

async function ResetList({
  houseId,
  faction,
  budget,
  budgetParam,
  kind,
}: {
  houseId: number;
  faction: string;
  budget: number;
  budgetParam: string;
  kind: ResetKind;
}) {
  const lang = await nameLang();
  const s = await dealSettings(faction);
  const rows = (await resetCandidates(houseId, s, budget, kind)).slice(0, 40);
  const kindHref = (k: ResetKind) => `/deals?house=${houseId}&tab=reset&tipo=${k}${budgetParam ? `&presupuesto=${encodeURIComponent(budgetParam)}` : ""}`;
  const restockUnknown = rows.some((r) => r.reset.restockUnknown);

  return (
    <>
      <form action="/deals" className="flex items-end gap-2">
        <input type="hidden" name="house" value={houseId} />
        <input type="hidden" name="tab" value="reset" />
        <input type="hidden" name="tipo" value={kind} />
        <label className="flex-1 text-xs text-muted">
          <span className="flex items-center gap-1">
            Cuánto oro quieres invertir como máximo
            <Hint label="Presupuesto">Solo se proponen resets cuyo coste total (comprar todo lo barato) cabe en esta cantidad. Escríbelo como 500g o 1200g 50s.</Hint>
          </span>
          <input name="presupuesto" defaultValue={budgetParam || formatMoney(budget)} className="input mt-1" placeholder="500g" aria-label="Presupuesto máximo" />
        </label>
        <button className="btn shrink-0">Calcular</button>
      </form>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-xs text-muted">Qué</span>
        {(Object.keys(RESET_KINDS) as ResetKind[]).map((k) => (
          <Link
            key={k}
            href={kindHref(k)}
            aria-current={k === kind ? "true" : undefined}
            className={`min-h-9 rounded-full border px-3 py-1.5 ${k === kind ? "border-gold text-gold" : "border-line text-muted hover:text-fg"}`}
          >
            {RESET_KINDS[k].label}
          </Link>
        ))}
      </div>
      {restockUnknown && (
        <p className="card text-xs text-muted">
          La reposición (cuánto se vuelve a publicar al día) se empezó a medir el 23-11: hasta tener 24 h de datos se supone igual a las
          ventas, así que casi todo sale como <span className="text-bad">riesgo alto</span>.
        </p>
      )}
      {rows.length === 0 ? (
        <p className="card text-sm text-muted">Con este presupuesto no hay ningún reset que salga a cuenta ahora mismo.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map(({ row: r, reset: x }) => (
            <li key={r.item_id}>
              <Link href={`/item/${r.item_id}?house=${houseId}`} className="block space-y-1.5 px-4 py-3 active:bg-surface-2">
                <div className="flex items-center justify-between gap-3">
                  <ItemTitle row={r} lang={lang} />
                  <div className="shrink-0 text-right font-mono text-sm" title="Beneficio esperado con el modelo (ventas, subida de precio y reposición) · si lo vendieras todo a tu precio">
                    <p className="text-good">
                      +{formatMoney(x.expectedProfit)}
                      <span className="font-sans text-xs text-muted"> esperado</span>
                    </p>
                    <p className="font-sans text-xs text-muted">máx. +{formatMoney(x.bestProfit)}</p>
                  </div>
                </div>
                <p className="text-xs">
                  <span className="text-muted">1.</span> Compra <b>{x.units.toLocaleString("es-ES")} uds</b> (todo hasta {formatMoney(x.maxPaid)}) por{" "}
                  <b className="font-mono">{formatMoney(x.cost)}</b>
                  <br />
                  <span className="text-muted">2.</span> Publícalas a <b className="font-mono text-gold">{formatMoney(x.relist)}</b>{" "}
                  <span className="text-muted">
                    (+{Math.round((x.overMarket - 1) * 100)}% sobre lo normal, {formatMoney(r.market_7d ?? r.p15_market)}; el siguiente vendedor está a {formatMoney(x.wall)})
                  </span>
                </p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span className={`rounded border px-1.5 py-px ${RISK[x.risk].className}`}>{RISK[x.risk].label}</span>
                  <span>≈{r.sold_per_day} vendidos/día</span>
                  <span>· {x.restockUnknown ? "reposición sin datos" : `≈${r.listed_per_day} repuestos/día`}</span>
                  <span>· {x.daysToSell === null ? "puede no venderse" : `≈${Math.ceil(x.daysToSell)} días en venderlo`}</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-1 text-xs text-muted">
        <p>
          <b>Cómo funciona</b>: compras todas las unidades baratas hasta el siguiente escalón de precio (el “muro”) y publicas 1c por
          debajo de él, como mucho al doble del precio normal. Antes de comprar, mira en el juego que la escalera siga igual.
        </p>
        <p>
          <b>Beneficio esperado</b>: en {DEFAULT_HORIZON} días vendes una parte, según las ventas al día (menos cuanto más subes el precio) y
          lo que otros vuelven a publicar; lo que sobra se valora a su precio normal −10%, con el depósito perdido. <b>Máx.</b>: si lo vendieras
          todo a tu precio. <b>Riesgo alto</b>: se repone tan rápido como se vende o tardarías más de una semana.
        </p>
      </div>
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
                    compra {r.vendor_units} uds desde {formatMoney(r.min_buyout)} · el vendedor te paga {formatMoney(r.vendor_sell)} c/u
                  </p>
                </div>
                <p className="shrink-0 text-right font-mono text-sm text-good" title="Ganancia total comprando todas esas unidades y vendiéndolas al vendedor">
                  +{formatMoney(r.vendor_profit)}
                  <span className="block font-sans text-xs text-muted">ganas</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        <b>Cómo se hace</b>: compras en la subasta y vendes al vendedor (sin comisión ni depósito). Suelen ser céntimos por unidad; mira el total.
      </p>
    </>
  );
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
      <span className={`line-clamp-2 font-medium leading-snug q-${r.quality ?? "COMMON"}`}>{pick(r.name_en, r.name_es, lang) ?? `Objeto #${r.item_id}`}</span>
      {r.activity && r.activity !== "normal" && (
        <span className={`shrink-0 rounded border px-1.5 py-px text-[11px] ${ACTIVITY_CLASS[r.activity]}`}>{ACTIVITY_LABEL[r.activity]}</span>
      )}
    </span>
  );
}
