import Link from "next/link";

export function SetupNotice() {
  return (
    <div className="card-accent space-y-2 text-sm">
      <p className="font-medium text-gold">Falta la configuración</p>
      <p className="text-muted">
        Copia <code>.env.example</code> a <code>.env.local</code>, rellena las credenciales de Blizzard y Supabase y aplica la
        migración de <code>supabase/migrations</code>. Los pasos están en el README.
      </p>
    </div>
  );
}

export function NoHousesNotice() {
  return (
    <div className="card-accent space-y-2 text-sm">
      <p className="font-medium text-gold">Todavía no hay ninguna casa marcada</p>
      <p className="text-muted">
        Ejecuta <code>pnpm discover</code> y marca tu casa de Alianza PvP y la de Blackwater PvP en{" "}
        <Link href="/admin/houses" className="text-gold underline">
          Ajustes → Casas de subastas
        </Link>
        . Después, <code>pnpm ingest</code> descarga los precios.
      </p>
    </div>
  );
}

export function NoRecipesNotice() {
  return (
    <div className="card-accent space-y-2 text-sm">
      <p className="font-medium text-gold">Todavía no hay recetas</p>
      <p className="text-muted">
        Ejecuta <code>pnpm sync-recipes</code> en el Mac para descargarlas de la API de Blizzard. Basta con hacerlo una vez (y tras cada parche).
      </p>
    </div>
  );
}

/** Esqueleto de lista mientras cargan los datos. */
export function Loading() {
  return (
    <div className="space-y-3" role="status" aria-label="Cargando">
      <div className="skeleton h-10 w-full" />
      <div className="list">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <div className="skeleton h-9 w-9 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3.5 w-2/5" />
              <div className="skeleton h-3 w-3/5" />
            </div>
            <div className="skeleton h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
