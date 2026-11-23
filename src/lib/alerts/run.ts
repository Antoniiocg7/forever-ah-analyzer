import type { SupabaseClient } from "@supabase/supabase-js";
import { categorize, gameContext, investAdvice } from "../calendar";
import { calendarEvents, dealSettings, flipCandidates, latestRows, marketableItems, itemsBasic, recentResets } from "../deals-queries";
import { pick } from "../lang";
import { scoreDeal } from "../pricing/deals";
import { buildPlan } from "../professions/plan";
import { economySettings, marketData, recipesFor } from "../professions/queries";
import { hoursSinceLastIngest, trackedHouses } from "../queries";
import { sendTelegram } from "../telegram";
import {
  COOLDOWN_HOURS,
  DEFAULT_ALERTS,
  dealAlerts,
  digestHtml,
  digestKeyDue,
  levelingAlerts,
  resetAlerts,
  watchAlerts,
  type Alert,
  type AlertSettings,
  type DealCandidate,
  type LevelingCandidate,
} from "./rules";

export const PUBLIC_URL = process.env.PUBLIC_URL ?? "https://forever-ah-analyzer.vercel.app";

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

export async function alertConfig(db: SupabaseClient): Promise<{ settings: AlertSettings; chatId: string | null }> {
  const rows = await must(db.from("settings").select("key, value").in("key", ["alerts", "telegram_chat_id"]));
  const get = (k: string) => (rows ?? []).find((r) => r.key === k)?.value;
  const raw = (get("alerts") ?? {}) as Record<string, unknown>;
  const settings: AlertSettings = {
    enabled: raw.enabled !== false,
    minDealProfit: typeof raw.min_deal_profit === "number" ? raw.min_deal_profit : DEFAULT_ALERTS.minDealProfit,
    maxPerRun: typeof raw.max_per_run === "number" ? raw.max_per_run : DEFAULT_ALERTS.maxPerRun,
    dailyHour: typeof raw.daily_hour === "number" ? raw.daily_hour : DEFAULT_ALERTS.dailyHour,
    lang: raw.lang === "es" ? "es" : "en",
    leveling: Array.isArray(raw.leveling) ? (raw.leveling as AlertSettings["leveling"]) : [],
  };
  const chat = get("telegram_chat_id");
  return { settings, chatId: typeof chat === "string" || typeof chat === "number" ? String(chat) : null };
}

/** Claves enviadas recientemente, respetando el tiempo de espera de cada tipo. */
async function recentKeys(db: SupabaseClient, now: Date): Promise<Set<string>> {
  const since = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();
  const rows = await must(db.from("alerts_sent").select("key, kind, sent_at").gte("sent_at", since).not("key", "is", null));
  const out = new Set<string>();
  for (const r of rows ?? []) {
    const hours = COOLDOWN_HOURS[r.kind as keyof typeof COOLDOWN_HOURS] ?? 48;
    if (now.getTime() - new Date(r.sent_at as string).getTime() < hours * 3600 * 1000) out.add(r.key as string);
  }
  return out;
}

async function levelingResults(houseId: number, faction: string, s: AlertSettings): Promise<LevelingCandidate[]> {
  if (s.leveling.length === 0) return [];
  const econ = await economySettings(faction);
  const out: LevelingCandidate[] = [];
  for (const target of s.leveling) {
    const recipes = await recipesFor(target.slug);
    if (recipes.length === 0) continue;
    const craftable = await recipesFor([...new Set([...econ.myProfessions, target.slug])]);
    const ids = new Set<number>();
    for (const r of [...recipes, ...craftable]) {
      for (const id of [r.yields_item, r.learned_from_item, ...r.recipe_reagents.map((g) => g.item_id)]) if (typeof id === "number") ids.add(id);
    }
    const { markets } = await marketData(houseId, [...ids]);
    const plan = buildPlan({ recipes, craftable, markets, settings: econ, from: target.from, to: target.to, includeUnlistedPlans: false, sellOnAh: false });
    if (plan.route.steps.length === 0 || plan.medianCost === null) continue;
    out.push({
      slug: target.slug,
      name: pick(recipes[0].profession, recipes[0].profession_es, s.lang) ?? recipes[0].profession,
      from: target.from,
      to: plan.route.reached,
      cost: plan.route.cost,
      medianCost: plan.medianCost,
    });
  }
  return out;
}

export type AlertRun = { sent: number; skipped?: string; errors: string[] };

/**
 * Evalúa y envía las alertas: chollos, lista de seguimiento, buen momento para subir profesiones y
 * el resumen diario. Pensado para ejecutarse tras cada ingesta horaria.
 */
export async function runAlerts(db: SupabaseClient, now = new Date()): Promise<AlertRun> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const { settings: s, chatId } = await alertConfig(db);
  if (!token) return { sent: 0, skipped: "falta TELEGRAM_BOT_TOKEN", errors: [] };
  if (!chatId) return { sent: 0, skipped: "no hay chat conectado (pnpm telegram-setup)", errors: [] };
  if (!s.enabled) return { sent: 0, skipped: "alertas desactivadas", errors: [] };

  const houses = await trackedHouses();
  const house = houses[0];
  if (!house) return { sent: 0, skipped: "no hay casa marcada", errors: [] };
  const recent = await recentKeys(db, now);

  // Chollos para revender.
  const ds = await dealSettings(house.faction);
  const deals: DealCandidate[] = [];
  for (const r of await flipCandidates(house.id, ds)) {
    const d = scoreDeal(
      { min: r.min_buyout, market7d: r.market_7d, soldPerDay: r.sold_per_day, qty: r.qty, vendorSell: r.vendor_sell, dealUnits: r.deal_units, dealCost: r.deal_cost },
      ds,
    );
    if (!d || r.market_7d === null || r.sold_per_day === null) continue;
    deals.push({
      itemId: r.item_id,
      name: pick(r.name_en, r.name_es, s.lang) ?? `#${r.item_id}`,
      min: r.min_buyout,
      market7d: r.market_7d,
      units: r.deal_units || 1,
      cost: r.deal_units ? r.deal_cost : r.min_buyout,
      depthProfit: d.depthProfit,
      soldPerDay: r.sold_per_day,
    });
  }

  // Lista de seguimiento.
  const watch = (await must(db.from("watchlist").select("item_id, target_price, direction"))) ?? [];
  const { markets, info } = watch.length ? await marketData(house.id, watch.map((w) => w.item_id as number)) : { markets: new Map(), info: new Map() };
  const watched = watch.map((w) => ({
    itemId: w.item_id as number,
    name: pick(info.get(w.item_id)?.name, info.get(w.item_id)?.nameEs, s.lang) ?? `#${w.item_id}`,
    target: Number(w.target_price),
    direction: w.direction as "below" | "above",
    min: markets.get(w.item_id)?.min ?? null,
  }));

  const leveling = await levelingResults(house.id, house.faction, s);

  // Resets de otros detectados en las últimas 2 h y que siguen en pie.
  const fresh = (await recentResets(house.id, 2)).filter((e) => e.status === "open");
  const freshIds = fresh.map((e) => e.item_id);
  const [freshRows, freshItems] = await Promise.all([latestRows(house.id, freshIds), itemsBasic(freshIds)]);
  const resets = fresh.map((e) => {
    const it = freshRows.get(e.item_id) ?? freshItems.get(e.item_id);
    return {
      itemId: e.item_id,
      name: pick(it?.name_en, it?.name_es, s.lang) ?? `#${e.item_id}`,
      prevMin: Number(e.prev_min),
      newMin: Number(e.new_min),
      market: Number(e.market),
      units: e.units,
      cost: Number(e.cost),
      minNow: freshRows.get(e.item_id)?.min_buyout ?? null,
    };
  });

  const alerts: Alert[] = [
    ...watchAlerts(watched, recent, PUBLIC_URL),
    ...dealAlerts(deals, s, recent, PUBLIC_URL),
    ...levelingAlerts(leveling, recent, PUBLIC_URL),
    ...resetAlerts(resets, s, recent, PUBLIC_URL),
  ];

  const digestKey = digestKeyDue(now, s.dailyHour, recent);
  if (digestKey) {
    const events = await calendarEvents();
    const ctx = gameContext(events, now.getTime());
    const raidSoon = events.some((e) => e.kind === "raid" && ctx.next?.date === e.date) && (ctx.next?.daysUntil ?? 999) <= 45;
    const buys = (await marketableItems(house.id))
      .filter((r) => ["raid-consumable", "raid-material"].includes(categorize(r.name_en) ?? "") && r.market_7d && investAdvice(r, raidSoon).buy)
      .sort((a, b) => (b.discount ?? 0) - (a.discount ?? 0))
      .map((r) => ({ itemId: r.item_id, name: pick(r.name_en, r.name_es, s.lang) ?? `#${r.item_id}`, min: r.min_buyout, market7d: r.market_7d! }));
    alerts.push({
      key: digestKey,
      kind: "digest",
      html: digestHtml({
        base: PUBLIC_URL,
        day: ctx.day,
        next: ctx.next,
        deals: [...deals].sort((a, b) => b.depthProfit - a.depthProfit),
        buys,
        leveling,
        hoursSinceIngest: await hoursSinceLastIngest(),
      }),
    });
  }

  let sent = 0;
  const errors: string[] = [];
  for (const a of alerts) {
    try {
      await sendTelegram(token, chatId, a.html);
      await must(db.from("alerts_sent").insert({ kind: a.kind, item_id: a.itemId ?? null, key: a.key, payload: { html: a.html } }));
      sent++;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { sent, errors };
}
