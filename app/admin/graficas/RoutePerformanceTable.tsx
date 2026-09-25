import type { MatchedRoutePerformance } from "../../lib/routePerformanceImport";

const formatNumber = (value: number) => value.toLocaleString("es-CO", { maximumFractionDigits: 2 });
const formatPercent = (value: number | null) => value === null ? "Sin dato" : `${formatNumber(value)} %`;
const formatDate = (value: string) => value.split("-").reverse().join("/");

function MatchBadge({ row, pending, error }: { row: MatchedRoutePerformance; pending: boolean; error: boolean }) {
  const state = pending ? "Cargando" : error ? "No disponible" : row.match === "matched" ? "Coincide" : row.match === "ambiguous" ? "Varias coincidencias" : "Sin coincidencia";
  const tone = pending || error ? "bg-slate-100 text-slate-600" : row.match === "matched" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : row.match === "ambiguous" ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-rose-50 text-rose-700 ring-rose-200";
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ring-inset ${tone}`}><span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${pending || error ? "bg-slate-400" : row.match === "matched" ? "bg-emerald-500" : row.match === "ambiguous" ? "bg-amber-500" : "bg-rose-500"}`} />{state}</span>;
}

function RangeValues({ row }: { row: MatchedRoutePerformance }) {
  return <div className="space-y-1 tabular-nums">
    <p className="text-xs font-bold text-emerald-700">{formatPercent(row.rangePercent)} en rango</p>
    <p className="text-[10px] font-semibold text-amber-700">{formatPercent(row.outsidePercent)} fuera</p>
  </div>;
}

function Crew({ row }: { row: MatchedRoutePerformance }) {
  return <div className="min-w-0 space-y-0.5">
    <p className="truncate text-xs font-bold text-slate-800" title={row.rr || "RR sin identificar"}>RR: {row.rr || "Sin identificar"}</p>
    <p className="truncate text-[11px] text-slate-600" title={row.driver || "Conductor sin identificar"}>Conductor: {row.driver || "Sin identificar"}</p>
    {row.contractor && <p className="truncate text-[10px] font-medium text-slate-400" title={row.contractor}>{row.contractor}</p>}
  </div>;
}

function Route({ row }: { row: MatchedRoutePerformance }) {
  return <div className="min-w-0 space-y-0.5">
    <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-[#10223d] px-2 py-1 font-mono text-[11px] font-bold text-white">{row.plate || row.originalPlate}</span><span className="text-[11px] font-semibold tabular-nums text-slate-700">{formatDate(row.date)}</span></div>
    <p className="text-[10px] text-slate-500">Viaje {row.trip || "—"}{row.dt ? ` · DT ${row.dt}` : ""}</p>
    {row.matchedPlate && row.matchedPlate !== row.plate && <p className="truncate text-[10px] text-slate-500" title={row.matchedPlate}>Seguimiento: {row.matchedPlate}</p>}
    {row.originalPlate && <p className="truncate text-[10px] text-slate-400" title={row.originalPlate}>Placa original: {row.originalPlate}</p>}
  </div>;
}

function Kilometers({ row }: { row: MatchedRoutePerformance }) {
  return <div className="min-w-[110px] tabular-nums">
    <div className="flex justify-between gap-2 text-[11px] text-slate-500"><span>Plan</span><span>{formatNumber(row.plannedKm)} km</span></div>
    <div className="flex justify-between gap-2 text-[11px] text-slate-500"><span>Ejecutado</span><span>{formatNumber(row.executedKm)} km</span></div>
    <div className="mt-1 flex justify-between gap-2 border-t border-slate-200 pt-1 text-xs font-bold text-[#10223d]"><span>Diferencia</span><span>{formatNumber(row.differenceKm)} km</span></div>
  </div>;
}

export default function RoutePerformanceTable({ rows, pending, error }: { rows: MatchedRoutePerformance[]; pending: boolean; error: boolean }) {
  return <section aria-label="Detalle de viajes" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3"><div><h3 className="text-sm font-bold text-[#10223d]">Detalle de viajes</h3><p className="mt-0.5 text-[11px] text-slate-500">Kilómetros y rango del Excel · RR y conductor de Seguimiento</p></div><span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold tabular-nums text-slate-600 ring-1 ring-slate-200">{rows.length} en esta página</span></div>
    <div className="space-y-3 p-3 md:hidden">
      {rows.map((row) => <article className="overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm" key={row.fila}>
        <div className="flex flex-wrap items-start justify-between gap-2"><Route row={row} /><MatchBadge row={row} pending={pending} error={error} /></div>
        <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2"><Crew row={row} /><Kilometers row={row} /></div>
        <div className="mt-3 border-t border-slate-100 pt-3"><RangeValues row={row} /></div>
      </article>)}
    </div>
    <div className="hidden max-h-[620px] overflow-auto md:block">
      <table className="w-full min-w-[980px] table-fixed text-left">
        <caption className="sr-only">Viajes del Excel cruzados con Seguimiento por placa y fecha</caption>
        <colgroup><col className="w-[22%]" /><col className="w-[24%]" /><col className="w-[18%]" /><col className="w-[19%]" /><col className="w-[17%]" /></colgroup>
        <thead className="sticky top-0 z-10 bg-[#10223d] text-[10px] font-bold uppercase tracking-[0.08em] text-white shadow-sm"><tr><th className="px-4 py-3" scope="col">Ruta</th><th className="px-4 py-3" scope="col">Tripulación</th><th className="px-4 py-3" scope="col">Kilómetros</th><th className="px-4 py-3" scope="col">Entrega en rango</th><th className="px-4 py-3" scope="col">Cruce</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((row) => <tr className="align-middle odd:bg-white even:bg-slate-50/70 hover:bg-cyan-50/60" key={row.fila}><td className="px-4 py-3"><Route row={row} /></td><td className="px-4 py-3"><Crew row={row} /></td><td className="px-4 py-3"><Kilometers row={row} /></td><td className="px-4 py-3"><RangeValues row={row} /></td><td className="px-4 py-3"><MatchBadge row={row} pending={pending} error={error} /></td></tr>)}</tbody>
      </table>
    </div>
    {!rows.length && <p className="px-4 py-10 text-center text-sm text-slate-500">No hay viajes para estos filtros.</p>}
  </section>;
}
