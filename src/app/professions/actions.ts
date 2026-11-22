"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminTokenOk } from "@/lib/admin";
import { MY_PROFESSIONS_COOKIE, parseProfessions } from "@/lib/prefs";
import { MAX_SKILL } from "@/lib/professions/leveling";
import { supabaseAdmin } from "@/lib/supabase";

const skill = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_SKILL + 75 ? n : null;
};

/** Guarda los niveles reales de una receta (vistos en el juego) o quita la corrección. */
export async function saveRecipeSkill(formData: FormData) {
  const back = String(formData.get("back") ?? "/professions");
  const safeBack = back.startsWith("/professions/") ? back : "/professions";
  const sep = safeBack.includes("?") ? "&" : "?";
  if (!adminTokenOk(String(formData.get("token") ?? ""))) redirect(`${safeBack}${sep}msg=token`);

  const id = Number(formData.get("recipeId"));
  if (!Number.isInteger(id)) redirect(`${safeBack}${sep}msg=invalid`);
  const db = supabaseAdmin();

  if (formData.get("reset") === "1") {
    // Vuelve a la estimación en el próximo `pnpm sync-skills`.
    const { error } = await db.from("recipes").update({ orange: null, yellow: null, green: null, grey: null, skill_source: null }).eq("id", id);
    if (error) throw new Error(error.message);
    redirect(`${safeBack}${sep}msg=reset`);
  }

  const [orange, yellow, green, grey] = ["orange", "yellow", "green", "grey"].map((k) => skill(formData.get(k)));
  if (orange === null || yellow === null || green === null || grey === null || !(orange <= yellow && yellow <= green && green <= grey)) {
    redirect(`${safeBack}${sep}msg=invalid`);
  }
  const { error } = await db.from("recipes").update({ skill_req: orange, orange, yellow, green, grey, skill_source: "manual" }).eq("id", id);
  if (error) throw new Error(error.message);
  redirect(`${safeBack}${sep}msg=ok`);
}

/** Guarda en este navegador qué profesiones tienes (no pide contraseña: no cambia nada para los demás). */
export async function saveMyProfessions(formData: FormData) {
  const chosen = parseProfessions(formData.getAll("p").map(String).join(",")) ?? [];
  (await cookies()).set(MY_PROFESSIONS_COOKIE, chosen.join(","), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/professions?msg=guardado");
}
