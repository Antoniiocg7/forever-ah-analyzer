/** Resumen del libro de cuentas: lo que entra, lo que sale y el beneficio por objeto. */

export type LedgerRow = {
  at: string;
  kind: "post" | "sale" | "buy" | "expire" | "cancel";
  item_id: number | null;
  name: string | null;
  qty: number;
  price: number;
  cut: number;
  deposit: number;
};

export type ItemSummary = {
  key: string;
  itemId: number | null;
  name: string | null;
  soldQty: number;
  /** Lo que cobraste: bruto − comisión. */
  income: number;
  boughtQty: number;
  spent: number;
  /** Media de venta (neta) y de compra por unidad. */
  avgSell: number | null;
  avgBuy: number | null;
  /** Beneficio de las unidades vendidas al coste medio de compra (solo si compraste ese objeto). */
  flipProfit: number | null;
  expiredQty: number;
};

export type LedgerSummary = {
  sold: number;
  income: number;
  cut: number;
  bought: number;
  spent: number;
  posted: number;
  expired: number;
  cancelled: number;
  /** Ingresos − gastos (oro que ha entrado neto por la subasta). */
  net: number;
  items: ItemSummary[];
};

/** Resume las operaciones desde `since` (inclusive). */
export function summarizeLedger(rows: LedgerRow[], since?: Date): LedgerSummary {
  const t = { sold: 0, income: 0, cut: 0, bought: 0, spent: 0, posted: 0, expired: 0, cancelled: 0 };
  const items = new Map<string, ItemSummary>();
  // Entradas sin ID: se unen a las del mismo nombre que sí lo tienen.
  const idByName = new Map<string, number>();
  for (const r of rows) if (r.item_id !== null && r.name) idByName.set(r.name, r.item_id);
  const item = (r: LedgerRow) => {
    const id = r.item_id ?? (r.name ? idByName.get(r.name) : undefined) ?? null;
    const key = id !== null ? String(id) : `n:${r.name ?? "?"}`;
    let s = items.get(key);
    if (!s) {
      s = { key, itemId: id, name: r.name, soldQty: 0, income: 0, boughtQty: 0, spent: 0, avgSell: null, avgBuy: null, flipProfit: null, expiredQty: 0 };
      items.set(key, s);
    }
    return s;
  };
  for (const r of rows) {
    if (since && Date.parse(r.at) < since.getTime()) continue;
    if (r.kind === "sale") {
      const s = item(r);
      s.soldQty += r.qty;
      s.income += r.price - r.cut;
      t.sold += r.qty;
      t.income += r.price - r.cut;
      t.cut += r.cut;
    } else if (r.kind === "buy") {
      const s = item(r);
      s.boughtQty += r.qty;
      s.spent += r.price;
      t.bought += r.qty;
      t.spent += r.price;
    } else if (r.kind === "post") t.posted++;
    else if (r.kind === "expire") {
      item(r).expiredQty += r.qty;
      t.expired++;
    } else if (r.kind === "cancel") t.cancelled++;
  }
  for (const s of items.values()) {
    s.avgSell = s.soldQty ? Math.round(s.income / s.soldQty) : null;
    s.avgBuy = s.boughtQty ? Math.round(s.spent / s.boughtQty) : null;
    s.flipProfit = s.avgSell !== null && s.avgBuy !== null ? Math.round((s.avgSell - s.avgBuy) * s.soldQty) : null;
  }
  return {
    ...t,
    net: t.income - t.spent,
    items: [...items.values()].sort((a, b) => b.income - b.spent - (a.income - a.spent)),
  };
}

/** Oro neto por día (ingresos − gastos), del más antiguo al más reciente, en hora de Polonia. */
export function netByDay(rows: LedgerRow[]): { day: string; income: number; spent: number }[] {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" });
  const days = new Map<string, { income: number; spent: number }>();
  for (const r of rows) {
    if (r.kind !== "sale" && r.kind !== "buy") continue;
    const d = fmt.format(new Date(r.at));
    const v = days.get(d) ?? { income: 0, spent: 0 };
    if (r.kind === "sale") v.income += r.price - r.cut;
    else v.spent += r.price;
    days.set(d, v);
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v }));
}

/** Fecha de hace `days` días. */
export const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
