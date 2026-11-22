import { describe, expect, it } from "vitest";
import { marketActivity } from "./activity";

describe("marketActivity", () => {
  it("clasifica por ventas/día y rotación del stock", () => {
    expect(marketActivity(null, 10)).toBeNull();
    expect(marketActivity(600, 100000)).toBe("high");
    expect(marketActivity(30, 40)).toBe("high"); // vende más de la mitad de su stock al día
    expect(marketActivity(30, 1000)).toBe("normal");
    expect(marketActivity(5, 10)).toBe("normal");
    expect(marketActivity(2, 10)).toBe("low");
    expect(marketActivity(0, 0)).toBe("low");
  });
});
