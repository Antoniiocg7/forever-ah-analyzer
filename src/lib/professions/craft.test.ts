import { describe, expect, it } from "vitest";
import { buyPrice, craftCosts, craftEconomics, liquidityOf, type Market, type RecipeInput } from "./craft";

const ORE = 10;
const BAR = 11;
const COAL = 12;
const STEEL = 13;
const BELT = 14;
const STONE = 15;

const m = (p: Partial<Market>): Market => ({
  min: null,
  market: null,
  market7d: null,
  qty: 100,
  numAuctions: 20,
  soldPerDay: 50,
  vendorBuy: null,
  vendorSell: null,
  ...p,
});

const markets = new Map<number, Market>([
  [ORE, m({ min: 40, market: 50 })],
  [BAR, m({ min: 200, market: 220 })],
  [COAL, m({ min: 600, market: 700, vendorBuy: 500 })],
  [BELT, m({ min: 3000, market: 3500, market7d: 3200 })],
]);

const smeltBar: RecipeInput = { id: 1, name: "Smelt Bar", yieldsItem: BAR, yieldsQty: 1, reagents: [{ itemId: ORE, qty: 2 }] };
const steel: RecipeInput = { id: 2, name: "Smelt Steel", yieldsItem: STEEL, yieldsQty: 1, reagents: [{ itemId: BAR, qty: 1 }, { itemId: COAL, qty: 1 }] };
const belt: RecipeInput = { id: 3, name: "Belt", yieldsItem: BELT, yieldsQty: 1, reagents: [{ itemId: BAR, qty: 6 }] };

describe("buyPrice", () => {
  it("elige el vendedor si es más barato que la subasta", () => {
    expect(buyPrice(markets.get(COAL))).toEqual({ unit: 500, via: "vendor" });
    expect(buyPrice(markets.get(ORE))).toEqual({ unit: 50, via: "ah" });
    expect(buyPrice(undefined)).toBeNull();
  });
});

describe("craftCosts", () => {
  it("encadena recetas: la barra sale más barata fundiendo y el acero usa esa barra", () => {
    const costs = craftCosts([steel, smeltBar], markets);
    expect(costs.get(BAR)).toEqual({ unit: 100, via: "craft", recipeId: 1 });
    // acero = barra fundida (100) + carbón de vendedor (500), aunque la receta vaya antes en la lista
    expect(costs.get(STEEL)?.unit).toBe(600);
  });

  it("no cuelga con recetas en ciclo", () => {
    const a: RecipeInput = { id: 8, name: "A", yieldsItem: ORE, yieldsQty: 1, reagents: [{ itemId: BAR, qty: 1 }] };
    const costs = craftCosts([smeltBar, a], markets);
    expect(costs.get(BAR)?.unit).toBe(100);
  });
});

describe("craftEconomics", () => {
  it("usa el material fabricado si es más barato y vende al menor entre mínimo y mediana de 7 días", () => {
    const crafted = craftCosts([smeltBar], markets);
    const r = craftEconomics(belt, markets, crafted, 0.05, { deposit_min: 100, pct: { "2": 0.05, "24": 0.6 } });
    expect(r.lines[0].acquire).toMatchObject({ via: "craft", unit: 100 });
    expect(r.cost).toBe(600);
    expect(r.sellUnit).toBe(3000);
    expect(r.ahRevenue).toBe(2850);
    expect(r.profit).toBe(2250);
    expect(r.liquidity).toBe("high"); // 50 ventas/día con 100 en venta: rota la mitad del stock al día
  });

  it("no usa la propia receta como fuente de su material", () => {
    const crafted = craftCosts([smeltBar], markets);
    const r = craftEconomics(smeltBar, markets, crafted, 0.05);
    expect(r.lines[0].acquire?.via).toBe("ah");
  });

  it("sin precio de un material: coste parcial y sin beneficio", () => {
    const r = craftEconomics(
      { id: 4, name: "X", yieldsItem: BELT, yieldsQty: 1, reagents: [{ itemId: BAR, qty: 2 }, { itemId: STONE, qty: 1 }] },
      markets,
      new Map(),
      0.05,
    );
    expect(r.cost).toBeNull();
    expect(r.knownCost).toBe(440);
    expect(r.profit).toBeNull();
  });

  it("vende al vendedor si paga más, y lo multiplica por las unidades fabricadas", () => {
    const vendorMarkets = new Map(markets).set(STONE, m({ vendorSell: 300, qty: 0, numAuctions: 0, soldPerDay: null }));
    const r = craftEconomics({ id: 5, name: "Y", yieldsItem: STONE, yieldsQty: 2, reagents: [{ itemId: ORE, qty: 1 }] }, vendorMarkets, new Map(), 0.05);
    expect(r.sellVia).toBe("vendor");
    expect(r.revenue).toBe(600);
    expect(r.profit).toBe(550);
    expect(r.liquidity).toBe("ok");
  });

  it("el depósito usa el precio de vendedor y respeta el mínimo", () => {
    const withVendor = new Map(markets).set(BELT, m({ min: 3000, vendorSell: 1000 }));
    const r = craftEconomics(belt, withVendor, new Map(), 0.05, { deposit_min: 100, pct: { "2": 0.05, "24": 0.6 } });
    expect(r.deposit).toEqual({ h2: 100, h24: 600 });
  });
});

describe("liquidityOf", () => {
  it("clasifica el mercado del producto", () => {
    expect(liquidityOf(null)).toBe("none");
    expect(liquidityOf(m({ qty: 0, soldPerDay: null }))).toBe("none");
    expect(liquidityOf(m({ numAuctions: 1, soldPerDay: 0 }))).toBe("thin");
    expect(liquidityOf(m({ numAuctions: 1, soldPerDay: 3 }))).toBe("thin");
    expect(liquidityOf(m({ numAuctions: 4, soldPerDay: 8 }))).toBe("ok");
    expect(liquidityOf(m({ qty: 30, soldPerDay: 40 }))).toBe("high");
    expect(liquidityOf(m({ numAuctions: 9, soldPerDay: null }))).toBe("unknown");
    expect(liquidityOf(m({ numAuctions: 1, soldPerDay: null }))).toBe("thin");
  });
});

describe("addToShop (lista de la compra del planificador)", () => {
  it("al fabricar un material añade también lo que hay que comprar para hacerlo", async () => {
    const { addToShop } = await import("./plan");
    const crafted = craftCosts([smeltBar], markets);
    const shop = new Map();
    addToShop(shop, markets, new Map([[smeltBar.id, smeltBar]]), crafted, BAR, 10, crafted.get(BAR)!);
    expect(shop.get(`${BAR}|craft`)).toMatchObject({ qty: 10 });
    expect(shop.get(`${ORE}|ah`)).toMatchObject({ qty: 20, available: 100 });
  });
});
