import { describe, expect, it } from "vitest";
import { categorize, gameContext, type GameEvent } from "./calendar";

const events: GameEvent[] = [
  { date: "2026-11-04", kind: "launch", name: "Lanzamiento" },
  { date: "2026-12-09", kind: "raid", name: "Raids" },
];

describe("gameContext", () => {
  it("cuenta el día desde el lanzamiento y los días hasta las raids", () => {
    const c = gameContext(events, Date.parse("2026-11-22T10:00:00Z"));
    expect(c.day).toBe(19);
    expect(c.next).toMatchObject({ name: "Raids", daysUntil: 17 });
    expect(c.tips.length).toBe(2);
  });

  it("tras las raids y pasados 60 días, cambia el consejo", () => {
    const c = gameContext(events, Date.parse("2027-02-01T00:00:00Z"));
    expect(c.next).toBeNull();
    expect(c.tips).toHaveLength(1);
    expect(c.tips[0]).toContain("nivel máximo");
  });
});

describe("categorize", () => {
  it("clasifica consumibles, materiales de raid y de subida", () => {
    expect(categorize("Flask of the Titans")).toBe("raid-consumable");
    expect(categorize("Greater Fire Protection Potion")).toBe("raid-consumable");
    expect(categorize("Essence of Fire")).toBe("raid-material");
    expect(categorize("Black Lotus")).toBe("raid-material");
    expect(categorize("Iron Ore")).toBe("leveling-material");
    expect(categorize("Thorium Shells")).toBeNull();
    expect(categorize(null)).toBeNull();
    expect(categorize("Recipe: Greater Arcane Protection Potion")).toBeNull();
  });
});
