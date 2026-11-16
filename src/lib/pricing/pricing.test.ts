import { describe, expect, it } from "vitest";
import type { Listing } from "../blizzard/client";
import { aggregateItem, aggregateListings } from "./aggregate";
import { estimateSales, type CompactAuction } from "./sales";

const listing = (auctionId: number, itemId: number, qty: number, unitPrice: number | null, timeLeft: Listing["timeLeft"] = "VERY_LONG"): Listing => ({
  auctionId,
  itemId,
  qty,
  unitPrice,
  timeLeft,
});

describe("aggregateItem", () => {
  it("calcula mínimo, mediana ponderada y p15 por unidades", () => {
    // 100 unidades: 10 a 100c, 40 a 200c, 50 a 300c
    const agg = aggregateItem(1, [
      { price: 300, qty: 50 },
      { price: 100, qty: 10 },
      { price: 200, qty: 40 },
    ])!;
    expect(agg.minBuyout).toBe(100);
    expect(agg.qty).toBe(100);
    expect(agg.numAuctions).toBe(3);
    expect(agg.median).toBe(200);
    // 15 unidades más baratas: 10×100 + 5×200 = 2000 → 133
    expect(agg.p15Market).toBe(133);
  });

  it("ignora listados de más de 100× la mediana", () => {
    const agg = aggregateItem(1, [
      { price: 100, qty: 20 },
      { price: 9_999_999, qty: 1 },
    ])!;
    expect(agg.qty).toBe(20);
    expect(agg.numAuctions).toBe(1);
    expect(agg.p15Market).toBe(100);
  });

  it("con una sola unidad usa esa unidad como mercado", () => {
    const agg = aggregateItem(1, [{ price: 5000, qty: 1 }])!;
    expect(agg).toMatchObject({ minBuyout: 5000, p15Market: 5000, median: 5000, qty: 1 });
  });

  it("devuelve null sin listados con precio", () => {
    expect(aggregateItem(1, [])).toBeNull();
    expect(aggregateItem(1, [{ price: 0, qty: 3 }])).toBeNull();
  });
});

describe("aggregateListings", () => {
  it("agrupa por objeto y descarta las subastas solo con puja", () => {
    const aggs = aggregateListings([
      listing(1, 2770, 20, 50),
      listing(2, 2770, 10, 40),
      listing(3, 2840, 5, null),
      listing(4, 2771, 1, 900),
    ]);
    expect([...aggs.keys()].sort()).toEqual([2770, 2771]);
    expect(aggs.get(2770)).toMatchObject({ minBuyout: 40, qty: 30, numAuctions: 2 });
  });
});

describe("estimateSales", () => {
  const prev: CompactAuction[] = [
    [1, 2770, 20, "VERY_LONG"], // desaparece → vendida
    [2, 2770, 10, "SHORT"], // desaparece pero pudo caducar
    [3, 2840, 50, "LONG"], // baja a 30 → 20 vendidas
    [4, 2771, 5, "MEDIUM"], // sigue igual
    [5, 2771, 7, "UNKNOWN"], // desaparece sin time_left fiable
  ];
  const curr = [listing(3, 2840, 30, 100, "LONG"), listing(4, 2771, 5, 900, "SHORT"), listing(6, 2770, 99, 45)];

  it("cuenta desapariciones no caducadas y bajadas de cantidad", () => {
    const sold = estimateSales(prev, curr);
    expect(sold.get(2770)).toBe(20);
    expect(sold.get(2840)).toBe(20);
    expect(sold.has(2771)).toBe(false);
  });

  it("no cuenta nada si no hay snapshot previo", () => {
    expect(estimateSales([], curr).size).toBe(0);
  });
});
