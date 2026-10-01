"use client";

import { countRangeVehiclesByWeekday, type RangeVehicleRow } from "../../lib/rangeVehicleCount";

const format = (value: number) => value.toLocaleString("es-CO", { maximumFractionDigits: 0 });
const DAY_COLORS = [
  "from-violet-600 to-violet-400",
  "from-teal-600 to-teal-400",
  "from-amber-600 to-amber-400",
  "from-pink-600 to-pink-400",
  "from-indigo-600 to-indigo-400",
  "from-orange-600 to-orange-400",
  "from-emerald-600 to-emerald-400",
];

export default function RangeWeekdayChart({ rows, contractor, contractors, onContractorChange }: {
  rows: RangeVehicleRow[];
  contractor: string | null;
  contractors: string[];
  onContractorChange: (contractor: string | null) => void;
}) {
  const values = countRangeVehiclesByWeekday(rows, contractor);
  const hasData = values.some(day => day.days > 0);
  const tick = Math.max(1, Math.ceil(Math.max(...values.map(day => day.total)) / 4));
  const scale = tick * 4;

  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="range-weekday-title">
    <header className="border-b border-slate-200 bg-violet-50/50 px-4 py-4 sm:px-5">
      <p className="text-[10px] font-bold uppercase tracking-[.16em] text-violet-700">Totales por día de la semana</p>
      <h3 id="range-weekday-title" className="mt-1 text-lg font-semibold text-[#10223d]">Vehículos fuera de rango por día de la semana</h3>
      <p className="mt-1 text-xs text-slate-500">Selecciona un contratista para comparar sus totales de lunes a domingo. La selección se aplica también a la gráfica por horario.</p>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Contratista de la gráfica de totales semanales">
        {[null, ...contractors].map(item => <button key={item ?? "general"} type="button" aria-pressed={contractor === item} onClick={() => onContractorChange(item)}
          className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 ${contractor === item ? "border-violet-600 bg-violet-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50"}`}>
          {item ?? "General"}
        </button>)}
      </div>
    </header>
    <div className="p-4 sm:p-5">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-2 font-semibold text-slate-700"><i className="h-2.5 w-2.5 rounded-full bg-violet-600" />{contractor ?? "Todos los contratistas"}</span>
        <span className="text-slate-500">Total de vehículos fuera de rango</span>
      </div>
      {!hasData ? <p className="rounded-lg bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">No hay datos para los filtros seleccionados.</p> : <>
        <div className="overflow-x-auto pb-2" tabIndex={0} role="region" aria-label="Totales de lunes a domingo; desplaza horizontalmente para ver todos los días">
          <div className="min-w-[560px] pt-6">
            <div className="relative ml-10 h-48 border-b border-slate-300 sm:h-56">
              {[0, 1, 2, 3, 4].map(value => <div key={value} className="pointer-events-none absolute inset-x-0 border-t border-slate-100" style={{ bottom: `${value * 25}%` }} aria-hidden="true">
                <span className="absolute right-full -translate-y-1/2 pr-2 text-[10px] tabular-nums text-slate-500">{format(value * tick)}</span>
              </div>)}
              <div className="absolute inset-0 grid grid-cols-7 items-end">
                {values.map((day, index) => <div key={day.label} className="flex h-full items-end justify-center px-1">
                  <div className={`relative w-7 rounded-t-md bg-gradient-to-t ${DAY_COLORS[index]} transition-[height] duration-300 motion-reduce:transition-none sm:w-10`}
                    style={{ height: `${day.total / scale * 100}%` }} role="img"
                    aria-label={day.days ? `${day.label}: ${format(day.total)} vehículos fuera de rango, ${day.days} fechas con datos` : `${day.label}: sin datos`}>
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold tabular-nums text-[#10223d]">{day.days ? format(day.total) : "—"}</span>
                  </div>
                </div>)}
              </div>
            </div>
            <div className="ml-10 grid grid-cols-7">
              {values.map(day => <div key={day.label} className="px-1 pt-3 text-center">
                <p className="text-xs font-semibold text-slate-600">{day.label}</p>
                <p className="mt-1 text-[10px] text-slate-500">{day.days ? `${day.days} ${day.days === 1 ? "fecha" : "fechas"}` : "Sin datos"}</p>
              </div>)}
            </div>
          </div>
        </div>
        <p className="mt-5 rounded-lg bg-slate-50 px-3 py-3 text-[11px] leading-relaxed text-slate-500">
          Cada placa cuenta una vez por contratista y fecha operativa, sin importar la hora. Cada barra suma los conteos diarios de todas las fechas seleccionadas que corresponden a ese día de la semana. Si una placa aparece en fechas distintas, cuenta una vez en cada fecha. Las fechas sin datos y las visitas sin placa se excluyen. General suma los conteos diarios de los contratistas.
        </p>
      </>}
    </div>
  </section>;
}
