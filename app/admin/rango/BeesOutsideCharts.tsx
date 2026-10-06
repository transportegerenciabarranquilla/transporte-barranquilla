"use client";

import { useState, type ReactNode } from "react";
import { contractorLabel } from "../../lib/contractors";
import { beesOutsideByContractor, beesOutsideByHour, beesOutsideByWeekday, beesRangeTotals, type BeesRangeRow } from "../../lib/beesRangeCharts";

const format = (value: number) => value.toLocaleString("es-CO");
const colors = ["from-violet-600 to-violet-400", "from-teal-600 to-teal-400", "from-amber-600 to-amber-400", "from-pink-600 to-pink-400", "from-indigo-600 to-indigo-400", "from-orange-600 to-orange-400", "from-emerald-600 to-emerald-400"];

const contractorColors: Record<string, { bar: string; button: string }> = {
  "Surti Cervezas": { bar: "from-yellow-500 to-yellow-300", button: "border-yellow-400 bg-yellow-400 text-[#10223d]" },
  "Logisticos": { bar: "from-green-600 to-green-400", button: "border-green-700 bg-green-700 text-white" },
  "Punto Corona": { bar: "from-amber-600 to-amber-400", button: "border-amber-400 bg-amber-400 text-[#10223d]" },
};

const contractorColor = (contractor: string) => contractorColors[contractorLabel(contractor)];

export default function BeesOutsideCharts({ rows, contractor, contractors, onContractorChange }: {
  rows: BeesRangeRow[]; contractor: string; contractors: string[]; onContractorChange: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const totals = beesRangeTotals(rows);
  const timeBarColor = "from-emerald-600 to-emerald-400";
  const controls = <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Contratista de las gráficas BEES">
    {["Todas", ...contractors].map(item => <button key={item} type="button" aria-pressed={item === contractor} onClick={() => onContractorChange(item)}
      className={`rounded-full border px-3 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 ${item === contractor ? contractorColor(item)?.button ?? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-violet-50"}`}>
      {item === "Todas" ? "General" : item}
    </button>)}
  </div>;
  return <div className="space-y-5">
    <div className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
      Base BEES: <strong>{format(totals.total)} clientes</strong> = {format(totals.inside)} en rango + <strong>{format(totals.outside)} fuera de rango</strong> + {format(totals.unvalidated)} sin validar.
      Cada cliente cuenta una vez por contratista, fecha y DT, igual que en el comparativo superior. Los motivos seleccionados no cambian estos conteos.
    </div>
    <ClientChart title="Fuera de rango por contratista" subtitle="Clientes BEES fuera de rango, tengan o no un motivo seleccionado." values={beesOutsideByContractor(rows).map(group => ({ label: group.contractor || "Sin contratista", count: group.outside, color: contractorColor(group.contractor)?.bar }))} total={totals.outside} controls={controls} />
    <ClientChart title="Clientes fuera de rango por horario" subtitle="Clientes de la misma base BEES, agrupados por la hora registrada en Colombia." values={beesOutsideByHour(rows, expanded)} total={totals.outside} controls={controls} barColor={timeBarColor}
      footer={<>
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="rounded-lg bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">{expanded ? "Ver menos horarios" : "Ver más horarios desde las 4 p. m."}</button>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">Se incluyen clientes sin placa, anteriores a las 6 a. m. y sin hora. Los registros históricos pueden usar la hora del primer reporte como referencia.</p>
      </>} />
    <ClientChart title="Clientes fuera de rango por día de la semana" subtitle="Totales de clientes BEES por fecha operativa, sin promedios." values={beesOutsideByWeekday(rows)} total={totals.outside} controls={controls} barColor={timeBarColor} />
  </div>;
}

function ClientChart({ title, subtitle, values, total, controls, footer, barColor }: {
  title: string; subtitle: string; values: Array<{ label: string; count: number; color?: string }>; total: number; controls: ReactNode; footer?: ReactNode; barColor?: string;
}) {
  const tick = Math.max(1, Math.ceil(Math.max(0, ...values.map(value => value.count)) / 4));
  const columns = { gridTemplateColumns: `repeat(${values.length || 1}, minmax(0, 1fr))` };
  return <section aria-label={title} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <header className="border-b border-slate-200 bg-green-50/40 px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-violet-700">Datos BEES</p>
      <h3 className="mt-1 text-lg font-semibold text-[#10223d]">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>{controls}
    </header>
    <div className="p-5">
      <div className="mb-6 flex flex-wrap justify-between gap-2 text-xs"><span className="font-semibold text-slate-700">{format(total)} clientes fuera de rango</span><span className="text-slate-500">Número de clientes</span></div>
      {total === 0 ? <p className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No hay clientes BEES fuera de rango para los filtros seleccionados.</p> : <div className="overflow-x-auto pb-2" tabIndex={0} role="region" aria-label={`${title}; desplaza para ver todas las categorías`}>
        <div className="pt-6" style={{ minWidth: Math.max(450, values.length * 105) }}>
          <div className="relative ml-10 h-56 border-b border-slate-300">
            {[0, 1, 2, 3, 4].map(value => <div key={value} className="pointer-events-none absolute inset-x-0 border-t border-slate-100" style={{ bottom: `${value * 25}%` }} aria-hidden="true"><span className="absolute right-full -translate-y-1/2 pr-2 text-[10px] text-slate-500">{format(value * tick)}</span></div>)}
            <div className="absolute inset-0 grid items-end" style={columns}>{values.map((value, index) => <div key={value.label} className="flex h-full items-end justify-center px-2">
              <div className={`relative w-10 rounded-t-md bg-gradient-to-t ${value.color ?? barColor ?? colors[index % colors.length]}`} style={{ height: `${value.count / (tick * 4) * 100}%` }} role="img" aria-label={`${value.label}: ${format(value.count)} clientes fuera de rango`}>
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold tabular-nums text-[#10223d]">{format(value.count)}</span>
              </div>
            </div>)}</div>
          </div>
          <div className="ml-10 grid" style={columns}>{values.map(value => <p key={value.label} className="px-2 pt-3 text-center text-xs font-semibold text-slate-600">{value.label}</p>)}</div>
        </div>
      </div>}
      {footer && <div className="mt-4">{footer}</div>}
    </div>
  </section>;
}
