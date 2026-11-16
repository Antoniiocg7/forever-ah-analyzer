import Link from "next/link";

export function SetupNotice() {
  return (
    <div className="card space-y-2 text-sm">
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
    <div className="card space-y-2 text-sm">
      <p className="font-medium text-gold">Todavía no hay ninguna casa marcada</p>
      <p className="text-muted">
        Ejecuta <code>pnpm discover</code> y marca tu casa de Alianza PvP y la de Blackwater PvP en{" "}
        <Link href="/admin/houses" className="text-gold underline">
          Casas
        </Link>
        . Después, <code>pnpm ingest</code> descarga los precios.
      </p>
    </div>
  );
}

export function NoRecipesNotice() {
  return (
    <div className="card space-y-2 text-sm">
      <p className="font-medium text-gold">Todavía no hay recetas</p>
      <p className="text-muted">
        Ejecuta <code>pnpm sync-recipes</code> en el Mac para descargarlas de la API de Blizzard. Basta con hacerlo una vez (y tras cada parche).
      </p>
    </div>
  );
}

export function Loading() {
  return <div className="card animate-pulse text-sm text-muted">Cargando…</div>;
}
