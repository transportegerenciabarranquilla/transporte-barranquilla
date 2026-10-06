"use client";

import { Clock, MapPinned, Route, Target } from "lucide-react";
import { ROUTE_PERFORMANCE_CONTRACTORS, routePerformanceContractor } from "../../lib/routePerformanceContractors";
import type { MatchedRoutePerformance } from "../../lib/routePerformanceImport";
import { averagePerformance, deliveryPerformance, totalPerformanceMinutes, formatPerformanceDuration } from "../../lib/routePerformanceMetrics";
import RoutePerformanceTrend from "./RoutePerformanceTrend";

const format = (value: number) => value.toLocaleString("es-CO", { maximumFractionDigits: 2 });
const compact = (value: number) => new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const circle = (radius: number) => 2 * Math.PI * radius;

function totals(rows: MatchedRoutePerformance[]) {
  return rows.reduce((sum, row) => ({
    planned: sum.planned + row.plannedKm,
    executed: sum.executed + row.executedKm,
    difference: sum.difference + Math.abs(row.differenceKm),
  }), { planned: 0, executed: 0, difference: 0 });
}

function KilometerRing({ rows, small = false, dark = false }: { rows: MatchedRoutePerformance[]; small?: boolean; dark?: boolean }) {
  const { planned, executed, difference } = totals(rows);
  const maximum = Math.max(1, planned, executed);
  return <svg aria-label={`Plan ${format(planned)} kilómetros, ejecutado ${format(executed)} kilómetros, diferencia acumulada ${format(difference)} kilómetros.`} className={`${small ? "h-28 w-28" : "h-44 w-44"} shrink-0`} role="img" viewBox="0 0 100 100">
    {[38, 28].map((radius) => <circle cx="50" cy="50" fill="none" key={radius} r={radius} stroke={dark ? "#35516d" : "#e2e8f0"} strokeWidth="7" />)}
    {planned > 0 && <circle cx="50" cy="50" fill="none" r="38" stroke={dark ? "#72a8ff" : "#2563eb"} strokeDasharray={`${circle(38) * planned / maximum} ${circle(38)}`} strokeLinecap="round" strokeWidth="7" transform="rotate(-90 50 50)" />}
    {executed > 0 && <circle cx="50" cy="50" fill="none" r="28" stroke={dark ? "#43d5e8" : "#06b6d4"} strokeDasharray={`${circle(28) * executed / maximum} ${circle(28)}`} strokeLinecap="round" strokeWidth="7" transform="rotate(-90 50 50)" />}
    <text dominantBaseline="middle" fill={dark ? "#fff" : "#10223d"} fontSize={small ? "12" : "14"} fontWeight="800" textAnchor="middle" x="50" y="47">{rows.length ? compact(difference) : "—"}</text>
    <text dominantBaseline="middle" fill={dark ? "#adc3d6" : "#64748b"} fontSize="7" fontWeight="600" textAnchor="middle" x="50" y="59">km dif.</text>
  </svg>;
}

function PercentageRing({ value, label, small = false, tone = "range" }: { value: number | null; label: string; small?: boolean; tone?: "range" | "adherence" }) {
  const color = tone === "range" ? "#059669" : "#7c3aed";
  const base = tone === "range" && value !== null ? "#fbbf24" : "#e2e8f0";
  const percentage = value === null ? 0 : Math.max(0, Math.min(100, value));
  return <svg aria-label={value === null ? `${label}: sin datos` : `${label}: ${format(value)} por ciento`} className={`${small ? "h-24 w-24" : "h-32 w-32"} shrink-0`} role="img" viewBox="0 0 100 100">
    <circle cx="50" cy="50" fill="none" r="37" stroke={base} strokeWidth="10" />
    {percentage > 0 && <circle cx="50" cy="50" fill="none" r="37" stroke={color} strokeDasharray={`${circle(37) * percentage / 100} ${circle(37)}`} strokeLinecap="round" strokeWidth="10" transform="rotate(-90 50 50)" />}
    <text dominantBaseline="middle" fill={value === null ? "#64748b" : tone === "range" ? "#065f46" : "#5b21b6"} fontSize={small ? "14" : "17"} fontWeight="800" textAnchor="middle" x="50" y="51">{value === null ? "—" : `${format(value)}%`}</text>
  </svg>;
}

type SurtiRangeSummary = { started: number; inRange: number; days: number; value: number } | null;
type SurtiAdherenceSummary = { date: string; count: number; value: number } | null;

function ContractorCard({ name, rows, position, surtiRange, surtiAdherence }: { name: string; rows: MatchedRoutePerformance[]; position: number; surtiRange: SurtiRangeSummary; surtiAdherence: SurtiAdherenceSummary }) {
  const adherence = averagePerformance(rows, "adherenceKmPercent");
  const adherenceHistory = name === "Surti Cervezas" && adherence.value === null ? surtiAdherence : null;
  const range = deliveryPerformance(rows);
  const rangeReport = name === "Surti Cervezas" && (rows.length === 0 || range.value === null) ? surtiRange : null;
  const initials = name.split(" ").map((word) => word[0]).join("").slice(0, 2);
  return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-[11px] font-black tracking-wide text-white">{initials}</span><div className="min-w-0"><h4 className="truncate text-sm font-bold text-slate-900">{name}</h4><p className="text-[11px] text-slate-500">{rows.length.toLocaleString("es-CO")} viajes identificados en Excel{rangeReport ? ` · ${format(rangeReport.started)} visitas en Rango` : ""}</p></div></div>
      <span className="text-xs font-bold tabular-nums text-slate-400">0{position}</span>
    </div>
    <div className="grid divide-y divide-slate-100 p-4 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
      <div className="flex flex-col items-center gap-1 pb-4 sm:pb-0 sm:pr-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700">Adherencia km</p>
        <PercentageRing value={adherenceHistory?.value ?? adherence.value} label={`Adherencia a kilómetros de ${name}${adherenceHistory ? `, último dato del ${adherenceHistory.date.split("-").reverse().join("/")}` : ""}`} tone="adherence" small />
        <p className="text-center text-[11px] text-slate-600">{adherenceHistory ? `${adherenceHistory.count} viaje${adherenceHistory.count === 1 ? "" : "s"} con ADH_KM · último dato ${adherenceHistory.date.split("-").reverse().join("/")} (fuera del período)` : `${adherence.count.toLocaleString("es-CO")} viajes con ADH_KM`}</p>
      </div>
      <div className="flex flex-col items-center gap-1 pt-4 sm:pt-0 sm:pl-2">
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">{rangeReport ? "Entrega en rango · reporte de Rango" : "Rango MyGeotab"}</p>
        <PercentageRing value={rangeReport?.value ?? range.value} label={`Entrega en rango de ${name}${rangeReport ? " según el reporte de Rango" : " MyGeotab"}`} small />
        <p className="text-center text-[11px] text-slate-600">{rangeReport ? `${format(rangeReport.inRange)} / ${format(rangeReport.started)} visitas en rango · ${rangeReport.days} día${rangeReport.days === 1 ? "" : "s"}` : range.missing ? `Faltan clientes en ${range.missing} viajes` : `${format(range.visited)} / ${format(range.planned)} clientes`}</p>
      </div>
    </div>
  </article>;
}

export default function RoutePerformanceCharts({ rows, contractorOnly = "", surtiRange = null, surtiAdherence = null }: { rows: MatchedRoutePerformance[]; contractorOnly?: string; surtiRange?: SurtiRangeSummary; surtiAdherence?: SurtiAdherenceSummary }) {
  const summary = totals(rows);
  const hours = averagePerformance(rows, "adherenceHoursPercent");
  const plannedHours = formatPerformanceDuration(totalPerformanceMinutes(rows, "plannedMinutes"));
  const executedHours = formatPerformanceDuration(totalPerformanceMinutes(rows, "executedMinutes"));
  const range = deliveryPerformance(rows);
  const adherence = averagePerformance(rows, "adherenceKmPercent");
  const byContractor = (contractorOnly ? [contractorOnly] : ROUTE_PERFORMANCE_CONTRACTORS).map((name) => ({ name, rows: rows.filter((row) => routePerformanceContractor(row.contractor) === name) }));
  const identifiedTrips = byContractor.reduce((count, group) => count + group.rows.length, 0);
  return <div className="space-y-5">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <section aria-label="Diferencia de kilómetros general" className="relative overflow-hidden rounded-2xl bg-[#10283f] p-5 text-white shadow-lg shadow-slate-300/40 sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-6 -top-16 h-48 w-48 rounded-full border border-white/10" />
        <div className="relative flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Visión general</p><h3 className="mt-1 text-lg font-bold">Diferencia de kilómetros</h3><p className="mt-1 text-xs text-slate-300">{rows.length.toLocaleString("es-CO")} viajes · Todos los filtros y páginas</p></div><Route aria-hidden="true" className="text-cyan-300" size={22} /></div>
        <div className="relative flex flex-col items-center justify-center gap-5 py-4 sm:flex-row sm:gap-8"><KilometerRing rows={rows} dark /><div className="w-full max-w-[260px] space-y-3 text-xs tabular-nums"><div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2"><span className="flex items-center gap-2 text-slate-300"><i className="h-2.5 w-2.5 rounded-full bg-[#72a8ff]" />Plan</span><strong>{format(summary.planned)} km</strong></div><div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2"><span className="flex items-center gap-2 text-slate-300"><i className="h-2.5 w-2.5 rounded-full bg-[#43d5e8]" />Ejecutado</span><strong>{format(summary.executed)} km</strong></div><div className="flex items-center justify-between gap-3"><span className="text-cyan-200">Diferencia acumulada</span><strong className="text-sm text-cyan-200">{format(summary.difference)} km</strong></div></div></div>
        <p className="relative border-t border-white/10 pt-3 text-[11px] text-slate-300">Suma de la diferencia reportada en cada viaje del Excel.</p>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <section aria-label="Entrega en rango MyGeotab general" className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-[#f3fbf7] p-4 shadow-sm sm:p-5"><div className="min-w-0"><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><MapPinned size={19} /></div><h3 className="text-sm font-bold text-slate-900">Entrega en rango MyGeotab</h3><p className="mt-1 text-xs text-slate-600">Clientes visitados / clientes planeados x 100</p><p className="mt-2 text-xs text-slate-600">{range.missing ? `Faltan CLIPLAN / CLIVISITADOS en ${range.missing} viajes. Carga el Excel original para calcular el total.` : `Clientes planeados: ${format(range.planned)} - Visitados: ${format(range.visited)}`}</p><p className="mt-3 text-xs font-semibold text-emerald-700">En rango {range.value === null ? "Sin dato" : `${format(range.value)} %`} <span className="font-normal text-slate-500">· Fuera {range.value === null ? "Sin dato" : `${format(100 - range.value)} %`}</span></p></div><PercentageRing value={range.value} label="Entrega en rango MyGeotab general" /></section>
        <section aria-label="Adherencia a kilómetros general" className="flex items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-[#f8f5ff] p-4 shadow-sm sm:p-5"><div className="min-w-0"><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><Target size={19} /></div><h3 className="text-sm font-bold text-slate-900">Adherencia a kilómetros</h3><p className="mt-1 text-xs text-slate-600">Promedio de {adherence.count.toLocaleString("es-CO")} viajes</p><p className="mt-3 text-xs font-semibold text-violet-700">Promedio de ADH_KM del Excel</p></div><PercentageRing value={adherence.value} label="Adherencia a kilómetros general" tone="adherence" /></section>
      </div>
    </div>
    <section aria-label="Adherencia a horas general" className="flex items-center justify-between gap-3 rounded-2xl border border-sky-100 bg-sky-50 p-4 shadow-sm sm:p-5">
      <div><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><Clock size={19} /></div>
        <h3 className="text-sm font-bold text-slate-900">Adherencia a horas</h3>
        <p className="mt-1 text-xs text-slate-600">Promedio de ADH_HRS · {hours.count} viajes con dato</p>
        <p className="mt-3 text-xs font-semibold text-sky-700">Horas plan: {plannedHours || "Sin dato"} · Ejecutadas: {executedHours || "Sin dato"}</p>
      </div>
      <PercentageRing value={hours.value} label="Adherencia a horas general" tone="adherence" />
    </section>
    <RoutePerformanceTrend rows={rows} />
    <section aria-label="Indicadores por contratista" className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-700">Comparativo</p><h3 className="mt-1 text-base font-bold text-slate-900">Por contratista</h3><p className="mt-1 text-xs text-slate-500">Adherencia y MyGeotab del Excel. Si faltan viajes de Surti, su entrega en rango se toma del reporte de Rango para las fechas seleccionadas.</p></div><span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">{identifiedTrips.toLocaleString("es-CO")} viajes identificados</span></div>
      {rows.length > 0 && identifiedTrips === 0 && <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">No se identificaron viajes de Surti Cervezas, Logisticos ni HL Logisticos. El Excel puede incluir una columna CONTRATISTA o TRANSPORTISTA para mostrar este desglose.</p>}
      <div className="mt-4 grid gap-3 xl:grid-cols-3">{byContractor.map(({ name, rows: contractorRows }, index) => <ContractorCard key={name} name={name} rows={contractorRows} position={index + 1} surtiRange={surtiRange} surtiAdherence={surtiAdherence} />)}</div>
    </section>
  </div>;
}
