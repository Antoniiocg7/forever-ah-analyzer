"use server";

import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { HOUSE_LABELS } from "@/lib/house-labels";
import { supabaseAdmin } from "@/lib/supabase";

function tokenOk(given: string): boolean {
  const expected = process.env.ADMIN_TOKEN ?? "";
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function saveHouseLabel(formData: FormData) {
  const houseId = Number(formData.get("houseId"));
  const label = String(formData.get("label") ?? "");
  if (!tokenOk(String(formData.get("token") ?? ""))) redirect("/admin/houses?msg=token");
  if (!Number.isInteger(houseId) || (label !== "" && !HOUSE_LABELS.includes(label))) redirect("/admin/houses?msg=invalid");

  const db = supabaseAdmin();
  // Cada etiqueta corresponde a una sola casa: se la quitamos a la que la tuviera.
  if (label) {
    const { error } = await db.from("houses").update({ label: null, tracked: false }).eq("label", label).neq("id", houseId);
    if (error) throw new Error(error.message);
  }
  const { error } = await db.from("houses").update({ label: label || null, tracked: label !== "" }).eq("id", houseId);
  if (error) throw new Error(error.message);
  redirect("/admin/houses?msg=ok");
}
