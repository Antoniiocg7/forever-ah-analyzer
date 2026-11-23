import { describe, expect, it } from "vitest";
import { DEFAULT_ALERTS, dealAlerts, digestHtml, digestKeyDue, eventAlerts, levelingAlerts, resetAlerts, warsawNow, watchAlerts, type DealCandidate } from "./rules";

const base = "https://example.test";
const deal = (itemId: number, depthProfit: number): DealCandidate => ({ itemId, name: `Item ${itemId}`, min: 100, market7d: 200, units: 3, cost: 300, depthProfit, soldPerDay: 10 });

describe("dealAlerts", () => {
  it("filtra por beneficio mínimo, respeta el antispam y limita por ejecución", () => {
    const s = { ...DEFAULT_ALERTS, minDealProfit: 1000, maxPerRun: 2 };
    const out = dealAlerts([deal(1, 500), deal(2, 5000), deal(3, 3000), deal(4, 9000), deal(5, 2000)], s, new Set(["deal:4"]), base);
    expect(out.map((a) => a.itemId)).toEqual([2, 3]);
    expect(out[0].html).toContain(`${base}/item/2`);
  });

  it("escapa los nombres para el HTML de Telegram", () => {
    const out = dealAlerts([{ ...deal(1, 99999), name: "A <b> & B" }], DEFAULT_ALERTS, new Set(), base);
    expect(out[0].html).toContain("A &lt;b&gt; &amp; B");
  });
});

describe("watchAlerts", () => {
  it("avisa al cruzar el objetivo hacia abajo o hacia arriba", () => {
    const out = watchAlerts(
      [
        { itemId: 1, name: "a", target: 100, direction: "below", min: 90 },
        { itemId: 2, name: "b", target: 100, direction: "below", min: 110 },
        { itemId: 3, name: "c", target: 100, direction: "above", min: 150 },
        { itemId: 4, name: "d", target: 100, direction: "above", min: null },
        { itemId: 5, name: "e", target: 100, direction: "below", min: 50 },
      ],
      new Set(["watch:5"]),
      base,
    );
    expect(out.map((a) => a.itemId)).toEqual([1, 3]);
  });
});

describe("levelingAlerts", () => {
  it("solo si cuesta al menos un 15% menos que una semana normal", () => {
    const out = levelingAlerts(
      [
        { slug: "mining", name: "Mining", from: 1, to: 100, cost: 80, medianCost: 100 },
        { slug: "blacksmithing", name: "Blacksmithing", from: 1, to: 100, cost: 90, medianCost: 100 },
      ],
      new Set(),
      base,
    );
    expect(out.map((a) => a.key)).toEqual(["leveling:mining"]);
    expect(out[0].html).toContain("20%");
  });
});

describe("resumen diario", () => {
  it("usa la hora de Polonia", () => {
    expect(warsawNow(new Date("2026-11-22T08:30:00Z"))).toEqual({ date: "2026-11-22", hour: 9 });
  });

  it("toca a partir de la hora elegida y una sola vez al día", () => {
    const now = new Date("2026-11-22T08:30:00Z"); // 9:30 en Polonia
    expect(digestKeyDue(now, 9, new Set())).toBe("digest:2026-11-22");
    expect(digestKeyDue(now, 10, new Set())).toBeNull();
    expect(digestKeyDue(now, 9, new Set(["digest:2026-11-22"]))).toBeNull();
  });

  it("incluye chollos y avisa si la descarga está parada", () => {
    const html = digestHtml({ base, day: 19, next: { name: "Raids", daysUntil: 17 }, deals: [deal(7, 12345)], buys: [], leveling: [], hoursSinceIngest: 5 });
    expect(html).toContain("Día 19");
    expect(html).toContain("/item/7");
    expect(html).toContain("hace 5 h");
  });
});

describe("resetAlerts", () => {
  const ev = { itemId: 7, name: "Arcanite Bar", prevMin: 90000, newMin: 150000, market: 100000, units: 12, cost: 1_100_000, minNow: 149000 };
  it("avisa de un reset grande y sugiere vender 1c por debajo", () => {
    const [a] = resetAlerts([ev], DEFAULT_ALERTS, new Set(), "https://x");
    expect(a.key).toBe("reset:7");
    expect(a.html).toContain("vende a 14g 89s");
  });
  it("respeta el antispam y el mínimo", () => {
    expect(resetAlerts([ev], DEFAULT_ALERTS, new Set(["reset:7"]), "https://x")).toEqual([]);
    expect(resetAlerts([{ ...ev, cost: 100 }], DEFAULT_ALERTS, new Set(), "https://x")).toEqual([]);
  });
});

describe("eventAlerts", () => {
  const ev = {
    slug: "darkmoon-faire",
    name: "Feria de la Luna Negra",
    starts: "2026-12-07",
    phase: "soon" as const,
    daysUntil: 14,
    daysLeft: 0,
    daysSinceStart: -14,
    items: [
      { itemId: 5134, name: "Small Furry Paw", min: 500, action: "buy" as const },
      { itemId: 4363, name: "Copper Modulator", min: 900, action: "wait" as const },
    ],
  };
  it("a 14 días avisa solo de lo que conviene comprar", () => {
    const [a] = eventAlerts([ev], new Set(), "https://x");
    expect(a.key).toBe("event:darkmoon-faire:2026-12-07:buy");
    expect(a.html).toContain("Small Furry Paw");
    expect(a.html).not.toContain("Copper Modulator");
  });
  it("una vez por aparición", () => {
    expect(eventAlerts([ev], new Set(["event:darkmoon-faire:2026-12-07:buy"]), "https://x")).toEqual([]);
  });
  it("fuera de la ventana no avisa", () => {
    expect(eventAlerts([{ ...ev, daysUntil: 10 }], new Set(), "https://x")).toEqual([]);
  });
  it("al empezar, vender", () => {
    const [a] = eventAlerts([{ ...ev, phase: "during", daysUntil: 0, daysLeft: 7, daysSinceStart: 0 }], new Set(), "https://x");
    expect(a.key).toBe("event:darkmoon-faire:2026-12-07:sell");
  });
  it("no repite el aviso de vender a mitad de un evento largo", () => {
    expect(eventAlerts([{ ...ev, phase: "during", daysUntil: 0, daysLeft: 10, daysSinceStart: 5 }], new Set(), "https://x")).toEqual([]);
  });
});
