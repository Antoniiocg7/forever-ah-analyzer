// Rellena los nombres en español: tipos de objeto y objetos que aún no los tienen (la ingesta ya guarda los nuevos).
// Uso: pnpm sync-names
import { chunks, fetchItems, must } from "../src/lib/ingest";
import { setup } from "./_setup";

async function main() {
  const { db, blizzard } = await setup();
  const ids: number[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await must(db.from("items").select("id").is("name_es", null).neq("source", "none").order("id").range(from, from + 999));
    ids.push(...(page ?? []).map((r) => r.id as number));
    if (!page || page.length < 1000) break;
  }
  const classes = await blizzard.itemClassNames();
  if (classes.length) await must(db.from("item_class_names").upsert(classes));
  console.log(`${classes.length} tipos de objeto traducidos.`);
  console.log(`${ids.length} objetos sin nombre en español…`);
  let done = 0;
  for (const part of chunks(ids, 500)) {
    done += await fetchItems(db, blizzard, part);
    console.log(`  ${done}/${ids.length}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
