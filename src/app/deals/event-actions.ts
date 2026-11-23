"use server";

import { redirect } from "next/navigation";
import { adminTokenOk } from "@/lib/admin";
import { findItemId } from "@/lib/item-search";
import { supabaseAdmin } from "@/lib/supabase";

const back = (msg: string, eventId?: number) => redirect(`/deals?tab=events&msg=${msg}${eventId ? `#evento-${eventId}` : ""}`);

function guard(formData: FormData): number {
  if (!adminTokenOk(String(formData.get("token") ?? ""))) back("token");
  const eventId = Number(formData.get("eventId"));
  if (!Number.isInteger(eventId) || eventId <= 0) back("invalid");
  return eventId;
}

export async function addEventItem(formData: FormData) {
  const eventId = guard(formData);
  const itemId = await findItemId(String(formData.get("item") ?? ""));
  if (!itemId) back("no-item", eventId);
  const qtyRaw = String(formData.get("qty") ?? "").trim();
  const qty = qtyRaw === "" ? null : Number(qtyRaw);
  if (qty !== null && (!Number.isInteger(qty) || qty <= 0)) back("invalid", eventId);
  const note = String(formData.get("note") ?? "").trim() || null;
  const { error } = await supabaseAdmin()
    .from("seasonal_event_items")
    .upsert({ event_id: eventId, item_id: itemId, qty, note, confirmed: formData.get("confirmed") === "on" });
  if (error) throw new Error(error.message);
  back("ok", eventId);
}

export async function removeEventItem(formData: FormData) {
  const eventId = guard(formData);
  const itemId = Number(formData.get("itemId"));
  const { error } = await supabaseAdmin().from("seasonal_event_items").delete().eq("event_id", eventId).eq("item_id", itemId);
  if (error) throw new Error(error.message);
  back("quitado", eventId);
}

export async function confirmEventItem(formData: FormData) {
  const eventId = guard(formData);
  const itemId = Number(formData.get("itemId"));
  const { error } = await supabaseAdmin()
    .from("seasonal_event_items")
    .update({ confirmed: formData.get("confirmed") === "1" })
    .eq("event_id", eventId)
    .eq("item_id", itemId);
  if (error) throw new Error(error.message);
  back("ok", eventId);
}

export async function addEventDate(formData: FormData) {
  const eventId = guard(formData);
  const starts = String(formData.get("starts") ?? "");
  const ends = String(formData.get("ends") ?? "") || starts;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(starts) || !iso.test(ends) || ends < starts) back("invalid", eventId);
  const place = String(formData.get("place") ?? "").trim() || null;
  const { error } = await supabaseAdmin().from("seasonal_event_dates").upsert({ event_id: eventId, starts, ends, place }, { onConflict: "event_id,starts" });
  if (error) throw new Error(error.message);
  back("ok", eventId);
}
