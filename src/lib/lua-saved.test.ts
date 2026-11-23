import { describe, expect, it } from "vitest";
import { LuaParseError, parseSavedVariables } from "./lua-saved";

describe("parseSavedVariables", () => {
  it("lee el formato que escribe el juego", () => {
    const src = `
AHledgerDB = {
["inventory"] = {
["Heroe-Realm"] = {
["g"] = 241,
["b"] = "159:9:0,2589:18:0",
["n"] = "Heroe",
},
},
["ledger"] = {
{
["q"] = 80,
["p"] = 14400,
["k"] = "buy",
["name"] = "Solid Stone",
}, -- [1]
{
["k"] = "sale",
["p"] = -1.5e3,
["ok"] = true,
["no"] = false,
["x"] = nil,
}, -- [2]
},
}
OtherDB = nil
`;
    const out = parseSavedVariables(src);
    const db = out.AHledgerDB as Record<string, unknown>;
    expect((db.inventory as Record<string, Record<string, unknown>>)["Heroe-Realm"].g).toBe(241);
    const ledger = db.ledger as Record<string, unknown>[];
    expect(Array.isArray(ledger)).toBe(true);
    expect(ledger[0]).toEqual({ q: 80, p: 14400, k: "buy", name: "Solid Stone" });
    expect(ledger[1]).toMatchObject({ k: "sale", p: -1500, ok: true, no: false, x: null });
    expect(out.OtherDB).toBeNull();
  });

  it("entiende escapes, claves numéricas y nombres sin corchetes", () => {
    const out = parseSavedVariables(`X = { a = "di \\"hola\\"\\n", [10] = 'b', [1] = 1, "pos" }`);
    expect(out.X).toEqual({ a: 'di "hola"\n', "10": "b", "1": "pos" });
  });

  it("una lista con claves 1..n es un array", () => {
    expect(parseSavedVariables(`X = { [1] = "a", [2] = "b" }`).X).toEqual(["a", "b"]);
  });

  it("falla con algo que no es una tabla de datos", () => {
    expect(() => parseSavedVariables(`X = os.exit()`)).toThrow(LuaParseError);
  });
});
