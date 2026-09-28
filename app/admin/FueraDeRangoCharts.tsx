"use client";

import { useEffect, useId, useMemo, useState } from "react";
import ClientRangeHistory from "./ClientRangeHistory";
import ClientRangeComparison from "./ClientRangeComparison";
import { buildClientRangeSummary, type ClientRangeFilters } from "../lib/clientRangeSummary";
import type { PuntoCoronaRouteReport } from "../lib/puntoCoronaRoutesStorage";
import type { ModulacionRegistro } from "../lib/modulacionStorage";
import { CalendarDays, CheckCircle2, MapPin, Search, Users, X, ClipboardList, Radar, Activity, Percent, SlidersHorizontal, ArrowDownWideNarrow, Info, RefreshCw } from "lucide-react";

export default function FueraDeRangoCharts({ contractor, from, to, dt }: ClientRangeFilters) {
  const [data, setData] = useState<{ reports: PuntoCoronaRouteReport[]; modulations: ModulacionRegistro[] } | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("outside");
  const [page, setPage] = useState(1);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const historyId = useId();
  const [dateFrom, setDateFrom] = useState(from);
  const [dateTo, setDateTo] = useState(to);
  const [pendingSources, setPendingSources] = useState(2);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    const controllers = [new AbortController(), new AbortController()];
    setPendingSources(2);
    setError("");
    async function read(url: string, source: "reports" | "modulations", controller: AbortController) {
      const label = source === "reports" ? "rango" : "modulaciones";
      const timeout = window.setTimeout(() => controller.abort(), 60_000);
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "No se pudo cargar la información de clientes.");
        const records = source === "reports" ? body.reports : body.records;
        if (!Array.isArray(records)) throw new Error("La respuesta no contiene una lista válida.");
        if (!disposed) setData(current => ({ reports: [], modulations: [], ...current, [source]: records }));
      } catch (caught) {
        if (disposed) return;
        const message = controller.signal.aborted ? "La consulta tardó demasiado." : caught instanceof Error ? caught.message : "Error de conexión.";
        setError(current => `${current ? `${current} ` : ""}No se pudo cargar ${label}: ${message}`);
      } finally {
        window.clearTimeout(timeout);
        if (!disposed) setPendingSources(current => current - 1);
      }
    }
    void read("/api/admin/rango", "reports", controllers[0]);
    void read("/api/modulaciones", "modulations", controllers[1]);
    return () => { disposed = true; controllers.forEach(controller => controller.abort()); };
  }, [attempt]);
  const rows = useMemo(() => buildClientRangeSummary(data?.reports || [], data?.modulations || [], { contractor, from: dateFrom, to: dateTo, dt }), [data, contractor, dateFrom, dateTo, dt]);
  const visible = rows.filter(row => `${row.name} ${row.code}`.toLocaleLowerCase("es-CO").includes(search.trim().toLocaleLowerCase("es-CO"))).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "es-CO");
    if (sort === "attentions") return b.attentions - a.attentions || a.name.localeCompare(b.name, "es-CO");
    if (sort === "refusal") return (b.refusal ?? -1) - (a.refusal ?? -1) || a.name.localeCompare(b.name, "es-CO");
    if (sort === "outsidePercent") return (b.outsidePercent ?? -1) - (a.outsidePercent ?? -1) || b.outside - a.outside;
    return b.outside - a.outside || b.modulations - a.modulations || a.name.localeCompare(b.name, "es-CO");
  });
  const selectedClient = visible.find(row => row.key === expandedClient);
  const loading = pendingSources > 0;
  const pageCount = Math.max(1, Math.ceil(visible.length / 50));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visible.slice((currentPage - 1) * 50, currentPage * 50);
  const totals = visible.reduce((total, row) => ({ attentions: total.attentions + row.attentions, outside: total.outside + row.outside, inside: total.inside + row.inside, modulations: total.modulations + row.modulations, refused: total.refused + row.refusedVolume, delivered: total.delivered + row.deliveredVolume }), { attentions: 0, outside: 0, inside: 0, modulations: 0, refused: 0, delivered: 0 });
  const refusal = totals.refused + totals.delivered > 0 ? totals.refused / (totals.refused + totals.delivered) * 100 : null;
  const validated = totals.inside + totals.outside;
  const insidePercent = validated ? totals.inside / validated * 100 : null;
  const filtered = Boolean(search || dateFrom || dateTo || dt || contractor !== "Todas");
  const metrics = [
    { label: "Clientes", value: visible.length.toLocaleString("es-CO"), detail: "En esta consulta", icon: Users, color: "text-sky-700", background: "bg-sky-50" },
    { label: "Atenciones", value: totals.attentions.toLocaleString("es-CO"), detail: "Visitas iniciadas", icon: Activity, color: "text-slate-700", background: "bg-slate-100" },
    { label: "Fuera de rango", value: totals.outside.toLocaleString("es-CO"), detail: "Visitas registradas", icon: MapPin, color: "text-rose-700", background: "bg-rose-50" },
    { label: "Dentro de rango", value: totals.inside.toLocaleString("es-CO"), detail: "Visitas registradas", icon: CheckCircle2, color: "text-emerald-700", background: "bg-emerald-50" },
    { label: "Modulaciones", value: totals.modulations.toLocaleString("es-CO"), detail: "Seguimientos cargados", icon: ClipboardList, color: "text-indigo-700", background: "bg-indigo-50" },
    { label: "Refusal", value: refusal === null ? "Sin datos" : `${refusal.toLocaleString("es-CO", { maximumFractionDigits: 2 })}%`, detail: "Sobre el volumen total", icon: Percent, color: "text-amber-700", background: "bg-amber-50" },
  ];
  const inputClass = "mt-1.5 h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10";
  return <section className="space-y-6">
    <header className="relative overflow-hidden rounded-3xl bg-[#10223d] px-6 py-7 text-white sm:px-8 sm:py-8">
      <Radar aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-96 w-96 text-teal-300/[0.07]" strokeWidth={0.75} />
      <div className="relative grid gap-7 lg:grid-cols-[1.35fr_1fr] lg:items-center">
        <div>
          <p className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-teal-200"><span className="h-1.5 w-1.5 rounded-full bg-teal-300" />Control de visitas</p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Fuera de rango<span className="text-teal-300">.</span></h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-300">Cada visita cuenta. Consulta la atención de tus clientes, sus modulaciones y su porcentaje de rechazo.</p>
          <span role="status" className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-200"><span className={`h-1.5 w-1.5 rounded-full ${loading ? "bg-amber-300 motion-safe:animate-pulse" : error ? "bg-rose-300" : "bg-teal-300"}`} />{loading ? "Cargando historial" : error ? "Información incompleta" : filtered ? "Consulta con filtros" : "Historial completo"}</span>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium text-slate-300">Visitas dentro de rango</p><p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">{insidePercent === null ? "—" : `${insidePercent.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`}</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-300/10 text-teal-200"><Radar size={22} aria-hidden="true" /></span></div>
          <div aria-hidden="true" className="mt-5 flex h-2 overflow-hidden rounded-full bg-white/10">{validated > 0 && <><span className="bg-teal-300" style={{ width: `${insidePercent}%` }} /><span className="bg-rose-400" style={{ width: `${100 - (insidePercent ?? 0)}%` }} /></>}</div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-300"><span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-teal-300" />{totals.inside.toLocaleString("es-CO")} dentro</span><span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-rose-400" />{totals.outside.toLocaleString("es-CO")} fuera</span></div>
          <p className="mt-3 text-[10px] text-slate-400">Calculado sobre las visitas con rango validado.</p>
        </div>
      </div>
    </header>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{metrics.map(metric => <article key={metric.label} className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <span className={`mb-4 grid h-9 w-9 place-items-center rounded-xl ${metric.background} ${metric.color}`}><metric.icon size={18} aria-hidden="true" /></span>
      <p className={`text-2xl font-bold tracking-tight tabular-nums ${metric.color}`}>{!data && loading ? "—" : metric.value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-700">{metric.label}</p><p className="mt-1 text-[10px] text-slate-500">{metric.detail}</p>
    </article>)}</div>
    <ClientRangeComparison rows={rows} loading={loading} incomplete={Boolean(error)} from={dateFrom} to={dateTo}>
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold text-[#10223d]"><SlidersHorizontal size={16} aria-hidden="true" />Personaliza tu consulta</h3><span className="text-[11px] text-slate-500">Los resultados se actualizan al cambiar los filtros</span></div>
      <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="text-xs font-semibold text-slate-600"><span className="flex items-center gap-2"><Search size={15} />Buscar cliente</span><input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Escribe un nombre o código para filtrar" className={inputClass} /></label>
        <label className="text-xs font-semibold text-slate-600"><span className="flex items-center gap-2"><CalendarDays size={15} />Desde</span><input type="date" value={dateFrom} max={dateTo || undefined} onChange={event => { setDateFrom(event.target.value); setPage(1); }} className={inputClass} /></label>
        <label className="text-xs font-semibold text-slate-600"><span className="flex items-center gap-2"><CalendarDays size={15} />Hasta</span><input type="date" value={dateTo} min={dateFrom || undefined} onChange={event => { setDateTo(event.target.value); setPage(1); }} className={inputClass} /></label>
        <button type="button" disabled={!search && !dateFrom && !dateTo} onClick={() => { setDateFrom(""); setDateTo(""); setSearch(""); setPage(1); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-default disabled:opacity-40"><X size={16} aria-hidden="true" />Limpiar</button>
      </div>
    </div>
    </ClientRangeComparison>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><p>{error} Los resultados pueden estar incompletos.</p><button type="button" disabled={loading} onClick={() => setAttempt(current => current + 1)} className="mt-2 rounded-lg border border-rose-300 px-3 py-2 font-semibold disabled:opacity-50">Reintentar carga</button></div>}
    <div className="grid grid-cols-1 gap-5">
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-5"><div><div className="flex items-center gap-3"><h3 className="text-lg font-bold text-[#10223d]">Detalle por cliente</h3><span className="rounded-lg bg-teal-50 px-2 py-1 text-xs font-bold tabular-nums text-teal-800">{visible.length.toLocaleString("es-CO")}</span></div><p className="mt-1 text-xs text-slate-500">Pulsa el nombre de un cliente para consultar su historial del período.</p></div><div className="flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-xs text-slate-500"><ArrowDownWideNarrow size={16} aria-hidden="true" /><span className="sr-only">Ordenar clientes</span><select value={sort} onChange={event => { setSort(event.target.value); setPage(1); }} className="h-10 max-w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-teal-600"><option value="outside">Más veces fuera de rango</option><option value="outsidePercent">Mayor % fuera de rango</option><option value="attentions">Más atenciones</option><option value="refusal">Mayor refusal</option><option value="name">Nombre del cliente</option></select></label><button type="button" disabled={loading} onClick={() => setAttempt(current => current + 1)} aria-label="Actualizar información" title="Actualizar información" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-teal-50 hover:text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-40"><RefreshCw size={16} aria-hidden="true" className={loading ? "motion-safe:animate-spin" : ""} /></button></div></div>
      <div className="max-h-[650px] overflow-auto focus-visible:outline-2 focus-visible:outline-teal-600" role="region" aria-label="Detalle por cliente; desplaza horizontalmente para ver todas las columnas" tabIndex={0}>
        <table className="w-full min-w-[1200px] text-left text-sm" aria-busy={loading}>
          <caption className="sr-only">Atenciones, rango, modulaciones y refusal por cliente</caption>
          <thead className="sticky top-0 z-20 bg-slate-100 text-[10px] uppercase tracking-wider text-slate-600"><tr>{["Nombre del cliente", "Total de atenciones", "Fuera de rango", "Dentro de rango", "% fuera de rango", "Veces que moduló", "Cajas entregadas / rechazadas", "Refusal (%)"].map((label, index) => <th key={label} scope="col" className={`px-4 py-4 ${index ? "text-center" : "sticky left-0 z-30 w-[240px] bg-slate-100 sm:w-[300px]"}`}>{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{pageRows.map(row => <tr key={row.key} className={`group transition-colors hover:bg-teal-50/60 ${expandedClient === row.key ? "bg-teal-50/60" : ""}`}>
            <th scope="row" className="sticky left-0 z-10 w-[240px] border-r border-slate-100 bg-white px-4 py-4 font-normal group-hover:bg-teal-50 sm:w-[300px]"><button type="button" aria-expanded={expandedClient === row.key} aria-controls={expandedClient === row.key ? historyId : undefined} onClick={() => setExpandedClient(current => current === row.key ? null : row.key)} className="flex w-full items-center gap-2 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-teal-600"><span className="min-w-0"><span className="block max-w-[180px] break-words font-semibold text-[#10223d] sm:max-w-[230px]">{row.name}</span><span className="mt-1 block text-[10px] text-slate-500">{row.code || "Sin código"} · {row.contractor}</span><span className="mt-1 block text-[10px] font-semibold text-teal-700">{expandedClient === row.key ? "Ocultar historial" : "Ver historial"}</span></span></button></th>
            <td className="px-4 py-4 text-center"><span className="font-bold tabular-nums text-[#10223d]">{row.attentions.toLocaleString("es-CO")}</span>{row.unknown > 0 && <span className="mt-1 block text-[11px] text-amber-700">{row.unknown.toLocaleString("es-CO")} sin rango validado</span>}</td>
            <td className="px-4 py-4 text-center"><span className="inline-flex min-w-10 justify-center rounded-lg bg-rose-50 px-3 py-1.5 font-bold tabular-nums text-rose-700">{row.outside.toLocaleString("es-CO")}</span></td>
            <td className="px-4 py-4 text-center"><span className="inline-flex min-w-10 justify-center rounded-lg bg-emerald-50 px-3 py-1.5 font-bold tabular-nums text-emerald-700">{row.inside.toLocaleString("es-CO")}</span></td>
            <td className="px-4 py-4 text-center"><span className={`font-bold tabular-nums ${row.outsidePercent === null ? "text-slate-400" : row.outsidePercent > 0 ? "text-rose-700" : "text-emerald-700"}`}>{row.outsidePercent === null ? "Sin validar" : `${row.outsidePercent.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`}</span><span className="mt-1 block text-[10px] text-slate-500">{(row.inside + row.outside).toLocaleString("es-CO")} visitas validadas</span></td>
            <td className="px-4 py-4 text-center"><span className="inline-flex min-w-10 justify-center rounded-lg bg-indigo-50 px-3 py-1.5 font-bold tabular-nums text-indigo-700">{row.modulations.toLocaleString("es-CO")}</span></td>
            <td className="px-4 py-4 text-center"><span className="block whitespace-nowrap text-xs font-semibold tabular-nums text-emerald-700">{row.deliveredVolume.toLocaleString("es-CO", { maximumFractionDigits: 2 })} <span className="font-normal">entregadas</span></span><span className="mt-1 block whitespace-nowrap text-xs font-semibold tabular-nums text-amber-700">{row.refusedVolume.toLocaleString("es-CO", { maximumFractionDigits: 2 })} <span className="font-normal">rechazadas</span></span></td>
            <td className="px-4 py-4 text-center"><span className={`text-sm font-bold tabular-nums ${row.refusal === null ? "text-slate-400" : row.refusal > 0 ? "text-amber-700" : "text-slate-600"}`}>{row.refusal === null ? "Sin datos" : `${row.refusal.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}</span>{row.refusal !== null && <div aria-hidden="true" className="mx-auto mt-2 h-1 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, Math.max(0, row.refusal))}%` }} /></div>}</td>
          </tr>)}{!visible.length && <tr><td colSpan={8} className="px-5 py-16 text-center"><Users size={30} aria-hidden="true" className="mx-auto mb-3 text-slate-300" /><p role="status" className="font-semibold text-slate-600">{loading ? "Cargando todos los clientes..." : error ? "No se pudo completar la consulta" : filtered ? "No hay coincidencias para estos filtros" : "No hay registros de clientes disponibles"}</p><p className="mt-2 text-xs text-slate-400">{loading ? "La información aparecerá automáticamente." : filtered ? "Limpia la búsqueda o amplía el rango de fechas." : "Los datos se consultan automáticamente al abrir el módulo."}</p></td></tr>}</tbody>
        </table>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] text-slate-500"><span>{visible.length ? `${((currentPage - 1) * 50 + 1).toLocaleString("es-CO")}–${Math.min(currentPage * 50, visible.length).toLocaleString("es-CO")} de ${visible.length.toLocaleString("es-CO")} clientes` : "0 clientes"} · {totals.attentions.toLocaleString("es-CO")} atenciones en la consulta</span><nav aria-label="Páginas de clientes" className="flex items-center gap-3"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-default disabled:opacity-40">Anterior</button><span aria-live="polite" className="tabular-nums">{currentPage} / {pageCount}</span><button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-default disabled:opacity-40">Siguiente</button></nav></footer>
    </div>
    {selectedClient && <ClientRangeHistory key={selectedClient.key} client={selectedClient} from={dateFrom} to={dateTo} id={historyId} onClose={() => setExpandedClient(null)} />}
    </div>
    <details className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-xs text-slate-500"><summary className="cursor-pointer font-medium text-slate-600 focus-visible:outline-2 focus-visible:outline-teal-600"><Info size={14} className="mr-2 inline" aria-hidden="true" />Cómo se calculan los indicadores</summary><div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 leading-6 sm:grid-cols-3"><p><strong className="block text-slate-700">Atenciones y rango</strong>El % fuera de rango se calcula sobre las visitas con rango validado. Las atenciones son visitas iniciadas. Las visitas sin rango validado se incluyen en el total y se indican debajo de cada conteo.</p><p><strong className="block text-slate-700">Refusal y modulaciones</strong>Refusal = cajas rechazadas / (entregadas + rechazadas) × 100. Sin volumen registrado aparece «Sin datos». Las modulaciones son seguimientos cargados.</p><p><strong className="block text-slate-700">Período consultado</strong>Las fechas corresponden al día operativo o de despacho. El reporte de cierre tiene prioridad sobre el reporte actual del mismo día.</p></div></details>
  </section>;
}
