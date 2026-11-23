import { eventTiming, pastUplift, type EventTiming, type Occurrence } from "./seasonal";
import { supabaseAdmin } from "./supabase";

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export type SeasonalItem = { item_id: number; qty: number | null; note: string | null; confirmed: boolean };
export type SeasonalEvent = {
  id: number;
  slug: string;
  name: string;
  kind: "holiday" | "faire" | "other";
  notes: string | null;
  source: string | null;
  dates: (Occurrence & { id: number })[];
  items: SeasonalItem[];
  timing: EventTiming | null;
};

/** Eventos con sus fechas, objetos y fase actual, ordenados: en curso, próximos y luego los pasados. */
export async function seasonalEvents(now = Date.now()): Promise<SeasonalEvent[]> {
  const db = supabaseAdmin();
  const [events, dates, items] = await Promise.all([
    db.from("seasonal_events").select("id, slug, name, kind, notes, source"),
    db.from("seasonal_event_dates").select("id, event_id, starts, ends, place").order("starts"),
    db.from("seasonal_event_items").select("event_id, item_id, qty, note, confirmed"),
  ]);
  type D = Occurrence & { id: number; event_id: number };
  type I = SeasonalItem & { event_id: number };
  const ds = unwrap<D[]>(dates);
  const is = unwrap<I[]>(items);
  const out = unwrap<Omit<SeasonalEvent, "dates" | "items" | "timing">[]>(events).map((e) => {
    const evDates = ds.filter((d) => d.event_id === e.id).map(({ id, starts, ends, place }) => ({ id, starts, ends, place }));
    return {
      ...e,
      dates: evDates,
      items: is.filter((i) => i.event_id === e.id).map(({ item_id, qty, note, confirmed }) => ({ item_id, qty, note, confirmed })),
      timing: eventTiming(evDates, now),
    };
  });
  const rank = (e: SeasonalEvent) => (e.timing === null ? 3 : e.timing.phase === "during" ? 0 : e.timing.phase === "past" ? 2 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || (a.timing?.daysUntil ?? 0) - (b.timing?.daysUntil ?? 0));
}

/** Próximo evento (en curso o por venir) para el banner. */
export async function nextSeasonalEvent(): Promise<SeasonalEvent | null> {
  return (await seasonalEvents()).find((e) => e.timing && e.timing.phase !== "past") ?? null;
}

/**
 * Subida de precio en la última aparición pasada de cada evento (con historial suficiente), por
 * objeto. Mientras no haya historial de una aparición anterior, queda vacío.
 */
export async function pastUplifts(houseId: number, events: SeasonalEvent[], now = Date.now()): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const today = new Date(now).toISOString().slice(0, 10);
  for (const e of events) {
    const past = e.dates.filter((d) => d.ends < today).at(-1);
    if (!past || e.items.length === 0) continue;
    const from = new Date(Date.parse(`${past.starts}T00:00:00Z`) - 14 * 86_400_000).toISOString().slice(0, 10);
    const rows = unwrap<{ item_id: number; day: string; avg_market: number | null }[]>(
      await supabaseAdmin()
        .from("item_prices_daily")
        .select("item_id, day, avg_market")
        .eq("house_id", houseId)
        .in(
          "item_id",
          e.items.map((i) => i.item_id),
        )
        .gte("day", from)
        .lte("day", past.ends),
    );
    for (const it of e.items) {
      const up = pastUplift(
        rows.filter((r) => r.item_id === it.item_id).map((r) => ({ day: r.day, market: r.avg_market })),
        past,
      );
      if (up !== null) out.set(`${e.id}:${it.item_id}`, up);
    }
  }
  return out;
}
