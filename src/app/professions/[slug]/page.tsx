import Link from "next/link";
import { Suspense } from "react";
import { HouseTabs } from "@/components/HouseTabs";
import { Loading, NoHousesNotice, NoRecipesNotice, SetupNotice } from "@/components/notices";
import { isConfigured } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { craftEconomics, type CraftResult } from "@/lib/professions/craft";
import { ahCutFor, itemData, recipesFor, type RecipeRow } from "@/lib/professions/queries";
import { trackedHouses } from "@/lib/queries";

const SORTS = { profit: "Beneficio", margin: "Margen", cost: "Coste", name: "Nombre" } as const;
type Sort = keyof typeof SORTS;

export default function Page(props: PageProps<"/professions/[slug]">) {
  return (
    <div className="space-y-4">
      <Link href="/professions" className="text-sm text-muted">
        ← Profesiones
      </Link>
      <Suspense fallback={<Loading />}>
        <Recipes {...props} />
      </Suspense>
    </div>
  );
}

/** Los nulos van siempre al final, sea cual sea el orden. */
function byNumber(pick: (c: CraftResult) => number | null, dir: 1 | -1) {
  return (a: { calc: CraftResult }, b: { calc: CraftResult }) => {
    const x = pick(a.calc);
    const y = pick(b.calc);
    if (x === null || y === null) return Number(x === null) - Number(y === null);
    return (x - y) * dir;
  };
}

async function Recipes({ params, searchParams }: PageProps<"/professions/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  if (!isConfigured()) return <SetupNotice />;

  const [houses, recipes] = await Promise.all([trackedHouses(), recipesFor(slug)]);
  if (recipes.length === 0) return <NoRecipesNotice />;
  if (houses.length === 0) return <NoHousesNotice />;

  const house = houses.find((h) => String(h.id) === sp.house) ?? houses[0];
  const sort: Sort = typeof sp.sort === "string" && sp.sort in SORTS ? (sp.sort as Sort) : "profit";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const itemIds = new Set<number>();
  for (const r of recipes) {
    if (r.yields_item !== null) itemIds.add(r.yields_item);
    for (const g of r.recipe_reagents) itemIds.add(g.item_id);
  }
  const [{ prices, vendorSell, info, updatedAt }, { cut, confirmed }] = await Promise.all([itemData(house.id, [...itemIds]), ahCutFor(house.faction)]);

  const rows = recipes
    .filter((r) => !q || r.name_en.toLowerCase().includes(q.toLowerCase()))
    .map((recipe) => ({
      recipe,
      calc: craftEconomics(
        { yieldsItem: recipe.yields_item, yieldsQty: Number(recipe.yields_qty), reagents: recipe.recipe_reagents.map((g) => ({ itemId: g.item_id, qty: g.qty })) },
        prices,
        vendorSell,
        cut,
      ),
    }));

  if (sort === "name") rows.sort((a, b) => a.recipe.name_en.localeCompare(b.recipe.name_en));
  else if (sort === "cost") rows.sort(byNumber((c) => c.cost, 1));
  else if (sort === "margin") rows.sort(byNumber((c) => c.margin, -1));
  else rows.sort(byNumber((c) => c.profit, -1));

  const profitable = rows.filter((r) => (r.calc.profit ?? 0) > 0).length;
  const href = (over: { house?: number; sort?: Sort }) => {
    const p = new URLSearchParams({ house: String(over.house ?? house.id), sort: over.sort ?? sort });
    if (q) p.set("q", q);
    return `/professions/${slug}?${p}`;
  };
  const itemName = (id: number) => info.get(id)?.name ?? `Objeto #${id}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{recipes[0].profession}</h1>
        <p className="text-xs text-muted">
          {recipes.length.toLocaleString("es-ES")} recetas · {profitable} con beneficio ahora
          {updatedAt && ` · precios de ${new Date(updatedAt).toLocaleString("es-ES", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" })}`}
        </p>
      </div>

      <form action={`/professions/${slug}`} className="flex gap-2">
        <input type="hidden" name="house" value={house.id} />
        <input type="hidden" name="sort" value={sort} />
        <input className="input" type="search" name="q" defaultValue={q} placeholder="Buscar receta" enterKeyHint="search" />
        <button className="btn shrink-0">Buscar</button>
      </form>

      <HouseTabs houses={houses} current={house.id} hrefFor={(id) => href({ house: id })} />

      <div className="flex gap-2 overflow-x-auto text-sm">
        {(Object.keys(SORTS) as Sort[]).map((s) => (
          <Link key={s} href={href({ sort: s })} className={`min-h-9 shrink-0 rounded-full border px-3 py-1.5 ${s === sort ? "border-gold text-gold" : "border-line text-muted"}`}>
            {SORTS[s]}
          </Link>
        ))}
      </div>

      {!confirmed && (
        <p className="card text-sm text-bad">La comisión de venta de esta casa está sin confirmar: el beneficio se calcula con un 5% provisional.</p>
      )}
      {prices.size === 0 && <p className="card text-sm text-muted">Aún no hay precios de esta casa. Ejecuta pnpm ingest.</p>}

      {rows.length === 0 ? (
        <p className="card text-sm text-muted">Ninguna receta coincide con “{q}”.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map(({ recipe, calc }) => (
            <li key={recipe.id}>
              <RecipeItem recipe={recipe} calc={calc} houseId={house.id} itemName={itemName} quality={recipe.yields_item === null ? null : (info.get(recipe.yields_item)?.quality ?? null)} prices={prices} />
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted">
        Coste: materiales comprados al precio de mercado (media del 15% más barato). Beneficio: vender al mínimo actual menos la
        comisión del {Math.round(cut * 100)}%, o a un vendedor si paga más. No incluye el depósito de publicación.
      </p>
    </div>
  );
}

function RecipeItem({
  recipe,
  calc,
  houseId,
  itemName,
  quality,
  prices,
}: {
  recipe: RecipeRow;
  calc: CraftResult;
  houseId: number;
  itemName: (id: number) => string;
  quality: string | null;
  prices: ReadonlyMap<number, { min: number; market: number }>;
}) {
  const profitClass = calc.profit === null ? "text-muted" : calc.profit > 0 ? "text-good" : "text-bad";
  const qty = Number(recipe.yields_qty);
  const meta = [recipe.category, recipe.tier, recipe.skill_req ? `nivel ${recipe.skill_req}` : null].filter(Boolean).join(" · ");

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 active:bg-surface-2">
        <div className="min-w-0">
          <p className={`truncate font-medium q-${quality ?? "COMMON"}`}>
            {recipe.name_en}
            {qty !== 1 && <span className="text-muted"> ×{qty}</span>}
          </p>
          {meta && <p className="truncate text-xs text-muted">{meta}</p>}
        </div>
        <div className="shrink-0 text-right font-mono text-sm">
          <p className={profitClass}>
            {calc.profit === null ? "—" : `${calc.profit > 0 ? "+" : ""}${formatMoney(calc.profit)}`}
            {calc.margin !== null && <span className="text-xs"> ({Math.round(calc.margin * 100)}%)</span>}
          </p>
          <p className="text-xs text-muted">coste {calc.cost === null ? (calc.knownCost > 0 ? `> ${formatMoney(calc.knownCost)}` : "—") : formatMoney(calc.cost)}</p>
        </div>
      </summary>

      <div className="space-y-2 border-t border-line bg-surface-2 px-4 py-3 text-sm">
        {recipe.recipe_reagents.length === 0 ? (
          <p className="text-muted">La API no indica los materiales de esta receta.</p>
        ) : (
          <ul className="space-y-1">
            {recipe.recipe_reagents.map((g) => {
              const p = prices.get(g.item_id);
              return (
                <li key={g.item_id} className="flex justify-between gap-3">
                  <Link href={`/item/${g.item_id}?house=${houseId}`} className="min-w-0 truncate underline decoration-line underline-offset-2">
                    {g.qty} × {itemName(g.item_id)}
                  </Link>
                  <span className={`shrink-0 font-mono ${p ? "" : "text-bad"}`}>{p ? formatMoney(p.market * g.qty) : "sin stock"}</span>
                </li>
              );
            })}
          </ul>
        )}

        <dl className="space-y-1 border-t border-line pt-2">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Vender en la subasta (neto)</dt>
            <dd className="font-mono">{calc.ahRevenue === null ? "sin stock" : formatMoney(calc.ahRevenue)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Vender a un vendedor</dt>
            <dd className="font-mono">{formatMoney(calc.vendorRevenue)}</dd>
          </div>
        </dl>

        {recipe.yields_item === null ? (
          <p className="text-xs text-muted">La API no indica qué objeto fabrica esta receta, así que no se puede calcular el beneficio.</p>
        ) : (
          <Link href={`/item/${recipe.yields_item}?house=${houseId}`} className="inline-block py-1 text-xs text-gold underline">
            Ver precios de {itemName(recipe.yields_item)}
          </Link>
        )}
      </div>
    </details>
  );
}
