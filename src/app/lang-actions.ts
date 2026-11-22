"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { LANG_COOKIE } from "@/lib/lang";

/** Cambia el idioma de los nombres en este navegador y vuelve a la misma página. */
export async function setLang(formData: FormData) {
  const lang = formData.get("lang") === "es" ? "es" : "en";
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const referer = (await headers()).get("referer");
  let back = "/";
  try {
    if (referer) {
      const u = new URL(referer);
      back = `${u.pathname}${u.search}`;
    }
  } catch {}
  redirect(back.startsWith("/") ? back : "/");
}
