import { describe, expect, it } from "vitest";
import { craftEconomics, type Price } from "./craft";

const ORE = 2770;
const BAR = 2840;
const STONE = 2835;
const BELT = 2851;

const prices = new Map<number, Price>([
  [ORE, { min: 40, market: 50 }],
  [BAR, { min: 200, market: 220 }],
  [BELT, { min: 3000, market: 3500 }],
]);
const noVendor = new Map<number, number>();

describe("craftEconomics", () => {
  it("coste a precio de mercado y venta al mínimo menos la comisión", () => {
    const r = craftEconomics({ yieldsItem: BELT, yieldsQty: 1, reagents: [{ itemId: BAR, qty: 6 }] }, prices, noVendor, 0.05);
    expect(r.cost).toBe(1320);
    expect(r.ahRevenue).toBe(2850);
    expect(r.sellVia).toBe("ah");
    expect(r.profit).toBe(1530);
    expect(r.margin).toBeCloseTo(1530 / 1320);
  });

  it("multiplica el ingreso por las unidades fabricadas y puede dar pérdidas", () => {
    const r = craftEconomics({ yieldsItem: ORE, yieldsQty: 2, reagents: [{ itemId: BAR, qty: 1 }] }, prices, noVendor, 0.05);
    expect(r.ahRevenue).toBe(76);
    expect(r.profit).toBe(76 - 220);
  });

  it("sin precio de un material no hay coste ni beneficio, pero sí coste parcial", () => {
    const r = craftEconomics(
      { yieldsItem: BELT, yieldsQty: 1, reagents: [{ itemId: BAR, qty: 2 }, { itemId: STONE, qty: 1 }] },
      prices,
      noVendor,
      0.05,
    );
    expect(r.cost).toBeNull();
    expect(r.knownCost).toBe(440);
    expect(r.missing).toEqual([STONE]);
    expect(r.profit).toBeNull();
    expect(r.ahRevenue).toBe(2850);
  });

  it("elige el vendedor si paga más que la subasta, o si no hay nada en la subasta", () => {
    const better = craftEconomics({ yieldsItem: BELT, yieldsQty: 1, reagents: [{ itemId: BAR, qty: 1 }] }, prices, new Map([[BELT, 4000]]), 0.05);
    expect(better.sellVia).toBe("vendor");
    expect(better.profit).toBe(4000 - 220);

    const only = craftEconomics({ yieldsItem: STONE, yieldsQty: 1, reagents: [{ itemId: ORE, qty: 1 }] }, prices, new Map([[STONE, 10]]), 0.05);
    expect(only.sellVia).toBe("vendor");
    expect(only.profit).toBe(10 - 50);
  });

  it("receta sin objeto fabricado o sin materiales: sin beneficio", () => {
    expect(craftEconomics({ yieldsItem: null, yieldsQty: 1, reagents: [{ itemId: ORE, qty: 1 }] }, prices, noVendor, 0.05).profit).toBeNull();
    expect(craftEconomics({ yieldsItem: BELT, yieldsQty: 1, reagents: [] }, prices, noVendor, 0.05).cost).toBeNull();
  });
});
