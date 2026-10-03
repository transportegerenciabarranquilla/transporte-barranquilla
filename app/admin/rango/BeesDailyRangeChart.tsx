"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { beesRangeByDate, type BeesRangeRow } from "../../lib/beesRangeCharts";

const series = [
  { key: "inside", label: "En rango", color: "#059669", track: "#d1fae5" },
  { key: "outside", label: "Fuera de rango", color: "#dc2626", track: "#fee2e2" },
  { key: "unvalidated", label: "Sin validar", color: "#d9a514", track: "#fef3c7" },
] as const;
const format = (value: number) => value.toLocaleString("es-CO");
const percentageOf = (value: number, total: number) => total > 0 ? value / total * 100 : 0;
const formatPercentage = (value: number) => `${value.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;
const dateLabel = (date: string) => date ? date.split("-").reverse().join("/") : "Sin fecha";
const weekday = (date: string) => date && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ? new Intl.DateTimeFormat("es-CO", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)) : "Sin fecha";

function StatusRing({ item, value, total }: { item: typeof series[number]; value: number; total: number }) {
  const percentage = percentageOf(value, total);
  const label = formatPercentage(percentage);
  return <div className="flex flex-col items-center gap-1 py-2">
    <h4 className="text-center text-xs font-bold sm:text-sm" style={{ color: item.color }}>{item.label}</h4>
    <svg viewBox="0 0 120 120" className="h-20 w-20 sm:h-28 sm:w-28" role="img" aria-label={`${item.label}: ${label} de los clientes del día`}>
      <circle cx="60" cy="60" r="44" fill="none" stroke={item.track} strokeWidth="17" />
      <circle cx="60" cy="60" r="44" fill="none" stroke={item.color} strokeWidth="17" pathLength="100" strokeDasharray={`${percentage} 100`} transform="rotate(-90 60 60)" />
      <text x="60" y="65" textAnchor="middle" fontSize={label.length > 6 ? "14" : "19"} fontWeight="800" fill="#0f172a">{label}</text>
    </svg>
  </div>;
}

export default function BeesDailyRangeChart({ rows }: { rows: BeesRangeRow[] }) {
  const days = beesRangeByDate(rows);
  const [selectedDate, setSelectedDate] = useState("");
  const selected = days.find(day => day.date === selectedDate) ?? days[days.length - 1];
  const width = Math.max(760, days.length * 66 + 100);
  const height = 440;
  const left = 64;
  const top = 26;
  const bottom = 374;
  const step = 25;
  const maximum = 100;
  const x = (index: number) => days.length === 1 ? width / 2 : left + index * (width - left - 40) / (days.length - 1);
  const y = (value: number) => bottom - value / maximum * (bottom - top);

  return <section aria-label="Rango de clientes BEES por día" className="space-y-2">
    {!days.length ? <p className="py-12 text-center text-sm text-slate-500">No hay clientes BEES para los filtros seleccionados.</p> : <>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_210px]">
      <div className="min-w-0 rounded-xl border border-slate-300 bg-gradient-to-br from-slate-50 to-white p-4">
        <div className="flex items-center gap-3"><span aria-hidden="true" className="text-3xl">🐝</span><div><h3 className="text-sm font-bold text-slate-900">Clientes BEES por día</h3><p className="text-[11px] text-slate-500">Selecciona una fecha para ver el porcentaje de cada estado sobre el total de clientes del día.</p></div></div>
        <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-medium">{series.map(item => <span key={item.key} className="flex items-center gap-1.5 text-slate-800"><span className="relative h-0.5 w-5" style={{ backgroundColor: item.color }}><span className="absolute -top-0.5 left-2 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} /></span>{item.label}</span>)}</div>
      <div className="mt-4 overflow-x-auto">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Gráfica de líneas: porcentaje de clientes en rango, fuera de rango y sin validar por día" className="min-w-full">
          <text x={left} y="13" fontSize="11" fill="#64748b">Clientes (%)</text>
          {[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1={left} x2={width - 22} y1={y(tick * step)} y2={y(tick * step)} stroke="#cbd5e1" strokeDasharray="4 4" /><text x={left - 10} y={y(tick * step) + 4} textAnchor="end" fontSize="11" fill="#64748b">{formatPercentage(tick * step)}</text></g>)}
          {selected && <line x1={x(days.indexOf(selected))} x2={x(days.indexOf(selected))} y1={top} y2={bottom} stroke="#94a3b8" strokeDasharray="3 4" />}
          {series.map(item => <g key={item.key}>
            <polyline points={days.map((day, index) => `${x(index)},${y(percentageOf(day[item.key], day.total))}`).join(" ")} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinejoin="round" />
            {days.map((day, index) => <circle key={day.date} cx={x(index)} cy={y(percentageOf(day[item.key], day.total))} r="4" fill="white" stroke={item.color} strokeWidth="2"><title>{dateLabel(day.date)} · {item.label}: {formatPercentage(percentageOf(day[item.key], day.total))}</title></circle>)}
          </g>)}
          {days.map((day, index) => <g key={day.date}>
            <text x={x(index)} y={bottom + 19} textAnchor="middle" fontSize="11" fill="#334155">{weekday(day.date)}</text>
            <text x={x(index)} y={bottom + 36} textAnchor="middle" fontSize="10" fill="#64748b">{dateLabel(day.date)}</text>
            <rect x={x(index) - 24} y={top} width="48" height={bottom - top + 22} fill="transparent" role="button" tabIndex={0} aria-pressed={selected?.date === day.date} aria-label={`${dateLabel(day.date)}: ${formatPercentage(percentageOf(day.inside, day.total))} en rango, ${formatPercentage(percentageOf(day.outside, day.total))} fuera de rango, ${formatPercentage(percentageOf(day.unvalidated, day.total))} sin validar`} className="cursor-pointer focus:outline-2 focus:outline-violet-500" onMouseEnter={() => setSelectedDate(day.date)} onFocus={() => setSelectedDate(day.date)} onClick={() => setSelectedDate(day.date)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedDate(day.date); } }}><title>{dateLabel(day.date)}: {formatPercentage(percentageOf(day.inside, day.total))} en rango, {formatPercentage(percentageOf(day.outside, day.total))} fuera de rango, {formatPercentage(percentageOf(day.unvalidated, day.total))} sin validar</title></rect>
          </g>)}
        </svg>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Desliza para ver todas las fechas con registros. Se conservan los filtros de fecha, contratista y DT.</p>
      </div>
      {selected && <aside aria-label="Porcentajes del día seleccionado" className="grid grid-cols-3 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 lg:grid-cols-1"><p className="col-span-3 text-center text-xs font-semibold text-slate-500 lg:col-span-1">{dateLabel(selected.date)}</p>{series.map(item => <StatusRing key={item.key} item={item} value={selected[item.key]} total={selected.total} />)}</aside>}
      </div>
      {selected && <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm" aria-live="polite"><strong className="flex items-center gap-2"><CalendarDays size={19} aria-hidden="true" />{dateLabel(selected.date)}</strong>{series.map(item => <span key={item.key} className="flex items-center gap-2" style={{ color: item.color }}><span className="h-4 w-4 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />{item.label}: <strong>{formatPercentage(percentageOf(selected[item.key], selected.total))}</strong></span>)}<strong className="flex items-center gap-2 text-slate-900"><span aria-hidden="true">🐝</span>Total: {format(selected.total)}</strong></div>}
    </>}
  </section>;
}
