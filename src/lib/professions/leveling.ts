/** Subir profesiones: niveles de receta, colores, probabilidad de subir y ruta más barata. */

export const MAX_SKILL = 300;

// ---------------------------------------------------------------------------------------------
// Estimación del nivel de receta
// ---------------------------------------------------------------------------------------------

export type SkillModel = { a: number; b: number; points: number };

/**
 * Ajuste lineal nivel_receta ≈ a + b × nivel_objeto, con los niveles oficiales conocidos
 * (recetas que se aprenden con planos/patrones). null si hay menos de 2 puntos distintos.
 */
export function fitSkillModel(points: { itemLevel: number; skill: number }[]): SkillModel | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p.itemLevel, 0) / n;
  const my = points.reduce((s, p) => s + p.skill, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.itemLevel - mx) ** 2;
    sxy += (p.itemLevel - mx) * (p.skill - my);
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b, points: n };
}

/** Nivel estimado, redondeado a múltiplos de 5 y dentro de 1–300. */
export function estimateSkill(model: SkillModel, itemLevel: number): number {
  const raw = model.a + model.b * itemLevel;
  return Math.min(MAX_SKILL, Math.max(1, Math.round(raw / 5) * 5));
}

// ---------------------------------------------------------------------------------------------
// Colores y probabilidad de subir
// ---------------------------------------------------------------------------------------------

export type Colors = { orange: number; yellow: number; green: number; grey: number };
export type ColorOffsets = { yellow: number; green: number; grey: number };
export type Chances = { orange: number; yellow: number; green: number; grey: number };

export const DEFAULT_OFFSETS: ColorOffsets = { yellow: 25, green: 37, grey: 50 };
export const DEFAULT_CHANCES: Chances = { orange: 1, yellow: 0.75, green: 0.25, grey: 0 };

/** Colores de una receta: las correcciones manuales mandan; el resto sale del nivel + desplazamientos. */
export function colorsFor(
  r: { skillReq: number; orange?: number | null; yellow?: number | null; green?: number | null; grey?: number | null },
  offsets: ColorOffsets = DEFAULT_OFFSETS,
): Colors {
  const orange = r.orange ?? r.skillReq;
  return {
    orange,
    yellow: r.yellow ?? orange + offsets.yellow,
    green: r.green ?? orange + offsets.green,
    grey: r.grey ?? orange + offsets.grey,
  };
}

export type Color = keyof Colors;

/** Color de la receta con tu nivel actual; null si aún no puedes hacerla. */
export function colorAt(c: Colors, skill: number): Color | null {
  if (skill < c.orange) return null;
  if (skill < c.yellow) return "orange";
  if (skill < c.green) return "yellow";
  if (skill < c.grey) return "green";
  return "grey";
}

export function chanceAt(c: Colors, skill: number, chances: Chances = DEFAULT_CHANCES): number {
  const color = colorAt(c, skill);
  return color === null ? 0 : chances[color];
}

// ---------------------------------------------------------------------------------------------
// Ruta más barata
// ---------------------------------------------------------------------------------------------

export type RouteRecipe = {
  id: number;
  colors: Colors;
  /** Coste neto de fabricar una vez: materiales menos lo que esperas recuperar vendiendo el producto. */
  netPerCraft: number;
  /** Coste de aprender la receta (planos comprados en la subasta), una sola vez. */
  learnCost: number;
};

export type RouteStep = { recipeId: number; from: number; to: number; crafts: number; cost: number };
export type Route = { steps: RouteStep[]; cost: number; crafts: number; reached: number };

/**
 * Ruta de coste mínimo de `from` a `to`. Programación dinámica por tramos: dp[s] = coste mínimo para
 * llegar al nivel s; desde s se puede usar una receta para un tramo [s, e) mientras dé puntos,
 * pagando su aprendizaje una vez por tramo y, por cada punto, neto / probabilidad de subir.
 * Si en algún nivel ninguna receta da puntos, la ruta se queda en `reached` < `to`.
 */
export function cheapestRoute(from: number, to: number, recipes: RouteRecipe[], chances: Chances = DEFAULT_CHANCES): Route {
  const L = Math.max(0, to - from);
  const dp = new Array<number>(L + 1).fill(Infinity);
  const prev = new Array<{ at: number; recipe: RouteRecipe; crafts: number; cost: number } | null>(L + 1).fill(null);
  dp[0] = 0;

  for (let i = 0; i < L; i++) {
    if (dp[i] === Infinity) continue;
    const s = from + i;
    for (const r of recipes) {
      let cost = r.learnCost;
      let crafts = 0;
      for (let k = s; k < to; k++) {
        const p = chanceAt(r.colors, k, chances);
        if (p <= 0) break;
        crafts += 1 / p;
        cost += r.netPerCraft / p;
        const j = k + 1 - from;
        const total = dp[i] + cost;
        if (total < dp[j]) {
          dp[j] = total;
          prev[j] = { at: i, recipe: r, crafts, cost };
        }
      }
    }
  }

  let end = L;
  while (end > 0 && dp[end] === Infinity) end--;
  const steps: RouteStep[] = [];
  for (let j = end; j > 0; ) {
    const p = prev[j]!;
    steps.unshift({ recipeId: p.recipe.id, from: from + p.at, to: from + j, crafts: p.crafts, cost: p.cost });
    j = p.at;
  }
  // Une tramos consecutivos de la misma receta (salen al empatar costes).
  const merged: RouteStep[] = [];
  for (const st of steps) {
    const last = merged[merged.length - 1];
    if (last && last.recipeId === st.recipeId && last.to === st.from) {
      last.to = st.to;
      last.crafts += st.crafts;
      last.cost += st.cost;
    } else merged.push({ ...st });
  }
  return { steps: merged, cost: dp[end], crafts: merged.reduce((s, x) => s + x.crafts, 0), reached: from + end };
}

/**
 * Probabilidad de vender el producto según su liquidez, para descontar del coste lo que esperas
 * recuperar. Venderlo a un vendedor es seguro y se cuenta aparte.
 */
export const SALE_PROBABILITY = { ok: 0.7, unknown: 0.4, thin: 0.15, none: 0 } as const;
