import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Cabecera de cada apartado: título, para qué sirve en una frase y, plegado,
 * cómo se usa paso a paso.
 */
export function PageIntro({ title, summary, steps, extra }: { title: ReactNode; summary: ReactNode; steps?: ReactNode[]; extra?: ReactNode }) {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted">{summary}</p>
      {steps && steps.length > 0 && (
        <details className="group rounded-lg border border-line bg-surface/60 text-sm">
          <summary className="flex min-h-10 list-none items-center gap-2 px-3 py-2 text-gold">
            <span className="transition-transform group-open:rotate-90" aria-hidden>
              ▸
            </span>
            Cómo se usa
          </summary>
          <ol className="list-decimal space-y-1.5 px-3 pb-3 pl-8 text-muted">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <p className="border-t border-line px-3 py-2 text-xs text-muted">
            ¿Alguna palabra no está clara?{" "}
            <Link href="/ayuda" className="text-gold underline">
              Glosario
            </Link>
          </p>
        </details>
      )}
      {extra}
    </div>
  );
}
