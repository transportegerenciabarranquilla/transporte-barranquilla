import { Clock3 } from "lucide-react";
import { formatClock } from "../lib/time";
import type { TdRow } from "../lib/types";

export function RouteTimeTable({ rows }: { rows: TdRow[] }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-5 py-4">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700"><Clock3 size={14} /> Duración de las rutas</p>
          <h2 className="mt-1 text-lg font-black text-[#2d1b4e]">Tiempo en ruta</h2>
        </div>
        <span className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-500 ring-1 ring-slate-200">{rows.length} {rows.length === 1 ? "ruta" : "rutas"}</span>
      </div>
      <div className="max-h-[480px] overflow-auto scrollbar-thin">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-white text-[10px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3">DT</th>
              <th className="px-4 py-3">Viaje</th>
              <th className="px-4 py-3">Placa</th>
              <th className="px-4 py-3">Transportista</th>
              <th className="px-4 py-3">Hora salida</th>
              <th className="px-4 py-3">Hora llegada</th>
              <th className="px-4 py-3 text-right">Tiempo en ruta</th>
              <th className="px-4 py-3 text-right">Tiempo planeado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr className="hover:bg-slate-50" key={row.id}>
                <td className="px-4 py-3 font-black text-[#2d1b4e]">{row.dt || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{row.trip || "—"}</td>
                <td className="px-4 py-3 font-semibold text-slate-700">{row.plate || "Sin placa"}</td>
                <td className="px-4 py-3 text-slate-600">{row.carrier || "—"}</td>
                <td className="px-4 py-3 tabular-nums text-slate-600">{row.departureSeconds === null ? "Pendiente" : formatClock(row.departureSeconds)}</td>
                <td className="px-4 py-3 tabular-nums text-slate-600">{row.routeArrival || "Pendiente"}</td>
                <td className="px-4 py-3 text-right font-black tabular-nums text-[#2d1b4e]">{row.routeTime || "Pendiente"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">{row.plannedTime || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="px-5 py-8 text-center text-sm text-slate-500">No hay rutas para los filtros seleccionados.</p> : null}
      </div>
    </section>
  );
}
