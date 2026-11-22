import { describe, expect, it } from "vitest";
import type { Listing } from "../blizzard/client";
import { computeDepth, scoreDeal, type DealSettings } from "./deals";

const l = (itemId: number, qty: number, unitPrice: number | null): Listing => ({ auctionId: Math.random(), itemId, qty, unitPrice, timeLeft: "LONG" });

describe("computeDepth", () => {
  it("suma las unidades baratas frente a la mediana y las de por debajo del vendedor", () => {
    const d = computeDepth(
      [l(1, 5, 80), l(1, 3, 85), l(1, 10, 90), l(2, 4, 40), l(2, 2, 60), l(3, 1, null)],
      new Map([[1, 100]]),
      new Map([[2, 50]]),
    );
    expect(d.get(1)).toEqual({ dealUnits: 8, dealCost: 5 * 80 + 3 * 85, vendorUnits: 0, vendorProfit: 0 });
    expect(d.get(2)).toEqual({ dealUnits: 0, dealCost: 0, vendorUnits: 4, vendorProfit: 40 });
    expect(d.has(3)).toBe(false);
  });
});

const settings: DealSettings = { cut: 0.05, minSoldPerDay: 5, minMarket: 10000, deposit: { deposit_min: 100, pct: { "24": 0.6 } } };

describe("scoreDeal", () => {
  const base = { min: 70000, market7d: 100000, soldPerDay: 20, qty: 40, vendorSell: 5000, dealUnits: 3, dealCost: 210000 };

  it("calcula descuento, ganancia por unidad con comisión y depósito, y profundidad", () => {
    const d = scoreDeal(base, settings)!;
    expect(d.discount).toBeCloseTo(0.3);
    expect(d.pNoSale).toBeCloseTo(0.5);
    expect(d.deposit).toBe(3000);
    // 100000 × 0,95 − 70000 − 3000 × 0,5 = 23500
    expect(d.profitPerUnit).toBe(23500);
    // 3 × (95000 − 1500) − 210000 = 70500
    expect(d.depthProfit).toBe(70500);
    expect(d.daysToSell).toBeCloseTo(3 / 20);
  });

  it("descarta lo que no se vende, lo barato de por sí y lo que no compensa tras la comisión", () => {
    expect(scoreDeal({ ...base, soldPerDay: 2 }, settings)).toBeNull();
    expect(scoreDeal({ ...base, soldPerDay: null }, settings)).toBeNull();
    expect(scoreDeal({ ...base, market7d: 5000, min: 3000 }, settings)).toBeNull();
    expect(scoreDeal({ ...base, min: 96000 }, settings)).toBeNull();
  });
});
