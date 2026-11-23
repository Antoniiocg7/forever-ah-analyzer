"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminTokenOk } from "@/lib/admin";
import { ADMIN_COOKIE, isAdmin, sessionValue } from "@/lib/admin-session";
import { importPlayerData, type PlayerData } from "@/lib/ahledger";
import { supabaseAdmin } from "@/lib/supabase";

export async function login(formData: FormData) {
  if (!adminTokenOk(String(formData.get("token") ?? ""))) redirect("/cuenta?msg=token");
  (await cookies()).set(ADMIN_COOKIE, sessionValue(), { path: "/", httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 60 });
  redirect("/cuenta");
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/cuenta");
}

const dataSchema = z.object({
  characters: z.array(
    z.object({
      key: z.string().max(200),
      name: z.string().max(100),
      realm: z.string().max(200).nullable(),
      faction: z.string().max(50).nullable(),
      money: z.number().nullable(),
      bagsAt: z.string().nullable(),
      bankAt: z.string().nullable(),
    }),
  ).max(100),
  inventory: z.array(z.object({ charKey: z.string().max(200), itemId: z.number().int(), place: z.enum(["bags", "bank"]), qty: z.number().int(), bound: z.boolean() })).max(20000),
  ledger: z.array(
    z.object({
      seq: z.number().int(),
      at: z.string(),
      kind: z.enum(["post", "sale", "buy", "expire", "cancel"]),
      itemId: z.number().int().nullable(),
      name: z.string().max(200).nullable(),
      qty: z.number().int(),
      price: z.number(),
      cut: z.number(),
      deposit: z.number(),
      hours: z.number().nullable(),
    }),
  ).max(10000),
  skipped: z.number(),
});

/**
 * Recibe los datos ya extraídos en el navegador (el archivo pesa ~20 MB, demasiado para subirlo
 * entero) y los guarda. Solo con sesión de administración.
 */
export async function uploadPlayerData(json: string): Promise<{ ok: true; text: string } | { ok: false; text: string }> {
  if (!(await isAdmin())) return { ok: false, text: "Primero entra con la contraseña." };
  const parsed = dataSchema.safeParse(JSON.parse(json));
  if (!parsed.success) return { ok: false, text: "Los datos no tienen el formato esperado." };
  const r = await importPlayerData(supabaseAdmin(), parsed.data as PlayerData);
  return { ok: true, text: `Subido: ${r.characters} personajes, ${r.items} objetos, ${r.ledger} operaciones.` };
}
