// Sube tus datos reales (inventario, oro y libro de la subasta) desde el archivo de AHledger.
// Uso: pnpm addon-sync            (busca el archivo solo)
//      pnpm addon-sync <ruta>     (o AHLEDGER_FILE=<ruta> en .env.local)
// Conviene salir del juego (o hacer /reload) antes: WoW solo escribe el archivo al cerrar o recargar.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { importPlayerData, readAhledgerFile } from "../src/lib/ahledger";
import { supabaseAdmin } from "../src/lib/supabase";

/** Instalaciones posibles de WoW: /Applications y cualquier disco externo. */
function candidates(): string[] {
  const roots = ["/Applications/World of Warcraft"];
  if (existsSync("/Volumes")) for (const v of readdirSync("/Volumes")) roots.push(join("/Volumes", v, "World of Warcraft"));
  const files: string[] = [];
  for (const root of roots) {
    const accounts = join(root, "_forever_", "WTF", "Account");
    if (!existsSync(accounts)) continue;
    for (const acc of readdirSync(accounts)) {
      const f = join(accounts, acc, "SavedVariables", "AHledger.lua");
      if (existsSync(f)) files.push(f);
    }
  }
  // El más reciente primero.
  return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

async function main(): Promise<number> {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const file = process.argv[2] ?? process.env.AHLEDGER_FILE ?? candidates()[0];
  if (!file || !existsSync(file)) {
    console.error("No encuentro AHledger.lua. ¿Está instalado el addon AHledger y has entrado al juego con él?");
    console.error("Pasa la ruta: pnpm addon-sync \"/ruta/a/WTF/Account/<cuenta>/SavedVariables/AHledger.lua\"");
    return 1;
  }
  const age = (Date.now() - statSync(file).mtimeMs) / 60_000;
  console.log(`Archivo: ${file}`);
  console.log(`Guardado hace ${age < 60 ? `${Math.round(age)} min` : `${Math.round(age / 60)} h`} (WoW lo escribe al salir o con /reload).`);

  const data = readAhledgerFile(readFileSync(file, "utf8"));
  const r = await importPlayerData(supabaseAdmin(), data);
  console.log(`Subido: ${r.characters} personajes, ${r.items} objetos en bolsas/banco, ${r.ledger} operaciones de la subasta.`);
  if (data.skipped) console.log(`(${data.skipped} entradas con un formato que no reconozco: ignoradas)`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
