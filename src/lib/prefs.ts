import { cookies } from "next/headers";

/** Cookie con las profesiones de quien usa este navegador (slugs separados por comas). */
export const MY_PROFESSIONS_COOKIE = "mis_profesiones";

export function parseProfessions(raw: string | undefined | null): string[] | null {
  if (raw === undefined || raw === null) return null;
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => /^[a-z0-9-]{1,40}$/.test(s)))].slice(0, 12);
}

/** Las profesiones elegidas en este navegador, o null si no ha elegido ninguna todavía. */
export async function browserProfessions(): Promise<string[] | null> {
  return parseProfessions((await cookies()).get(MY_PROFESSIONS_COOKIE)?.value);
}
