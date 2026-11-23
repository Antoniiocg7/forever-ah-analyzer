import { describe, expect, it } from "vitest";
import { wishAdvice } from "./wishlist";

const base = { min: 10000, market7d: 10000, low30: 8000, maxPrice: null, everSeen: true };

describe("wishAdvice", () => {
  it("nunca vista en la subasta = probablemente BoP", () => {
    expect(wishAdvice({ ...base, min: null, everSeen: false }).action).toBe("absent");
  });
  it("vista antes pero ahora no hay", () => {
    expect(wishAdvice({ ...base, min: null }).label).toContain("no hay");
  });
  it("por debajo de tu máximo: comprar", () => {
    expect(wishAdvice({ ...base, maxPrice: 12000 }).action).toBe("buy");
  });
  it("por encima de tu máximo: esperar, con el %", () => {
    const a = wishAdvice({ ...base, maxPrice: 8000 });
    expect(a.action).toBe("wait");
    expect(a.label).toContain("25%");
  });
  it("mínimo del mes: comprar", () => {
    expect(wishAdvice({ ...base, min: 7900 }).action).toBe("buy");
  });
  it("mucho más barata que lo normal: comprar", () => {
    expect(wishAdvice({ ...base, low30: null, min: 8000 }).action).toBe("buy");
  });
  it("más cara de lo normal: esperar", () => {
    expect(wishAdvice({ ...base, min: 12000 }).action).toBe("wait");
  });
  it("precio normal: vigilar", () => {
    expect(wishAdvice(base).action).toBe("watch");
  });
});
