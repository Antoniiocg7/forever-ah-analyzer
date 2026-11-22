import { setLang } from "@/app/lang-actions";
import { nameLang } from "@/lib/lang-server";

/** Selector EN/ES para los nombres de objetos, recetas y profesiones. */
export async function LangToggle() {
  const lang = await nameLang();
  return <LangToggleView lang={lang} />;
}

export function LangToggleView({ lang }: { lang: "en" | "es" | null }) {
  return (
    <form action={setLang} className="flex overflow-hidden rounded-full border border-line text-[11px]" aria-label="Idioma de los nombres">
      {(["en", "es"] as const).map((l) => (
        <button key={l} name="lang" value={l} className={`min-h-7 px-2 ${lang === l ? "bg-surface-2 text-gold" : "text-muted"}`} aria-pressed={lang === l}>
          {l.toUpperCase()}
        </button>
      ))}
    </form>
  );
}
