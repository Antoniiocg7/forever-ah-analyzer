// Ingesta horaria de las casas marcadas como `tracked`.
// Uso: pnpm ingest
import { ingestHouse, syncItemNames } from "../src/lib/ingest";
import { setup } from "./_setup";

async function main(): Promise<number> {
  const started = Date.now();
  const { db, blizzard, rulesetId } = await setup();

  const { data: houses, error } = await db.from("houses").select("id, label").eq("tracked", true);
  if (error) throw new Error(error.message);
  if (!houses || houses.length === 0) {
    console.log("No hay casas marcadas. Ejecuta `pnpm discover` y márcalas en /admin/houses.");
    return 0;
  }

  let failed = false;
  for (const house of houses) {
    const r = await ingestHouse(db, blizzard, rulesetId, house.id);
    console.log(`casa ${house.id} (${house.label ?? "sin etiqueta"}): ${r.status}`, r.items ? `· ${r.items} objetos · ${r.auctions} subastas` : "");
    if (r.status === "error") failed = true;
  }

  const named = await syncItemNames(db, blizzard, houses.map((h) => h.id));
  const mem = Math.round(process.memoryUsage().rss / 1024 / 1024);
  console.log(`Objetos nuevos consultados: ${named}. Tiempo: ${((Date.now() - started) / 1000).toFixed(1)} s. Memoria: ${mem} MB.`);
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
