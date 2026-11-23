"use server";

import { redirect } from "next/navigation";
import { adminTokenOk } from "@/lib/admin";
import { findItemId } from "@/lib/item-search";
import { parseMoney } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase";
import { SLOTS } from "@/lib/wishlist";

/** Vuelve a `back` (solo rutas internas) con un mensaje. */
function done(formData: FormData, msg: string): never {
  const back = String(formData.get("back") ?? "/deseos");
  const safe = back.startsWith("/") && !back.startsWith("//") ? back : "/deseos";
  redirect(`${safe}${safe.includes("?") ? "&" : "?"}msg=${msg}`);
}

function checkToken(formData: FormData) {
  if (!adminTokenOk(String(formData.get("token") ?? ""))) done(formData, "token");
}

/** Añade o actualiza una pieza (por ID o nombre exacto). */
export async function saveWish(formData: FormData) {
  checkToken(formData);
  const itemId = await findItemId(String(formData.get("item") ?? ""));
  if (!itemId) done(formData, "no-item");
  const slotRaw = String(formData.get("slot") ?? "");
  const slot = slotRaw in SLOTS ? slotRaw : null;
  const priority = Number(formData.get("priority") ?? 2);
  const maxRaw = String(formData.get("max_price") ?? "").trim();
  const maxPrice = maxRaw === "" ? null : parseMoney(maxRaw);
  if (![1, 2, 3].includes(priority) || (maxRaw !== "" && maxPrice === null)) done(formData, "invalid");
  const note = String(formData.get("note") ?? "").trim() || null;
  const { error } = await supabaseAdmin().from("wishlist").upsert({ item_id: itemId, slot, priority, max_price: maxPrice, note });
  if (error) throw new Error(error.message);
  done(formData, "guardado");
}

export async function toggleObtained(formData: FormData) {
  checkToken(formData);
  const itemId = Number(formData.get("itemId"));
  const { error } = await supabaseAdmin().from("wishlist").update({ obtained: formData.get("obtained") === "1" }).eq("item_id", itemId);
  if (error) throw new Error(error.message);
  done(formData, "guardado");
}

export async function removeWish(formData: FormData) {
  checkToken(formData);
  const itemId = Number(formData.get("itemId"));
  const { error } = await supabaseAdmin().from("wishlist").delete().eq("item_id", itemId);
  if (error) throw new Error(error.message);
  done(formData, "quitado");
}
