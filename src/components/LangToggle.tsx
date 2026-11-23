import { setLang } from "@/app/lang-actions";
import { Flag } from "@/components/Flag";
import { nameLang } from "@/lib/lang-server";

/** Selector EN/ES para los nombres de objetos, recetas y profesiones (la web siempre está en español). */
export async function LangToggle() {
  const lang = await nameLang();
  return <LangToggleView lang={lang} />;
}

const LABELS = { en: "inglés", es: "español" } as const;

export function LangToggleView({ lang }: { lang: "en" | "es" | null }) {
  return (
    <form action={setLang} className="flex shrink-0 items-center gap-2" aria-label="Idioma de los nombres de objetos">
      <span className="hidden text-xs text-muted xl:inline">Nombres de objetos</span>
      <div className="flex rounded-full border border-line bg-surface p-0.5" role="group">
        {(["en", "es"] as const).map((l) => {
          const active = lang === l;
          return (
            <button
              key={l}
              name="lang"
              value={l}
              title={`Nombres de objetos, recetas y profesiones en ${LABELS[l]}`}
              aria-label={`Nombres en ${LABELS[l]}`}
              aria-pressed={active}
              className={`flex h-8 items-center gap-1.5 rounded-full px-2 text-xs font-semibold whitespace-nowrap transition-colors sm:px-2.5 ${
                active ? "bg-surface-3 text-fg shadow-sm ring-1 ring-gold/50" : "text-muted hover:text-fg"
              }`}
            >
              <Flag code={l} className={`h-3.5 w-5 shrink-0 rounded-[3px] ring-1 ring-black/30 ${active ? "" : "opacity-60 grayscale-[40%]"}`} />
              {l.toUpperCase()}
            </button>
          );
        })}
      </div>
    </form>
  );
}
