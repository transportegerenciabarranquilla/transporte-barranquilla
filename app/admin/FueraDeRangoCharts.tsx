"use client";

import { useEffect, useMemo, useState } from "react";
import { buildClientRangeSummary, type ClientRangeFilters } from "../lib/clientRangeSummary";
import type { PuntoCoronaRouteReport } from "../lib/puntoCoronaRoutesStorage";
import type { ModulacionRegistro } from "../lib/modulacionStorage";
import type { ImportedRangeVisit } from "../lib/clientRangeImport";
import ClientRangeUpload from "./ClientRangeUpload";
import { FOXTROT_RANGE_LIMIT_METERS } from "./rango/foxtrot";
import { contractorLabel } from "../lib/contractors";
import { ArrowUpRight, CalendarDays, CheckCircle2, MapPin, Search, Users, X, ClipboardList, Radar } from "lucide-react";

export default function FueraDeRangoCharts({ contractor, from, to, dt }: ClientRangeFilters) {
  const [data, setData] = useState<{ reports: PuntoCoronaRouteReport[]; modulations: ModulacionRegistro[] } | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(from);
  const [dateTo, setDateTo] = useState(to);
  const [imports, setImports] = useState<ImportedRangeVisit[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    async function read(url: string) {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo cargar la información de clientes.");
      return body;
    }
    Promise.allSettled([read("/api/admin/rango"), read("/api/modulaciones")])
      .then(([range, modulation]) => {
        if (controller.signal.aborted) return;
        setData({ reports: range.status === "fulfilled" ? range.value.reports || [] : [], modulations: modulation.status === "fulfilled" ? modulation.value.records || [] : [] });
        const missing = [range.status === "rejected" ? "rango" : "", modulation.status === "rejected" ? "modulaciones" : ""].filter(Boolean);
        if (missing.length) setError(`No se pudo cargar ${missing.join(" y ")}. Los resultados están incompletos; recarga para reintentar.`);
      });
    return () => controller.abort();
  }, []);
  const rows = useMemo(() => buildClientRangeSummary(data?.reports || [], data?.modulations || [], { contractor, from: dateFrom, to: dateTo, dt }, imports, FOXTROT_RANGE_LIMIT_METERS), [data, contractor, dateFrom, dateTo, dt, imports]);
  const visible = rows.filter(row => `${row.name} ${row.code}`.toLocaleLowerCase("es-CO").includes(search.trim().toLocaleLowerCase("es-CO")));
  const loading = !data && !error;
  const totals = visible.reduce((total, row) => ({ outside: total.outside + row.outside, inside: total.inside + row.inside, modulations: total.modulations + row.modulations }), { outside: 0, inside: 0, modulations: 0 });
  const filtered = Boolean(search || dateFrom || dateTo || dt || contractor !== "Todas");
  const metrics = [
    { label: "Clientes", value: visible.length, icon: Users, color: "text-sky-700", background: "bg-sky-50", border: "border-t-sky-500" },
    { label: "Visitas fuera de rango", value: totals.outside, icon: MapPin, color: "text-rose-700", background: "bg-rose-50", border: "border-t-rose-500" },
    { label: "Visitas dentro de rango", value: totals.inside, icon: CheckCircle2, color: "text-emerald-700", background: "bg-emerald-50", border: "border-t-emerald-500" },
    { label: "Seguimientos cargados", value: totals.modulations, icon: ClipboardList, color: "text-indigo-700", background: "bg-indigo-50", border: "border-t-indigo-500" },
  ];
  const inputClass = "mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";
  return <section className="space-y-5">
    <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#10223d] via-[#123a50] to-[#0f766e] px-6 py-7 text-white shadow-lg sm:px-8">
      <Radar aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-64 w-64 text-white/[0.06]" strokeWidth={1} />
      <div className="relative flex flex-wrap items-center justify-between gap-5">
        <div><p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-teal-200">Control de visitas · Clientes</p><h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Fuera de RangoCharts</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-200">Consulta el historial de tus clientes, identifica visitas fuera de rango y revisa sus seguimientos.</p></div>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold"><span className={`h-2 w-2 rounded-full ${loading ? "bg-amber-300" : error ? "bg-rose-300" : "bg-emerald-300"}`} />{loading ? "Cargando historial" : error ? "Información incompleta" : filtered ? "Vista filtrada" : "Historial completo"}</span>
      </div>
    </header>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(metric => <article key={metric.label} className={`rounded-2xl border border-slate-200 border-t-[3px] ${metric.border} bg-white p-4 shadow-sm sm:p-5`}>
      <div className="flex items-center justify-between gap-2"><span className={`grid h-10 w-10 place-items-center rounded-xl ${metric.background} ${metric.color}`}><metric.icon size={20} aria-hidden="true" /></span><ArrowUpRight size={16} aria-hidden="true" className="text-slate-300" /></div>
      <p className="mt-4 text-3xl font-bold tracking-tight tabular-nums text-[#10223d]">{loading || error ? "—" : metric.value.toLocaleString("es-CO")}</p><p className="mt-1 text-xs font-medium text-slate-500">{metric.label}</p>
    </article>)}</div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
        <label className="text-xs font-semibold text-slate-600"><span className="flex items-center gap-2"><Search size={15} />Buscar cliente</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Escribe un nombre o código para filtrar" className={inputClass} /></label>
        <label className="text-xs font-semibold text-slate-600"><span className="flex items-center gap-2"><CalendarDays size={15} />Desde</span><input type="date" value={dateFrom} max={dateTo || undefined} onChange={event => setDateFrom(event.target.value)} className={inputClass} /></label>
        <label className="text-xs font-semibold text-slate-600"><span className="flex items-center gap-2"><CalendarDays size={15} />Hasta</span><input type="date" value={dateTo} min={dateFrom || undefined} onChange={event => setDateTo(event.target.value)} className={inputClass} /></label>
        <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); setSearch(""); }} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"><X size={16} />Limpiar</button>
      </div>
    </div>
    <ClientRangeUpload onImport={visits => setImports(current => [...visits.map(visit => ({ ...visit, contractor: contractorLabel(visit.contractor) || visit.contractor })), ...current])} />
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5"><div><h3 className="text-lg font-bold text-[#10223d]">Información de clientes</h3><p className="mt-1 text-xs text-slate-500">{filtered ? "Resultados de los filtros seleccionados" : "Todos los clientes disponibles, sin necesidad de buscar"} · Mayor frecuencia fuera de rango primero</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{visible.length.toLocaleString("es-CO")} clientes</span></div>
      <div className="max-h-[700px] overflow-auto">
        <table className="w-full min-w-[1050px] text-left text-sm" aria-busy={loading}>
          <caption className="sr-only">Conteos de visitas y modulaciones por cliente</caption>
          <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-wider text-slate-600"><tr>{["Cliente / transportista", "Fuera de rango", "Dentro de rango", "Sin validar", "Veces que moduló", "Distancia máxima", "Exceso máximo"].map((label, index) => <th key={label} scope="col" className={`px-4 py-4 ${index ? "text-center" : ""}`}>{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{visible.map(row => <tr key={row.key} className="transition-colors even:bg-slate-50/50 hover:bg-teal-50/50">
            <td className="px-4 py-4"><div className="flex items-center gap-3"><span aria-hidden="true" className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xs font-bold ${row.outside ? "bg-rose-50 text-rose-700" : "bg-teal-50 text-teal-700"}`}>{row.name.slice(0, 2).toLocaleUpperCase("es-CO")}</span><div className="min-w-0"><span className="font-semibold text-[#10223d]">{row.name}</span><span className="mt-1 block text-[11px] text-slate-500">{row.code || "Sin código"} · {row.contractor}</span></div></div></td>
            <td className="px-4 py-4 text-center"><span className="inline-flex min-w-10 justify-center rounded-lg bg-rose-50 px-3 py-1.5 font-bold tabular-nums text-rose-700">{row.outside.toLocaleString("es-CO")}</span></td>
            <td className="px-4 py-4 text-center"><span className="inline-flex min-w-10 justify-center rounded-lg bg-emerald-50 px-3 py-1.5 font-bold tabular-nums text-emerald-700">{row.inside.toLocaleString("es-CO")}</span></td>
            <td className="px-4 py-4 text-center tabular-nums text-amber-700">{row.unknown.toLocaleString("es-CO")}</td>
            <td className="px-4 py-4 text-center"><span className="inline-flex min-w-10 justify-center rounded-lg bg-indigo-50 px-3 py-1.5 font-bold tabular-nums text-indigo-700">{row.modulations.toLocaleString("es-CO")}</span></td>
            <td className="px-4 py-4 text-center tabular-nums text-slate-600">{row.maxDistance === null ? <span className="text-xs text-slate-400">Sin coordenadas</span> : `${row.maxDistance.toLocaleString("es-CO", { maximumFractionDigits: 1 })} m`}</td>
            <td className="px-4 py-4 text-center font-bold tabular-nums text-rose-700">{row.maxExcess === null ? <span className="font-normal text-slate-400">—</span> : `${row.maxExcess.toLocaleString("es-CO", { maximumFractionDigits: 1 })} m`}</td>
          </tr>)}{!visible.length && <tr><td colSpan={7} className="px-5 py-16 text-center"><Users size={30} aria-hidden="true" className="mx-auto mb-3 text-slate-300" /><p role="status" className="font-semibold text-slate-600">{loading ? "Cargando todos los clientes..." : error ? "No se pudo completar la consulta" : filtered ? "No hay coincidencias para estos filtros" : "No hay registros de clientes disponibles"}</p><p className="mt-2 text-xs text-slate-400">{loading ? "La información aparecerá automáticamente." : filtered ? "Limpia la búsqueda o amplía el rango de fechas." : "Los datos se consultan automáticamente al abrir el módulo."}</p></td></tr>}</tbody>
        </table>
      </div>
      <footer className="border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] leading-5 text-slate-500">Modulaciones = seguimientos cargados. BEES conserva el estado del reporte; las coordenadas del Excel se evalúan con un límite de 50 m. Distancia y exceso muestran el máximo por cliente.</footer>
    </div>
  </section>;
}
