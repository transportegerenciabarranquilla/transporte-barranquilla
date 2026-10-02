"use client";

import { useEffect, useState } from "react";
import { complaintAccumulation, complaintLastThreeDays, complaintToday, type ComplaintChartRow } from "../../lib/complaintCharts";

const format = (value: number) => value.toLocaleString("es-CO");
const percent = (value: number) => `${value.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;
const dateLabel = (date: string) => date.split("-").reverse().join("/");

export default function ComplaintTrendCharts({ rows }: { rows: ComplaintChartRow[] }) {
  const [today, setToday] = useState(() => complaintToday());
  useEffect(() => {
    const update = () => setToday(complaintToday());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  const accumulation = complaintAccumulation(rows);
  const recent = complaintLastThreeDays(rows, today);
  const recentTotal = recent.reduce((sum, day) => sum + day.count, 0);
  const tick = Math.max(1, Math.ceil(Math.max(0, ...recent.map(day => day.count)) / 4));

  return <div className="grid gap-5 lg:grid-cols-2">
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-blue-800">Evolución acumulada</p>
      <h2 className="mt-1 text-lg font-bold">Porcentaje de quejas acumuladas</h2>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">Quejas acumuladas hasta cada fecha ÷ total de quejas con fecha en los filtros seleccionados. Base: {format(accumulation.total)} quejas.</p>
      {accumulation.excluded > 0 && <p className="mt-2 text-xs text-amber-700">{format(accumulation.excluded)} quejas sin fecha válida quedan fuera de estas dos gráficas.</p>}
      {accumulation.total === 0 ? <p className="mt-6 rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">No hay quejas con fecha para calcular el porcentaje acumulado.</p> : <>
        <div className="mt-5 flex justify-between text-[10px] text-slate-500" aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div>
        <div className="mt-3 max-h-80 space-y-4 overflow-y-auto pr-2">
          {accumulation.values.map(day => <div key={day.date}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs"><span className="font-semibold">{dateLabel(day.date)}</span><span><strong className="text-blue-800">{percent(day.percentage)}</strong> · {format(day.accumulated)} de {format(accumulation.total)} quejas</span></div>
            <div className="h-5 overflow-hidden rounded-md bg-blue-50" role="img" aria-label={`${dateLabel(day.date)}: ${percent(day.percentage)}, ${format(day.accumulated)} quejas acumuladas, ${format(day.count)} nuevas ese día`}>
              <div className="h-full rounded-md bg-[#2563eb] shadow-sm" style={{ width: `${day.percentage}%` }} />
            </div>
          </div>)}
        </div>
      </>}
    </section>
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-blue-800">Últimos tres días</p>
      <h2 className="mt-1 text-lg font-bold">Quejas recientes</h2>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">Hoy y los dos días anteriores, según la fecha de creación y el horario de Colombia. Se aplican los filtros de transportista, estado y fechas.</p>
      <p className="mt-3 text-sm font-semibold text-blue-800">{format(recentTotal)} quejas del {dateLabel(recent[0].date)} al {dateLabel(today)}</p>
      <div className="mt-10 ml-8">
        <div className="relative h-48 border-b border-slate-300">
          {[0, 1, 2, 3, 4].map(value => <div key={value} className="pointer-events-none absolute inset-x-0 border-t border-slate-100" style={{ bottom: `${value * 25}%` }} aria-hidden="true"><span className="absolute right-full -translate-y-1/2 pr-2 text-[10px] text-slate-500">{format(value * tick)}</span></div>)}
          <div className="absolute inset-0 grid grid-cols-3 items-end">
            {recent.map(day => <div key={day.date} className="flex h-full items-end justify-center px-2">
              <div role="img" aria-label={`${dateLabel(day.date)}: ${format(day.count)} quejas`} className="relative w-12 rounded-t-md bg-[#0d9488] shadow-sm" style={{ height: `${day.count / (tick * 4) * 100}%` }}>
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-sm font-bold tabular-nums">{format(day.count)}</span>
              </div>
            </div>)}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 pt-3 text-center text-[10px] font-semibold sm:text-xs">{recent.map(day => <div key={day.date}>{dateLabel(day.date)}{day.date === today && <span className="block text-blue-800">Hoy</span>}</div>)}</div>
      </div>
      {recentTotal === 0 && <p className="mt-4 text-xs text-slate-500">No hay quejas en estos tres días con los filtros seleccionados.</p>}
    </section>
  </div>;
}
