import { describe, expect, it } from "vitest";
import { chanceAt, cheapestRoute, colorAt, colorsFor, estimateSkill, fitSkillModel, type RouteRecipe } from "./leveling";

describe("fitSkillModel / estimateSkill", () => {
  it("ajusta una recta con los niveles oficiales y redondea a 5", () => {
    const model = fitSkillModel([
      { itemLevel: 10, skill: 50 },
      { itemLevel: 30, skill: 150 },
      { itemLevel: 50, skill: 250 },
    ])!;
    expect(model.b).toBeCloseTo(5);
    expect(estimateSkill(model, 41)).toBe(205);
    expect(estimateSkill(model, 0)).toBe(1);
    expect(estimateSkill(model, 99)).toBe(300);
  });

  it("sin datos suficientes no hay modelo", () => {
    expect(fitSkillModel([{ itemLevel: 10, skill: 50 }])).toBeNull();
    expect(fitSkillModel([{ itemLevel: 10, skill: 50 }, { itemLevel: 10, skill: 60 }])).toBeNull();
  });
});

describe("colores", () => {
  it("usa las correcciones manuales y si no los desplazamientos", () => {
    expect(colorsFor({ skillReq: 100 })).toEqual({ orange: 100, yellow: 125, green: 137, grey: 150 });
    expect(colorsFor({ skillReq: 100, grey: 140 })).toEqual({ orange: 100, yellow: 125, green: 137, grey: 140 });
  });

  it("color y probabilidad según el nivel", () => {
    const c = colorsFor({ skillReq: 100 });
    expect(colorAt(c, 99)).toBeNull();
    expect(colorAt(c, 100)).toBe("orange");
    expect(chanceAt(c, 130)).toBe(0.75);
    expect(chanceAt(c, 140)).toBe(0.25);
    expect(chanceAt(c, 150)).toBe(0);
  });
});

const recipe = (id: number, skillReq: number, netPerCraft: number, learnCost = 0): RouteRecipe => ({
  id,
  colors: colorsFor({ skillReq }),
  netPerCraft,
  learnCost,
});

describe("cheapestRoute", () => {
  it("usa la receta barata mientras es naranja y cambia cuando la cara compensa", () => {
    // A: 1 de coste, naranja 1–25, gris desde 51. B: 10 de coste, naranja desde 20.
    const r = cheapestRoute(1, 55, [recipe(1, 1, 1), recipe(2, 20, 10)]);
    expect(r.reached).toBe(55);
    // Incluso en verde (38–50) A cuesta 1/0,25 = 4 por punto, menos que B (10): A hasta que se vuelve gris.
    expect(r.steps[0]).toMatchObject({ recipeId: 1, from: 1, to: 51 });
    expect(r.steps.at(-1)).toMatchObject({ recipeId: 2, from: 51, to: 55 });
  });

  it("paga los planos una sola vez y solo si compensan", () => {
    const cheapWithPlans = recipe(3, 1, 1, 1000);
    const normal = recipe(4, 1, 5);
    // 20 puntos: con planos 1000 + 20 = 1020; sin planos 100. Elige la normal.
    expect(cheapestRoute(1, 21, [cheapWithPlans, normal]).steps.map((s) => s.recipeId)).toEqual([4]);
    // Si la normal es carísima, compensan los planos.
    const pricey = recipe(5, 1, 500);
    const r = cheapestRoute(1, 21, [cheapWithPlans, pricey]);
    expect(r.steps.map((s) => s.recipeId)).toEqual([3]);
    expect(r.cost).toBe(1020);
  });

  it("si hay un hueco sin recetas, se queda en el último nivel alcanzable", () => {
    const r = cheapestRoute(1, 100, [recipe(1, 1, 1)]);
    expect(r.reached).toBe(51); // gris a partir de 51
    expect(r.cost).toBeGreaterThan(0);
  });

  it("cuenta las fabricaciones esperadas (1 / probabilidad)", () => {
    const r = cheapestRoute(130, 132, [recipe(1, 100, 4)]); // amarillo: 0,75
    expect(r.crafts).toBeCloseTo(2 / 0.75);
    expect(r.cost).toBeCloseTo((2 * 4) / 0.75);
  });
});
