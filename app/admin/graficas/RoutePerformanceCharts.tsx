"use client";

import { useState } from "react";
import type { MatchedRoutePerformance } from "../../lib/routePerformanceImport";

const format = (value: number) => value.toLocaleString("es-CO", { maximumFractionDigits: 2 });
const CIRCUMFERENCE = 2 * Math.PI * 36;

export default function RoutePerformanceCharts({ rows }: { rows: MatchedRoutePerformance[] }) {
  const [showAll, setShowAll] = useState(false);
  const topTrips = [...rows].sort((a, b) => Math.abs(b.differenceKm) - Math.abs(a.differenceKm)).slice(0, 10);
  const trips = showAll ? topTrips : topTrips.slice(0, 5);
  const maxKm = Math.max(1, ...topTrips.flatMap((row) => [row.plannedKm, row.executedKm]));
  const ranged = rows.filter((row) => row.rangePercent !== null);
  const average = ranged.length ? ranged.reduce((total, row) => total + (row.rangePercent ?? 0), 0) / ranged.length : null;
  const inRange = average === null ? 0 : Math.max(0, Math.min(100, average));

  return <div className="grid items-start gap-3 xl:grid-cols-2">
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="Gráfica de kilómetros por viaje">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h3 className="text-sm font-bold text-[#10223d]">Diferencia de kilómetros</h3><p className="mt-0.5 text-[11px] text-slate-500">Viajes con mayor diferencia del Excel</p></div>
        <div className="flex gap-2 text-[10px] font-semibold text-slate-500"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-blue-600" />Plan</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-cyan-500" />Ejecutado</span></div>
      </div>
      <div className="mt-3 space-y-2.5">{trips.map((row) => <div key={row.fila}>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 text-[11px]"><span className="font-semibold text-slate-700">{row.plate || row.originalPlate} · {row.date.split("-").reverse().join("/")}</span><span className="font-bold tabular-nums text-violet-700">{format(row.differenceKm)} km de diferencia</span></div>
        <div role="img" aria-label={`Planeados: ${format(row.plannedKm)} km. Ejecutados: ${format(row.executedKm)} km. Diferencia del Excel: ${format(row.differenceKm)} km.`} className="space-y-1">
          <div className="grid grid-cols-[1fr_62px] items-center gap-2"><div className="h-1.5 rounded bg-slate-100"><div className="h-full rounded bg-blue-600" style={{ width: `${row.plannedKm / maxKm * 100}%` }} /></div><span className="text-right text-[10px] tabular-nums text-slate-500">{format(row.plannedKm)}</span></div>
          <div className="grid grid-cols-[1fr_62px] items-center gap-2"><div className="h-1.5 rounded bg-slate-100"><div className="h-full rounded bg-cyan-500" style={{ width: `${row.executedKm / maxKm * 100}%` }} /></div><span className="text-right text-[10px] tabular-nums text-slate-500">{format(row.executedKm)}</span></div>
        </div>
      </div>)}</div>
      {!trips.length && <p className="py-6 text-center text-xs text-slate-500">No hay viajes para estos filtros.</p>}
      {topTrips.length > 5 && <button className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100" onClick={() => setShowAll((value) => !value)} type="button">{showAll ? "Ver menos" : "Ver 10 viajes"}</button>}
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="Gráfica circular del rango general">
      <h3 className="text-sm font-bold text-[#10223d]">Entrega en rango general</h3>
      <p className="mt-0.5 text-[11px] text-slate-500">Promedio de {ranged.length} viaje{ranged.length === 1 ? "" : "s"} con rango · Todos los filtros y páginas</p>
      <div className="flex flex-wrap items-center justify-center gap-5 py-5">
        <svg aria-label={average === null ? "Sin datos de rango" : `${format(average)} por ciento en rango y ${format(100 - average)} por ciento fuera de rango`} height="156" role="img" viewBox="0 0 100 100" width="156">
          <circle cx="50" cy="50" fill="none" r="36" stroke={average === null ? "#e2e8f0" : "#fbbf24"} strokeWidth="12" />
          {average !== null && inRange > 0 && <circle cx="50" cy="50" fill="none" r="36" stroke="#10b981" strokeDasharray={`${CIRCUMFERENCE * inRange / 100} ${CIRCUMFERENCE}`} strokeLinecap="round" strokeWidth="12" transform="rotate(-90 50 50)" />}
          <text dominantBaseline="middle" fill={average === null ? "#64748b" : "#064e3b"} fontSize={average === null ? "13" : "18"} fontWeight="800" textAnchor="middle" x="50" y="51">{average === null ? "—" : `${format(average)}%`}</text>
        </svg>
        <div className="space-y-3 text-xs font-semibold">
          <p className="flex items-center gap-2 text-emerald-700"><span className="h-3 w-3 rounded-full bg-emerald-500" />En rango: {average === null ? "Sin dato" : `${format(average)} %`}</p>
          <p className="flex items-center gap-2 text-amber-700"><span className="h-3 w-3 rounded-full bg-amber-400" />Fuera: {average === null ? "Sin dato" : `${format(100 - average)} %`}</p>
        </div>
      </div>
      <p className="text-center text-[10px] leading-4 text-slate-500">Cada viaje aporta su porcentaje de ENTREGA RANGO del Excel.</p>
    </section>
  </div>;
}
