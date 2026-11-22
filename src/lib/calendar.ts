/** Contexto de la etapa del juego: días desde el lanzamiento, próximo evento y qué suele pasar con los precios. */

export type GameEvent = { date: string; kind: "launch" | "raid" | "patch" | "other"; name: string };

export type GameContext = {
  day: number | null;
  next: { name: string; kind: GameEvent["kind"]; date: string; daysUntil: number } | null;
  tips: string[];
};

const DAY = 86_400_000;
const toDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/**
 * Patrones típicos de los lanzamientos de Classic (no una predicción): antes de abrir raids suben los
 * consumibles y sus materiales; durante el primer mes y medio los materiales de subida bajan a medida
 * que la gente llega al nivel máximo.
 */
export function gameContext(events: GameEvent[], now = Date.now()): GameContext {
  const launch = events.find((e) => e.kind === "launch");
  const day = launch ? Math.floor((now - toDay(launch.date)) / DAY) + 1 : null;
  const upcoming = events
    .filter((e) => toDay(e.date) > now)
    .sort((a, b) => toDay(a.date) - toDay(b.date))
    .map((e) => ({ ...e, daysUntil: Math.ceil((toDay(e.date) - now) / DAY) }));
  const next = upcoming[0] ?? null;
  const nextRaid = upcoming.find((e) => e.kind === "raid");

  const tips: string[] = [];
  if (nextRaid && nextRaid.daysUntil <= 45) {
    tips.push(
      `Faltan ${nextRaid.daysUntil} días para las raids: los consumibles (frascos, elixires, pociones de protección) y sus materiales suelen subir antes de la apertura. Compra si están por debajo de su mediana.`,
    );
  }
  if (day !== null && day <= 60) {
    tips.push("Etapa de subida: muchos jugadores aún suben de nivel. Los materiales de subida tienden a bajar a medida que la gente llega a 60; no acumules de más.");
  }
  if (nextRaid === undefined && day !== null && day > 60) {
    tips.push("Etapa de nivel máximo: la demanda la marcan las raids y el equipo; los materiales de subida suelen estar en su precio más bajo.");
  }
  return { day, next, tips };
}

export type Category = "raid-consumable" | "raid-material" | "leveling-material";

export const CATEGORY_LABEL: Record<Category, string> = {
  "raid-consumable": "Consumibles de raid",
  "raid-material": "Materiales de raid",
  "leveling-material": "Materiales de subida",
};

const RAID_CONSUMABLE = [
  /^Flask of /,
  /^Elixir of /,
  /^Greater .*Elixir$/,
  / Protection Potion$/,
  /^(Major|Superior) (Healing|Mana) Potion$/,
  /^Major Rejuvenation Potion$/,
  /^(Mageblood|Free Action|Limited Invulnerability|Restorative|Magic Resistance) Potion$/,
  /^Juju /,
  /^Winterfall Firewater$/,
  /^(Dense|Elemental) (Sharpening Stone|Weightstone)$/,
  /^Brilliant (Wizard|Mana) Oil$/,
  /^(Runn Tum Tuber Surprise|Nightfin Soup|Grilled Squid|Smoked Desert Dumplings|Dirge's Kickin' Chimaerok Chops)$/,
];

const RAID_MATERIAL = [
  /^Black Lotus$/,
  /^Arcanite Bar$/,
  /^Elemental (Fire|Earth|Water|Air)$/,
  /^Essence of (Fire|Water|Earth|Air|Undeath)$/,
  /^(Dreamfoil|Mountain Silversage|Plaguebloom|Golden Sansam|Gromsblood|Icecap|Sungrass|Ghost Mushroom)$/,
  /^(Large Brilliant Shard|Righteous Orb|Fiery Core|Lava Core)$/,
  /^(Dark Iron Ore|Dark Iron Bar|Enchanted Thorium Bar|Mooncloth|Felcloth)$/,
];

const LEVELING_MATERIAL = [
  /^(Linen|Wool|Silk|Mageweave) Cloth$/,
  /^(Copper|Tin|Silver|Iron|Gold|Mithril) (Ore|Bar)$/,
  /^Bronze Bar$/,
  /^Steel Bar$/,
  /^(Rough|Coarse|Heavy|Solid) Stone$/,
  /^(Light|Medium|Heavy) Leather$/,
  /^(Peacebloom|Silverleaf|Earthroot|Mageroyal|Briarthorn|Bruiseweed|Wild Steelbloom|Kingsblood|Liferoot|Fadeleaf|Goldthorn|Khadgar's Whisker)$/,
];

export function categorize(name: string | null): Category | null {
  // Las recetas ("Recipe: …", "Plans: …") no son el consumible en sí.
  if (!name || /^(Recipe|Plans|Pattern|Formula|Schematic|Manual|Design|Technique):/.test(name)) return null;
  if (RAID_CONSUMABLE.some((r) => r.test(name))) return "raid-consumable";
  if (RAID_MATERIAL.some((r) => r.test(name))) return "raid-material";
  if (LEVELING_MATERIAL.some((r) => r.test(name))) return "leveling-material";
  return null;
}

export type Advice = { label: string; className: string; rank: number; buy: boolean };

/** Recomendación para un objeto de raid según su precio frente a la mediana y su tendencia semanal. */
export function investAdvice(r: { trend: number | null; discount: number | null }, raidSoon: boolean): Advice {
  const trend = r.trend ?? 0;
  const discount = r.discount ?? 0;
  if (trend >= 0.15) return { label: "Ya ha subido", className: "text-bad", rank: 4, buy: false };
  // Si se está desplomando, mejor esperar a que se estabilice que comprar a mitad de caída.
  if (trend <= -0.25) return { label: "Bajando: espera", className: "text-gold", rank: 3, buy: false };
  if (raidSoon && discount >= 0 && trend <= 0.1) return { label: "Comprar ahora", className: "text-good", rank: 1, buy: true };
  return { label: "Vigilar", className: "text-muted", rank: 2, buy: false };
}
