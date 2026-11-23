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
import {
  calendarEvents,
  dealSettings,
  flipCandidates,
  hoursSince,
  itemsBasic,
  latestRows,
  marketableItems,
  recentResets,
  RESET_KINDS,
  resetCandidates,
  resetHistory,
  vendorFlips,
  type MarketEvent,
  type ResetHistory,
  type ResetKind,
} from "@/lib/deals-queries";
import { isConfigured } from "@/lib/env";
import { pick, type Lang } from "@/lib/lang";
import { nameLang } from "@/lib/lang-server";
import { formatMoney, parseMoney } from "@/lib/money";
import { ACTIVITY_CLASS, ACTIVITY_LABEL } from "@/lib/pricing/activity";
import { scoreDeal } from "@/lib/pricing/deals";
import { adminTokenRequired } from "@/lib/admin";
import { eventAdvice } from "@/lib/seasonal";
import { pastUplifts, seasonalEvents, type SeasonalEvent } from "@/lib/seasonal-queries";
import { addEventDate, addEventItem, confirmEventItem, removeEventItem } from "./event-actions";
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
  others: {
    label: "Resets de otros",
    desc: "Objetos en los que alguien acaba de comprar todo lo barato y ha subido el precio. Si tienes ese objeto, es buen momento para vender; y su historial te dice si en ese objeto los resets aguantan.",
  },
  vendor: {
    label: "Comprar y vender al NPC",
    desc: "Objetos que en la subasta cuestan menos de lo que te paga un vendedor del juego. Ganancia segura, sin comisión ni depósito.",
  },
  events: {
    label: "Eventos",
    desc: "Festividades y la Feria de la Luna Negra: qué objetos piden sus misiones y cuándo comprarlos (antes) y venderlos (durante).",
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
        eyebrow="Oportunidades"
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
  const chip = (active: boolean) => (active ? "chip chip-active" : "chip");

  return (
    <div className="space-y-4">
      <HouseTabs houses={houses} current={house.id} hrefFor={(id) => href({ house: id })} />
      <div className="scroller text-sm">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <Link key={t} href={href({ tab: t })} className={chip(t === tab)} title={TABS[t].desc} aria-current={t === tab ? "page" : undefined}>
            {TABS[t].label}
          </Link>
        ))}
      </div>
      <p className="text-sm text-muted">{TABS[tab].desc}</p>
      {tab === "flip" && <FlipList houseId={house.id} faction={house.faction} />}
      {tab === "reset" && <ResetList houseId={house.id} faction={house.faction} budget={budget} budgetParam={budgetParam} kind={kind} />}
      {tab === "others" && <OthersList houseId={house.id} />}
      {tab === "vendor" && <VendorList houseId={house.id} />}
      {tab === "events" && <EventsList houseId={house.id} msg={typeof sp.msg === "string" ? sp.msg : undefined} />}
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
        <ul className="list">
          {rows.map(({ r, deal }) => (
            <li key={r.item_id}>
              <Link href={`/item/${r.item_id}?house=${houseId}`} className="block space-y-1 px-4 py-3 row">
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
  const history = await resetHistory(
    houseId,
    rows.map((r) => r.row.item_id),
  );
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
            className={k === kind ? "chip chip-active" : "chip"}
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
        <ul className="list">
          {rows.map(({ row: r, reset: x }) => (
            <li key={r.item_id}>
              <Link href={`/item/${r.item_id}?house=${houseId}`} className="block space-y-1.5 px-4 py-3 row">
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
                {history.get(r.item_id) && <HistoryLine h={history.get(r.item_id)!} />}
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

function EventStatus({ e }: { e: MarketEvent }) {
  const dur = e.resolved_at ? Math.max(1, Math.round((Date.parse(e.resolved_at) - Date.parse(e.detected_at)) / 3600_000)) : null;
  const [label, cls] =
    e.status === "open"
      ? [`aguantando · hace ${hoursSince(e.detected_at)} h`, "border-gold/60 text-gold"]
      : e.status === "held"
        ? ["aguantó 24 h", "border-good/60 text-good"]
        : [`se cayó en ${dur} h`, "border-bad/60 text-bad"];
  return <span className={`rounded border px-1.5 py-px ${cls}`}>{label}</span>;
}

/** Resumen del historial de resets ajenos de un objeto. */
function HistoryLine({ h }: { h: ResetHistory }) {
  const closed = h.held + h.failed;
  return (
    <p className="text-xs text-muted">
      Resets de otros en este objeto: {h.total}
      {closed > 0 && (
        <>
          {" "}
          · <span className={h.held >= h.failed ? "text-good" : "text-bad"}>{h.held} de {closed} aguantaron 24 h</span>
        </>
      )}
      {h.avgHoursToFail !== null && ` · los que se cayeron duraron ≈${Math.round(h.avgHoursToFail)} h`}
    </p>
  );
}

async function OthersList({ houseId }: { houseId: number }) {
  const lang = await nameLang();
  const events = await recentResets(houseId);
  const ids = [...new Set(events.map((e) => e.item_id))];
  const [latest, history] = await Promise.all([latestRows(houseId, ids), resetHistory(houseId, ids)]);
  const basics = await itemsBasic(ids.filter((id) => !latest.has(id)));
  const name = (id: number) => {
    const r = latest.get(id) ?? basics.get(id);
    return pick(r?.name_en, r?.name_es, lang) ?? `Objeto #${id}`;
  };
  const closed = events.filter((e) => e.status !== "open");
  const held = closed.filter((e) => e.status === "held").length;

  return (
    <>
      {events.length === 0 ? (
        <p className="card text-sm text-muted">
          En las últimas 72 h no se ha detectado ningún reset. Se empezaron a registrar el 23-11; se detectan cuando, de una hora a otra,
          alguien compra lo barato de un objeto y el mínimo salta más de un 25% (y más de un 15% sobre su precio normal).
        </p>
      ) : (
        <>
          {closed.length > 0 && (
            <p className="text-xs text-muted">
              De los {closed.length} resets ya cerrados, <span className={held >= closed.length / 2 ? "text-good" : "text-bad"}>{held} aguantaron 24 h</span>.
            </p>
          )}
          <ul className="list">
            {events.map((e) => {
              const now = latest.get(e.item_id);
              const info = now ?? basics.get(e.item_id);
              const minNow = now?.min_buyout ?? null;
              return (
                <li key={e.id}>
                  <Link href={`/item/${e.item_id}?house=${houseId}`} className="block space-y-1.5 px-4 py-3 row">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <ItemIcon src={info?.icon_url ?? null} quality={info?.quality ?? null} />
                        <span className={`line-clamp-2 font-medium leading-snug q-${info?.quality ?? "COMMON"}`}>{name(e.item_id)}</span>
                      </span>
                      <div className="shrink-0 text-right font-mono text-sm" title="Mínimo antes → justo después del reset">
                        <p className="text-gold">{formatMoney(e.new_min)}</p>
                        <p className="font-sans text-xs text-muted">antes {formatMoney(e.prev_min)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted">
                      Alguien compró <b className="text-fg">{e.units.toLocaleString("es-ES")} uds</b> por <b className="font-mono text-fg">{formatMoney(e.cost)}</b> ·
                      precio normal {formatMoney(e.market)} (+{Math.round((e.new_min / e.market - 1) * 100)}%)
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <EventStatus e={e} />
                      {e.status === "open" && (
                        <span>
                          {minNow === null ? "agotado ahora" : `mínimo ahora ${formatMoney(minNow)}`}
                          {minNow !== null && minNow > e.market && <span className="text-good"> · si tienes, vende a {formatMoney(minNow - 1)}</span>}
                        </span>
                      )}
                    </p>
                    {history.get(e.item_id) && history.get(e.item_id)!.total > 1 && <HistoryLine h={history.get(e.item_id)!} />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="space-y-1 text-xs text-muted">
        <p>
          <b>Para qué sirve</b>: si tienes el objeto, véndelo mientras el precio está alto (1c por debajo del mínimo de ahora). Si no, no
          compres a ese precio: espera a ver si se cae.
        </p>
        <p>
          <b>Aguantando</b>: el precio sigue alto. <b>Se cayó</b>: el mínimo volvió a menos de un 10% sobre el de antes (o un 5% sobre lo
          normal), porque otros publicaron más barato. <b>Aguantó</b>: siguió alto 24 h. Con el tiempo, este historial te dice en qué
          objetos merece la pena resetear tú.
        </p>
      </div>
    </>
  );
}

const EVENT_MSG: Record<string, { text: string; ok: boolean }> = {
  ok: { text: "Guardado.", ok: true },
  quitado: { text: "Objeto quitado del evento.", ok: true },
  token: { text: "La contraseña de administración no es correcta.", ok: false },
  invalid: { text: "Algún dato no es válido.", ok: false },
  "no-item": { text: "No encuentro ese objeto: pon su ID o su nombre exacto (en inglés o español).", ok: false },
};

const fmtDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });

async function EventsList({ houseId, msg }: { houseId: number; msg?: string }) {
  const lang = await nameLang();
  const events = await seasonalEvents();
  const ids = [...new Set(events.flatMap((e) => e.items.map((i) => i.item_id)))];
  const [latest, uplifts] = await Promise.all([latestRows(houseId, ids), pastUplifts(houseId, events)]);
  const basics = await itemsBasic(ids.filter((id) => !latest.has(id)));
  const needToken = adminTokenRequired();
  const m = msg ? EVENT_MSG[msg] : undefined;
  const tokenField = needToken && <input name="token" type="password" required placeholder="Contraseña" className="input" autoComplete="current-password" aria-label="Contraseña de administración" />;

  return (
    <>
      {m && <p className={`card text-sm ${m.ok ? "text-good" : "text-bad"}`}>{m.text}</p>}
      <p className="text-xs text-muted">
        Fechas de wowcalc.net y foreverdb.net (aprox.: Blizzard no ha publicado la hora del reino de Forever). Las misiones vienen de Classic:
        las marcadas <span className="text-gold">sin confirmar</span> hay que verlas en el juego. Puedes añadir objetos y fechas en cada
        evento.
      </p>
      {events.map((e) => (
        <EventCard key={e.id} e={e} houseId={houseId} lang={lang} latest={latest} basics={basics} uplifts={uplifts} tokenField={tokenField} />
      ))}
    </>
  );
}

function EventCard({
  e,
  houseId,
  lang,
  latest,
  basics,
  uplifts,
  tokenField,
}: {
  e: SeasonalEvent;
  houseId: number;
  lang: Lang;
  latest: Map<number, LatestPriceRow>;
  basics: Map<number, { name_en: string | null; name_es: string | null; quality: string | null; icon_url: string | null }>;
  uplifts: Map<string, number>;
  tokenField: React.ReactNode;
}) {
  const t = e.timing;
  const when = !t
    ? "sin fechas"
    : t.phase === "during"
      ? `en curso · quedan ${t.daysLeft} ${t.daysLeft === 1 ? "día" : "días"}`
      : t.phase === "past"
        ? "ya pasó"
        : `en ${t.daysUntil} ${t.daysUntil === 1 ? "día" : "días"}`;
  const whenClass = t?.phase === "during" ? "text-good" : t?.phase === "soon" ? "text-gold" : "text-muted";
  const otherDates = e.dates.filter((d) => d.starts !== t?.occ.starts && d.ends >= new Date().toISOString().slice(0, 10));

  return (
    <section id={`evento-${e.id}`} className={`card space-y-3 ${t?.phase === "during" || t?.phase === "soon" ? "border-gold/50" : ""}`}>
      <div>
        <h2 className="flex flex-wrap items-baseline justify-between gap-x-3 font-medium">
          {e.name}
          <span className={`text-sm font-normal ${whenClass}`}>{when}</span>
        </h2>
        {t && (
          <p className="text-xs text-muted">
            {fmtDate(t.occ.starts)}
            {t.occ.ends !== t.occ.starts && ` – ${fmtDate(t.occ.ends)}`}
            {t.occ.place && ` · ${t.occ.place}`}
            {otherDates.length > 0 && ` · después: ${otherDates.map((d) => fmtDate(d.starts)).join(", ")}`}
          </p>
        )}
        {e.notes && <p className="mt-1 text-xs text-muted">{e.notes}</p>}
      </div>

      {e.items.length === 0 ? (
        <p className="text-sm text-muted">Aún no hay objetos apuntados para este evento.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line text-sm">
          {e.items.map((it) => {
            const row = latest.get(it.item_id);
            const info = row ?? basics.get(it.item_id);
            const up = uplifts.get(`${e.id}:${it.item_id}`) ?? null;
            const advice = t ? eventAdvice(t, { min: row?.min_buyout ?? null, market7d: row?.market_7d ?? row?.p15_market ?? null }, up) : null;
            return (
              <li key={it.item_id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <Link href={`/item/${it.item_id}?house=${houseId}`} className="flex min-w-0 items-center gap-2">
                  <ItemIcon src={info?.icon_url ?? null} quality={info?.quality ?? null} size={24} />
                  <span className="min-w-0">
                    <span className={`block truncate q-${info?.quality ?? "COMMON"}`}>
                      {it.qty ? `${it.qty} × ` : ""}
                      {pick(info?.name_en, info?.name_es, lang) ?? `Objeto #${it.item_id}`}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {it.note}
                      {!it.confirmed && <span className="text-gold"> · sin confirmar</span>}
                      {up !== null && ` · la última vez ${up >= 0 ? "+" : "−"}${Math.abs(Math.round(up * 100))}%`}
                    </span>
                    {advice && <span className={`block text-[11px] ${advice.className}`}>{advice.label}</span>}
                  </span>
                </Link>
                <span className="shrink-0 text-right font-mono">
                  {row ? formatMoney(row.min_buyout) : <span className="text-xs text-muted">no hay</span>}
                  {row?.market_7d != null && <span className="block text-[11px] text-muted">normal {formatMoney(row.market_7d)}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <details className="text-sm">
        <summary className="py-1 text-gold">✎ Editar objetos y fechas</summary>
        <div className="mt-2 space-y-4">
          <form action={addEventItem} className="space-y-2">
            <input type="hidden" name="eventId" value={e.id} />
            <p className="text-xs text-muted">Añadir (o cambiar) un objeto que pide el evento:</p>
            <input name="item" required className="input" placeholder="ID o nombre exacto (p. ej. Small Egg)" aria-label="Objeto" />
            <div className="grid grid-cols-[5rem_1fr] gap-2">
              <input name="qty" type="number" min={1} inputMode="numeric" className="input px-2" placeholder="Cant." aria-label="Cantidad que pide la misión" />
              <input name="note" className="input" placeholder="Para qué (p. ej. galletas de jengibre)" aria-label="Nota" />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" name="confirmed" className="h-4 w-4 accent-[#e0b354]" />
              Lo he visto en el juego (confirmado)
            </label>
            {tokenField}
            <button className="btn w-full sm:w-auto">Guardar objeto</button>
          </form>

          {e.items.length > 0 && (
            <ul className="space-y-1.5 text-xs">
              {e.items.map((it) => {
                const info = latest.get(it.item_id) ?? basics.get(it.item_id);
                return (
                  <li key={it.item_id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{pick(info?.name_en, info?.name_es, lang) ?? `#${it.item_id}`}</span>
                    <span className="flex shrink-0 gap-1.5">
                      <form action={confirmEventItem}>
                        <input type="hidden" name="eventId" value={e.id} />
                        <input type="hidden" name="itemId" value={it.item_id} />
                        <input type="hidden" name="confirmed" value={it.confirmed ? "0" : "1"} />
                        {tokenField}
                        <button className="min-h-8 rounded border border-line px-2 text-muted hover:text-fg">{it.confirmed ? "Desconfirmar" : "✓ Confirmar"}</button>
                      </form>
                      <form action={removeEventItem}>
                        <input type="hidden" name="eventId" value={e.id} />
                        <input type="hidden" name="itemId" value={it.item_id} />
                        {tokenField}
                        <button className="min-h-8 rounded border border-line px-2 text-bad">Quitar</button>
                      </form>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <form action={addEventDate} className="space-y-2">
            <input type="hidden" name="eventId" value={e.id} />
            <p className="text-xs text-muted">Añadir fechas (p. ej. la Feria del mes que viene):</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted">
                Empieza
                <input name="starts" type="date" required className="input mt-1 px-2" />
              </label>
              <label className="text-xs text-muted">
                Termina
                <input name="ends" type="date" className="input mt-1 px-2" />
              </label>
            </div>
            <input name="place" className="input" placeholder="Lugar (opcional)" aria-label="Lugar" />
            {tokenField}
            <button className="btn w-full sm:w-auto">Guardar fechas</button>
          </form>
          {e.source && (
            <a href={e.source} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-muted underline">
              Fuente de las fechas ↗
            </a>
          )}
        </div>
      </details>
    </section>
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
        <ul className="list">
          {rows.map((r) => (
            <li key={r.item_id}>
              <Link href={`/item/${r.item_id}?house=${houseId}`} className="flex items-center justify-between gap-3 px-4 py-3 row">
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
            <ul className="list">
              {list.slice(0, 30).map(({ r, advice }) => (
                <li key={r.item_id}>
                  <Link href={`/item/${r.item_id}?house=${houseId}`} className="flex items-center justify-between gap-3 px-4 py-3 row">
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
