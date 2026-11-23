import { describe, expect, it } from "vitest";
import { extractPlayerData, parseItemList, readAhledgerFile } from "./ahledger";
import { netByDay, summarizeLedger, type LedgerRow } from "./ledger-stats";

const FILE = `
AHledgerDB = {
["inventory"] = {
["Heroe-Realm 6"] = {
["n"] = "Heroe", ["r"] = "Realm 6", ["f"] = "alliance", ["g"] = 24100, ["t"] = 1795388705, ["bt"] = 0,
["b"] = "159:9:0,2589:18:0,6948:1:1", ["k"] = "",
},
["Roto"] = { ["sin"] = "nombre" },
},
["ledger"] = {
{ ["s"] = 1, ["t"] = 1794844924, ["k"] = "buy", ["id"] = 2840, ["name"] = "Copper Bar", ["q"] = 20, ["p"] = 2000 },
{ ["s"] = 2, ["t"] = 1794847532, ["k"] = "sale", ["id"] = 2840, ["name"] = "Copper Bar", ["q"] = 10, ["p"] = 3000, ["cut"] = 150, ["dep"] = 100 },
{ ["s"] = 3, ["t"] = 1794847600, ["k"] = "drop", ["id"] = 1 },
{ ["s"] = 4, ["t"] = 1794847700, ["k"] = "post", ["id"] = 2840, ["q"] = 10, ["p"] = 3000, ["h"] = 12 },
},
}
`;

describe("AHledger", () => {
  it("lee personajes, inventario y operaciones de la subasta; descarta lo demás", () => {
    const d = readAhledgerFile(FILE);
    expect(d.characters).toEqual([
      { key: "Heroe-Realm 6", name: "Heroe", realm: "Realm 6", faction: "alliance", money: 24100, bagsAt: new Date(1795388705000).toISOString(), bankAt: null },
    ]);
    expect(d.inventory).toHaveLength(3);
    expect(d.inventory[2]).toEqual({ charKey: "Heroe-Realm 6", itemId: 6948, place: "bags", qty: 1, bound: true });
    expect(d.ledger.map((e) => e.kind)).toEqual(["buy", "sale", "post"]);
    expect(d.ledger[1]).toMatchObject({ seq: 2, itemId: 2840, qty: 10, price: 3000, cut: 150, deposit: 100 });
    expect(d.skipped).toBe(2); // el personaje sin nombre y la entrada "drop"
  });

  it("parseItemList ignora basura", () => {
    expect(parseItemList("1:2:0,x:y,3:0:0,,", "c", "bank")).toEqual([{ charKey: "c", itemId: 1, place: "bank", qty: 2, bound: false }]);
  });

  it("sin AHledgerDB avisa", () => {
    expect(() => readAhledgerFile("Otro = {}")).toThrow(/AHledgerDB/);
  });

  it("extractPlayerData aguanta un objeto vacío", () => {
    expect(extractPlayerData({})).toEqual({ characters: [], inventory: [], ledger: [], skipped: 0 });
  });
});

describe("summarizeLedger", () => {
  const rows: LedgerRow[] = [
    { at: "2026-11-20T10:00:00Z", kind: "buy", item_id: 2840, name: "Copper Bar", qty: 20, price: 2000, cut: 0, deposit: 0 },
    { at: "2026-11-21T10:00:00Z", kind: "sale", item_id: 2840, name: "Copper Bar", qty: 10, price: 3000, cut: 150, deposit: 100 },
    { at: "2026-11-21T11:00:00Z", kind: "post", item_id: 2840, name: "Copper Bar", qty: 10, price: 3000, cut: 0, deposit: 0 },
    { at: "2026-11-22T10:00:00Z", kind: "expire", item_id: 2840, name: "Copper Bar", qty: 5, price: 0, cut: 0, deposit: 0 },
  ];

  it("totales y beneficio por objeto al coste medio de compra", () => {
    const s = summarizeLedger(rows);
    expect(s).toMatchObject({ sold: 10, income: 2850, cut: 150, bought: 20, spent: 2000, posted: 1, expired: 1, net: 850 });
    expect(s.items[0]).toMatchObject({ itemId: 2840, avgSell: 285, avgBuy: 100, flipProfit: 1850, expiredQty: 5 });
  });

  it("filtra por fecha", () => {
    expect(summarizeLedger(rows, new Date("2026-11-21T00:00:00Z")).spent).toBe(0);
  });

  it("neto por día", () => {
    expect(netByDay(rows)).toEqual([
      { day: "2026-11-20", income: 0, spent: 2000 },
      { day: "2026-11-21", income: 2850, spent: 0 },
    ]);
  });
});

describe("summarizeLedger une por nombre", () => {
  it("una venta sin ID se suma al objeto del mismo nombre", () => {
    const rows: LedgerRow[] = [
      { at: "2026-11-21T10:00:00Z", kind: "sale", item_id: null, name: "Tin Ore", qty: 19, price: 2500, cut: 0, deposit: 0 },
      { at: "2026-11-21T11:00:00Z", kind: "sale", item_id: 2771, name: "Tin Ore", qty: 15, price: 2000, cut: 0, deposit: 0 },
    ];
    const s = summarizeLedger(rows);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ itemId: 2771, soldQty: 34 });
  });
});
