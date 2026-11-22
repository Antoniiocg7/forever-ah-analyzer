import type { SupabaseClient } from "@supabase/supabase-js";
import { BlizzardClient } from "./blizzard/client";
import { factionFromName } from "./blizzard/schemas";
import { aggregateListings } from "./pricing/aggregate";
import { computeDepth } from "./pricing/deals";
import { decodeState, encodeState, estimateSales, toCompact } from "./pricing/sales";
import { REFERENCE_ITEMS } from "./reference-items";

const CHUNK = 1000;
const MAX_NEW_ITEMS_PER_RUN = 3000;
const MAX_ICONS_PER_RUN = 2000;

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

export async function logError(db: SupabaseClient, houseId: number | null, stage: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[${stage}] casa ${houseId ?? "-"}: ${message}`);
  await db.from("ingest_errors").insert({ house_id: houseId, stage, message });
}

export type IngestResult = {
  houseId: number;
  status: "ok" | "not-modified" | "error";
  items?: number;
  auctions?: number;
  /** Minutos entre este snapshot y el anterior; null si no se pudieron estimar ventas. */
  gapMinutes?: number | null;
};

/** Mediana de 7 días y precio de vendedor de lo que hay en venta, para calcular la profundidad de los chollos. */
async function depthReferences(db: SupabaseClient, houseId: number): Promise<[Map<number, number>, Map<number, number>]> {
  const market = new Map<number, number>();
  const vendor = new Map<number, number>();
  for (let from = 0; ; from += CHUNK) {
    const page = await must(
      db.from("latest_item_prices").select("item_id, market_7d, vendor_sell").eq("house_id", houseId).order("item_id").range(from, from + CHUNK - 1),
    );
    for (const r of page ?? []) {
      if (r.market_7d) market.set(r.item_id as number, Number(r.market_7d));
      if (r.vendor_sell) vendor.set(r.item_id as number, Number(r.vendor_sell));
    }
    if (!page || page.length < CHUNK) break;
  }
  return [market, vendor];
}

/** Hora de los datos según Last-Modified; si falta, la de descarga. */
function dataTime(lastModified: string | null, fallback: Date): Date {
  const t = lastModified ? Date.parse(lastModified) : NaN;
  return Number.isNaN(t) ? fallback : new Date(t);
}

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
    const dataAt = dataTime(lastModified, fetchedAt);

    const aggregates = aggregateListings(listings);
    const depth = computeDepth(listings, ...(await depthReferences(db, houseId)));

    // Ventas: diferencia con el estado anterior. Si el estado está corrupto, se sigue sin estimar.
    let sold: Map<number, number> | null = null;
    let gapMs: number | null = null;
    const prev = await must(db.from("house_state").select("data_at, fetched_at, state").eq("house_id", houseId).maybeSingle());
    if (prev) {
      try {
        gapMs = dataAt.getTime() - new Date(prev.data_at ?? prev.fetched_at).getTime();
        sold = estimateSales(decodeState(prev.state as string), listings, gapMs);
      } catch (err) {
        await logError(db, houseId, "state", err);
      }
    }
    const gapMinutes = sold && gapMs !== null ? Math.round(gapMs / 60_000) : null;

    const snapshot = await must(
      db
        .from("snapshots")
        .insert({
          house_id: houseId,
          fetched_at: fetchedAt.toISOString(),
          data_at: dataAt.toISOString(),
          last_modified_header: lastModified,
          auction_count: listings.length,
          gap_minutes: gapMinutes,
        })
        .select("id")
        .single(),
    );
    if (!snapshot) throw new Error("No se pudo crear el snapshot");

    const rows: Record<string, number | null>[] = [...aggregates.values()].map((a) => ({
      snapshot_id: snapshot.id,
      item_id: a.itemId,
      min_buyout: a.minBuyout,
      p15_market: a.p15Market,
      qty: a.qty,
      num_auctions: a.numAuctions,
      est_sold: sold ? (sold.get(a.itemId) ?? 0) : null,
    }));
    // Objetos que se han agotado: sin precio, pero sus ventas cuentan.
    for (const [itemId, n] of sold ?? []) {
      if (!aggregates.has(itemId) && n > 0) {
        rows.push({ snapshot_id: snapshot.id, item_id: itemId, min_buyout: null, p15_market: null, qty: 0, num_auctions: 0, est_sold: n });
      }
    }
    for (const part of chunks(rows, CHUNK)) await must(db.from("item_prices_hourly").insert(part));

    // Precio actual: se sobrescribe y luego se borra lo que ya no está en venta.
    const latest = [...aggregates.values()].map((a) => ({
      house_id: houseId,
      item_id: a.itemId,
      snapshot_id: snapshot.id,
      fetched_at: fetchedAt.toISOString(),
      min_buyout: a.minBuyout,
      p15_market: a.p15Market,
      qty: a.qty,
      num_auctions: a.numAuctions,
      deal_units: depth.get(a.itemId)?.dealUnits ?? 0,
      deal_cost: depth.get(a.itemId)?.dealCost ?? 0,
      vendor_units: depth.get(a.itemId)?.vendorUnits ?? 0,
      vendor_profit: depth.get(a.itemId)?.vendorProfit ?? 0,
    }));
    for (const part of chunks(latest, CHUNK)) await must(db.from("item_prices_latest").upsert(part));
    await must(db.from("item_prices_latest").delete().eq("house_id", houseId).neq("snapshot_id", snapshot.id));
    // Ventas de las últimas 24 h (para mostrar ventas/día sin esperar a la media semanal).
    await must(db.rpc("refresh_recent_sales", { p_house: houseId }));

    await must(
      db.from("house_state").upsert({
        house_id: houseId,
        snapshot_id: snapshot.id,
        fetched_at: fetchedAt.toISOString(),
        data_at: dataAt.toISOString(),
        state: encodeState(toCompact(listings)),
      }),
    );
    await must(db.from("houses").update({ auction_count: listings.length }).eq("id", houseId));

    return { houseId, status: "ok", items: rows.length, auctions: listings.length, gapMinutes };
  } catch (err) {
    await logError(db, houseId, "ingest", err);
    return { houseId, status: "error" };
  }
}

type ItemData = NonNullable<Awaited<ReturnType<BlizzardClient["item"]>>>;

const itemRow = (id: number, item: ItemData, source: "blizzard" | "classic") => ({
  id,
  name_en: item.name ?? null,
  name_es: item.name_es ?? null,
  quality: item.quality?.type ?? null,
  vendor_sell: item.sell_price ?? null,
  vendor_buy: item.purchase_price ?? null,
  class: item.item_class?.name ?? null,
  subclass: item.item_subclass?.name ?? null,
  item_level: item.level ?? null,
  required_level: item.required_level ?? null,
  teaches_profession_id: item.preview_item?.requirements?.skill?.profession.id ?? null,
  teaches_skill: item.preview_item?.requirements?.skill?.level ?? null,
  teaches_item: item.preview_item?.recipe?.item?.item.id ?? null,
  source,
  updated_at: new Date().toISOString(),
});

/**
 * Consulta los objetos indicados y los guarda. Primero static-forever; si da 404, el catálogo de
 * Classic Era. `source`: 'blizzard' (Forever), 'classic', o 'none' (no está en ninguno).
 */
export async function fetchItems(db: SupabaseClient, blizzard: BlizzardClient, ids: number[]): Promise<number> {
  let done = 0;
  for (const batch of chunks(ids, 10)) {
    const rows = await Promise.all(
      batch.map(async (id) => {
        try {
          const forever = await blizzard.item(id, "static");
          if (forever) return itemRow(id, forever, "blizzard");
          const classic = await blizzard.item(id, "classic");
          if (classic) return itemRow(id, classic, "classic");
          return { id, source: "none" };
        } catch {
          return null; // error de red: se reintenta en la próxima ejecución
        }
      }),
    );
    const valid = rows.filter((r) => r !== null);
    // Upserts separados: PostgREST exige las mismas columnas en todas las filas de un lote.
    const found = valid.filter((r) => r.source !== "none");
    const none = valid.filter((r) => r.source === "none");
    if (found.length) await must(db.from("items").upsert(found));
    if (none.length) await must(db.from("items").upsert(none));
    done += valid.length;
  }
  return done;
}

/** Guarda los objetos que aún no están en `items` (o que solo se probaron en static-forever). */
export async function storeItems(db: SupabaseClient, blizzard: BlizzardClient, ids: number[], limit = Infinity): Promise<number> {
  const known = new Set<number>();
  for (const part of chunks(ids, 500)) {
    const rows = await must(db.from("items").select("id, source").in("id", part));
    for (const r of rows ?? []) if (r.source !== "missing") known.add(r.id as number);
  }
  return fetchItems(db, blizzard, ids.filter((id) => !known.has(id)).slice(0, limit));
}

/** Busca los iconos que faltan (icon_url null). Los que no tienen icono quedan con ''. */
async function fetchIcons(db: SupabaseClient, blizzard: BlizzardClient, limit: number): Promise<number> {
  const rows = await must(db.from("items").select("id, source").is("icon_url", null).neq("source", "none").limit(limit));
  let done = 0;
  for (const batch of chunks(rows ?? [], 10)) {
    const icons = await Promise.all(
      batch.map(async (r) => {
        try {
          const ns = r.source === "classic" ? "classic" : "static";
          const url = (await blizzard.itemIcon(r.id as number, ns)) ?? (ns === "static" ? await blizzard.itemIcon(r.id as number, "classic") : null);
          return { id: r.id as number, icon_url: url ?? "" };
        } catch {
          return null;
        }
      }),
    );
    const valid = icons.filter((i) => i !== null);
    // Solo se actualiza icon_url: todas las filas ya existen.
    if (valid.length) await must(db.from("items").upsert(valid, { onConflict: "id" }));
    done += valid.length;
  }
  return done;
}

/**
 * Completa nombres e iconos de lo que hay en venta: objetos nuevos, los que dieron 404 en
 * static-forever antes de existir el respaldo de Classic ('missing'), y los iconos pendientes.
 */
export async function enrichItems(db: SupabaseClient, blizzard: BlizzardClient, houseIds: number[]) {
  try {
    const unnamed = new Set<number>();
    for (const houseId of houseIds) {
      for (let from = 0; ; from += CHUNK) {
        const page = await must(
          db.from("latest_item_prices").select("item_id").eq("house_id", houseId).is("name_en", null).order("item_id").range(from, from + CHUNK - 1),
        );
        for (const r of page ?? []) unnamed.add(r.item_id as number);
        if (!page || page.length < CHUNK) break;
      }
    }
    const named = unnamed.size ? await storeItems(db, blizzard, [...unnamed], MAX_NEW_ITEMS_PER_RUN) : 0;
    const icons = await fetchIcons(db, blizzard, MAX_ICONS_PER_RUN);
    return { named, icons };
  } catch (err) {
    await logError(db, null, "items", err);
    return { named: 0, icons: 0 };
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
