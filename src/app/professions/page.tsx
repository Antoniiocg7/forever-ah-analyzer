import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Loading, NoRecipesNotice, SetupNotice } from "@/components/notices";
import { isConfigured } from "@/lib/env";
import { professionSummaries } from "@/lib/professions/queries";

/** Las profesiones del usuario salen primero. */
const MINE = ["mining", "blacksmithing", "first-aid"];

export default function Page() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Profesiones</h1>
        <p className="mt-1 text-sm text-muted">Todas las recetas de cada profesión, las tengas aprendidas o no, con su coste y su beneficio a precios de la subasta.</p>
      </div>
      <Suspense fallback={<Loading />}>
        <Professions />
      </Suspense>
    </div>
  );
}

async function Professions() {
  await connection();
  if (!isConfigured()) return <SetupNotice />;
  const all = await professionSummaries();
  if (all.length === 0) return <NoRecipesNotice />;

  const rank = (slug: string) => (MINE.includes(slug) ? MINE.indexOf(slug) : MINE.length);
  const sorted = [...all].sort((a, b) => rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name));

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {sorted.map((p) => (
        <li key={p.slug}>
          <Link href={`/professions/${p.slug}`} className={`card block active:bg-surface-2 ${MINE.includes(p.slug) ? "border-gold" : ""}`}>
            <p className="font-medium">{p.name}</p>
            <p className="mt-1 text-xs text-muted">{p.recipes.toLocaleString("es-ES")} recetas</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
