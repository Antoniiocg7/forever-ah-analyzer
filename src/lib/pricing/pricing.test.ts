import { describe, expect, it } from "vitest";
import type { Listing } from "../blizzard/client";
import { aggregateItem, aggregateListings } from "./aggregate";
import { decodeState, encodeState, estimateSales, type CompactAuction } from "./sales";

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

  const HOUR = 3_600_000;

  it("cuenta desapariciones no caducadas y bajadas de cantidad", () => {
    const sold = estimateSales(prev, curr, HOUR)!;
    expect(sold.get(2770)).toBe(20);
    expect(sold.get(2840)).toBe(20);
    expect(sold.has(2771)).toBe(false);
  });

  it("con un hueco de 8 h solo fían las VERY_LONG (una LONG pudo caducar)", () => {
    const longGone: CompactAuction[] = [
      [10, 2770, 5, "VERY_LONG"],
      [11, 2770, 7, "LONG"],
    ];
    expect(estimateSales(longGone, [], 8 * HOUR)!.get(2770)).toBe(5);
    expect(estimateSales(longGone, [], HOUR)!.get(2770)).toBe(12);
  });

  it("no estima con huecos de 12 h o más, ni con hueco nulo", () => {
    expect(estimateSales(prev, curr, 13 * HOUR)).toBeNull();
    expect(estimateSales(prev, curr, 0)).toBeNull();
  });

  it("no cuenta nada si no hay snapshot previo", () => {
    expect(estimateSales([], curr, HOUR)!.size).toBe(0);
  });
});

describe("estimateSales: recolocaciones", () => {
  const HOUR = 3_600_000;
  it("no cuenta como venta una subasta cancelada para rebajarla (más cara que el mínimo de ahora)", () => {
    const prev: CompactAuction[] = [
      [1, 2770, 10, "VERY_LONG", 100], // comprada: la más barata
      [2, 2770, 10, "VERY_LONG", 150], // cancelada y vuelta a publicar a 120
    ];
    const curr = [listing(3, 2770, 10, 120), listing(4, 2770, 5, 130)];
    expect(estimateSales(prev, curr, HOUR)!.get(2770)).toBe(10);
  });

  it("si el objeto se agota, todo lo desaparecido cuenta", () => {
    const prev: CompactAuction[] = [[1, 2770, 10, "VERY_LONG", 100], [2, 2770, 5, "LONG", 300]];
    expect(estimateSales(prev, [], HOUR)!.get(2770)).toBe(15);
  });

  it("las compras parciales de commodities cuentan aunque el precio sea alto", () => {
    const prev: CompactAuction[] = [[1, 2770, 10, "SHORT", 500]];
    expect(estimateSales(prev, [listing(1, 2770, 4, 500), listing(2, 2770, 50, 90)], HOUR)!.get(2770)).toBe(6);
  });

  it("las subastas solo con puja no se cuentan; los estados antiguos sin precio sí", () => {
    const prev: CompactAuction[] = [[1, 2770, 3, "VERY_LONG", null], [2, 2771, 4, "VERY_LONG"]];
    const sold = estimateSales(prev, [listing(9, 2770, 1, 50), listing(8, 2771, 1, 50)], HOUR)!;
    expect(sold.has(2770)).toBe(false);
    expect(sold.get(2771)).toBe(4);
  });
});

describe("encodeState / decodeState", () => {
  it("ida y vuelta sin pérdidas", () => {
    const state: CompactAuction[] = [
      [1, 2770, 20, "VERY_LONG", 150],
      [2, 2840, 3, "SHORT", null],
    ];
    expect(decodeState(encodeState(state))).toEqual(state);
  });
});
