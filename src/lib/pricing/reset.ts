/**
 * Cebos y resets de mercado a partir de la escalera de precios de un objeto.
 * Escalera: [[precio unitario, unidades], ...] agrupada por precio, de menor a mayor.
 */

export type Ladder = [price: number, qty: number][];

/** Escalones que se guardan por objeto (de sobra para ver el siguiente "muro"). */
export const LADDER_STEPS = 40;

/** Agrupa por precio y ordena; se corta a los primeros escalones y a ≤ 3× la mediana. */
export function buildLadder(listings: { price: number; qty: number }[], median: number): Ladder {
  const byPrice = new Map<number, number>();
  for (const l of listings) if (l.price > 0 && l.qty > 0) byPrice.set(l.price, (byPrice.get(l.price) ?? 0) + l.qty);
  const sorted = [...byPrice.entries()].sort((a, b) => a[0] - b[0]);
  const capped = sorted.filter(([p], i) => i === 0 || p <= median * 3);
  return capped.slice(0, LADDER_STEPS) as Ladder;
}

// ---------------------------------------------------------------------------------------------
// Cebos
// ---------------------------------------------------------------------------------------------

export type Bait = {
  /** Unidades sueltas puestas muy por debajo. */
  units: number;
  /** Precio del cebo (el mínimo que se ve). */
  price: number;
  /** Primer precio con volumen de verdad: el que hay que tomar como referencia para publicar. */
  realPrice: number;
};

/** Un cebo: unas pocas unidades sueltas (2, o el 1% del stock con un máximo de 5) al menos un 20% por debajo del siguiente escalón. */
export const BAIT_MAX_SHARE = 0.01;
export const BAIT_GAP = 0.8;
export const BAIT_MIN_STOCK = 20;
/** Más de esto ya es un lote barato de verdad (un chollo), no un cebo. */
export const BAIT_MAX_UNITS = 5;

/**
 * Detecta unidades sueltas muy baratas que bajan el "mínimo" (para que los que publican con
 * Auctionator rebajen a ese precio, o por error). null si el mínimo es un precio real.
 */
export function detectBait(ladder: Ladder): Bait | null {
  if (ladder.length < 2) return null;
  const total = ladder.reduce((s, [, q]) => s + q, 0);
  // Con poco stock (equipo, cosas raras) cada subasta suelta es un precio legítimo.
  if (total < BAIT_MIN_STOCK) return null;
  const maxUnits = Math.min(BAIT_MAX_UNITS, Math.max(2, Math.floor(total * BAIT_MAX_SHARE)));
  let units = 0;
  for (let i = 0; i < ladder.length - 1; i++) {
    units += ladder[i][1];
    if (units > maxUnits) return null;
    const next = ladder[i + 1][0];
    if (ladder[i][0] < next * BAIT_GAP) return { units, price: ladder[0][0], realPrice: next };
  }
  return null;
}

/** Precio al que publicar: 1 cobre por debajo del primer precio real (ignorando cebos). */
export function listingPrice(ladder: Ladder): number | null {
  if (ladder.length === 0) return null;
  const real = detectBait(ladder)?.realPrice ?? ladder[0][0];
  return Math.max(1, real - 1);
}

// ---------------------------------------------------------------------------------------------
// Resets
// ---------------------------------------------------------------------------------------------

export type ResetInput = {
  ladder: Ladder;
  /** Precio normal (mediana de 7 días, o mercado actual si no hay). */
  market: number;
  soldPerDay: number | null;
  /** Unidades nuevas publicadas al día (reposición); null si aún no se sabe. */
  listedPerDay: number | null;
  vendorSell: number | null;
};

export type ResetSettings = {
  cut: number;
  /** % del precio de vendedor que cuesta publicar 24 h. */
  depositPct: number;
  /** Días en los que esperas vender lo comprado. */
  horizonDays: number;
  /** Como mucho se publica a este múltiplo del precio normal. */
  maxPriceFactor: number;
  /** Lo que se puede gastar. */
  budget: number;
};

export const DEFAULT_RESET: Omit<ResetSettings, "cut" | "budget"> = { horizonDays: 3, maxPriceFactor: 2, depositPct: 0.6 };

export type ResetRisk = "low" | "medium" | "high";

export type Reset = {
  /** Unidades a comprar (todo lo que hay por debajo de `wall`). */
  units: number;
  cost: number;
  /** Precio más alto que pagas. */
  maxPaid: number;
  /** Siguiente precio en venta después de comprar: el "muro". */
  wall: number;
  /** Precio al que vuelves a publicar (1c por debajo del muro, con tope). */
  relist: number;
  /** relist / precio normal. */
  overMarket: number;
  /** Unidades que esperas vender en el horizonte. */
  expectedSold: number;
  /** Beneficio esperado: lo vendido a tu precio, lo que sobra a precio normal con descuento, menos coste y depósitos perdidos. */
  expectedProfit: number;
  /** Si lo vendes todo a tu precio. */
  bestProfit: number;
  /** Días para venderlo todo al ritmo esperado (null = no se vende). */
  daysToSell: number | null;
  risk: ResetRisk;
  /** La reposición es una suposición (aún no hay datos). */
  restockUnknown: boolean;
};

/** Ventas que se pierden al subir el precio: al doble del normal se vende un 30% de lo habitual. */
export function demandFactor(overMarket: number): number {
  return Math.min(1, Math.max(0.3, 1 - 0.7 * (overMarket - 1)));
}

/** Lo que vale lo que no consigas vender caro: el precio normal con un 10% de margen de seguridad. */
const LEFTOVER_VALUE = 0.9;
/** Para que sea un reset (y no un simple chollo), hay que publicar al menos un 10% por encima de lo normal. */
const MIN_OVER_MARKET = 1.1;

/**
 * Mejor reset de un objeto: prueba a comprar todo hasta cada escalón de la escalera y volver a
 * publicar justo por debajo del siguiente. Se queda con el de mayor beneficio esperado que quepa en el
 * presupuesto. null si ninguno sale a cuenta.
 *
 * Modelo (simple, a propósito):
 * - Demanda en el horizonte H: ventas/día × factor de precio × H.
 * - Competencia: lo que se repone en H (reposición/día × H). Si no se sabe, se supone igual a las ventas.
 *   Te llevas la parte de la demanda proporcional a tus unidades frente a las tuyas + las repuestas.
 * - Lo que no vendes vale el precio normal × 0,9, y pierdes el depósito de 24 h de esas unidades.
 */
export function bestReset(input: ResetInput, s: ResetSettings): Reset | null {
  const { ladder, market } = input;
  const S = input.soldPerDay ?? 0;
  if (ladder.length < 2 || market <= 0 || S <= 0) return null;
  const restockUnknown = input.listedPerDay === null;
  const R = input.listedPerDay ?? S;
  const net = 1 - s.cut;
  const depositUnit = (input.vendorSell ?? 0) * s.depositPct;

  let best: Reset | null = null;
  let units = 0;
  let cost = 0;
  for (let k = 1; k < ladder.length; k++) {
    const [p, q] = ladder[k - 1];
    units += q;
    cost += p * q;
    if (cost > s.budget) break;

    const wall = ladder[k][0];
    const relist = Math.min(wall - 1, Math.floor(market * s.maxPriceFactor));
    const overMarket = relist / market;
    if (overMarket < MIN_OVER_MARKET) continue;

    const demand = S * demandFactor(overMarket) * s.horizonDays;
    const competing = R * s.horizonDays;
    const expectedSold = Math.min(units, (demand * units) / (units + competing));
    const leftover = units - expectedSold;
    const expectedProfit = expectedSold * relist * net + leftover * market * LEFTOVER_VALUE * net - leftover * depositUnit - cost;
    const bestProfit = units * relist * net - cost;
    const ratePerDay = expectedSold / s.horizonDays;
    const daysToSell = ratePerDay > 0 ? units / ratePerDay : null;

    if (expectedProfit <= 0) continue;
    if (best && expectedProfit <= best.expectedProfit) continue;

    const risk: ResetRisk =
      restockUnknown || R >= S || daysToSell === null || daysToSell > 7 ? "high" : competing < units * 0.5 && daysToSell <= s.horizonDays ? "low" : "medium";
    best = {
      units,
      cost,
      maxPaid: p,
      wall,
      relist,
      overMarket,
      expectedSold: Math.round(expectedSold),
      expectedProfit: Math.round(expectedProfit),
      bestProfit: Math.round(bestProfit),
      daysToSell,
      risk,
      restockUnknown,
    };
  }
  return best;
}
