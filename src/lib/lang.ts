/** Idioma de los nombres de objetos, recetas y profesiones. La interfaz siempre está en español. */
export type Lang = "en" | "es";
export const LANG_COOKIE = "idioma";

/** Nombre en el idioma elegido; si falta la traducción, el inglés. */
export const pick = (en: string | null | undefined, es: string | null | undefined, lang: Lang): string | null => (lang === "es" ? es || en : en) ?? null;

/** Enlace a la ficha del objeto en Wowhead (sección de WoW Forever). */
export const wowheadItemUrl = (itemId: number, lang: Lang) => `https://www.wowhead.com/forever/${lang === "es" ? "es/" : ""}item=${itemId}`;
