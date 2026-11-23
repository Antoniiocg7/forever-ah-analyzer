import { describe, expect, it } from "vitest";
import { eventAdvice, eventTiming, pastUplift, type EventTiming } from "./seasonal";

const at = (iso: string) => Date.parse(iso);
const dmf = [
  { starts: "2026-12-07", ends: "2026-12-14", place: "Mulgore" },
  { starts: "2027-01-04", ends: "2027-01-11", place: "Elwynn Forest" },
];

describe("eventTiming", () => {
  it("próximo dentro de la ventana de compra", () => {
    const t = eventTiming(dmf, at("2026-11-23T12:00:00Z"))!;
    expect(t.phase).toBe("soon");
    expect(t.daysUntil).toBe(14);
    expect(t.occ.place).toBe("Mulgore");
  });
  it("en curso, incluido el último día", () => {
    const t = eventTiming(dmf, at("2026-12-14T20:00:00Z"))!;
    expect(t.phase).toBe("during");
    expect(t.daysLeft).toBe(1);
  });
  it("salta a la siguiente aparición cuando acaba", () => {
    const t = eventTiming(dmf, at("2026-12-20T00:00:00Z"))!;
    expect(t.occ.starts).toBe("2027-01-04");
    expect(t.phase).toBe("soon");
    expect(t.daysUntil).toBe(15);
  });
  it("todas pasadas", () => {
    expect(eventTiming(dmf, at("2027-03-01T00:00:00Z"))!.phase).toBe("past");
  });
});

describe("eventAdvice", () => {
  const soon: EventTiming = { occ: dmf[0], phase: "soon", daysUntil: 10, daysLeft: 0 };
  it("comprar si está a precio normal o menos", () => {
    expect(eventAdvice(soon, { min: 90, market7d: 100 }, null).action).toBe("buy");
  });
  it("tarde si ya ha subido más de un 15%", () => {
    expect(eventAdvice(soon, { min: 120, market7d: 100 }, null).action).toBe("wait");
  });
  it("sin prisa si la vez anterior no subió", () => {
    expect(eventAdvice(soon, { min: 90, market7d: 100 }, 0.01).action).toBe("watch");
  });
  it("durante el evento, vender", () => {
    expect(eventAdvice({ ...soon, phase: "during" }, { min: 90, market7d: 100 }, null).action).toBe("sell");
  });
});

describe("pastUplift", () => {
  it("compara el evento con las 2 semanas anteriores", () => {
    const daily = [
      ...["2026-11-30", "2026-12-01", "2026-12-02"].map((d) => ({ day: d, market: 100 })),
      ...["2026-12-07", "2026-12-08", "2026-12-09"].map((d) => ({ day: d, market: 130 })),
    ];
    expect(pastUplift(daily, dmf[0])).toBeCloseTo(0.3);
  });
  it("null con pocos datos", () => {
    expect(pastUplift([{ day: "2026-12-07", market: 130 }], dmf[0])).toBeNull();
  });
});
