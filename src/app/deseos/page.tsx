import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Hint } from "@/components/Hint";
import { HouseTabs } from "@/components/HouseTabs";
import { ItemIcon } from "@/components/ItemIcon";
import { Loading, NoHousesNotice, SetupNotice } from "@/components/notices";
import { PageIntro } from "@/components/PageIntro";
import { adminTokenRequired } from "@/lib/admin";
import { isConfigured } from "@/lib/env";
import { pick, wowheadItemUrl, type Lang } from "@/lib/lang";
import { nameLang } from "@/lib/lang-server";
import { formatMoney } from "@/lib/money";
import { trackedHouses } from "@/lib/queries";
import { PRIORITY, SLOTS, wishAdvice, type Slot } from "@/lib/wishlist";
import { wishlist, type WishItem } from "@/lib/wishlist-queries";
import { removeWish, toggleObtained } from "./actions";
import { WishForm } from "./WishForm";

export const metadata = { title: "Lista de deseos · Forever AH" };

const MESSAGES: Record<string, { text: string; ok: boolean }> = {
  guardado: { text: "Guardado.", ok: true },
  quitado: { text: "Pieza quitada de la lista.", ok: true },
  token: { text: "La contraseña de administración no es correcta.", ok: false },
  invalid: { text: "Algún dato no es válido (el precio, como 25g o 3g 50s).", ok: false },
  "no-item": { text: "No encuentro ese objeto: pon su ID o su nombre exacto (en inglés o español).", ok: false },
};

const PRIORITY_CLASS = { 1: "border-gold/60 text-gold", 2: "border-line text-muted", 3: "border-line text-muted" } as const;

export default function Page({ searchParams }: PageProps<"/deseos">) {
  return (
    <div className="space-y-4">
      <PageIntro
        eyebrow="Tu equipo"
        title="Lista de deseos"
        summary="Las piezas de equipo que quieres para tu paladín: cuánto cuestan ahora, su precio más bajo del mes y cuándo comprarlas."
        steps={[
          "Añade una pieza con su ID o su nombre (o desde su ficha, con el botón ♥). Elige la ranura y, si quieres, hasta cuánto pagarías.",
          "Cada pieza te dice si comprarla ya (por debajo de tu máximo, en el mínimo del mes o mucho más barata de lo normal) o esperar.",
          "Si nunca ha salido en la subasta, seguramente se liga al recogerla (BoP): mira en Wowhead dónde sale.",
          "Cuando la consigas, pulsa “La tengo” y pasa a la sección de conseguidas. Con Telegram conectado te avisa cuando baje de tu máximo.",
        ]}
      />
      <Suspense fallback={<Loading />}>
        <Wishlist searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Wishlist({ searchParams }: Pick<PageProps<"/deseos">, "searchParams">) {
  await connection();
  if (!isConfigured()) return <SetupNotice />;
  const sp = await searchParams;
  const houses = await trackedHouses();
  if (houses.length === 0) return <NoHousesNotice />;
  const house = houses.find((h) => String(h.id) === sp.house) ?? houses[0];
  const [items, lang] = await Promise.all([wishlist(house.id), nameLang()]);
  const msg = typeof sp.msg === "string" ? MESSAGES[sp.msg] : undefined;
  const back = `/deseos?house=${house.id}`;
  const tokenField = adminTokenRequired() && (
    <input name="token" type="password" required placeholder="Contraseña" className="input" autoComplete="current-password" aria-label="Contraseña de administración" />
  );

  const pending = items.filter((i) => !i.obtained);
  const obtained = items.filter((i) => i.obtained);
  const advised = pending.map((i) => ({
    i,
    a: wishAdvice({ min: i.latest?.min_buyout ?? null, market7d: i.latest?.market_7d ?? null, low30: i.low30, maxPrice: i.max_price, everSeen: i.everSeen }),
  }));
  const onSale = pending.filter((i) => i.latest);
  const total = onSale.reduce((s, i) => s + (i.latest?.min_buyout ?? 0), 0);
  const buyNow = advised.filter((x) => x.a.action === "buy");
  const order = Object.keys(SLOTS) as Slot[];
  const bySlot = [...advised].sort(
    (x, y) => order.indexOf(x.i.slot ?? "other") - order.indexOf(y.i.slot ?? "other") || x.i.priority - y.i.priority || x.a.rank - y.a.rank,
  );

  return (
    <div className="space-y-4">
      {msg && <p className={`card text-sm ${msg.ok ? "text-good" : "text-bad"}`}>{msg.text}</p>}
      <HouseTabs houses={houses} current={house.id} hrefFor={(id) => `/deseos?house=${id}`} />

      {pending.length > 0 && (
        <section className="card grid grid-cols-3 gap-2 text-center">
          <Stat label="Te faltan" value={String(pending.length)} />
          <Stat label="Comprar ya" value={String(buyNow.length)} className={buyNow.length ? "text-good" : ""} />
          <Stat
            label={
              <span className="inline-flex items-center gap-1">
                Coste en venta
                <Hint label="Coste de lo que está en venta">
                  Lo que costaría comprar ahora, al precio más barato, las {onSale.length} piezas que te faltan y están en la subasta.
                </Hint>
              </span>
            }
            value={formatMoney(total)}
          />
        </section>
      )}

      <details className="card" open={items.length === 0}>
        <summary className="font-medium text-gold">＋ Añadir pieza</summary>
        <WishForm back={back} tokenField={tokenField} />
      </details>

      {pending.length === 0 ? (
        <p className="card text-sm text-muted">
          {items.length === 0 ? "Tu lista está vacía. Añade la primera pieza arriba o desde la ficha de cualquier objeto." : "¡Lo tienes todo! 🎉"}
        </p>
      ) : (
        <ul className="list">
          {bySlot.map(({ i, a }) => (
            <li key={i.item_id} className="space-y-2 px-4 py-3">
              <WishLine i={i} lang={lang} houseId={house.id} />
              <p className={`text-xs ${a.className}`}>{a.label}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <form action={toggleObtained} className="flex gap-2">
                  <input type="hidden" name="itemId" value={i.item_id} />
                  <input type="hidden" name="obtained" value="1" />
                  <input type="hidden" name="back" value={back} />
                  {tokenField}
                  <button className="min-h-9 rounded-lg border border-good/60 px-3 text-good">✓ La tengo</button>
                </form>
                <a href={wowheadItemUrl(i.item_id, lang)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-muted hover:text-fg">
                  Dónde sale ↗
                </a>
                <details className="w-full">
                  <summary className="py-1 text-gold">✎ Editar</summary>
                  <WishForm back={back} tokenField={tokenField} wish={i} />
                  <form action={removeWish} className="mt-2 flex gap-2">
                    <input type="hidden" name="itemId" value={i.item_id} />
                    <input type="hidden" name="back" value={back} />
                    {tokenField}
                    <button className="btn-ghost text-bad">Quitar de la lista</button>
                  </form>
                </details>
              </div>
            </li>
          ))}
        </ul>
      )}

      {obtained.length > 0 && (
        <details className="text-sm">
          <summary className="py-1 text-muted">Ya las tienes ({obtained.length})</summary>
          <ul className="mt-2 list">
            {obtained.map((i) => (
              <li key={i.item_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="flex min-w-0 items-center gap-2 opacity-70">
                  <ItemIcon src={i.icon_url} quality={i.quality} size={22} />
                  <span className="truncate line-through">{pick(i.name_en, i.name_es, lang) ?? `#${i.item_id}`}</span>
                </span>
                <form action={toggleObtained} className="flex shrink-0 gap-2">
                  <input type="hidden" name="itemId" value={i.item_id} />
                  <input type="hidden" name="obtained" value="0" />
                  <input type="hidden" name="back" value={back} />
                  {tokenField}
                  <button className="min-h-8 rounded border border-line px-2 text-xs text-muted">Devolver a la lista</button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs text-muted">
        Esta lista la haces tú: la web no copia listas de BiS de otras páginas. Si buscas ideas, la ficha de Wowhead de cada pieza dice de
        dónde sale.
      </p>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: ReactNode; value: string; className?: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`mt-0.5 font-mono ${className}`}>{value}</p>
    </div>
  );
}

function WishLine({ i, lang, houseId }: { i: WishItem; lang: Lang; houseId: number }) {
  const l = i.latest;
  const meta = [
    i.slot ? SLOTS[i.slot] : null,
    i.item_level ? `nivel de objeto ${i.item_level}` : null,
    i.required_level ? `requiere ${i.required_level}` : null,
  ].filter(Boolean);
  return (
    <Link href={`/item/${i.item_id}?house=${houseId}`} className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-3">
        <ItemIcon src={i.icon_url} quality={i.quality} />
        <span className="min-w-0">
          <span className={`line-clamp-2 font-medium leading-snug q-${i.quality ?? "COMMON"}`}>{pick(i.name_en, i.name_es, lang) ?? `Objeto #${i.item_id}`}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className={`rounded border px-1.5 py-px ${PRIORITY_CLASS[i.priority]}`}>prioridad {PRIORITY[i.priority].toLowerCase()}</span>
            {meta.join(" · ")}
          </span>
          {i.note && <span className="block text-xs text-muted">{i.note}</span>}
        </span>
      </span>
      <span className="shrink-0 text-right font-mono text-sm">
        {l ? <span className="block text-gold">{formatMoney(l.min_buyout)}</span> : <span className="block text-xs text-muted">no hay</span>}
        {l?.market_7d != null && <span className="block text-[11px] text-muted">normal {formatMoney(l.market_7d)}</span>}
        {i.low30 !== null && <span className="block text-[11px] text-muted">mín. mes {formatMoney(i.low30)}</span>}
        {i.max_price !== null && <span className="block text-[11px] text-fg">tu máx. {formatMoney(i.max_price)}</span>}
      </span>
    </Link>
  );
}
