"use client";

import { useState } from "react";
import { contractorLabel } from "../../lib/contractors";
import { recordedRangeTime, rangeHour } from "../../lib/rangeHours";
import { countRangeVehicles, RANGE_VEHICLE_WINDOWS, RANGE_VEHICLE_EVENING_WINDOWS, type RangeVehicleRow } from "../../lib/rangeVehicleCount";

const format = (value: number) => value.toLocaleString("es-CO");

export default function RangeVehiclesChart({ rows }: { rows: Array<RangeVehicleRow & { outOfRadiusRecordedSource?: string }> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [eveningExpanded, setEveningExpanded] = useState(false);
  const visibleRows = rows.filter(row => contractorLabel(row.contractor) !== "Punto Corona");
  const hourWindows = eveningExpanded ? [...RANGE_VEHICLE_WINDOWS.slice(0, -1), ...RANGE_VEHICLE_EVENING_WINDOWS] : RANGE_VEHICLE_WINDOWS;
  const windows = hourWindows.map(window => ({ ...window, groups: countRangeVehicles(visibleRows, window.value) }));
  const contractors = windows[0].groups.map(group => group.contractor);
  const contractor = selected && contractors.includes(selected) ? selected : null;
  const values = windows.map(window => ({ ...window, count: window.groups
    .filter(group => !contractor || group.contractor === contractor)
    .reduce((sum, group) => sum + group.vehicleCount, 0) }));
  const tick = Math.max(1, Math.ceil(Math.max(...values.map(item => item.count)) / 4));
  const scale = tick * 4;
  const relevantRows = visibleRows.filter(row => row.withinRadius === false && row.status !== "NOT_STARTED" && row.date && (!contractor || (contractorLabel(row.contractor) || "Sin contratista") === contractor));
  const unknownHours = relevantRows.filter(row => recordedRangeTime(row) === null).length;
  const earlyHours = relevantRows.filter(row => { const hour = rangeHour(recordedRangeTime(row)); return hour !== null && hour < 6; }).length;
  const historicalHours = relevantRows.some(row => row.outOfRadiusRecordedSource === "report");
  const missingPlates = values.some(window => window.groups.some(group => (!contractor || group.contractor === contractor) && group.missingPlate > 0));
  const columns = eveningExpanded ? "grid-cols-9" : expanded ? "grid-cols-6" : "grid-cols-4 sm:grid-cols-6";

  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="range-vehicles-title">
    <header className="border-b border-slate-200 bg-sky-50/50 px-4 py-4 sm:px-5">
      <p className="text-[10px] font-bold uppercase tracking-[.16em] text-sky-700">Distribución por horario</p>
      <h3 id="range-vehicles-title" className="mt-1 text-lg font-semibold text-[#10223d]">Vehículos fuera de rango</h3>
      <p className="mt-1 text-xs text-slate-500">Compara todas las franjas o selecciona un contratista para ver su detalle.</p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Contratista de la gráfica de vehículos">
        {[null, ...contractors].map(item => <button key={item ?? "general"} type="button" aria-pressed={contractor === item} onClick={() => setSelected(item)}
          className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${contractor === item ? "border-sky-600 bg-sky-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50"}`}>
          {item ?? "General"}
        </button>)}
      </div>
    </header>
    <div className="p-4 sm:p-5">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-2 font-semibold text-slate-700"><i className="h-2.5 w-2.5 rounded-full bg-sky-600" />{contractor ?? "Todos los contratistas"}</span>
        <span className="text-slate-500">Número de vehículos</span>
      </div>
      {!contractors.length ? <p className="rounded-lg bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">No hay datos para los filtros seleccionados.</p> : <>
        <div className="overflow-x-auto pb-2">
        <div className={eveningExpanded ? "min-w-[810px] pt-6" : "pt-6"}>
        <div className="relative ml-8 h-48 border-b border-slate-300 sm:h-56">
          {[0, 1, 2, 3, 4].map(value => <div key={value} className="pointer-events-none absolute inset-x-0 border-t border-slate-100" style={{ bottom: `${value * 25}%` }} aria-hidden="true">
            <span className="absolute right-full -translate-y-1/2 pr-2 text-[10px] tabular-nums text-slate-500">{format(value * tick)}</span>
          </div>)}
          <div className={`absolute inset-0 grid items-end ${columns}`}>
            {values.map((item, index) => <div key={item.value} className={`h-full items-end justify-center px-1 ${index >= 4 && !expanded && !eveningExpanded ? "hidden sm:flex" : "flex"}`}>
              <div className="relative w-7 rounded-t-md bg-gradient-to-t from-sky-600 to-sky-400 transition-[height] duration-300 motion-reduce:transition-none sm:w-10"
                style={{ height: `${item.count / scale * 100}%` }} role="img" aria-label={`${contractor ?? "General"}, ${item.label}: ${format(item.count)} vehículos`}>
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold tabular-nums text-[#10223d]">{format(item.count)}</span>
              </div>
            </div>)}
          </div>
        </div>
        <div className={`ml-8 grid ${columns}`}>
          {values.map((item, index) => <div key={item.value} className={`px-1 pt-3 text-center ${index >= 4 && !expanded && !eveningExpanded ? "hidden sm:block" : ""}`}>
            <div className="flex flex-wrap items-center justify-center gap-1">
              <p className="text-[10px] font-semibold text-slate-600 sm:text-xs">{item.label}</p>
              {item.value === "16-24" && <button type="button" aria-expanded={false} onClick={() => setEveningExpanded(true)} className="rounded-md bg-sky-50 px-2 py-1.5 text-[10px] font-semibold text-sky-700 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-sky-600">Ver más →</button>}
            </div>
            {index === 3 && !expanded && !eveningExpanded && <button type="button" aria-expanded={false} onClick={() => setExpanded(true)} className="mt-2 rounded-md bg-sky-50 px-1 py-2 text-[10px] font-semibold text-sky-700 focus-visible:outline-2 focus-visible:outline-sky-600 sm:hidden">Ver más horarios →</button>}
          </div>)}
        </div>
        </div>
        </div>
        {eveningExpanded && <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Detalle desde las 4 p. m. Desliza la gráfica si no ves todas las horas.</p>
          <button type="button" aria-expanded={true} onClick={() => setEveningExpanded(false)} className="rounded-md bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-sky-600">Ver menos</button>
        </div>}
        {expanded && !eveningExpanded && <button type="button" aria-expanded={true} onClick={() => setExpanded(false)} className="mt-3 rounded-md bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 sm:hidden">Ver menos horarios</button>}
        <div className="mt-5 rounded-lg bg-slate-50 px-3 py-3 text-[11px] leading-relaxed text-slate-500">
          <p>Cada placa cuenta una vez por contratista y franja en las fechas seleccionadas. General suma los conteos de los contratistas. Una placa puede aparecer en varias franjas.</p>
          <details className="mt-2"><summary className="cursor-pointer font-medium text-slate-600">Acerca de los datos</summary>
            <p className="mt-2">Horas de Colombia. Se incluyen todos los motivos y las visitas sin clasificar. «4 p. m. en adelante» comprende hasta la medianoche; «Ver más» desglosa ese período en franjas de dos horas.</p>
            {historicalHours && <p className="mt-2">Los registros históricos usan la hora del primer reporte disponible como referencia; no es la hora exacta del evento.</p>}
            {unknownHours > 0 && <p className="mt-2">{format(unknownHours)} visitas sin hora no se asignan a una franja.</p>}
            {earlyHours > 0 && <p className="mt-2">{format(earlyHours)} visitas anteriores a las 6 a. m. quedan fuera de estas franjas.</p>}
            {missingPlates && <p className="mt-2">Las visitas sin placa se excluyen del conteo de vehículos.</p>}
          </details>
        </div>
      </>}
    </div>
  </section>;
}
