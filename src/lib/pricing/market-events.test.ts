import { describe, expect, it } from "vitest";
import type { Listing } from "../blizzard/client";
import { detectResets, resetStatus } from "./market-events";
import type { CompactAuction } from "./sales";

const L = (auctionId: number, itemId: number, qty: number, unitPrice: number): Listing => ({ auctionId, itemId, qty, unitPrice, timeLeft: "LONG" }) as Listing;

describe("detectResets", () => {
  // Objeto 7, normal 1g: había 20 uds a 90s–1g y un muro a 2g. Alguien compra las 20.
  const prev: CompactAuction[] = [
    [1, 7, 10, "VERY_LONG", 9000],
    [2, 7, 10, "VERY_LONG", 10000],
    [3, 7, 50, "VERY_LONG", 20000],
  ];
  const market = new Map([[7, 10000]]);

  it("detecta que alguien compró todo lo barato y el mínimo saltó", () => {
    const out = detectResets(prev, [L(3, 7, 50, 20000)], market, new Map([[7, 20]]));
    expect(out).toEqual([{ itemId: 7, prevMin: 9000, newMin: 20000, market: 10000, units: 20, cost: 190000 }]);
  });

  it("si lo barato se canceló (no se vendió) no es un reset", () => {
    expect(detectResets(prev, [L(3, 7, 50, 20000)], market, new Map([[7, 2]]))).toEqual([]);
  });

  it("una subida pequeña no cuenta", () => {
    expect(detectResets(prev, [L(3, 7, 50, 10500)], market, new Map([[7, 20]]))).toEqual([]);
  });

  it("objetos baratos (< 10s) se ignoran", () => {
    expect(detectResets(prev, [L(3, 7, 50, 20000)], new Map([[7, 500]]), new Map([[7, 20]]))).toEqual([]);
  });
});

describe("resetStatus", () => {
  const e = { prevMin: 9000, market: 10000, detectedAt: new Date("2026-11-23T10:00:00Z") };
  it("se cae si el mínimo vuelve a lo normal", () => {
    expect(resetStatus(e, 10400, new Date("2026-11-23T12:00:00Z"))).toBe("failed");
  });
  it("sigue abierto mientras el precio aguanta", () => {
    expect(resetStatus(e, 19000, new Date("2026-11-23T12:00:00Z"))).toBe("open");
    expect(resetStatus(e, null, new Date("2026-11-23T12:00:00Z"))).toBe("open");
  });
  it("aguanta tras 24 h", () => {
    expect(resetStatus(e, 18000, new Date("2026-11-24T10:00:00Z"))).toBe("held");
  });
});
