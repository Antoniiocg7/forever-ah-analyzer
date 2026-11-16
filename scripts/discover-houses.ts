// Fase 0: descarga las 15 casas y guarda los precios de referencia para /admin/houses.
// Uso: pnpm discover
import { discoverHouses } from "../src/lib/ingest";
import { setup } from "./_setup";

async function main() {
  const { db, blizzard, rulesetId } = await setup();
  console.log(`Ruleset ${rulesetId}. Descargando todas las casas (tarda: ~9 MB por casa)…`);
  const summary = await discoverHouses(db, blizzard, rulesetId);
  console.log(`Listo: ${summary.length} casas. Abre /admin/houses para marcar la tuya.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
