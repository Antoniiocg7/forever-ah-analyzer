import { supabaseAdmin } from "./supabase";

/** Busca un objeto por ID o por nombre exacto (inglés o español, sin distinguir mayúsculas). */
export async function findItemId(query: string): Promise<number | null> {
  const q = query.trim();
  if (/^\d+$/.test(q)) return Number(q);
  const safe = q.replace(/[,()*%]/g, "");
  if (!safe) return null;
  const { data, error } = await supabaseAdmin().from("items").select("id").or(`name_en.ilike.${safe},name_es.ilike.${safe}`).limit(2);
  if (error) throw new Error(error.message);
  return data?.length === 1 ? (data[0].id as number) : null;
}
