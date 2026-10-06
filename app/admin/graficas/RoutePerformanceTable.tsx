import { buildDriverOffenders } from "../../lib/routePerformanceOffenders";
import type { MatchedRoutePerformance } from "../../lib/routePerformanceImport";

const format = (value: number) => value.toLocaleString("es-CO", { maximumFractionDigits: 2 });

export default function RoutePerformanceTable({ rows, pending, error }: { rows: MatchedRoutePerformance[]; pending: boolean; error: boolean }) {
  const offenders = buildDriverOffenders(rows);
  return <section aria-label="Top offenders de conductores" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-4 sm:px-5">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">Tripulaciones</p><h3 className="mt-1 text-base font-bold text-[#10223d]">Top offenders · Conductores y RR</h3><p className="mt-1 text-xs text-slate-500">Menor promedio de ADH_KM primero. Se agrupan los viajes del mismo conductor, RR y contratista.</p></div>
      <span className="rounded-full border border-violet-100 bg-white px-3 py-1.5 text-[11px] font-bold tabular-nums text-violet-700">{offenders.length} de máximo 10</span>
    </div>
    {pending && <p className="border-b border-amber-100 bg-amber-50 px-5 py-2 text-xs text-amber-800">Cargando Seguimiento: faltan nombres de conductor y RR por cruzar.</p>}
    {error && <p className="border-b border-amber-100 bg-amber-50 px-5 py-2 text-xs text-amber-800">No se pudo cargar Seguimiento. Se usan los nombres disponibles en el Excel.</p>}
    <div className="grid gap-2 p-3 md:hidden">
      {offenders.map((item, index) => <article className="rounded-xl border border-slate-200 bg-white p-3" key={`${item.contractor}:${item.rr}:${item.driver}`}>
        <div className="flex items-start gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#10283f] text-xs font-bold text-white">{index + 1}</span><div className="min-w-0"><p className="font-bold text-slate-900">{item.driver}</p><p className="text-xs text-slate-600">RR: {item.rr || "Sin registrar"}</p><p className="text-[11px] text-slate-500">{item.contractor || "Sin contratista"} · {item.trips} viajes</p></div></div>
        <p className="mt-2 text-xs font-semibold text-slate-700">Placas: {item.plates.join(", ") || "Sin registrar"}</p>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs"><span className="font-bold text-violet-700">Adherencia {format(item.adherenceKmPercent)} %</span><span className="font-bold text-emerald-700">En rango {item.rangePercent === null ? "Sin datos" : `${format(item.rangePercent)} %`}</span><span className="text-slate-500">{format(item.differenceKm)} km de diferencia</span></div>
      </article>)}
    </div>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[860px] text-left">
        <caption className="sr-only">Diez conductores con menor promedio de adherencia a kilómetros y su responsable de ruta</caption>
        <thead className="bg-[#10223d] text-[10px] font-bold uppercase tracking-[0.08em] text-white"><tr><th className="w-14 px-4 py-3" scope="col">#</th><th className="px-4 py-3" scope="col">Conductor</th><th className="px-4 py-3" scope="col">Placas</th><th className="px-4 py-3" scope="col">RR</th><th className="px-4 py-3" scope="col">Contratista</th><th className="px-4 py-3 text-right" scope="col">Viajes</th><th className="min-w-36 px-4 py-3" scope="col">ADH_KM promedio</th><th className="min-w-32 px-4 py-3" scope="col">% entrega en rango</th><th className="px-4 py-3 text-right" scope="col">Diferencia acumulada</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{offenders.map((item, index) => <tr className="text-xs text-slate-700 odd:bg-white even:bg-slate-50/70" key={`${item.contractor}:${item.rr}:${item.driver}`}>
          <td className="px-4 py-3 font-black tabular-nums text-violet-700">{String(index + 1).padStart(2, "0")}</td>
          <td className="px-4 py-3 font-bold text-slate-900">{item.driver}</td>
          <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{item.plates.length ? item.plates.map(plate => <span key={plate} className="whitespace-nowrap rounded border border-slate-200 bg-slate-50 px-2 py-1 font-semibold">{plate}</span>) : "Sin registrar"}</div></td>
          <td className="px-4 py-3">{item.rr || "Sin registrar"}</td>
          <td className="px-4 py-3">{item.contractor || "Sin identificar"}</td>
          <td className="px-4 py-3 text-right font-semibold tabular-nums">{item.trips}</td>
          <td className="px-4 py-3"><span className="font-bold tabular-nums text-violet-700">{format(item.adherenceKmPercent)} %</span><span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-violet-100"><span className="block h-full rounded-full bg-violet-500" style={{ width: `${Math.max(0, Math.min(100, item.adherenceKmPercent))}%` }} /></span></td>
          <td className="px-4 py-3">{item.rangePercent === null ? <span className="text-slate-400">Sin datos</span> : <><span className="font-bold tabular-nums text-emerald-700">{format(item.rangePercent)} %</span><span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-emerald-100"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, item.rangePercent))}%` }} /></span></>}</td>
          <td className="px-4 py-3 text-right font-semibold tabular-nums">{format(item.differenceKm)} km</td>
        </tr>)}</tbody>
      </table>
    </div>
    {!offenders.length && <p className="px-5 py-8 text-center text-sm text-slate-500">No hay conductores identificados con ADH_KM en los filtros actuales.</p>}
  </section>;
}
