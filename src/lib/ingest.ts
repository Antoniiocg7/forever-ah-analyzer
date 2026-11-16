import type { SupabaseClient } from "@supabase/supabase-js";
import { BlizzardClient } from "./blizzard/client";
import { factionFromName } from "./blizzard/schemas";
import { aggregateListings } from "./pricing/aggregate";
import { estimateSales, MAX_GAP_MS, toCompact, type CompactAuction } from "./pricing/sales";
import { REFERENCE_ITEMS } from "./reference-items";

const CHUNK = 1000;
const MAX_NEW_ITEMS_PER_RUN = 3000;

export function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

async function logError(db: SupabaseClient, houseId: number | null, stage: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${stage}] casa ${houseId ?? "-"}: ${message}`);
  await db.from("ingest_errors").insert({ house_id: houseId, stage, message });
}

export type IngestResult = { houseId: number; status: "ok" | "not-modified" | "error"; items?: number; auctions?: number };

/** Ingesta de una casa: descarga, agrega por objeto, estima ventas y guarda el snapshot. */
export async function ingestHouse(
  db: SupabaseClient,
  blizzard: BlizzardClient,
  rulesetId: number,
  houseId: number,
): Promise<IngestResult> {
  try {
    const last = await must(
      db.from("snapshots").select("last_modified_header").eq("house_id", houseId).order("fetched_at", { ascending: false }).limit(1),
    );
    const fetchedAt = new Date();
    const result = await blizzard.listings(rulesetId, houseId, last?.[0]?.last_modified_header ?? null);
    if (!result) return { houseId, status: "not-modified" };
    const { listings, lastModified, skipped } = result;
    if (skipped > 0) await logError(db, houseId, "parse", `${skipped} subastas con formato inesperado`);
    if (listings.length === 0) throw new Error("La API devolvió 0 subastas");

    const aggregates = aggregateListings(listings);

    const state = await must(db.from("house_state").select("fetched_at, auctions").eq("house_id", houseId).maybeSingle());
    const canEstimate = state !== null && fetchedAt.getTime() - new Date(state.fetched_at).getTime() <= MAX_GAP_MS;
    const sold = canEstimate ? estimateSales(state.auctions as CompactAuction[], listings) : null;

    const snapshot = await must(
      db
        .from("snapshots")
        .insert({ house_id: houseId, fetched_at: fetchedAt.toISOString(), last_modified_header: lastModified, auction_count: listings.length })
        .select("id")
        .single(),
    );
    if (!snapshot) throw new Error("No se pudo crear el snapshot");

    const rows = [...aggregates.values()].map((a) => ({
      snapshot_id: snapshot.id,
      item_id: a.itemId,
      min_buyout: a.minBuyout,
      p15_market: a.p15Market,
      median: a.median,
      qty: a.qty,
      num_auctions: a.numAuctions,
      est_sold: sold ? (sold.get(a.itemId) ?? 0) : null,
    }));
    for (const part of chunks(rows, CHUNK)) await must(db.from("item_prices_hourly").insert(part));

    await must(
      db.from("house_state").upsert({
        house_id: houseId,
        snapshot_id: snapshot.id,
        fetched_at: fetchedAt.toISOString(),
        auctions: toCompact(listings),
      }),
    );
    await must(db.from("houses").update({ auction_count: listings.length }).eq("id", houseId));

    return { houseId, status: "ok", items: rows.length, auctions: listings.length };
  } catch (err) {
    await logError(db, houseId, "ingest", err);
    return { houseId, status: "error" };
  }
}

/** Consulta en static-forever los objetos que aún no están en `items` y los guarda. Lanza si falla la BD. */
export async function storeItems(db: SupabaseClient, blizzard: BlizzardClient, ids: number[], limit = Infinity): Promise<number> {
  // Los que ya están en `items` con source='missing' dieron 404: no se reintentan.
  const known = new Set<number>();
  for (const part of chunks(ids, 500)) {
    const rows = await must(db.from("items").select("id").in("id", part));
    for (const r of rows ?? []) known.add(r.id as number);
  }
  const todo = ids.filter((id) => !known.has(id)).slice(0, limit);

  let done = 0;
  for (const batch of chunks(todo, 10)) {
    const rows = await Promise.all(
      batch.map(async (id) => {
        const item = await blizzard.item(id).catch(() => undefined);
        if (item === undefined) return null; // error de red: se reintenta en la próxima ejecución
        if (item === null) return { id, source: "missing" };
        return {
          id,
          name_en: item.name ?? null,
          quality: item.quality?.type ?? null,
          vendor_sell: item.sell_price ?? null,
          vendor_buy: item.purchase_price ?? null,
          class: item.item_class?.name ?? null,
          subclass: item.item_subclass?.name ?? null,
          source: "blizzard",
        };
      }),
    );
    const valid = rows.filter((r) => r !== null);
    // Dos upserts: PostgREST exige las mismas columnas en todas las filas de un lote.
    const found = valid.filter((r) => r.source === "blizzard");
    const missing = valid.filter((r) => r.source === "missing");
    if (found.length) await must(db.from("items").upsert(found));
    if (missing.length) await must(db.from("items").upsert(missing));
    done += valid.length;
  }
  return done;
}

/** Rellena `items` con los objetos vistos en la subasta que aún no conocemos. */
export async function syncItemNames(db: SupabaseClient, blizzard: BlizzardClient, houseIds: number[]): Promise<number> {
  try {
    const seen = new Set<number>();
    for (const houseId of houseIds) {
      for (let from = 0; ; from += CHUNK) {
        const page = await must(
          db.from("latest_item_prices").select("item_id").eq("house_id", houseId).is("name_en", null).order("item_id").range(from, from + CHUNK - 1),
        );
        for (const r of page ?? []) seen.add(r.item_id as number);
        if (!page || page.length < CHUNK) break;
      }
    }
    if (seen.size === 0) return 0;

    return await storeItems(db, blizzard, [...seen], MAX_NEW_ITEMS_PER_RUN);
  } catch (err) {
    await logError(db, null, "items", err);
    return 0;
  }
}

/** Fase 0: descarga todas las casas y guarda el precio mínimo de los materiales de referencia. */
export async function discoverHouses(db: SupabaseClient, blizzard: BlizzardClient, rulesetId: number) {
  const houses = await blizzard.houses(rulesetId);
  const refIds = new Set(REFERENCE_ITEMS.map((i) => i.id));
  const summary: { id: number; name: string; auctions: number }[] = [];

  for (const house of houses) {
    const id = house.id;
    try {
      const name = house.name ?? `House ${id}`;
      const result = await blizzard.listings(rulesetId, id);
      const listings = result?.listings ?? [];
      const aggregates = aggregateListings(listings.filter((l) => refIds.has(l.itemId)));
      const now = new Date().toISOString();

      // No se toca label/tracked si la casa ya existía.
      await must(
        db.from("houses").upsert(
          { id, region: blizzard.region, name, faction: factionFromName(house.name), auction_count: listings.length, probed_at: now },
          { onConflict: "id" },
        ),
      );
      await must(
        db.from("house_probe").upsert(
          REFERENCE_ITEMS.map((item) => ({
            house_id: id,
            item_id: item.id,
            min_buyout: aggregates.get(item.id)?.minBuyout ?? null,
            qty: aggregates.get(item.id)?.qty ?? 0,
            fetched_at: now,
          })),
        ),
      );
      summary.push({ id, name, auctions: listings.length });
      console.log(`casa ${id} · ${name} · ${listings.length} subastas`);
    } catch (err) {
      await logError(db, id, "discover", err);
    }
  }
  return summary;
}
