"use client";

import { useMemo } from "react";
import { BarChart3, CalendarDays, Truck } from "lucide-react";
import { coordinateDay, type CoordinateRecord } from "../../lib/coordinateRecords";

const dayLabel = new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", day: "2-digit", month: "short" });
const weekday = new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", weekday: "short", year: "numeric" });

export default function CoordinateCharts({ rows, loading }: { rows: CoordinateRecord[]; loading: boolean }) {
  const stats = useMemo(() => {
    const days = new Map<string, number>();
    const contractors = new Map<string, number>();
    let undated = 0;
    for (const row of rows) {
      const day = coordinateDay(row.createdAt);
      if (day) days.set(day, (days.get(day) || 0) + 1);
      else undated++;
      const contractor = row.contratista.trim() || "Sin contratista";
      contractors.set(contractor, (contractors.get(contractor) || 0) + 1);
    }
    return {
      days: [...days].sort(([a], [b]) => a.localeCompare(b)),
      contractors: [...contractors].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")),
      undated,
    };
  }, [rows]);
  const maxDay = Math.max(1, ...stats.days.map(([, count]) => count));
  const maxContractor = Math.max(1, ...stats.contractors.map(([, count]) => count));
  const tickStep = Math.max(1, Math.ceil(maxDay / 4));
  const chartMax = tickStep * 4;
  const datedCount = rows.length - stats.undated;
  const empty = loading ? "Cargando registros…" : "No hay registros para los filtros seleccionados.";

  return <section aria-label="Gráficas de ingreso de coordenadas" className="space-y-4 pt-3">
    <div className="flex flex-wrap items-end justify-between gap-3 px-1">
      <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-violet-600">Resumen de ingresos</p><h2 className="mt-1 text-xl font-black tracking-tight">Actividad de coordenadas</h2><p className="mt-1 text-xs text-slate-500">Las gráficas reflejan las fechas y la búsqueda seleccionadas.</p></div>
      <span className="inline-flex items-center gap-2 rounded-full border border-violet-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"><span className="h-2 w-2 rounded-full bg-violet-500" />{rows.length.toLocaleString("es-CO")} registros filtrados</span>
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
      <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-violet-50/80 to-white px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700"><BarChart3 size={20} /></span>
          <div><h3 className="font-bold">Coordenadas ingresadas por día</h3><p className="mt-1 text-xs text-slate-500">Fecha de registro · hora de Bogotá</p></div>
        </header>
        <div className="flex flex-wrap gap-x-8 gap-y-3 px-5 pt-4">
          <div><p className="text-[11px] font-medium text-slate-500">Registros con fecha</p><p className="mt-0.5 text-2xl font-black tabular-nums">{datedCount.toLocaleString("es-CO")}</p></div>
          <div><p className="text-[11px] font-medium text-slate-500">Días con ingresos</p><p className="mt-0.5 text-2xl font-black tabular-nums">{stats.days.length.toLocaleString("es-CO")}</p></div>
          <div><p className="text-[11px] font-medium text-slate-500">Mayor cantidad en un día</p><p className="mt-0.5 text-2xl font-black tabular-nums text-violet-700">{stats.days.length ? maxDay.toLocaleString("es-CO") : "—"}</p></div>
        </div>
        {stats.days.length ? <div className="px-5 pb-4 pt-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Cantidad de registros</p>
          <div className="flex gap-2">
            <div aria-hidden="true" className="relative mt-7 h-48 w-8 shrink-0 text-right text-[10px] tabular-nums text-slate-400">
              {[4, 3, 2, 1, 0].map((tick) => <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${(4 - tick) * 25}%` }}>{tick * tickStep}</span>)}
            </div>
            <div className="min-w-0 flex-1 overflow-x-auto rounded-lg focus-visible:outline-2 focus-visible:outline-violet-500" tabIndex={0} role="region" aria-label="Cantidad por fecha; desplaza horizontalmente para ver todos los días">
              <div className="relative pt-7" style={{ minWidth: stats.days.length * 92 }}>
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-7 h-48">
                  {[0, 1, 2, 3, 4].map((tick) => <div key={tick} className={`absolute inset-x-0 border-t ${tick === 4 ? "border-slate-200" : "border-dashed border-slate-100"}`} style={{ top: `${tick * 25}%` }} />)}
                </div>
                <div className="relative flex justify-around gap-3 px-3">
                  {stats.days.map(([day, count]) => {
                    const date = new Date(`${day}T12:00:00Z`);
                    const label = dayLabel.format(date);
                    return <div key={day} className="group min-w-[68px] max-w-28 flex-1 text-center" title={`${label}: ${count} coordenadas`}>
                      <div className="flex h-48 items-end justify-center">
                        <div role="img" aria-label={`${label}: ${count} coordenadas`} className="relative w-full max-w-12 rounded-t-md bg-gradient-to-t from-violet-700 to-violet-400 shadow-sm transition-[height,filter] duration-300 group-hover:brightness-110 motion-reduce:transition-none" style={{ height: `${count / chartMax * 100}%` }}>
                          <span aria-hidden="true" className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-md bg-violet-50 px-2 py-0.5 text-xs font-extrabold tabular-nums text-violet-700">{count}</span>
                        </div>
                      </div>
                      <p className="mt-3 text-xs font-bold text-slate-600">{shortDate.format(date)}</p><p className="mt-0.5 text-[10px] text-slate-400">{weekday.format(date)}</p>
                    </div>;
                  })}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-[10px] text-slate-500"><CalendarDays size={12} />Se muestran los días con registros.</p>
        </div> : <p className="px-5 py-16 text-center text-sm text-slate-500">{rows.length ? "Los registros filtrados no tienen una fecha válida." : empty}</p>}
        {stats.undated > 0 ? <p className="mx-5 mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{stats.undated} registros sin fecha válida no se incluyen en las barras por día.</p> : null}
      </article>
      <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-blue-50/80 to-white px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700"><Truck size={20} /></span>
          <div><h3 className="font-bold">Ingresos por contratista</h3><p className="mt-1 text-xs text-slate-500">Ordenados de mayor a menor cantidad</p></div>
        </header>
        <div className="flex items-baseline justify-between gap-3 px-5 pb-2 pt-4"><p className="text-sm font-bold">{stats.contractors.length} contratistas</p><span className="text-[10px] text-slate-400">Cantidad · % del total</span></div>
        <div className="max-h-80 space-y-5 overflow-y-auto p-5">
          {stats.contractors.map(([name, count], index) => <div key={name} className="group">
            <div className="mb-2 flex items-center gap-2.5">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-bold ${index === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{index + 1}</span>
              <span className="min-w-0 flex-1 text-xs font-semibold text-slate-700">{name}</span>
              <div className="shrink-0 text-right"><strong className="text-sm tabular-nums text-blue-700">{count.toLocaleString("es-CO")}</strong><span className="ml-2 text-[10px] tabular-nums text-slate-400">{(count / rows.length * 100).toFixed(1)}%</span></div>
            </div>
            <div role="img" aria-label={`${name}: ${count} coordenadas`} className="ml-8 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-[width,filter] duration-300 group-hover:brightness-110 motion-reduce:transition-none" style={{ width: `${count / maxContractor * 100}%` }} /></div>
          </div>)}
          {!stats.contractors.length ? <p className="py-12 text-center text-sm text-slate-500">{empty}</p> : null}
        </div>
      </article>
    </div>
  </section>;
}
