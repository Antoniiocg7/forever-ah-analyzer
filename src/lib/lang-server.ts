import { cookies } from "next/headers";
import { LANG_COOKIE, type Lang } from "./lang";

/** Idioma elegido en este navegador (por defecto inglés, como el cliente del juego). */
export async function nameLang(): Promise<Lang> {
  return (await cookies()).get(LANG_COOKIE)?.value === "es" ? "es" : "en";
}
