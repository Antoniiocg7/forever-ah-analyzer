import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Loading, NoRecipesNotice, SetupNotice } from "@/components/notices";
import { isConfigured } from "@/lib/env";
import { economySettings, professionSummaries } from "@/lib/professions/queries";
import { saveMyProfessions } from "./actions";

export default function Page({ searchParams }: PageProps<"/professions">) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Profesiones</h1>
        <p className="mt-1 text-sm text-muted">Todas las recetas de cada profesión, las tengas aprendidas o no, con su coste y su beneficio a precios de la subasta.</p>
      </div>
      <Suspense fallback={<Loading />}>
        <Professions searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Professions({ searchParams }: Pick<PageProps<"/professions">, "searchParams">) {
  await connection();
  if (!isConfigured()) return <SetupNotice />;
  const [sp, all, settings] = await Promise.all([searchParams, professionSummaries(), economySettings("alliance")]);
  if (all.length === 0) return <NoRecipesNotice />;
  const mine = settings.myProfessions;

  const rank = (slug: string) => (mine.includes(slug) ? mine.indexOf(slug) : mine.length);
  const sorted = [...all].sort((a, b) => rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name));
  const alphabetical = [...all].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      {sp.msg === "guardado" && <p className="card text-sm text-good">Guardado en este navegador. Los costes ya usan tus profesiones.</p>}

      <details className="card" open={!settings.myProfessionsFromBrowser}>
        <summary className="cursor-pointer text-sm font-medium">
          Mis profesiones: {mine.length ? all.filter((p) => mine.includes(p.slug)).map((p) => p.name).join(", ") : "ninguna"}
          {!settings.myProfessionsFromBrowser && <span className="font-normal text-muted"> (las de por defecto)</span>}
        </summary>
        <form action={saveMyProfessions} className="mt-3 space-y-3">
          <p className="text-xs text-muted">
            Se guardan solo en este navegador. Sirven para marcarlas como tuyas y para calcular los materiales que puedes fabricar tú
            (por ejemplo, fundir barras con Minería) en vez de comprarlos.
          </p>
          <div className="flex flex-wrap gap-2">
            {alphabetical.map((p) => (
              <label
                key={p.slug}
                className="flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-line px-3 text-sm text-muted has-[:checked]:border-gold has-[:checked]:text-gold"
              >
                <input type="checkbox" name="p" value={p.slug} defaultChecked={mine.includes(p.slug)} className="h-4 w-4 accent-[#e0b354]" />
                {p.name}
              </label>
            ))}
          </div>
          <button className="btn w-full sm:w-auto">Guardar mis profesiones</button>
        </form>
      </details>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {sorted.map((p) => (
          <li key={p.slug}>
            <Link href={`/professions/${p.slug}`} className={`card block active:bg-surface-2 ${mine.includes(p.slug) ? "border-gold" : ""}`}>
              <p className="font-medium">{p.name}</p>
              <p className="mt-1 text-xs text-muted">
                {p.recipes.toLocaleString("es-ES")} recetas{mine.includes(p.slug) && " · tuya"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
