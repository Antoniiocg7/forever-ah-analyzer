// Niveles de receta para el planificador: oficiales (planos, patrones…) y estimados para el resto.
// Uso: pnpm sync-skills   (después de pnpm sync-recipes; repetir tras cada parche)
import { syncSkillLevels } from "../src/lib/professions/skills";
import { setup } from "./_setup";

async function main() {
  const { db, blizzard } = await setup();
  const r = await syncSkillLevels(db, blizzard);
  console.log(`Listo: ${r.official} recetas con nivel oficial y ${r.estimated} estimadas.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
