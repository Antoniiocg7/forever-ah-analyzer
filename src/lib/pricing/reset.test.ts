import { describe, expect, it } from "vitest";
import type { Listing } from "../blizzard/client";
import { estimateListings } from "./sales";
import { bestReset, buildLadder, demandFactor, detectBait, listingPrice, type ResetSettings } from "./reset";

const S: ResetSettings = { cut: 0.05, depositPct: 0.6, horizonDays: 3, maxPriceFactor: 2, budget: 1_000_000 };

describe("buildLadder", () => {
  it("agrupa por precio, ordena y corta a 3× la mediana", () => {
    const l = buildLadder(
      [
        { price: 120, qty: 5 },
        { price: 100, qty: 2 },
        { price: 120, qty: 3 },
        { price: 900, qty: 1 },
      ],
      110,
    );
    expect(l).toEqual([
      [100, 2],
      [120, 8],
    ]);
  });
});

describe("detectBait", () => {
  it("1 unidad muy barata delante de un mercado con volumen es un cebo", () => {
    expect(detectBait([[50, 1], [150, 200], [160, 300]])).toEqual({ units: 1, price: 50, realPrice: 150 });
  });
  it("un mínimo con volumen no es cebo", () => {
    expect(detectBait([[50, 40], [150, 200]])).toBeNull();
  });
  it("un lote barato grande (aunque sea < 1% del stock) es un chollo, no un cebo", () => {
    expect(detectBait([[57, 28], [160, 12000]])).toBeNull();
    expect(detectBait([[57, 4], [160, 12000]])).toEqual({ units: 4, price: 57, realPrice: 160 });
  });
  it("una rebaja pequeña no es cebo", () => {
    expect(detectBait([[140, 1], [150, 200]])).toBeNull();
  });
  it("con poco stock no se marca nada", () => {
    expect(detectBait([[50, 1], [150, 3]])).toBeNull();
  });
  it("el precio para publicar ignora el cebo", () => {
    expect(listingPrice([[50, 1], [150, 200]])).toBe(149);
    expect(listingPrice([[150, 200], [160, 10]])).toBe(149);
  });
});

describe("demandFactor", () => {
  it("baja con el precio y tiene suelo", () => {
    expect(demandFactor(1)).toBe(1);
    expect(demandFactor(1.5)).toBeCloseTo(0.65);
    expect(demandFactor(3)).toBe(0.3);
  });
});

describe("bestReset", () => {
  // 30 uds baratas a 1g y luego un muro a 2g: comprar las 30 y publicar a 2g − 1c.
  const ladder: [number, number][] = [
    [10000, 30],
    [20000, 500],
  ];

  it("encuentra el reset hasta el muro cuando se vende mucho y se repone poco", () => {
    const r = bestReset({ ladder, market: 12000, soldPerDay: 40, listedPerDay: 5, vendorSell: 100 }, S)!;
    expect(r.units).toBe(30);
    expect(r.cost).toBe(300000);
    expect(r.relist).toBe(19999);
    expect(r.expectedProfit).toBeGreaterThan(0);
    expect(r.bestProfit).toBe(Math.round(30 * 19999 * 0.95 - 300000));
    expect(r.risk).not.toBe("high");
  });

  it("si se repone tanto como se vende, el riesgo es alto", () => {
    const r = bestReset({ ladder, market: 12000, soldPerDay: 40, listedPerDay: 60, vendorSell: 100 }, S);
    expect(r?.risk ?? "high").toBe("high");
  });

  it("sin reposición conocida se marca como suposición", () => {
    const r = bestReset({ ladder, market: 12000, soldPerDay: 40, listedPerDay: null, vendorSell: 100 }, S);
    expect(r === null || (r.restockUnknown && r.risk === "high")).toBe(true);
  });

  it("respeta el presupuesto", () => {
    expect(bestReset({ ladder, market: 12000, soldPerDay: 40, listedPerDay: 5, vendorSell: 100 }, { ...S, budget: 100000 })).toBeNull();
  });

  it("sin ventas no hay reset", () => {
    expect(bestReset({ ladder, market: 12000, soldPerDay: 0, listedPerDay: 0, vendorSell: 100 }, S)).toBeNull();
  });

  it("no publica por encima de 2× el precio normal", () => {
    const r = bestReset({ ladder: [[10000, 10], [90000, 100]], market: 12000, soldPerDay: 100, listedPerDay: 1, vendorSell: 0 }, S)!;
    expect(r.relist).toBe(24000);
  });
});

describe("estimateListings", () => {
  const L = (auctionId: number, itemId: number, qty: number): Listing => ({ auctionId, itemId, qty, unitPrice: 100, timeLeft: "LONG" }) as Listing;
  it("una recolocación (mismo stock, ID nuevo) no es reposición", () => {
    const out = estimateListings([[1, 7, 20, "LONG", 100]], [L(2, 7, 20)], new Map());
    expect(out.get(7)).toBeUndefined();
  });
  it("reposición = stock nuevo − stock viejo + vendidas", () => {
    const out = estimateListings([[1, 7, 20, "LONG", 100]], [L(1, 7, 5), L(3, 7, 30)], new Map([[7, 15]]));
    expect(out.get(7)).toBe(30);
  });
});
