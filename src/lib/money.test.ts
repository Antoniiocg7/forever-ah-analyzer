import { describe, expect, it } from "vitest";
import { formatMoney, parseMoney } from "./money";

describe("parseMoney", () => {
  it("entiende oro, plata y cobre", () => {
    expect(parseMoney("1g 20s 5c")).toBe(12005);
    expect(parseMoney("1g20s")).toBe(12000);
    expect(parseMoney("35s")).toBe(3500);
    expect(parseMoney("80c")).toBe(80);
    expect(parseMoney("1,5")).toBe(15000);
    expect(parseMoney("2")).toBe(20000);
  });
  it("rechaza lo que no es un precio", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("g")).toBeNull();
  });
  it("ida y vuelta con formatMoney", () => {
    expect(parseMoney(formatMoney(2345))).toBe(2345);
    expect(parseMoney(formatMoney(12_340_000))).toBe(12_340_000);
  });
});
