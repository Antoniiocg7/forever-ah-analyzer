import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseSavedVariables } from "./lua-saved";

/**
 * Datos del jugador a partir del archivo de AHledger (addon de terceros: solo se leen tus datos
 * guardados, no se usa su código). El formato no es público: todo se valida y lo que no encaja se
 * descarta sin romper la sincronización.
 */

export type Character = { key: string; name: string; realm: string | null; faction: string | null; money: number | null; bagsAt: string | null; bankAt: string | null };
export type InventoryRow = { charKey: string; itemId: number; place: "bags" | "bank"; qty: number; bound: boolean };
export type LedgerEntry = {
  seq: number;
  at: string;
  kind: "post" | "sale" | "buy" | "expire" | "cancel";
  itemId: number | null;
  name: string | null;
  qty: number;
  price: number;
  cut: number;
  deposit: number;
  hours: number | null;
};
export type PlayerData = { characters: Character[]; inventory: InventoryRow[]; ledger: LedgerEntry[]; skipped: number };

const num = z.coerce.number().finite();
const charSchema = z.object({
  n: z.string(),
  r: z.string().optional(),
  f: z.string().optional(),
  g: num.optional(),
  t: num.optional(),
  bt: num.optional(),
  b: z.string().optional(),
  k: z.string().optional(),
});
const entrySchema = z.object({
  s: num,
  t: num,
  k: z.enum(["post", "sale", "buy", "expire", "cancel"]),
  id: num.optional(),
  name: z.string().optional(),
  q: num.optional(),
  p: num.optional(),
  cut: num.optional(),
  dep: num.optional(),
  h: num.optional(),
});

const iso = (unix: number | undefined) => (unix && unix > 0 ? new Date(unix * 1000).toISOString() : null);

/** "id:cantidad:ligado,id:cantidad:ligado" → filas. */
export function parseItemList(s: string | undefined, charKey: string, place: "bags" | "bank"): InventoryRow[] {
  if (!s) return [];
  const out: InventoryRow[] = [];
  for (const part of s.split(",")) {
    const [id, qty, bound] = part.split(":").map(Number);
    if (Number.isInteger(id) && id > 0 && Number.isInteger(qty) && qty > 0) out.push({ charKey, itemId: id, place, qty, bound: bound === 1 });
  }
  return out;
}

/** Extrae personajes, inventario y libro de AHledgerDB ya leído. */
export function extractPlayerData(db: unknown): PlayerData {
  const root = (db && typeof db === "object" ? db : {}) as Record<string, unknown>;
  const characters: Character[] = [];
  const inventory: InventoryRow[] = [];
  const ledger: LedgerEntry[] = [];
  let skipped = 0;

  const inv = root.inventory && typeof root.inventory === "object" ? (root.inventory as Record<string, unknown>) : {};
  for (const [key, raw] of Object.entries(inv)) {
    const c = charSchema.safeParse(raw);
    if (!c.success) {
      skipped++;
      continue;
    }
    characters.push({
      key,
      name: c.data.n,
      realm: c.data.r ?? null,
      faction: c.data.f ?? null,
      money: c.data.g ?? null,
      bagsAt: iso(c.data.t),
      bankAt: iso(c.data.bt),
    });
    inventory.push(...parseItemList(c.data.b, key, "bags"), ...parseItemList(c.data.k, key, "bank"));
  }

  for (const raw of Array.isArray(root.ledger) ? root.ledger : []) {
    const e = entrySchema.safeParse(raw);
    if (!e.success) {
      skipped++;
      continue;
    }
    ledger.push({
      seq: e.data.s,
      at: iso(e.data.t)!,
      kind: e.data.k,
      itemId: e.data.id ?? null,
      name: e.data.name?.trim() || null,
      qty: Math.max(1, Math.round(e.data.q ?? 1)),
      price: Math.round(e.data.p ?? 0),
      cut: Math.round(e.data.cut ?? 0),
      deposit: Math.round(e.data.dep ?? 0),
      hours: e.data.h ?? null,
    });
  }
  return { characters, inventory, ledger, skipped };
}

/** Lee el texto del archivo AHledger.lua. */
export function readAhledgerFile(text: string): PlayerData {
  const vars = parseSavedVariables(text);
  if (!vars.AHledgerDB) throw new Error("El archivo no contiene AHledgerDB: ¿es AHledger.lua de SavedVariables?");
  return extractPlayerData(vars.AHledgerDB);
}

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Guarda los datos en Supabase. Personajes y libro se actualizan (el libro por número de secuencia,
 * así que repetir la sincronización no duplica nada); el inventario de cada personaje se reemplaza.
 */
export async function importPlayerData(db: SupabaseClient, d: PlayerData): Promise<{ characters: number; items: number; ledger: number }> {
  // AHledger no siempre apunta el ID (algunas ventas solo traen el nombre): se busca por nombre.
  const missing = [...new Set(d.ledger.filter((e) => e.itemId === null && e.name).map((e) => e.name!))];
  if (missing.length) {
    const found = new Map<string, number>();
    for (let i = 0; i < missing.length; i += 200) {
      const rows = await must(db.from("items").select("id, name_en").in("name_en", missing.slice(i, i + 200)));
      const seen = new Map<string, number[]>();
      for (const r of (rows ?? []) as { id: number; name_en: string }[]) seen.set(r.name_en, [...(seen.get(r.name_en) ?? []), r.id]);
      // Solo si el nombre es único (hay objetos distintos con el mismo nombre).
      for (const [n, ids] of seen) if (ids.length === 1) found.set(n, ids[0]);
    }
    // También vale el ID que el propio libro tiene para ese nombre en otras entradas.
    for (const e of d.ledger) if (e.itemId !== null && e.name && !found.has(e.name)) found.set(e.name, e.itemId);
    d = { ...d, ledger: d.ledger.map((e) => (e.itemId === null && e.name && found.has(e.name) ? { ...e, itemId: found.get(e.name)! } : e)) };
  }

  if (d.characters.length) {
    await must(
      db.from("my_characters").upsert(
        d.characters.map((c) => ({
          key: c.key,
          name: c.name,
          realm: c.realm,
          faction: c.faction,
          money: c.money,
          bags_at: c.bagsAt,
          bank_at: c.bankAt,
          updated_at: new Date().toISOString(),
        })),
      ),
    );
    await must(db.from("my_inventory").delete().in("char_key", d.characters.map((c) => c.key)));
    for (let i = 0; i < d.inventory.length; i += 1000) {
      await must(
        db.from("my_inventory").insert(
          d.inventory.slice(i, i + 1000).map((r) => ({ char_key: r.charKey, item_id: r.itemId, place: r.place, qty: r.qty, bound: r.bound })),
        ),
      );
    }
  }
  for (let i = 0; i < d.ledger.length; i += 1000) {
    await must(
      db.from("my_ledger").upsert(
        d.ledger.slice(i, i + 1000).map((e) => ({
          seq: e.seq,
          at: e.at,
          kind: e.kind,
          item_id: e.itemId,
          name: e.name,
          qty: e.qty,
          price: e.price,
          cut: e.cut,
          deposit: e.deposit,
          hours: e.hours,
        })),
      ),
    );
  }
  return { characters: d.characters.length, items: d.inventory.length, ledger: d.ledger.length };
}
