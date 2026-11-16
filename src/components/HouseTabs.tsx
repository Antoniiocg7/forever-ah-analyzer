import Link from "next/link";
import type { HouseRow } from "@/lib/supabase";

/** Selector de casa. `hrefFor` construye el enlace para cada casa. */
export function HouseTabs({ houses, current, hrefFor }: { houses: HouseRow[]; current: number; hrefFor: (houseId: number) => string }) {
  if (houses.length < 2) return null;
  return (
    <div className="flex gap-2 overflow-x-auto">
      {houses.map((h) => (
        <Link
          key={h.id}
          href={hrefFor(h.id)}
          className={`min-h-9 shrink-0 rounded-full border px-3 py-1.5 text-sm ${
            h.id === current ? "border-gold text-gold" : "border-line text-muted"
          }`}
        >
          {h.label ?? h.name}
        </Link>
      ))}
    </div>
  );
}
