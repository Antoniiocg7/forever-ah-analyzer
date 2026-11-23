import Link from "next/link";
import { Hint } from "@/components/Hint";
import type { HouseRow } from "@/lib/supabase";

const FACTION: Record<string, { name: string; tip: string }> = {
  alliance: { name: "Alianza", tip: "Tu subasta de Alianza: la de las capitales (Ventormenta, Forjaz…). Comisión del 5%." },
  horde: { name: "Horda", tip: "La subasta de la Horda: no la puedes usar con un personaje de Alianza." },
  neutral: { name: "Blackwater", tip: "La subasta neutral (Gadgetzan, Bahía del Botín…), compartida con la Horda. Suele ir más lenta y cobrar más comisión." },
};

/** Selector de casa. `hrefFor` construye el enlace para cada casa. */
export function HouseTabs({ houses, current, hrefFor }: { houses: HouseRow[]; current: number; hrefFor: (houseId: number) => string }) {
  if (houses.length < 2) return null;
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
        Subasta
        <Hint label="¿Qué subasta elijo?">
          Cada subasta tiene sus propios precios. <b>Alianza</b> es la de tu facción, en las capitales. <b>Blackwater</b> es la neutral
          (Gadgetzan, Bahía del Botín), compartida con la Horda. Compara las dos para comprar en una y vender en la otra.
        </Hint>
      </span>
      {houses.map((h) => {
        const f = FACTION[h.faction];
        return (
          <Link
            key={h.id}
            href={hrefFor(h.id)}
            title={f?.tip}
            aria-current={h.id === current ? "true" : undefined}
            className={`min-h-9 shrink-0 rounded-full border px-3 py-1.5 text-sm ${h.id === current ? "border-gold text-gold" : "border-line text-muted hover:text-fg"}`}
          >
            {f?.name ?? h.label ?? h.name}
          </Link>
        );
      })}
    </div>
  );
}
