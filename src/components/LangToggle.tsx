import { setLang } from "@/app/lang-actions";
import { nameLang } from "@/lib/lang-server";

/** Selector EN/ES para los nombres de objetos, recetas y profesiones. */
export async function LangToggle() {
  const lang = await nameLang();
  return <LangToggleView lang={lang} />;
}

const LABELS = { en: "English", es: "Español" } as const;

export function LangToggleView({ lang }: { lang: "en" | "es" | null }) {
  return (
    <form action={setLang} className="flex items-center gap-1.5" aria-label="Idioma de los nombres de objetos">
      <span className="hidden text-xs text-muted sm:inline">Nombres:</span>
      <div className="flex overflow-hidden rounded-full border border-gold/60 text-xs font-medium">
        {(["en", "es"] as const).map((l) => {
          const active = lang === l;
          return (
            <button
              key={l}
              name="lang"
              value={l}
              title={`Nombres de objetos y recetas en ${LABELS[l].toLowerCase()}`}
              aria-pressed={active}
              className={`min-h-8 min-w-10 px-2.5 transition-colors ${active ? "bg-gold text-bg" : "text-fg hover:bg-surface-2 hover:text-gold"}`}
            >
              {l.toUpperCase()}
            </button>
          );
        })}
      </div>
    </form>
  );
}
