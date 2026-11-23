import type { ReactNode } from "react";
import { Hint } from "@/components/Hint";
import { formatMoney } from "@/lib/money";
import { PRIORITY, SLOTS, type Slot } from "@/lib/wishlist";
import type { WishRow } from "@/lib/wishlist-queries";
import { saveWish } from "./actions";

/** Formulario para añadir o editar una pieza. */
export function WishForm({
  back,
  tokenField,
  wish,
  submitLabel,
}: {
  back: string;
  tokenField: ReactNode;
  submitLabel?: string;
  wish?: Pick<WishRow, "item_id" | "slot" | "priority" | "max_price" | "note">;
}) {
  return (
    <form action={saveWish} className="mt-3 space-y-2 text-sm">
      <input type="hidden" name="back" value={back} />
      {wish ? (
        <input type="hidden" name="item" value={wish.item_id} />
      ) : (
        <input name="item" required className="input" placeholder="ID o nombre exacto (p. ej. Lionheart Helm)" aria-label="Pieza" />
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          Ranura
          <select name="slot" defaultValue={wish?.slot ?? ""} className="input mt-1 text-sm">
            <option value="">—</option>
            {(Object.keys(SLOTS) as Slot[]).map((s) => (
              <option key={s} value={s}>
                {SLOTS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Prioridad
          <select name="priority" defaultValue={wish?.priority ?? 2} className="input mt-1 text-sm">
            {([1, 2, 3] as const).map((p) => (
              <option key={p} value={p}>
                {PRIORITY[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          <span className="flex items-center gap-1">
            Pagaría hasta
            <Hint label="Precio máximo">Si el más barato baja de este precio, se marca “cómprala” y te avisa por Telegram. Déjalo vacío si no tienes límite.</Hint>
          </span>
          <input name="max_price" defaultValue={wish?.max_price != null ? formatMoney(wish.max_price) : ""} placeholder="p. ej. 25g" className="input mt-1 text-sm" />
        </label>
        <label className="text-xs text-muted">
          Nota
          <input name="note" defaultValue={wish?.note ?? ""} placeholder="p. ej. para tanquear" className="input mt-1 text-sm" />
        </label>
      </div>
      {tokenField}
      <button className="btn w-full sm:w-auto">{submitLabel ?? (wish ? "Guardar cambios" : "Añadir a la lista")}</button>
    </form>
  );
}
