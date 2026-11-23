import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Hint } from "@/components/Hint";
import { HouseTabs } from "@/components/HouseTabs";
import { ItemIcon } from "@/components/ItemIcon";
import { Loading, NoHousesNotice, SetupNotice } from "@/components/notices";
import { PriceChart } from "@/components/PriceChart";
import { isConfigured } from "@/lib/env";
import { pick, wowheadItemUrl, type Lang } from "@/lib/lang";
import { nameLang } from "@/lib/lang-server";
import { adminTokenRequired } from "@/lib/admin";
import { formatMoney } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase";
import { addWatch, removeWatch } from "@/app/alerts/actions";
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

  const stats: { label: string; value: string; hint: string }[] = [
    { label: "Más barato ahora", value: formatMoney(latest?.min_buyout), hint: "Precio por unidad de la subasta más barata en este momento: lo que pagarías si compras ya." },
    {
      label: "Publica a",
      value: latest ? formatMoney(Math.max(1, (latest.real_min ?? latest.min_buyout) - 1)) : "—",
      hint:
        latest?.real_min != null
          ? `Ojo: el más barato son ${latest.bait_units} ud sueltas muy por debajo (un cebo para que la gente rebaje). El precio real empieza en ${formatMoney(latest.real_min)}: publica 1c por debajo de ese, no del cebo (o compra el cebo, que está barato).`
          : "1 cobre por debajo del más barato: así tu subasta sale la primera.",
    },
    {
      label: "Precio de mercado",
      value: formatMoney(latest?.p15_market),
      hint: "Media del 15% de unidades más baratas. Más fiable que el mínimo, que puede ser una sola subasta suelta.",
    },
    {
      label: "Precio normal (7 días)",
      value: formatMoney(latest?.market_7d),
      hint: "Mediana de la última semana. Si “más barato ahora” está muy por debajo, es buen momento para comprar; si está por encima, para vender.",
    },
    {
      label: "En venta",
      value: latest ? `${latest.qty.toLocaleString("es-ES")} uds · ${latest.num_auctions} subastas` : "—",
      hint: "Unidades publicadas ahora y en cuántas subastas están repartidas. Mucho stock y pocas ventas = cuesta vender.",
    },
    {
      label: "Vendidos al día",
      value: soldPerDay === null ? "sin datos aún" : `≈ ${soldPerDay.toLocaleString("es-ES")}`,
      hint: "Estimación: subastas que desaparecen antes de caducar. Blizzard no publica las ventas reales.",
    },
    {
      label: "Vendedor (NPC)",
      hint: "“Paga” es lo que te da un vendedor del juego por cada unidad. “Vende a” es lo que cuesta comprárselo a él (si lo vende).",
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
          Ver en Wowhead (dónde sale, para qué sirve) ↗
        </a>
      </div>

      <HouseTabs houses={houses} current={house.id} hrefFor={(h) => `/item/${itemId}?house=${h}`} />

      <dl className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <dt className="flex items-center gap-1 text-xs text-muted">
              {s.label}
              <Hint label={`Qué es “${s.label}”`}>{s.hint}</Hint>
            </dt>
            <dd className="mt-1 font-mono text-base">{s.value}</dd>
          </div>
        ))}
      </dl>

      {!latest && <p className="card text-sm text-muted">Ahora mismo no hay ninguna unidad en venta en esta casa.</p>}

      <PriceChart hourly={hourly} daily={daily} />

      <WatchForm itemId={itemId} back={`/item/${itemId}?house=${house.id}`} msg={typeof sp.msg === "string" ? sp.msg : undefined} current={latest?.min_buyout ?? null} />

      <RecipeList title="Recetas que lo fabrican" recipes={recipes.makes} houseId={house.id} lang={lang} />
      <RecipeList title="Recetas que lo usan como material" recipes={recipes.uses} houseId={house.id} lang={lang} showQty />

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

const WATCH_MSG: Record<string, { text: string; ok: boolean }> = {
  aviso: { text: "Aviso guardado: te llegará por Telegram.", ok: true },
  quitado: { text: "Aviso quitado.", ok: true },
  token: { text: "La contraseña de administración no es correcta.", ok: false },
  invalid: { text: "Precio no válido. Escríbelo como 1g 20s, 35s o 1,5.", ok: false },
};

/** "Avísame cuando el mínimo baje de / suba de X" (lista de seguimiento, se avisa por Telegram). */
async function WatchForm({ itemId, back, msg, current }: { itemId: number; back: string; msg?: string; current: number | null }) {
  const { data } = await supabaseAdmin().from("watchlist").select("target_price, direction").eq("item_id", itemId).maybeSingle();
  const needToken = adminTokenRequired();
  const m = msg ? WATCH_MSG[msg] : undefined;
  return (
    <section className="card space-y-2 text-sm">
      <h2 className="font-medium">Avísame por Telegram</h2>
      <p className="text-xs text-muted">Te llega un mensaje al móvil cuando el más barato baje (o suba) del precio que pongas. Se revisa cada hora.</p>
      {m && <p className={m.ok ? "text-good" : "text-bad"}>{m.text}</p>}
      {data && (
        <form action={removeWatch} className="flex items-center justify-between gap-2">
          <span className="text-muted">
            Ahora: {data.direction === "below" ? "si baja de" : "si sube de"} {formatMoney(Number(data.target_price))}
          </span>
          <input type="hidden" name="itemId" value={itemId} />
          <input type="hidden" name="back" value={back} />
          {needToken && <input name="token" type="password" required placeholder="Contraseña" className="input w-32" aria-label="Contraseña de administración" />}
          <button className="min-h-9 shrink-0 rounded-lg border border-line px-3 text-muted">Quitar</button>
        </form>
      )}
      <form action={addWatch} className="grid grid-cols-[auto_1fr] gap-2">
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="back" value={back} />
        <select name="direction" defaultValue={data?.direction ?? "below"} className="input w-auto" aria-label="Cuándo avisar">
          <option value="below">Si baja de</option>
          <option value="above">Si sube de</option>
        </select>
        <input
          name="target"
          className="input"
          placeholder={current ? `p. ej. ${formatMoney(Math.round(current * 0.85))}` : "p. ej. 1g 20s"}
          defaultValue={data ? formatMoney(Number(data.target_price)) : ""}
          required
          aria-label="Precio por unidad (p. ej. 1g 20s)"
        />
        {needToken && <input name="token" type="password" required placeholder="Contraseña" className="input col-span-2" aria-label="Contraseña de administración" />}
        <button className="btn col-span-2">{data ? "Cambiar aviso" : "Guardar aviso"}</button>
      </form>
      <Link href="/alerts" className="inline-block text-xs text-gold underline">
        Ver todas las alertas
      </Link>
    </section>
  );
}
