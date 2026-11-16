"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/money";
import type { PricePoint } from "@/lib/queries";

const TZ = "Europe/Warsaw";
const fmtTick = (range: "7d" | "30d") => (t: number) =>
  new Date(t).toLocaleString("es-ES", range === "7d" ? { timeZone: TZ, weekday: "short", hour: "2-digit" } : { timeZone: TZ, day: "numeric", month: "short" });
const fmtFull = (t: number) => new Date(t).toLocaleString("es-ES", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" });

const tooltipStyle = { background: "#1f232c", border: "1px solid #2a2f3a", borderRadius: 8, fontSize: 12 };
const axis = { stroke: "#9299a6", fontSize: 11, tickLine: false, axisLine: false } as const;

export function PriceChart({ hourly, daily }: { hourly: PricePoint[]; daily: PricePoint[] }) {
  const [range, setRange] = useState<"7d" | "30d">("7d");
  const data = range === "7d" ? hourly : daily;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 text-xs">
          <span className="text-gold">■ Mínimo</span>
          <span className="text-[#5b9cf0]">■ Mercado</span>
        </div>
        <div className="flex rounded-lg border border-line text-sm">
          {(["7d", "30d"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`min-h-9 px-3 ${range === r ? "bg-surface-2 text-fg" : "text-muted"}`}
              aria-pressed={range === r}
            >
              {r === "7d" ? "7 días" : "30 días"}
            </button>
          ))}
        </div>
      </div>

      {data.length < 2 ? (
        <p className="py-10 text-center text-sm text-muted">Hacen falta al menos dos {range === "7d" ? "snapshots" : "días"} para dibujar la gráfica.</p>
      ) : (
        <>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#2a2f3a" vertical={false} />
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={fmtTick(range)} minTickGap={40} {...axis} />
                <YAxis tickFormatter={(v: number) => formatMoney(v)} width={64} domain={["auto", "auto"]} {...axis} />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(t) => fmtFull(Number(t))} formatter={(v, name) => [formatMoney(Number(v)), name]} />
                <Line name="Mínimo" dataKey="min" stroke="#e0b354" dot={false} strokeWidth={2} isAnimationActive={false} />
                <Line name="Mercado" dataKey="market" stroke="#5b9cf0" dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-xs text-muted">Unidades en venta</p>
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
                <XAxis dataKey="t" hide />
                <YAxis width={64} {...axis} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#1f232c" }} labelFormatter={(t) => fmtFull(Number(t))} formatter={(v) => [Number(v).toLocaleString("es-ES"), "En venta"]} />
                <Bar dataKey="qty" fill="#3a4150" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
