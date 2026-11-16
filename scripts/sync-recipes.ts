// Descarga todas las recetas de todas las profesiones desde static-forever.
// Uso: pnpm sync-recipes   (basta con ejecutarlo una vez y tras cada parche)
import { syncRecipes } from "../src/lib/professions/sync";
import { setup } from "./_setup";

async function main() {
  const { db, blizzard } = await setup();
  const r = await syncRecipes(db, blizzard);
  console.log(`Listo: ${r.recipes} recetas de ${r.professions} profesiones, ${r.items} objetos nuevos.`);
  if (r.withoutItem) console.log(`Aviso: ${r.withoutItem} recetas no indican qué objeto fabrican (no se puede calcular su beneficio).`);
  if (r.failed) console.log(`Aviso: ${r.failed} recetas no se pudieron descargar (404 o formato inesperado).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
