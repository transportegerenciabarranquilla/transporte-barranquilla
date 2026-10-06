"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, RefreshCw, Table2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { RANGE_REASONS } from "../../../lib/rangeReasons";
import { contractorLabel } from "../../../lib/contractors";

type RangeRow = { status: string; withinRadius: boolean | null; manualOutOfRadiusReason?: string; outOfRadiusReason?: string; skippedReason?: string };
type Report = { id: string; contractor: string; operationalDate: string; kind: "current" | "closure"; uploadedAt: string; updatedAt: string; closedAt?: string; rows: RangeRow[] };
type ReasonStat = { reason: string; total: number; average: number; percentage: number };

const normalize = (value: string) => value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
const reasonOf = (row: RangeRow) => {
  const raw = normalize(row.manualOutOfRadiusReason || row.outOfRadiusReason || row.skippedReason || "");
  return raw === "apoyo ingreso" ? "apoyo de ingreso" : raw;
};
const displayReason = (value: string) => RANGE_REASONS.find(reason => normalize(reason) === value) || "Sin clasificar";

export default function RangeReasonsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [contractor, setContractor] = useState("Todas");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    fetch("/api/admin/rango", { cache: "no-store" }).then(async response => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudieron cargar los reportes de rango.");
      setReports(body.reports || []);
    }).catch(caught => setError(caught instanceof Error ? caught.message : "No se pudieron cargar los reportes de rango.")).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const selected = useMemo(() => preferredReports(reports).filter(report =>
    (contractor === "Todas" || contractorLabel(report.contractor) === contractor)
    && (!from || report.operationalDate >= from) && (!to || report.operationalDate <= to)), [reports, contractor, from, to]);
  const contractors = useMemo(() => [...new Set(preferredReports(reports).map(report => contractorLabel(report.contractor)))].sort((a, b) => a.localeCompare(b, "es")), [reports]);
  const stats = useMemo(() => buildStats(selected), [selected]);
  const totalOutside = stats.reduce((sum, row) => sum + row.total, 0);
  const totalVisits = selected.reduce((sum, report) => sum + report.rows.filter(row => row.status !== "NOT_STARTED" && row.withinRadius === false).length, 0);

  return <main className="min-h-screen bg-[#f4f7fb] px-5 py-6 text-slate-900 sm:px-8">
    <div className="mx-auto max-w-7xl">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-3"><button type="button" aria-label="Volver a rango" onClick={() => router.push("/admin/rango")} className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] hover:bg-slate-100"><ArrowLeft size={19} /></button><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#0f7c58]">Módulo admin · Rango</p><h1 className="text-2xl font-semibold text-[#10223d]">Motivos fuera de rango</h1><p className="text-sm text-slate-500">Tablas y promedios tomados de los reportes de las contratistas.</p></div></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => router.push("/admin/rango")} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-[#10223d] hover:bg-slate-50"><Table2 size={16} />Panel rango</button><button type="button" onClick={load} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Actualizar</button></div>
      </header>
      <section className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <label className="text-xs font-semibold text-slate-600">Contratista<select value={contractor} onChange={event => setContractor(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm"><option>Todas</option>{contractors.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="text-xs font-semibold text-slate-600"><span className="flex items-center gap-1"><CalendarDays size={14} />Desde</span><input type="date" value={from} onChange={event => setFrom(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600"><span className="flex items-center gap-1"><CalendarDays size={14} />Hasta</span><input type="date" value={to} onChange={event => setTo(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm" /></label>
        <div className="flex items-end"><div className="w-full rounded-md bg-rose-50 p-3"><p className="text-2xl font-bold text-rose-700">{totalOutside.toLocaleString("es-CO")}</p><p className="text-xs font-semibold text-rose-800">visitas fuera de rango · {selected.length} reportes</p></div></div>
      </section>
      {error && <p role="alert" className="mb-5 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      <section className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-200 bg-slate-50 px-5 py-4"><h2 className="font-semibold text-[#10223d]">Resumen por motivo</h2><p className="mt-1 text-xs text-slate-500">Promedio por reporte seleccionado y porcentaje sobre todas las visitas fuera de rango.</p></header><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-[#10223d] text-left text-xs uppercase tracking-wide text-white"><tr><th className="px-4 py-3">Motivo</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Promedio por reporte</th><th className="px-4 py-3 text-right">% del total</th></tr></thead><tbody className="divide-y divide-slate-100">{stats.map(row => <tr key={row.reason}><td className="px-4 py-3 font-semibold text-slate-800">{row.reason}</td><td className="px-4 py-3 text-right font-bold text-rose-700">{row.total.toLocaleString("es-CO")}</td><td className="px-4 py-3 text-right text-slate-700">{row.average.toLocaleString("es-CO", { maximumFractionDigits: 2 })}</td><td className="px-4 py-3 text-right font-semibold text-[#0f7c58]">{row.percentage.toLocaleString("es-CO", { maximumFractionDigits: 2 })}%</td></tr>)}{!stats.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">{loading ? "Cargando reportes..." : "No hay visitas fuera de rango para los filtros seleccionados."}</td></tr>}</tbody></table></div></section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-200 bg-slate-50 px-5 py-4"><h2 className="font-semibold text-[#10223d]">Detalle por contratista y motivo</h2><p className="mt-1 text-xs text-slate-500">{totalVisits.toLocaleString("es-CO")} visitas fuera de rango identificadas.</p></header><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-[#10223d] text-left text-xs uppercase tracking-wide text-white"><tr><th className="px-4 py-3">Contratista</th>{RANGE_REASONS.map(reason => <th key={reason} className="px-3 py-3 text-right">{reason}</th>)}<th className="px-4 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{buildContractorStats(selected).map(row => <tr key={row.contractor}><td className="px-4 py-3 font-semibold text-[#10223d]">{row.contractor}</td>{RANGE_REASONS.map(reason => <td key={reason} className="px-3 py-3 text-right tabular-nums">{(row.counts[normalize(reason)] || 0).toLocaleString("es-CO")}</td>)}<td className="px-4 py-3 text-right font-bold text-rose-700">{row.total.toLocaleString("es-CO")}</td></tr>)}</tbody></table></div></section>
    </div>
  </main>;
}

function preferredReports(reports: Report[]) {
  const map = new Map<string, Report>();
  for (const report of reports) {
    const key = `${contractorLabel(report.contractor)}:${report.operationalDate}`;
    const current = map.get(key);
    if (!current || (report.kind === "closure" && current.kind !== "closure") || Date.parse(report.closedAt || report.uploadedAt || report.updatedAt) > Date.parse(current.closedAt || current.uploadedAt || current.updatedAt)) map.set(key, report);
  }
  return [...map.values()];
}

function buildStats(reports: Report[]): ReasonStat[] {
  const counts = new Map<string, number>();
  for (const report of reports) for (const row of report.rows) if (row.status !== "NOT_STARTED" && row.withinRadius === false) counts.set(reasonOf(row), (counts.get(reasonOf(row)) || 0) + 1);
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason: displayReason(reason), total: count, average: reports.length ? count / reports.length : 0, percentage: total ? count / total * 100 : 0 }));
}

function buildContractorStats(reports: Report[]) {
  const groups = new Map<string, { contractor: string; counts: Record<string, number>; total: number }>();
  for (const report of reports) {
    const contractor = contractorLabel(report.contractor);
    const group = groups.get(contractor) || { contractor, counts: {}, total: 0 };
    for (const row of report.rows) if (row.status !== "NOT_STARTED" && row.withinRadius === false) { const reason = reasonOf(row); group.counts[reason] = (group.counts[reason] || 0) + 1; group.total += 1; }
    groups.set(contractor, group);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}
