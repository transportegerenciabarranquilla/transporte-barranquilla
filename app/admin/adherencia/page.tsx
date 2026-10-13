"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Search, TrendingUp, X, XCircle } from "lucide-react";
import { ADHERENCE_CONTRACTORS, buildMonthlyOrderAdherence, buildRrOrderAdherence, filterAdherenceReportsByDate } from "../../lib/routeOrderAdherence";
import type { PuntoCoronaRouteReport } from "../../lib/puntoCoronaRoutesStorage";
import { normalizeContractorName } from "../../lib/contractors";

type AdminAdherenceReport = Pick<PuntoCoronaRouteReport, "contractor" | "operationalDate" | "kind" | "uploadedAt" | "closedAt" | "rows"> & { updatedAt?: string };
type DateRange = { from: string; to: string };

const COLORS: Record<string, string> = {
  "Surti Cervezas": "#f59e0b",
  Logisticos: "#0f7c58",
  "HL Logisticos": "#2563eb",
};

export default function AdminAdherenciaPage() {
  const router = useRouter();
  const [initialRange] = useState(defaultDateRange);
  const [dateRange, setDateRange] = useState<DateRange>(initialRange);
  const [appliedRange, setAppliedRange] = useState<DateRange>(initialRange);
  const [contractor, setContractor] = useState("Todas");
  const [rrSearch, setRrSearch] = useState("");
  const [reports, setReports] = useState<AdminAdherenceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ adherencia: "1" });
    if (appliedRange.from) params.set("desde", appliedRange.from);
    if (appliedRange.to) params.set("hasta", appliedRange.to);
    setLoading(true);
    setError("");
    fetch(`/api/admin/rango?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudo cargar la adherencia.");
        setReports(body.reports || []);
      })
      .catch((caught) => {
        if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : "No se pudo cargar la adherencia.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [appliedRange.from, appliedRange.to, refreshKey]);

  const dateReports = useMemo(() => filterAdherenceReportsByDate(reports, appliedRange.from, appliedRange.to), [appliedRange.from, appliedRange.to, reports]);
  const scopedReports = useMemo(() => contractor === "Todas" ? dateReports : dateReports.filter((report) => normalizeContractorName(report.contractor) === normalizeContractorName(contractor)), [contractor, dateReports]);
  const rrRows = useMemo(() => buildRrOrderAdherence(scopedReports).filter((row) => !rrSearch.trim() || row.rr.toLocaleLowerCase("es-CO").includes(rrSearch.trim().toLocaleLowerCase("es-CO"))), [rrSearch, scopedReports]);
  const monthlyRows = useMemo(() => buildMonthlyOrderAdherence(scopedReports), [scopedReports]);
  const totals = useMemo(() => rrRows.reduce((result, row) => ({ evaluated: result.evaluated + row.evaluated, compliant: result.compliant + row.compliant, withoutOrder: result.withoutOrder + row.withoutOrder }), { evaluated: 0, compliant: 0, withoutOrder: 0 }), [rrRows]);
  const totalPercentage = totals.evaluated ? totals.compliant / totals.evaluated * 100 : null;

  function applyRange() {
    if (dateRange.from && dateRange.to && dateRange.from > dateRange.to) {
      setError("La fecha inicial no puede superar la fecha final.");
      return;
    }
    setAppliedRange({ ...dateRange });
    setRefreshKey((current) => current + 1);
  }

  function updateRange(next: DateRange) {
    setDateRange(next);
    if (!next.from || !next.to || next.from <= next.to) setAppliedRange({ ...next });
  }

  function clearFilters() {
    const next = defaultDateRange();
    setDateRange(next);
    setAppliedRange(next);
    setContractor("Todas");
    setRrSearch("");
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-4 sm:px-8">
          <button aria-label="Volver al panel admin" className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100" onClick={() => router.push("/admin")} type="button"><ArrowLeft size={19} /></button>
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Módulo admin</p><h1 className="text-2xl font-semibold text-[#10223d]">Adherencia a cumplimiento</h1></div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto_auto] xl:items-end">
            <DateInput label="Desde" max={dateRange.to} onChange={(from) => updateRange({ ...dateRange, from })} value={dateRange.from} />
            <DateInput label="Hasta" min={dateRange.from} onChange={(to) => updateRange({ ...dateRange, to })} value={dateRange.to} />
            <label className="text-sm font-semibold text-[#10223d]"><span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500"><Search size={16} />Buscar RR</span><input className="h-11 w-full rounded-md border border-slate-200 px-3 outline-none focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15" onChange={(event) => setRrSearch(event.target.value)} placeholder="Nombre del responsable" type="search" value={rrSearch} /></label>
            <button className="h-11 rounded-md bg-[#0f7c58] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b684a] disabled:cursor-wait disabled:opacity-70" disabled={loading} onClick={applyRange} type="button">{loading ? "Actualizando..." : "Aplicar fechas"}</button>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={clearFilters} type="button"><X size={16} />Limpiar</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Todas", ...ADHERENCE_CONTRACTORS].map((item) => <button className={`rounded-md px-3 py-2 text-xs font-semibold transition ${contractor === item ? "bg-[#10223d] text-white shadow-sm" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`} key={item} onClick={() => setContractor(item)} type="button">{item}</button>)}
          </div>
          <p className="mt-3 text-[11px] font-semibold text-slate-500">Período aplicado: {appliedRange.from || "inicio"} — {appliedRange.to || "hoy"}</p>
        </section>

        {error ? <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
        {loading ? <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Calculando adherencia del período...</div> : null}

        <div className={`mb-5 grid gap-3 transition-opacity sm:grid-cols-2 xl:grid-cols-4 ${loading ? "opacity-35" : "opacity-100"}`}>
          <Metric icon={<TrendingUp size={20} />} label="Cumplimiento global" value={formatPercentage(totalPercentage)} tone="green" />
          <Metric icon={<ClipboardCheck size={20} />} label="Visitas evaluadas" value={totals.evaluated.toLocaleString("es-CO")} tone="blue" />
          <Metric icon={<CheckCircle2 size={20} />} label="En el orden establecido" value={totals.compliant.toLocaleString("es-CO")} tone="green" />
          <Metric icon={<XCircle size={20} />} label="Sin datos de orden" value={totals.withoutOrder.toLocaleString("es-CO")} tone="amber" />
        </div>

        <div className={`grid items-stretch gap-5 transition-opacity xl:grid-cols-2 ${loading ? "pointer-events-none opacity-35" : "opacity-100"}`}>
          <RrAdherenceTable key={`${contractor}:${rrSearch}:${appliedRange.from}:${appliedRange.to}`} rows={rrRows} />
          <MonthlyAdherenceChart rows={monthlyRows} />
        </div>
      </section>
    </main>
  );
}

function RrAdherenceTable({ rows }: { rows: ReturnType<typeof buildRrOrderAdherence> }) {
  const pageSize = 7;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(safePage * pageSize, (safePage + 1) * pageSize);

  return (
    <section className="flex h-[570px] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Detalle por responsable</p>
        <h2 className="mt-0.5 text-base font-semibold text-[#10223d]">Cumplimiento del orden por RR</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">Compara el orden establecido con el orden realmente visitado.</p>
      </div>
      <div className="min-h-0 flex-1">
        <table className="h-full w-full table-fixed text-left text-[10px]">
          <colgroup><col className="w-[25%]" /><col className="w-[16%]" /><col className="w-[8%]" /><col className="w-[10%]" /><col className="w-[9%]" /><col className="w-[10%]" /><col className="w-[9%]" /><col className="w-[13%]" /></colgroup>
          <thead className="bg-white text-[9px] uppercase tracking-[0.06em] text-slate-500 shadow-sm">
            <tr><th className="px-2 py-2">RR</th><th className="px-2 py-2">Contratista</th><th className="px-1 py-2 text-center">Rutas</th><th className="px-1 py-2 text-center">Evaluadas</th><th className="px-1 py-2 text-center">Cumple</th><th className="px-1 py-2 text-center">No cumple</th><th className="px-1 py-2 text-center">Sin dato</th><th className="px-1 py-2 text-center">Adherencia</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.map((row) => <tr className="h-12 hover:bg-slate-50" key={`${row.contractor}:${row.rr}`}><td className="break-words px-2 py-1.5 font-semibold leading-tight text-[#10223d]">{row.rr}</td><td className="break-words px-2 py-1.5 leading-tight text-slate-600">{row.contractor}</td><td className="px-1 py-1.5 text-center">{row.routes}</td><td className="px-1 py-1.5 text-center font-semibold">{row.evaluated}</td><td className="px-1 py-1.5 text-center font-semibold text-emerald-700">{row.compliant}</td><td className="px-1 py-1.5 text-center font-semibold text-red-700">{row.nonCompliant}</td><td className="px-1 py-1.5 text-center text-amber-700">{row.withoutOrder}</td><td className="px-1 py-1.5 text-center"><span className={`inline-flex max-w-full justify-center rounded-full px-1.5 py-1 text-[9px] font-bold ${percentageTone(row.percentage)}`}>{formatPercentage(row.percentage)}</span></td></tr>)}
            {!visibleRows.length ? <tr><td className="px-5 py-12 text-center text-sm text-slate-500" colSpan={8}>No hay visitas con información de orden para los filtros seleccionados.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="flex h-14 shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-4">
        <p className="text-[11px] font-semibold text-slate-500">{rows.length ? `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, rows.length)} de ${rows.length} RR` : "0 RR"}</p>
        <div className="flex items-center gap-2"><button aria-label="Página anterior" className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-35" disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} type="button"><ChevronLeft size={16} /></button><span className="min-w-16 text-center text-[11px] font-semibold text-slate-600">{safePage + 1} / {pageCount}</span><button aria-label="Página siguiente" className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-35" disabled={safePage >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} type="button"><ChevronRight size={16} /></button></div>
      </div>
    </section>
  );
}

function MonthlyAdherenceChart({ rows }: { rows: ReturnType<typeof buildMonthlyOrderAdherence> }) {
  const months = [...new Set(rows.map((row) => row.month))];
  return (
    <section className="flex h-[570px] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="shrink-0"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Tendencia mensual</p><h2 className="mt-0.5 text-base font-semibold text-[#10223d]">Cumplimiento por contratista</h2></div>
      <div className="mt-2 flex shrink-0 flex-wrap gap-x-3 gap-y-1">{ADHERENCE_CONTRACTORS.map((item) => <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-600" key={item}><i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLORS[item] }} />{item}</span>)}</div>
      {months.length ? <div className="mt-4 min-h-0 flex-1"><div className="grid h-full gap-2" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>{months.map((month) => <div className="flex min-w-0 flex-col" key={month}><div className="relative flex flex-1 items-end justify-center gap-1 border-b border-slate-300 bg-[linear-gradient(to_top,rgba(148,163,184,.16)_1px,transparent_1px)] bg-[size:100%_25%] px-1">{ADHERENCE_CONTRACTORS.map((item) => { const point = rows.find((row) => row.month === month && row.contractor === item); const value = point?.percentage; return <div className="group relative flex h-full min-w-0 flex-1 items-end justify-center" key={item}><div aria-label={`${item}: ${formatPercentage(value)}`} className="w-full max-w-8 rounded-t-sm transition hover:opacity-80" style={{ backgroundColor: COLORS[item], height: `${value ?? 0}%`, minHeight: point ? 3 : 0 }} /><span className="pointer-events-none absolute bottom-2 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-[9px] font-semibold text-white group-hover:block">{point ? `${formatPercentage(value)} · ${point.compliant}/${point.evaluated}` : "Sin datos"}</span></div>; })}</div><p className="truncate pt-2 text-center text-[10px] font-semibold capitalize text-slate-600">{formatMonth(month)}</p></div>)}</div></div> : <div className="mt-4 grid flex-1 place-items-center rounded-lg border border-dashed border-slate-200 px-6 text-center text-sm text-slate-500">No hay datos comparables para construir la gráfica mensual.</div>}
    </section>
  );
}

function DateInput({ label, max, min, onChange, value }: { label: string; max?: string; min?: string; onChange: (value: string) => void; value: string }) {
  return <label className="text-sm font-semibold text-[#10223d]"><span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500"><CalendarDays size={16} />{label}</span><input className="h-11 w-full rounded-md border border-slate-200 px-3 outline-none focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15" max={max || undefined} min={min || undefined} onChange={(event) => onChange(event.target.value)} type="date" value={value} /></label>;
}

function Metric({ icon, label, tone, value }: { icon: React.ReactNode; label: string; tone: "green" | "blue" | "amber"; value: string }) {
  const tones = { green: "bg-emerald-50 text-emerald-700", blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-700" };
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`grid h-9 w-9 place-items-center rounded-md ${tones[tone]}`}>{icon}</div><p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-[#10223d]">{value}</p></div>;
}

function defaultDateRange(): DateRange {
  const to = dateKey(new Date());
  const [year, month] = to.split("-").map(Number);
  const fromDate = new Date(Date.UTC(year, month - 6, 1, 12));
  return { from: fromDate.toISOString().slice(0, 10), to };
}

function dateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatMonth(month: string) {
  return new Intl.DateTimeFormat("es-CO", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`)).replace(".", "");
}

function formatPercentage(value: number | null | undefined) {
  return value == null ? "Sin dato" : `${value.toLocaleString("es-CO", { maximumFractionDigits: 2 })}%`;
}

function percentageTone(value: number | null) {
  if (value == null) return "bg-slate-100 text-slate-600";
  if (value >= 90) return "bg-emerald-100 text-emerald-800";
  if (value >= 75) return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}
