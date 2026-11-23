import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Hint } from "@/components/Hint";
import { ItemIcon } from "@/components/ItemIcon";
import { Money } from "@/components/Money";
import { Loading, SetupNotice } from "@/components/notices";
import { PageIntro } from "@/components/PageIntro";
import { isAdmin } from "@/lib/admin-session";
import { isConfigured } from "@/lib/env";
import { pick } from "@/lib/lang";
import { nameLang } from "@/lib/lang-server";
import { formatMoney } from "@/lib/money";
import { daysAgo, netByDay, summarizeLedger, type LedgerRow } from "@/lib/ledger-stats";
import { myAccount } from "@/lib/account-queries";
import { trackedHouses } from "@/lib/queries";
import { login, logout } from "./actions";
import { AddonUpload } from "./AddonUpload";

export const metadata = { title: "Mi oro · Forever AH" };

const RANGES = { "7": { label: "7 días", days: 7 }, "30": { label: "30 días", days: 30 }, todo: { label: "Todo", days: null } } as const;
type Range = keyof typeof RANGES;

const KIND = {
  sale: { label: "Venta", className: "border-good/50 text-good" },
  buy: { label: "Compra", className: "border-info/50 text-info" },
  post: { label: "Publicada", className: "border-line text-muted" },
  cancel: { label: "Cancelada", className: "border-line text-muted" },
  expire: { label: "Caducada", className: "border-bad/50 text-bad" },
} as const;

export default function Page({ searchParams }: PageProps<"/cuenta">) {
  return (
    <div className="space-y-5">
      <PageIntro
        eyebrow="Tu cuenta"
        title="Mi oro"
        summary="Tus ventas y compras REALES en la subasta, tu oro y lo que vale tu inventario, leídos del addon AHledger."
        steps={[
          "Juega con el addon AHledger activado: apunta lo que publicas, vendes y compras (al recoger el correo) y lo que llevas en bolsas y banco.",
          "Sal del juego o escribe /reload: WoW solo guarda los datos del addon entonces.",
          <>
            En el Mac, ejecuta <code className="rounded bg-surface-3 px-1">pnpm addon-sync</code> (encuentra el archivo solo). Desde otro sitio, sube
            el archivo con el botón de abajo.
          </>,
          "Aquí verás lo que has ganado de verdad por objeto, si vendes por debajo del precio normal y cuánto vale lo que tienes.",
        ]}
        actions={
          <Link href="/admin/houses" className="btn-ghost" title="Casas de subastas, alertas y ayuda">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
            <span className="hidden sm:inline">Ajustes</span>
          </Link>
        }
      />
      <Suspense fallback={<Loading />}>
        <Account searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Account({ searchParams }: Pick<PageProps<"/cuenta">, "searchParams">) {
  await connection();
  if (!isConfigured()) return <SetupNotice />;
  const sp = await searchParams;
  if (!(await isAdmin())) return <LoginCard wrong={sp.msg === "token"} />;

  const range: Range = typeof sp.rango === "string" && sp.rango in RANGES ? (sp.rango as Range) : "30";
  const days = RANGES[range].days;
  const since = days ? daysAgo(days) : undefined;
  const houses = await trackedHouses();
  const [acc, lang] = await Promise.all([myAccount(houses[0]?.id ?? null), nameLang()]);

  if (acc.characters.length === 0 && acc.ledger.length === 0) {
    return (
      <section className="card space-y-3">
        <p className="font-medium">Aún no hay datos tuyos</p>
        <p className="text-sm text-muted">
          Ejecuta <code className="rounded bg-surface-3 px-1">pnpm addon-sync</code> en el Mac, o sube aquí tu AHledger.lua (está en{" "}
          <code className="text-xs">_forever_/WTF/Account/&lt;cuenta&gt;/SavedVariables/</code>).
        </p>
        <AddonUpload />
      </section>
    );
  }

  const s = summarizeLedger(acc.ledger, since);
  const days7 = summarizeLedger(acc.ledger, daysAgo(7));
  const chart = netByDay(acc.ledger.filter((r) => !since || Date.parse(r.at) >= since.getTime())).slice(-30);
  const maxBar = Math.max(1, ...chart.map((d) => Math.max(d.income, d.spent)));
  const money = acc.characters.reduce((t, c) => t + (c.money ?? 0), 0);
  const name = (id: number | null, fallback: string | null) => (id !== null ? pick(acc.items.get(id)?.name_en, acc.items.get(id)?.name_es, lang) : null) ?? fallback ?? "Sin nombre (el correo no lo dice)";
  const lastSync = acc.characters.map((c) => c.updated_at).sort().at(-1);
  const href = (r: Range) => `/cuenta?rango=${r}`;

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Oro en bolsas" hint="Suma del oro que llevan todos tus personajes (la última vez que entraste con cada uno)." value={<Money value={money} />} />
        <Stat
          label="Valor del inventario"
          hint="Lo que vale lo que tienes en bolsas y banco al precio normal de la subasta (sin contar objetos ligados ni lo que no se vende)."
          value={<Money value={acc.inventoryValue} />}
        />
        <Stat
          label="Neto 7 días"
          hint="Lo que has cobrado por ventas (ya sin la comisión) menos lo que has gastado comprando, en los últimos 7 días."
          value={<Money value={days7.net} className={days7.net >= 0 ? "" : "text-bad"} />}
          accent={days7.net > 0}
        />
        <Stat label="Vendido 7 días" hint="Unidades vendidas en la subasta en los últimos 7 días." value={<span className="font-mono">{days7.sold.toLocaleString("es-ES")} uds</span>} />
      </section>

      <div className="scroller text-sm">
        <span className="eyebrow shrink-0">Periodo</span>
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <Link key={r} href={href(r)} className={r === range ? "chip chip-active" : "chip"}>
            {RANGES[r].label}
          </Link>
        ))}
      </div>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Subasta · {RANGES[range].label.toLowerCase()}</p>
            <p className="mt-1 text-2xl font-semibold">
              <Money value={s.net} className={s.net < 0 ? "text-bad" : ""} />
            </p>
            <p className="text-xs text-muted">neto (cobrado − gastado)</p>
          </div>
          <dl className="grid grid-cols-3 gap-4 text-right text-xs">
            <div>
              <dt className="text-muted">Cobrado</dt>
              <dd className="mt-0.5 text-sm text-good">
                <Money value={s.income} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">Gastado</dt>
              <dd className="mt-0.5 text-sm">
                <Money value={s.spent} />
              </dd>
            </div>
            <div>
              <dt className="text-muted">Comisión</dt>
              <dd className="mt-0.5 text-sm text-muted">
                <Money value={s.cut} />
              </dd>
            </div>
          </dl>
        </div>
        {chart.length > 0 && (
          <div>
            <div className="flex h-28 items-end gap-1" role="img" aria-label="Cobrado y gastado por día">
              {chart.map((d) => (
                <div key={d.day} className="flex h-full min-w-0 flex-1 items-end justify-center gap-px" title={`${d.day}: cobrado ${formatMoney(d.income)}, gastado ${formatMoney(d.spent)}`}>
                  <div className="w-1/2 max-w-3 rounded-t bg-good/70" style={{ height: `${(d.income / maxBar) * 100}%` }} />
                  <div className="w-1/2 max-w-3 rounded-t bg-info/60" style={{ height: `${(d.spent / maxBar) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted">
              <span>{chart[0].day.slice(5)}</span>
              <span className="flex gap-3">
                <span>
                  <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-good/70" />
                  cobrado
                </span>
                <span>
                  <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-info/60" />
                  gastado
                </span>
              </span>
              <span>{chart.at(-1)!.day.slice(5)}</span>
            </div>
          </div>
        )}
        <p className="text-xs text-muted">
          {s.posted} publicadas · {s.sold.toLocaleString("es-ES")} uds vendidas · {s.bought.toLocaleString("es-ES")} compradas ·{" "}
          <span className={s.expired ? "text-bad" : ""}>{s.expired} caducadas</span> · {s.cancelled} canceladas
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-1 px-1 text-sm font-semibold">
          Por objeto
          <Hint label="Cómo leer la tabla por objeto">
            <b>Cobrado</b>: lo que te pagaron, sin la comisión. <b>Media</b>: precio medio por unidad al que vendiste, comparado con el precio
            normal de ahora (<span className="text-bad">rojo</span> = vendes barato). <b>Beneficio</b>: si también lo compraste, lo vendido al
            precio medio de venta menos al de compra.
          </Hint>
        </h2>
        {s.items.length === 0 ? (
          <p className="card text-sm text-muted">Ninguna venta ni compra en este periodo.</p>
        ) : (
          <ul className="list">
            {s.items.slice(0, 40).map((it) => {
              const info = it.itemId !== null ? acc.items.get(it.itemId) : undefined;
              const market = it.itemId !== null ? acc.market.get(it.itemId) : undefined;
              const cheap = it.avgSell !== null && market ? it.avgSell < market * 0.9 : false;
              const row = (
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <ItemIcon src={info?.icon_url ?? null} quality={info?.quality ?? null} />
                    <span className="min-w-0">
                      <span className={`block truncate font-medium q-${info?.quality ?? "COMMON"}`}>{name(it.itemId, it.name)}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {it.soldQty > 0 && (
                          <>
                            vendidas {it.soldQty} · media <Money value={it.avgSell} className={cheap ? "text-bad" : ""} />
                            {market ? (
                              <>
                                {" "}
                                (normal <Money value={market} />)
                              </>
                            ) : null}
                          </>
                        )}
                        {it.soldQty > 0 && it.boughtQty > 0 && " · "}
                        {it.boughtQty > 0 && (
                          <>
                            compradas {it.boughtQty} a <Money value={it.avgBuy} />
                          </>
                        )}
                        {it.expiredQty > 0 && <span className="text-bad"> · {it.expiredQty} caducadas</span>}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm">
                    {it.income > 0 && (
                      <span className="block text-good">
                        +<Money value={it.income} />
                      </span>
                    )}
                    {it.spent > 0 && (
                      <span className="block text-xs text-muted">
                        −<Money value={it.spent} />
                      </span>
                    )}
                    {it.flipProfit !== null && (
                      <span className={`block text-[11px] ${it.flipProfit >= 0 ? "text-good" : "text-bad"}`}>
                        beneficio {it.flipProfit >= 0 ? "+" : "−"}
                        <Money value={Math.abs(it.flipProfit)} />
                      </span>
                    )}
                  </span>
                </div>
              );
              return (
                <li key={it.key}>
                  {it.itemId !== null ? (
                    <Link href={`/item/${it.itemId}`} className="row block">
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold">Últimas operaciones</h2>
        <ul className="list text-sm">
          {groupOps(acc.ledger).slice(0, 25).map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`badge w-[4.75rem] justify-center ${KIND[r.kind].className}`}>{KIND[r.kind].label}</span>
                <span className="truncate">
                  {r.qty > 1 && <span className="text-muted">{r.qty} × </span>}
                  {name(r.item_id, r.name)}
                  {r.times > 1 && <span className="text-xs text-muted"> ({r.times} subastas)</span>}
                </span>
              </span>
              <span className="shrink-0 text-right">
                {r.price > 0 && <Money value={r.kind === "sale" ? r.price - r.cut : r.price} className={r.kind === "sale" ? "text-good" : ""} />}
                <span className="block text-[11px] text-muted">
                  {new Date(r.at).toLocaleString("es-ES", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold">Personajes e inventario</h2>
        {acc.characters.map((c) => {
          const inv = acc.inventory.filter((r) => r.char_key === c.key);
          const value = inv.reduce((t, r) => t + (r.bound ? 0 : r.qty * (acc.market.get(r.item_id) ?? 0)), 0);
          return (
            <details key={c.key} className="card group p-0">
              <summary className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{c.name}</span>
                  <span className="block text-xs text-muted">
                    {inv.length} objetos distintos{c.bank_at ? "" : " · banco sin abrir"}
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm">
                  <Money value={c.money} />
                  <span className="block text-[11px] text-muted">
                    + <Money value={value} /> en objetos
                  </span>
                </span>
              </summary>
              <ul className="divide-y divide-line border-t border-line text-sm">
                {[...inv]
                  .sort((a, b) => b.qty * (acc.market.get(b.item_id) ?? 0) - a.qty * (acc.market.get(a.item_id) ?? 0))
                  .map((r) => {
                    const info = acc.items.get(r.item_id);
                    const m = acc.market.get(r.item_id);
                    return (
                      <li key={`${r.item_id}-${r.place}`}>
                        <Link href={`/item/${r.item_id}`} className="row flex items-center justify-between gap-3 px-4 py-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <ItemIcon src={info?.icon_url ?? null} quality={info?.quality ?? null} size={24} />
                            <span className="truncate">
                              {r.qty > 1 && <span className="text-muted">{r.qty} × </span>}
                              {name(r.item_id, null)}
                            </span>
                            {r.place === "bank" && <span className="badge border-line text-muted">banco</span>}
                            {r.bound && <span className="badge border-line text-faint">ligado</span>}
                          </span>
                          <span className="shrink-0 text-xs">{!r.bound && m ? <Money value={m * r.qty} /> : <span className="text-faint">—</span>}</span>
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </details>
          );
        })}
      </section>

      <section className="card space-y-3">
        <div>
          <p className="font-medium">Actualizar datos</p>
          <p className="text-sm text-muted">
            Última sincronización:{" "}
            {lastSync ? new Date(lastSync).toLocaleString("es-ES", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" }) : "nunca"}. En el
            Mac: <code className="rounded bg-surface-3 px-1">pnpm addon-sync</code>. Desde otro equipo, sube el archivo (se lee en tu navegador y solo se
            envían el inventario y el libro).
          </p>
        </div>
        <AddonUpload />
        <form action={logout}>
          <button className="text-xs text-muted underline-offset-2 hover:underline">Cerrar sesión en este navegador</button>
        </form>
      </section>
    </div>
  );
}

/** Une operaciones seguidas iguales (mismo tipo y objeto en el mismo minuto): p. ej. 25 cancelaciones de golpe. */
function groupOps(rows: LedgerRow[]): (LedgerRow & { times: number })[] {
  const out: (LedgerRow & { times: number })[] = [];
  for (const r of rows) {
    const last = out.at(-1);
    if (last && last.kind === r.kind && (last.item_id ?? last.name) === (r.item_id ?? r.name) && last.at.slice(0, 16) === r.at.slice(0, 16)) {
      last.qty += r.qty;
      last.price += r.price;
      last.cut += r.cut;
      last.times++;
    } else out.push({ ...r, times: 1 });
  }
  return out;
}

function Stat({ label, hint, value, accent }: { label: string; hint: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className={accent ? "card-accent p-3.5" : "card p-3.5"}>
      <p className="flex items-center gap-1 text-xs text-muted">
        {label}
        <Hint label={`Qué es “${label}”`}>{hint}</Hint>
      </p>
      <p className="mt-1.5 text-lg font-semibold">{value}</p>
    </div>
  );
}

function LoginCard({ wrong }: { wrong: boolean }) {
  return (
    <section className="card mx-auto max-w-sm space-y-3">
      <p className="font-medium">Datos privados</p>
      <p className="text-sm text-muted">Tu oro, tus personajes y tus ventas solo se ven con la contraseña de administración.</p>
      {wrong && <p className="text-sm text-bad">La contraseña no es correcta.</p>}
      <form action={login} className="space-y-2">
        <input name="token" type="password" required placeholder="Contraseña" className="input" autoComplete="current-password" aria-label="Contraseña de administración" />
        <button className="btn w-full">Entrar</button>
      </form>
    </section>
  );
}
