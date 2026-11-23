import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Cabecera de cada apartado: título, para qué sirve en una frase y, plegado, cómo se usa paso a paso.
 * `actions` va a la derecha del título (botones principales).
 */
export function PageIntro({
  title,
  summary,
  steps,
  extra,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  summary: ReactNode;
  steps?: ReactNode[];
  extra?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted">{summary}</p>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {steps && steps.length > 0 && (
        <details className="group max-w-2xl rounded-xl border border-line bg-surface/60 text-sm open:bg-surface">
          <summary className="flex min-h-10 list-none items-center gap-2 px-3 py-2 text-muted transition-colors hover:text-fg">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-gold" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
            </svg>
            Cómo se usa
            <svg viewBox="0 0 24 24" className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <ol className="space-y-2 px-3 pt-1 pb-3">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-muted">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold/15 text-[11px] font-semibold text-gold">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <p className="border-t border-line px-3 py-2 text-xs text-muted">
            ¿Alguna palabra no está clara?{" "}
            <Link href="/ayuda" className="text-gold underline-offset-2 hover:underline">
              Glosario
            </Link>
          </p>
        </details>
      )}
      {extra}
    </div>
  );
}
