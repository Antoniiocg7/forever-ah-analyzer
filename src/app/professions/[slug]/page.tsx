import Link from "next/link";
import { Suspense } from "react";
import { HouseTabs } from "@/components/HouseTabs";
import { ItemIcon } from "@/components/ItemIcon";
import { Loading, NoHousesNotice, NoRecipesNotice, SetupNotice } from "@/components/notices";
import { adminTokenRequired } from "@/lib/admin";
import { isConfigured } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { craftCosts, craftEconomics, type CraftResult, type Liquidity } from "@/lib/professions/craft";
import { colorsFor, type ColorOffsets } from "@/lib/professions/leveling";
import { economySettings, marketData, recipesFor, toRecipeInput, type ItemInfo, type RecipeRow } from "@/lib/professions/queries";
import { trackedHouses } from "@/lib/queries";
import { saveRecipeSkill } from "../actions";

const SORTS = { profit: "Beneficio", margin: "Margen", cost: "Coste", name: "Nombre" } as const;
type Sort = keyof typeof SORTS;

const LIQUIDITY: Record<Liquidity, { label: string; className: string } | null> = {
  ok: null,
  unknown: null,
  thin: { label: "poco mercado", className: "border-bad text-bad" },
  none: { label: "sin mercado", className: "border-line text-muted" },
};

const VIA = { ah: "subasta", vendor: "vendedor", craft: "fabricando" } as const;
const SOURCE: Record<string, string> = { item: "oficial", manual: "corregido por ti", classic: "aprox. (Classic)", estimate: "aprox." };
const MESSAGES: Record<string, { text: string; ok: boolean }> = {
  ok: { text: "Nivel guardado. El planificador ya lo usa.", ok: true },
  reset: { text: "Corrección quitada. Se volverá a estimar con pnpm sync-skills.", ok: true },
  token: { text: "La contraseña de administración no es correcta.", ok: false },
  invalid: { text: "Niveles no válidos: tienen que ir de menor a mayor (naranja ≤ amarillo ≤ verde ≤ gris).", ok: false },
};

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
  const reliable = sp.fiables === "1";

  const settings = await economySettings(house.faction);
  // Para abaratar materiales se pueden fabricar con tus profesiones (p. ej. fundir barras).
  const craftable = await recipesFor([...new Set([...settings.myProfessions, slug])]);
  const craftInputs = craftable.map(toRecipeInput);

  const itemIds = new Set<number>();
  for (const r of [...recipes, ...craftable]) {
    if (r.yields_item !== null) itemIds.add(r.yields_item);
    for (const g of r.recipe_reagents) itemIds.add(g.item_id);
  }
  const { markets, info, updatedAt } = await marketData(house.id, [...itemIds]);
  const crafted = craftCosts(craftInputs, markets);
  const recipeName = new Map(craftable.map((r) => [r.id, r.name_en]));

  const all = recipes.map((recipe) => ({
    recipe,
    calc: craftEconomics(toRecipeInput(recipe), markets, crafted, settings.cut, settings.deposit),
  }));
  const rows = all.filter(
    ({ recipe, calc }) =>
      (!q || recipe.name_en.toLowerCase().includes(q.toLowerCase())) &&
      (!reliable || (calc.profit !== null && calc.profit > 0 && (calc.liquidity === "ok" || calc.liquidity === "unknown"))),
  );

  if (sort === "name") rows.sort((a, b) => a.recipe.name_en.localeCompare(b.recipe.name_en));
  else if (sort === "cost") rows.sort(byNumber((c) => c.cost, 1));
  else if (sort === "margin") rows.sort(byNumber((c) => c.margin, -1));
  else rows.sort(byNumber((c) => c.profit, -1));

  const profitable = all.filter((r) => (r.calc.profit ?? 0) > 0).length;
  const href = (over: { house?: number; sort?: Sort; fiables?: boolean }) => {
    const p = new URLSearchParams({ house: String(over.house ?? house.id), sort: over.sort ?? sort });
    if (q) p.set("q", q);
    if (over.fiables ?? reliable) p.set("fiables", "1");
    return `/professions/${slug}?${p}`;
  };
  const chip = (active: boolean) => `min-h-9 shrink-0 rounded-full border px-3 py-1.5 ${active ? "border-gold text-gold" : "border-line text-muted"}`;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
        <h1 className="text-xl font-semibold">{recipes[0].profession}</h1>
        <p className="text-xs text-muted">
          {recipes.length.toLocaleString("es-ES")} recetas · {profitable} con beneficio ahora
          {updatedAt && ` · precios de ${new Date(updatedAt).toLocaleString("es-ES", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" })}`}
        </p>
        </div>
        <Link href={`/professions/${slug}/plan?house=${house.id}`} className="btn shrink-0 text-sm">
          Planificar subida
        </Link>
      </div>

      <form action={`/professions/${slug}`} className="flex gap-2">
        <input type="hidden" name="house" value={house.id} />
        <input type="hidden" name="sort" value={sort} />
        {reliable && <input type="hidden" name="fiables" value="1" />}
        <input className="input" type="search" name="q" defaultValue={q} placeholder="Buscar receta" enterKeyHint="search" />
        <button className="btn shrink-0">Buscar</button>
      </form>

      <HouseTabs houses={houses} current={house.id} hrefFor={(id) => href({ house: id })} />

      <div className="flex gap-2 overflow-x-auto text-sm">
        <Link href={href({ fiables: !reliable })} className={chip(reliable)} aria-pressed={reliable}>
          Solo rentables con mercado
        </Link>
        {(Object.keys(SORTS) as Sort[]).map((s) => (
          <Link key={s} href={href({ sort: s })} className={chip(s === sort)}>
            {SORTS[s]}
          </Link>
        ))}
      </div>

      {typeof sp.msg === "string" && MESSAGES[sp.msg] && (
        <p className={`card text-sm ${MESSAGES[sp.msg].ok ? "text-good" : "text-bad"}`}>{MESSAGES[sp.msg].text}</p>
      )}
      {!settings.cutConfirmed && (
        <p className="card text-sm text-bad">La comisión de venta de esta casa está sin confirmar: el beneficio se calcula con un 5% provisional.</p>
      )}
      {!updatedAt && <p className="card text-sm text-muted">Aún no hay precios de esta casa. Ejecuta pnpm ingest.</p>}

      {rows.length === 0 ? (
        <p className="card text-sm text-muted">{q ? `Ninguna receta coincide con “${q}”.` : "Ninguna receta cumple el filtro ahora mismo."}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map(({ recipe, calc }) => (
            <li key={recipe.id}>
              <RecipeItem
                recipe={recipe}
                calc={calc}
                houseId={house.id}
                info={info}
                recipeName={recipeName}
                offsets={settings.colorOffsets}
                back={href({})}
                needToken={adminTokenRequired()}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1 text-xs text-muted">
        <p>
          <b>Coste</b>: cada material al precio más bajo entre la subasta (mercado actual), un vendedor y fabricarlo tú con tus
          profesiones ({settings.myProfessions.join(", ") || "ninguna elegida"}; se cambian en{" "}
          <Link href="/professions" className="underline">
            Profesiones → Mis profesiones
          </Link>
          ).
        </p>
        <p>
          <b>Venta</b>: el menor entre el mínimo actual y la mediana de 7 días, menos la comisión del {Math.round(settings.cut * 100)}%; o a un
          vendedor si paga más. El depósito no se resta porque se recupera al vender.
        </p>
        <p>
          <b>Poco mercado</b>: el producto tiene 1–2 subastas y menos de una venta al día estimada; su precio puede ser el de un solo
          vendedor.
        </p>
      </div>
    </div>
  );
}

function RecipeItem({
  recipe,
  calc,
  houseId,
  info,
  recipeName,
  offsets,
  back,
  needToken,
}: {
  recipe: RecipeRow;
  calc: CraftResult;
  houseId: number;
  info: ReadonlyMap<number, ItemInfo>;
  recipeName: ReadonlyMap<number, string>;
  offsets: ColorOffsets;
  back: string;
  needToken: boolean;
}) {
  const profitClass = calc.profit === null ? "text-muted" : calc.profit > 0 ? "text-good" : "text-bad";
  const qty = Number(recipe.yields_qty);
  const product = recipe.yields_item === null ? null : info.get(recipe.yields_item);
  const itemName = (id: number) => info.get(id)?.name ?? `Objeto #${id}`;
  const badge = LIQUIDITY[calc.liquidity];
  const approx = recipe.skill_source === "estimate" || recipe.skill_source === "classic";
  const meta = [recipe.category, recipe.skill_req ? `nivel ${recipe.skill_req}${approx ? " aprox." : ""}` : null].filter(Boolean).join(" · ");
  const colors = recipe.skill_req
    ? colorsFor({ skillReq: recipe.skill_req, orange: recipe.orange, yellow: recipe.yellow, green: recipe.green, grey: recipe.grey }, offsets)
    : null;
  const isEnchant = recipe.yields_item === null && recipe.profession_slug === "enchanting";

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 active:bg-surface-2">
        <div className="flex min-w-0 items-center gap-3">
          <ItemIcon src={product?.icon} quality={product?.quality} />
          <div className="min-w-0">
            <p className={`truncate font-medium q-${product?.quality ?? "COMMON"}`}>
              {recipe.name_en}
              {qty !== 1 && <span className="text-muted"> ×{qty}</span>}
            </p>
            <p className="flex items-center gap-2 truncate text-xs text-muted">
              {badge && <span className={`shrink-0 rounded border px-1 ${badge.className}`}>{badge.label}</span>}
              {calc.product?.soldPerDay != null && <span className="shrink-0">≈{calc.product.soldPerDay}/día</span>}
              <span className="truncate">{meta}</span>
            </p>
          </div>
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
        {calc.lines.length === 0 ? (
          <p className="text-muted">La API no indica los materiales de esta receta.</p>
        ) : (
          <ul className="space-y-1.5">
            {calc.lines.map((l) => (
              <li key={l.itemId} className="flex items-center justify-between gap-3">
                <Link href={`/item/${l.itemId}?house=${houseId}`} className="flex min-w-0 items-center gap-2">
                  <ItemIcon src={info.get(l.itemId)?.icon} quality={info.get(l.itemId)?.quality} size={20} />
                  <span className="truncate underline decoration-line underline-offset-2">
                    {l.qty} × {itemName(l.itemId)}
                  </span>
                </Link>
                <span className="shrink-0 text-right font-mono">
                  {l.total === null ? (
                    <span className="text-bad">sin precio</span>
                  ) : (
                    <>
                      {formatMoney(l.total)}
                      <span className="block text-[11px] text-muted">
                        {l.acquire?.via === "craft" && l.acquire.recipeId ? `fabricando (${recipeName.get(l.acquire.recipeId) ?? "receta"})` : VIA[l.acquire!.via]}
                      </span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {isEnchant ? (
          <p className="border-t border-line pt-2 text-xs text-muted">Los encantamientos se aplican a un objeto: no se venden en la subasta, solo su coste es útil.</p>
        ) : (
          <dl className="space-y-1 border-t border-line pt-2">
            <Row label="Precio de venta (unidad)" value={calc.sellUnit === null ? "sin datos" : formatMoney(calc.sellUnit)} />
            {calc.product && <Row label="Mínimo ahora · mediana 7 d" value={`${formatMoney(calc.product.min)} · ${formatMoney(calc.product.market7d)}`} />}
            {calc.product && <Row label="En venta" value={`${calc.product.qty} uds en ${calc.product.numAuctions} subastas`} />}
            <Row label="Vender en la subasta (neto)" value={calc.ahRevenue === null ? "sin datos" : formatMoney(calc.ahRevenue)} />
            <Row label="Vender a un vendedor" value={formatMoney(calc.vendorRevenue)} />
            {calc.deposit && <Row label="Depósito 2 h · 24 h" value={`${formatMoney(calc.deposit.h2)} · ${formatMoney(calc.deposit.h24)}`} />}
          </dl>
        )}

        {recipe.yields_item !== null && (
          <Link href={`/item/${recipe.yields_item}?house=${houseId}`} className="inline-block py-1 text-xs text-gold underline">
            Ver historial de {itemName(recipe.yields_item)}
          </Link>
        )}
        {recipe.yields_item === null && !isEnchant && (
          <p className="text-xs text-muted">La API no indica qué objeto fabrica esta receta, así que no se puede calcular el beneficio.</p>
        )}

        <SkillEditor recipe={recipe} colors={colors} back={back} needToken={needToken} />
      </div>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-mono">{value}</dd>
    </div>
  );
}

const COLOR_FIELDS = [
  { key: "orange", label: "Naranja", className: "text-[#f0933f]" },
  { key: "yellow", label: "Amarillo", className: "text-[#e5d35b]" },
  { key: "green", label: "Verde", className: "text-good" },
  { key: "grey", label: "Gris", className: "text-muted" },
] as const;

/** Niveles de la receta y formulario para corregirlos con lo que ves en el juego. */
function SkillEditor({
  recipe,
  colors,
  back,
  needToken,
}: {
  recipe: RecipeRow;
  colors: { orange: number; yellow: number; green: number; grey: number } | null;
  back: string;
  needToken: boolean;
}) {
  return (
    <details className="border-t border-line pt-2 text-xs">
      <summary className="cursor-pointer py-1 text-muted">
        Nivel:{" "}
        {colors ? (
          <>
            {COLOR_FIELDS.map((f, i) => (
              <span key={f.key} className={f.className}>
                {colors[f.key]}
                {i < 3 ? " · " : ""}
              </span>
            ))}{" "}
            ({SOURCE[recipe.skill_source ?? "estimate"]}) · corregir
          </>
        ) : (
          "desconocido · añadir"
        )}
      </summary>
      <form action={saveRecipeSkill} className="mt-2 space-y-2">
        <input type="hidden" name="recipeId" value={recipe.id} />
        <input type="hidden" name="back" value={back} />
        <p className="text-muted">Pon los niveles que ves en el juego: desde cuándo es naranja, amarillo, verde y gris.</p>
        <div className="grid grid-cols-4 gap-2">
          {COLOR_FIELDS.map((f) => (
            <label key={f.key}>
              <span className={f.className}>{f.label}</span>
              <input className="input mt-1 px-2" type="number" name={f.key} min={1} max={375} defaultValue={colors?.[f.key]} inputMode="numeric" required />
            </label>
          ))}
        </div>
        {needToken && <input name="token" type="password" required placeholder="Contraseña" className="input" autoComplete="current-password" aria-label="Contraseña de administración" />}
        <div className="flex gap-2">
          <button className="btn flex-1">Guardar</button>
          {recipe.skill_source === "manual" && (
            <button name="reset" value="1" formNoValidate className="min-h-11 rounded-lg border border-line px-3 text-muted">
              Quitar corrección
            </button>
          )}
        </div>
      </form>
    </details>
  );
}
