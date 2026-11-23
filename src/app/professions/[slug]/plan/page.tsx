import Link from "next/link";
import { Suspense } from "react";
import { Hint } from "@/components/Hint";
import { HouseTabs } from "@/components/HouseTabs";
import { ItemIcon } from "@/components/ItemIcon";
import { Loading, NoHousesNotice, NoRecipesNotice, SetupNotice } from "@/components/notices";
import { PageIntro } from "@/components/PageIntro";
import { isConfigured } from "@/lib/env";
import { pick } from "@/lib/lang";
import { nameLang } from "@/lib/lang-server";
import { formatMoney } from "@/lib/money";
import { MAX_SKILL } from "@/lib/professions/leveling";
import { buildPlan, colorAt } from "@/lib/professions/plan";
import { economySettings, marketData, recipesFor } from "@/lib/professions/queries";
import { browserProfessions } from "@/lib/prefs";
import { trackedHouses } from "@/lib/queries";

const SOURCE: Record<string, string> = { item: "oficial", manual: "corregido", classic: "aprox. (Classic)", estimate: "aprox." };
const COLOR_CLASS = { orange: "text-[#f0933f]", yellow: "text-[#e5d35b]", green: "text-good", grey: "text-muted" } as const;
const VIA = { ah: "subasta", vendor: "vendedor", craft: "fabricar" } as const;
/** Profesiones que suben sobre todo recogiendo. */
const GATHERING = ["mining", "herbalism", "skinning", "fishing"];
/** Si la ruta cuesta esto o menos frente a una semana normal, es buen momento (CLAUDE.md, Fase 4). */
const GOOD_MOMENT = 0.85;

export default function Page(props: PageProps<"/professions/[slug]/plan">) {
  return (
    <div className="space-y-4">
      <Suspense fallback={<Loading />}>
        <Planner {...props} />
      </Suspense>
    </div>
  );
}

const clampSkill = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(MAX_SKILL, Math.max(1, Math.round(n))) : fallback;
};

async function Planner({ params, searchParams }: PageProps<"/professions/[slug]/plan">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  if (!isConfigured()) return <SetupNotice />;

  const [houses, recipes] = await Promise.all([trackedHouses(), recipesFor(slug)]);
  if (recipes.length === 0) return <NoRecipesNotice />;
  if (houses.length === 0) return <NoHousesNotice />;
  const house = houses.find((h) => String(h.id) === sp.house) ?? houses[0];

  const from = clampSkill(sp.from, 1);
  const to = Math.max(from + 1, clampSkill(sp.to, MAX_SKILL));
  const includeUnlisted = sp.planos === "todos";
  const sellOnAh = sp.vender === "subasta";
  const lang = await nameLang();
  const profession = pick(recipes[0].profession, recipes[0].profession_es, lang) ?? recipes[0].profession;
  const submitted = typeof sp.from === "string";

  const settings = await economySettings(house.faction, await browserProfessions());
  const craftable = await recipesFor([...new Set([...settings.myProfessions, slug])]);
  const ids = new Set<number>();
  for (const r of [...recipes, ...craftable]) {
    for (const id of [r.yields_item, r.learned_from_item, ...r.recipe_reagents.map((g) => g.item_id)]) {
      if (typeof id === "number") ids.add(id);
    }
  }
  const { markets, info } = await marketData(house.id, [...ids]);
  const name = (id: number) => pick(info.get(id)?.name, info.get(id)?.nameEs, lang) ?? `Objeto #${id}`;
  const recipesName = (rows: { id: number; name_en: string; name_es: string | null }[], id?: number) => {
    const r = rows.find((x) => x.id === id);
    return r ? (pick(r.name_en, r.name_es, lang) ?? r.name_en) : "receta";
  };

  const plan = submitted ? buildPlan({ recipes, craftable, markets, settings, from, to, includeUnlistedPlans: includeUnlisted, sellOnAh }) : null;
  const ratio = plan?.medianCost ? plan.route.cost / plan.medianCost : null;

  return (
    <div className="space-y-4">
      <Link href={`/professions/${slug}?house=${house.id}`} className="text-sm text-muted">
        ← {profession}
      </Link>
      <PageIntro
        eyebrow="Planificador"
        title={`Subir ${profession}`}
        summary="Calcula qué recetas fabricar, en qué orden y qué comprar para subir de nivel gastando lo mínimo con los precios de ahora."
        steps={[
          "Pon tu nivel actual de la profesión y el nivel al que quieres llegar, y pulsa “Calcular la ruta más barata”.",
          "Arriba verás el coste total y si ahora es buen momento (más barato que una semana normal) o conviene esperar.",
          "“Lista de la compra”: lo que tienes que comprar en la subasta o al vendedor. “Fabricar tú”: materiales intermedios que te sale más barato hacer (p. ej. barras).",
          "“Qué fabricar”: las recetas en orden, con los niveles en los que usar cada una y cuántas veces.",
        ]}
      />

      {GATHERING.includes(slug) && (
        <p className="card text-sm text-muted">
          {profession} sube sobre todo recogiendo en el mundo. Aquí solo se calcula lo que puedes subir fabricando
          {slug === "mining" ? " (fundir)" : ""}: los tramos sin receta los tendrás que subir recogiendo.
        </p>
      )}

      <HouseTabs houses={houses} current={house.id} hrefFor={(id) => `/professions/${slug}/plan?house=${id}&from=${from}&to=${to}${sellOnAh ? "&vender=subasta" : ""}${includeUnlisted ? "&planos=todos" : ""}`} />

      <form action={`/professions/${slug}/plan`} className="card grid grid-cols-2 gap-3">
        <input type="hidden" name="house" value={house.id} />
        <label className="text-sm">
          <span className="text-muted">Tu nivel ahora</span>
          <input className="input mt-1" type="number" name="from" min={1} max={MAX_SKILL - 1} defaultValue={from} inputMode="numeric" required />
        </label>
        <label className="text-sm">
          <span className="text-muted">Quiero llegar a</span>
          <input className="input mt-1" type="number" name="to" min={2} max={MAX_SKILL} defaultValue={to} inputMode="numeric" required />
        </label>
        <label className="col-span-2 flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="planos" value="todos" defaultChecked={includeUnlisted} className="h-4 w-4 accent-[#e0b354]" />
          <span>
            Usar también recetas de planos que ahora no se venden en la subasta{" "}
            <span className="text-xs">(márcalo si ya las tienes aprendidas)</span>
          </span>
        </label>
        <label className="col-span-2 flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="vender" value="subasta" defaultChecked={sellOnAh} className="h-4 w-4 accent-[#e0b354]" />
          <span>
            Descontar lo que sacaría vendiendo lo fabricado en la subasta{" "}
            <span className="text-xs">(optimista; si no, solo cuenta lo que paga el vendedor, que es seguro)</span>
          </span>
        </label>
        <button className="btn col-span-2">Calcular la ruta más barata</button>
      </form>

      {!plan ? (
        <p className="text-sm text-muted">Pon tu nivel actual y al que quieres llegar, y pulsa el botón.</p>
      ) : plan.route.steps.length === 0 ? (
        <p className="card text-sm text-bad">
          No hay ninguna receta con precio que dé puntos en el nivel {from}. Puede faltar el nivel de alguna receta o el precio de sus
          materiales.
        </p>
      ) : (
        <>
          <section className="card space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-medium">
                Del {from} al {plan.route.reached}
                <span className="block text-xs font-normal text-muted">coste total estimado</span>
              </h2>
              <p className="font-mono text-lg text-gold">{formatMoney(plan.route.cost)}</p>
            </div>
            <dl className="space-y-1 text-sm">
              <Row label="Materiales" value={formatMoney(plan.materials)} />
              <Row label={sellOnAh ? "Recuperas vendiendo (est.)" : "Recuperas vendiendo al vendedor"} value={`− ${formatMoney(plan.resale)}`} />
              {plan.plansToBuy.length > 0 && <Row label="Planos a comprar" value={formatMoney(plan.plansToBuy.reduce((s, p) => s + p.price, 0))} />}
              <Row label="Veces que fabricarás" value={`≈ ${Math.ceil(plan.route.crafts)}`} />
            </dl>
            {plan.route.reached < to && (
              <p className="text-sm text-bad">
                No se puede llegar a {to}: a partir de {plan.route.reached} ninguna receta con precio da puntos.
              </p>
            )}
            {ratio !== null && (
              <p className={`text-sm ${ratio <= GOOD_MOMENT ? "text-good" : ratio >= 1.15 ? "text-bad" : "text-muted"}`}>
                {ratio <= GOOD_MOMENT
                  ? `Buen momento: ahora cuesta un ${Math.round((1 - ratio) * 100)}% menos que en una semana normal (${formatMoney(plan.medianCost)}).`
                  : ratio >= 1.15
                    ? `Mal momento: ahora cuesta un ${Math.round((ratio - 1) * 100)}% más que en una semana normal (${formatMoney(plan.medianCost)}). Si puedes, espera.`
                    : `Precio normal: una semana normal costaría ${formatMoney(plan.medianCost)}.`}
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="flex items-center gap-1 text-sm font-medium text-muted">
              Lista de la compra
              <Hint label="Cómo usar la lista de la compra">
                Todo lo que tienes que comprar para la ruta entera. Debajo de cada línea: dónde comprarlo (subasta o vendedor) y el precio por
                unidad. <span className="text-good">Barato ahora</span> = buen momento para comprarlo;{" "}
                <span className="text-bad">caro ahora</span> = si puedes, espera o recógelo tú. Si ya lo tienes en las bolsas, no lo compres.
              </Hint>
            </h2>
            <ul className="list text-sm">
              {plan.plansToBuy.map((p) => (
                <li key={`plan-${p.recipeId}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link href={`/item/${p.itemId}?house=${house.id}`} className="flex min-w-0 items-center gap-2">
                    <ItemIcon src={info.get(p.itemId)?.icon} quality={info.get(p.itemId)?.quality} size={22} />
                    <span className="truncate">1 × {name(p.itemId)}</span>
                  </Link>
                  <span className="shrink-0 font-mono">{formatMoney(p.price)}</span>
                </li>
              ))}
              {plan.shopping
                .filter((l) => l.via !== "craft")
                .map((l) => {
                  const cheap = l.discount !== null && l.discount >= 0.1;
                  const dear = l.discount !== null && l.discount <= -0.15;
                  const short = l.available !== null && l.qty > l.available;
                  return (
                    <li key={`${l.itemId}-${l.via}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <Link href={`/item/${l.itemId}?house=${house.id}`} className="flex min-w-0 items-center gap-2">
                        <ItemIcon src={info.get(l.itemId)?.icon} quality={info.get(l.itemId)?.quality} size={22} />
                        <span className="min-w-0">
                          <span className="block truncate">
                            {l.qty} × {name(l.itemId)}
                          </span>
                          <span className="block text-[11px] text-muted">
                            {VIA[l.via]} · {formatMoney(l.unit)} c/u
                            {cheap && <span className="text-good"> · barato ahora (−{Math.round(l.discount! * 100)}%)</span>}
                            {dear && <span className="text-bad"> · caro ahora (+{Math.round(-l.discount! * 100)}%)</span>}
                            {short && <span className="text-bad"> · solo hay {l.available} en venta: el precio subirá al comprar más</span>}
                          </span>
                        </span>
                      </Link>
                      <span className="shrink-0 font-mono">{formatMoney(l.unit * l.qty)}</span>
                    </li>
                  );
                })}
            </ul>
            {plan.shopping.some((l) => l.via === "craft") && (
              <>
                <h3 className="pt-2 text-xs font-medium text-muted">Fabricar tú (sus materiales ya están en la lista de arriba)</h3>
                <ul className="list text-sm">
                  {plan.shopping
                    .filter((l) => l.via === "craft")
                    .map((l) => (
                      <li key={`${l.itemId}-craft`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <Link href={`/item/${l.itemId}?house=${house.id}`} className="flex min-w-0 items-center gap-2">
                          <ItemIcon src={info.get(l.itemId)?.icon} quality={info.get(l.itemId)?.quality} size={22} />
                          <span className="truncate">
                            {l.qty} × {name(l.itemId)}
                          </span>
                        </Link>
                        <span className="shrink-0 text-right text-xs text-muted">
                          {recipesName(craftable, l.recipeId)}
                          <span className="block font-mono">{formatMoney(l.unit)} c/u</span>
                        </span>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="flex items-center gap-1 text-sm font-medium text-muted">
              Qué fabricar, en orden
              <Hint label="Cómo leer los pasos">
                <b>125–150</b>: usa esa receta desde el nivel 125 hasta el 150. <b>≈ N veces</b>: cuántas fabricaciones hacen falta de media
                (las amarillas y verdes no siempre suben). El color del nombre es el color de la receta al empezar el tramo. A la derecha, lo
                que cuesta ese tramo.
              </Hint>
            </h2>
            <ol className="list text-sm">
              {plan.route.steps.map((st) => {
                const c = plan.byId.get(st.recipeId)!;
                const color = colorAt(c.colors, st.from);
                return (
                  <li key={`${st.recipeId}-${st.from}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate">
                        <span className="font-mono text-muted">
                          {st.from}–{st.to}
                        </span>{" "}
                        <span className={color ? COLOR_CLASS[color] : ""}>{pick(c.recipe.name_en, c.recipe.name_es, lang)}</span>
                      </p>
                      <p className="text-xs text-muted">
                        ≈ {Math.ceil(st.crafts)} veces · nivel {c.recipe.skill_req} ({SOURCE[c.recipe.skill_source ?? "estimate"]})
                        {c.recipe.learned_from_item !== null && " · planos"}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono">{formatMoney(st.cost)}</span>
                  </li>
                );
              })}
            </ol>
          </section>

          <div className="space-y-1 text-xs text-muted">
            <p>
              Los niveles marcados “aprox.” no los da la API: se estiman a partir del nivel del objeto (o de Classic) y pueden fallar por
              ±25. Los colores salen de la regla naranja → amarillo +{settings.colorOffsets.yellow} → verde +{settings.colorOffsets.green}{" "}
              → gris +{settings.colorOffsets.grey}. Si en el juego no cuadra, corrígelo en la receta.
            </p>
            <p>
              Probabilidad de subir: naranja {pct(settings.chances.orange)}, amarillo {pct(settings.chances.yellow)}, verde{" "}
              {pct(settings.chances.green)}. Lo que ya tengas en las bolsas cuenta a precio de subasta, que es lo que sacarías vendiéndolo.
            </p>
            {(plan.skipped.noPrice > 0 || plan.skipped.noSkill > 0 || plan.skipped.unlistedPlans > 0) && (
              <p>
                Fuera del cálculo: {plan.skipped.noPrice} recetas sin precio de algún material, {plan.skipped.noSkill} sin nivel
                {!includeUnlisted && `, ${plan.skipped.unlistedPlans} con planos que no están en venta`}.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;


function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-mono">{value}</dd>
    </div>
  );
}
