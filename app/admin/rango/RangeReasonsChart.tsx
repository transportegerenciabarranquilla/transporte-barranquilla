"use client";

import { useState } from "react";
import { RANGE_REASONS } from "../../lib/rangeReasons";
import { filterRangeHours, summarizeRangeReasons } from "../../lib/rangeReasonSummary";
import { RANGE_HOUR_WINDOWS } from "../../lib/rangeHours";
import { countRangeVehicles, type RangeVehicleRow } from "../../lib/rangeVehicleCount";

const COLORS = ["#0284c7", "#059669", "#d97706", "#7c3aed"];
const format = (value: number) => value.toLocaleString("es-CO", { maximumFractionDigits: 0 });

export default function RangeReasonsChart({ rows }: { rows: Array<Parameters<typeof summarizeRangeReasons>[0][number] & RangeVehicleRow> }) {
  const [hour, setHour] = useState("all");
  const filteredRows = filterRangeHours(rows, hour);
  const selectedWindow = RANGE_HOUR_WINDOWS.find(item => item.value === hour);
  const series = selectedWindow ? ["Vehículos fuera de rango"] : [...RANGE_REASONS];
  const vehicleCounts = selectedWindow ? countRangeVehicles(rows, hour) : [];
  const groups = selectedWindow
    ? vehicleCounts.map(group => ({ contractor: group.contractor, counts: [group.vehicleCount], total: group.vehicleCount, unclassified: 0 }))
    : summarizeRangeReasons(rows);
  const windowLabel = RANGE_HOUR_WINDOWS.find(item => item.value === hour)?.label ?? (hour === "all" ? "Todas las horas" : hour === "other" ? "Antes de las 6 a. m. o desde las 4 p. m." : "Sin hora registrada");
  const unknownHours = summarizeRangeReasons(rows).reduce((sum, group) => sum + group.unknownHour, 0);
  const historicalHours = filteredRows.filter(row => row.withinRadius === false && row.status !== "NOT_STARTED" && row.outOfRadiusRecordedSource === "report").length;
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const unclassified = groups.reduce((sum, group) => sum + group.unclassified, 0);
  const maximum = Math.max(1, ...groups.flatMap((group) => group.counts));
  const tick = Math.max(1, Math.ceil(maximum / 4));
  const scale = tick * 4;

  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="range-reasons-title">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/60 px-5 py-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-700">{selectedWindow ? "Cantidad por franja" : "Motivos registrados"}</p>
        <h3 id="range-reasons-title" className="mt-1 text-lg font-semibold text-[#10223d]">{selectedWindow ? `Vehículos fuera de rango · ${windowLabel}` : "Fuera de rango por contratista"}</h3>
        <p className="mt-1 text-xs text-slate-500">{selectedWindow ? "Cantidad de vehículos por contratista en la franja y las fechas seleccionadas." : "Cantidad de visitas por motivo, según los filtros de fecha, contratista y DT."}</p>
      </div>
      {!selectedWindow && <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 font-semibold text-emerald-800">{(total - unclassified).toLocaleString("es-CO")} con motivo</span>
        <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600">{unclassified.toLocaleString("es-CO")} sin clasificar</span>
      </div>}
    </header>
    <div className="p-5">
      <div className="mb-5">
        <p className="mb-2 text-xs font-semibold text-slate-600">Pulsa una franja para ver cuántos vehículos estuvieron fuera de rango</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Franja horaria">
          <button type="button" aria-pressed={!selectedWindow} onClick={() => setHour("all")} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${!selectedWindow ? "border-[#10223d] bg-[#10223d] text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>Ver motivos</button>
          {RANGE_HOUR_WINDOWS.map(item => <button key={item.value} type="button" aria-pressed={hour === item.value} onClick={() => setHour(item.value)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${hour === item.value ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 text-slate-600 hover:bg-sky-50"}`}>{item.label}</button>)}
        </div>
      </div>
      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2">
        {series.map((reason, index) => <span key={reason} className="inline-flex items-center gap-2 text-xs font-medium text-slate-600"><i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLORS[index] }} />{reason}</span>)}
      </div>
      {!groups.length ? <p className="rounded-lg bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">No hay visitas fuera de rango para los filtros seleccionados.</p> : <>
        <p className="mb-1 text-xs font-medium text-slate-500">{selectedWindow ? "Número de vehículos" : "Visitas fuera de rango"}</p>
        <div className="overflow-x-auto pb-2 pt-6">
          <div style={{ minWidth: Math.max(540, groups.length * 185) }}>
            <div className="relative ml-12 h-72 border-b border-l border-slate-400 sm:h-80">
              {[0, 1, 2, 3, 4].map((value) => <div key={value} className="pointer-events-none absolute inset-x-0 border-t border-slate-100" style={{ bottom: `${value * 25}%` }} aria-hidden="true">
                <span className="absolute right-full -translate-y-1/2 pr-3 text-xs tabular-nums text-slate-500">{format(value * tick)}</span>
              </div>)}
              <div className="absolute inset-0 grid items-end" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
                {groups.map((group) => <div key={group.contractor} className="flex h-full items-end justify-center px-4">
                  {series.map((reason, index) => <div key={reason}
                    className={`relative transition-[height] duration-300 motion-reduce:transition-none ${selectedWindow ? "w-16" : "w-1/4 max-w-12"}`}
                    style={{ height: `${group.counts[index] / scale * 100}%`, backgroundColor: COLORS[index] }}
                    role="img" aria-label={`${group.contractor}, ${reason}: ${format(group.counts[index])} ${selectedWindow ? "vehículos" : "visitas"}`}
                    title={`${group.contractor} · ${reason}: ${format(group.counts[index])}`}>
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold tabular-nums text-slate-700">{format(group.counts[index])}</span>
                  </div>)}
                </div>)}
              </div>
            </div>
            <div className="ml-12 grid" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
              {groups.map((group) => <div key={group.contractor} className="px-3 pt-3 text-center">
                <h4 className="text-sm font-semibold text-[#10223d]">{group.contractor}</h4>
                <p className="mt-1 text-[11px] text-slate-500">{selectedWindow ? `${format(group.counts[0])} vehículos` : `${group.total.toLocaleString("es-CO")} fuera de rango`}</p>
                {group.unclassified > 0 && <p className="mt-1 text-[11px] text-amber-700">{group.unclassified.toLocaleString("es-CO")} sin clasificar</p>}
              </div>)}
            </div>
          </div>
        </div>
        {selectedWindow ? <div className="mt-4 text-xs text-slate-500">
          <p>Cada placa cuenta una sola vez por contratista en la franja y las fechas seleccionadas, aunque tenga varios clientes fuera de rango.</p>
          <details className="mt-2"><summary className="cursor-pointer">Cómo se calcula y qué horas se usan</summary>
            <p className="mt-2">Se incluyen todos los motivos y las visitas sin clasificar. Las horas se muestran en horario de Colombia.</p>
            {historicalHours > 0 && <p className="mt-2">Los registros históricos usan la hora del primer reporte disponible como referencia; no es la hora exacta del evento.</p>}
            {unknownHours > 0 && <p className="mt-2">{unknownHours} visitas sin hora no se asignan a una franja.</p>}
            {vehicleCounts.some(group => group.missingPlate > 0) && <p className="mt-2">Las visitas sin placa se excluyen del conteo de vehículos.</p>}
          </details>
        </div> : <p className="mt-4 text-[11px] text-slate-500">Cada cliente se cuenta una vez por fecha, DT y contratista. «Sin clasificar» incluye visitas sin motivo o con otro motivo.</p>}
      </>}
    </div>
  </section>;
}
