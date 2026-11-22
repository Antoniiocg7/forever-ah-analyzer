"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminTokenOk } from "@/lib/admin";
import { MAX_SKILL } from "@/lib/professions/leveling";
import { parseMoney } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegram } from "@/lib/telegram";

const back = (path: string, msg: string) => redirect(`${path}${path.includes("?") ? "&" : "?"}msg=${msg}`);
const safePath = (v: FormDataEntryValue | null, fallback: string) => {
  const s = String(v ?? "");
  return s.startsWith("/") && !s.startsWith("//") ? s : fallback;
};

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

export async function saveAlertSettings(formData: FormData) {
  if (!adminTokenOk(String(formData.get("token") ?? ""))) back("/alerts", "token");
  const minProfit = parseMoney(String(formData.get("min_deal_profit") ?? ""));
  const maxPerRun = Number(formData.get("max_per_run"));
  const dailyHour = Number(formData.get("daily_hour"));
  if (minProfit === null || !Number.isInteger(maxPerRun) || maxPerRun < 0 || maxPerRun > 20 || !Number.isInteger(dailyHour) || dailyHour < 0 || dailyHour > 23) {
    back("/alerts", "invalid");
  }
  const leveling: { slug: string; from: number; to: number }[] = [];
  const slugs = formData.getAll("lv_slug").map(String);
  const froms = formData.getAll("lv_from").map(Number);
  const tos = formData.getAll("lv_to").map(Number);
  slugs.forEach((slug, i) => {
    const from = froms[i];
    const to = tos[i];
    if (/^[a-z0-9-]{1,40}$/.test(slug) && Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to > from && to <= MAX_SKILL) leveling.push({ slug, from, to });
  });
  const value = {
    enabled: formData.get("enabled") === "on",
    min_deal_profit: minProfit,
    max_per_run: maxPerRun,
    daily_hour: dailyHour,
    lang: formData.get("lang") === "es" ? "es" : "en",
    leveling: leveling.slice(0, 5),
  };
  await must(supabaseAdmin().from("settings").upsert({ key: "alerts", value }));
  revalidatePath("/alerts");
  back("/alerts", "ok");
}

export async function sendTestAlert(formData: FormData) {
  if (!adminTokenOk(String(formData.get("token") ?? ""))) back("/alerts", "token");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const row = await must(supabaseAdmin().from("settings").select("value").eq("key", "telegram_chat_id").maybeSingle());
  if (!token || !row) back("/alerts", "sin-telegram");
  try {
    await sendTelegram(token!, String(row!.value), "✅ <b>Forever AH</b>: las alertas funcionan.");
  } catch {
    back("/alerts", "error-telegram");
  }
  back("/alerts", "prueba");
}

export async function addWatch(formData: FormData) {
  const path = safePath(formData.get("back"), "/alerts");
  if (!adminTokenOk(String(formData.get("token") ?? ""))) back(path, "token");
  const itemId = Number(formData.get("itemId"));
  const target = parseMoney(String(formData.get("target") ?? ""));
  const direction = formData.get("direction") === "above" ? "above" : "below";
  if (!Number.isInteger(itemId) || target === null || target <= 0) back(path, "invalid");
  await must(supabaseAdmin().from("watchlist").upsert({ item_id: itemId, target_price: target, direction }));
  back(path, "aviso");
}

export async function removeWatch(formData: FormData) {
  const path = safePath(formData.get("back"), "/alerts");
  if (!adminTokenOk(String(formData.get("token") ?? ""))) back(path, "token");
  const itemId = Number(formData.get("itemId"));
  if (Number.isInteger(itemId)) await must(supabaseAdmin().from("watchlist").delete().eq("item_id", itemId));
  back(path, "quitado");
}
