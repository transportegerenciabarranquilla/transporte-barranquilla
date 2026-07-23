"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Download, History, LoaderCircle, MapPinCheck, Search, Table2, Truck, X, XCircle } from "lucide-react";
import { CONTRACTORS } from "../../lib/contractors";
import type { PuntoCoronaRouteReport } from "../../lib/puntoCoronaRoutesStorage";

type AdminRangoReport = {
  id: string;
  contractor: string;
  operationalDate: string;
  kind: PuntoCoronaRouteReport["kind"];
  fileName: string;
  uploadedAt: string;
  closedAt?: string;
  updatedAt: string;
  summary: PuntoCoronaRouteReport["summary"];
};

type DateRange = {
  from: string;
  to: string;
};

type RangoTotals = {
  reports: number;
  startedRows: number;
  inRange: number;
  outOfRange: number;
  unvalidated: number;
  crews: number;
  deliveryPercent: number;
};

export default function AdminRangoPage() {
  const router = useRouter();
  const [reports, setReports] = useState<AdminRangoReport[]>([]);
  const [contractor, setContractor] = useState("Todas");
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [dtSearch, setDtSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/rango", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudo cargar historial de rango.");
        setReports(body.reports || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar historial de rango."))
      .finally(() => setLoading(false));
  }, []);

  const historyReports = useMemo(() => getPreferredHistoryReports(reports), [reports]);
  const contractors = useMemo(() => {
    const reportContractors = new Set(historyReports.map((report) => report.contractor).filter(Boolean));
    return CONTRACTORS.filter((item) => reportContractors.has(item));
  }, [historyReports]);
  const visibleReports = useMemo(
    () => filterReports(historyReports, contractor, dateRange, dtSearch),
    [contractor, dateRange, dtSearch, historyReports],
  );
  const totals = useMemo(() => buildRangoTotals(visibleReports), [visibleReports]);
  const contractorSummaries = useMemo(
    () =>
      contractors
        .map((item) => ({
          contractor: item,
          totals: buildRangoTotals(filterReports(historyReports, item, dateRange, dtSearch)),
        }))
        .filter((item) => item.totals.reports > 0),
    [contractors, dateRange, dtSearch, historyReports],
  );

  function updateDateRange(nextRange: DateRange) {
    setDateRange(normalizeDateRange(nextRange));
  }

  function clearFilters() {
    setContractor("Todas");
    setDateRange({ from: "", to: "" });
    setDtSearch("");
  }

  async function downloadHistory() {
    setExporting(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (contractor !== "Todas") params.set("contractor", contractor);
      if (dateRange.from) params.set("from", dateRange.from);
      if (dateRange.to) params.set("to", dateRange.to);
      if (dtSearch.trim()) params.set("dt", dtSearch.trim());

      const response = await fetch(`/api/admin/rango/export?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "No se pudo generar el historial en Excel.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || "historial-fuera-de-rango.xlsx";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo generar el historial en Excel.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              aria-label="Volver a admin"
              className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100"
              onClick={() => router.push("/admin")}
              type="button"
            >
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Modulo admin</p>
              <h1 className="text-2xl font-semibold text-[#10223d]">Entrega en rango</h1>
            </div>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-[#10223d] shadow-sm transition hover:bg-slate-50"
            onClick={() => router.push("/admin")}
            type="button"
          >
            <Table2 size={16} />
            Panel admin
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        {error ? <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
        {loading ? <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Cargando historial de rango...</div> : null}

        <section className="mb-5 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto_auto]">
            <label className="text-sm font-semibold text-[#10223d]">
              <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                <CalendarDays size={16} />
                Desde
              </span>
              <input
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
                onChange={(event) => updateDateRange({ ...dateRange, from: event.target.value })}
                type="date"
                value={dateRange.from}
              />
            </label>
            <label className="text-sm font-semibold text-[#10223d]">
              <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                <CalendarDays size={16} />
                Hasta
              </span>
              <input
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
                onChange={(event) => updateDateRange({ ...dateRange, to: event.target.value })}
                type="date"
                value={dateRange.to}
              />
            </label>
            <label className="text-sm font-semibold text-[#10223d]">
              <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                <Search size={16} />
                DT
              </span>
              <input
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
                inputMode="numeric"
                onChange={(event) => setDtSearch(event.target.value)}
                placeholder="Ej: 123456"
                type="search"
                value={dtSearch}
              />
            </label>
            <button
              className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              onClick={clearFilters}
              type="button"
            >
              <X size={16} />
              Limpiar
            </button>
            <button
              className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#0f7c58] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b684a] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={exporting || totals.outOfRange === 0}
              onClick={downloadHistory}
              title={totals.outOfRange === 0 ? "No hay visitas fuera de rango para los filtros seleccionados." : "Descargar las visitas fuera de rango de los filtros actuales."}
              type="button"
            >
              {exporting ? <LoaderCircle className="animate-spin" size={16} /> : <Download size={16} />}
              {exporting ? "Generando..." : "Descargar historial"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Todas", ...contractors].map((item) => (
              <button
                className={`h-9 rounded-md px-3 text-xs font-semibold transition ${
                  contractor === item ? "bg-[#10223d] text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
                key={item}
                onClick={() => setContractor(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<History size={20} />} label="Historial global" value={`${totals.reports.toLocaleString("es-CO")} fechas`} tone="blue" />
          <Metric icon={<MapPinCheck size={20} />} label="% entrega en rango" value={`${totals.deliveryPercent.toLocaleString("es-CO")}%`} tone="green" />
          <Metric icon={<CheckCircle2 size={20} />} label="Visitas en rango" value={totals.inRange.toLocaleString("es-CO")} tone="green" />
          <Metric icon={<XCircle size={20} />} label="Visitas fuera" value={totals.outOfRange.toLocaleString("es-CO")} tone="red" />
        </div>

        <section className="mb-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Por contratista</p>
              <h2 className="text-lg font-semibold text-[#10223d]">Historial consolidado</h2>
            </div>
            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
              Global {visibleReports.length.toLocaleString("es-CO")}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {contractorSummaries.map((item) => (
              <button
                className={`rounded-lg border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                  contractor === item.contractor ? "border-[#0f7c58] ring-2 ring-[#0f7c58]/15" : "border-slate-200"
                }`}
                key={item.contractor}
                onClick={() => setContractor(item.contractor)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#10223d]">{item.contractor}</p>
                    <p className="mt-2 text-3xl font-semibold leading-none text-[#0f7c58]">{item.totals.deliveryPercent.toLocaleString("es-CO")}%</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">entrega en rango</p>
                  </div>
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">{item.totals.reports} fechas</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <SmallStat label="Visitas" value={item.totals.startedRows} />
                  <SmallStat label="En rango" tone="green" value={item.totals.inRange} />
                  <SmallStat label="Fuera" tone="red" value={item.totals.outOfRange} />
                </div>
              </button>
            ))}
          </div>
        </section>

        <RangoHistoryTable reports={visibleReports} />
      </section>
    </main>
  );
}

function RangoHistoryTable({ reports }: { reports: AdminRangoReport[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-[#10223d]">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-[#10223d] text-white">
            <Truck size={16} />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Historial de reportes</h2>
            <p className="text-xs text-slate-500">Un registro por contratista y dia; el cierre prevalece sobre el actual.</p>
          </div>
        </div>
        <span className="self-start rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 sm:self-auto">
          {reports.length} registro{reports.length === 1 ? "" : "s"}
        </span>
      </div>

      {reports.length ? (
        <div className="max-h-[620px] overflow-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="sticky top-0 z-10 bg-white text-[10px] uppercase tracking-[0.1em] text-slate-500 shadow-sm">
              <tr>
                <th className="px-3 py-2">Contratista</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Visitas</th>
                <th className="px-3 py-2 text-right">En rango</th>
                <th className="px-3 py-2 text-right">Fuera</th>
                <th className="px-3 py-2 text-right">Sin validar</th>
                <th className="px-3 py-2 text-right">% entrega</th>
                <th className="px-3 py-2 text-right">Tripulaciones</th>
                <th className="px-3 py-2 text-right">Ultimo evento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((report) => {
                const unvalidated = getUnvalidatedRows(report);

                return (
                  <tr className="bg-white hover:bg-slate-50" key={report.id}>
                    <td className="px-3 py-2 font-semibold text-[#10223d]">{report.contractor}</td>
                    <td className="px-3 py-2 text-slate-700">{formatDateLabel(report.operationalDate)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${report.kind === "closure" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-700"}`}>
                        {report.kind === "closure" ? "Cierre" : "Actual"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700">{report.summary.startedRows.toLocaleString("es-CO")}</td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700">{report.summary.inRange.toLocaleString("es-CO")}</td>
                    <td className="px-3 py-2 text-right font-semibold text-red-700">{report.summary.outOfRange.toLocaleString("es-CO")}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{unvalidated.toLocaleString("es-CO")}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#10223d]">{report.summary.deliveryRangePercent.toFixed(2)}%</td>
                    <td className="px-3 py-2 text-right text-slate-600">{report.summary.crews.length.toLocaleString("es-CO")}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{formatDateTime(report.closedAt || report.uploadedAt || report.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid min-h-44 place-items-center px-4 text-center text-sm text-slate-500">No hay reportes de rango para este filtro.</div>
      )}
    </section>
  );
}

function Metric({
  icon,
  label,
  tone,
  value,
}: {
  icon: ReactNode;
  label: string;
  tone: "blue" | "green" | "red";
  value: string;
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`mb-3 grid h-10 w-10 place-items-center rounded-md ${toneClass}`}>{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}

function SmallStat({ label, tone = "slate", value }: { label: string; tone?: "green" | "red" | "slate"; value: number }) {
  const toneClass = {
    green: "text-emerald-700",
    red: "text-red-700",
    slate: "text-[#10223d]",
  }[tone];

  return (
    <span className="rounded-md bg-slate-50 px-2 py-2 text-center">
      <span className={`block text-sm font-semibold ${toneClass}`}>{value.toLocaleString("es-CO")}</span>
      <span className="block text-[10px] uppercase tracking-[0.1em] text-slate-400">{label}</span>
    </span>
  );
}

function filterReports(reports: AdminRangoReport[], contractor: string, range: DateRange, dtSearch: string) {
  const targetDt = normalizeDt(dtSearch);

  return reports.filter((report) => {
    const matchesContractor = contractor === "Todas" || report.contractor === contractor;
    const matchesDate = isDateInRange(report.operationalDate, range);
    const matchesDt =
      !targetDt ||
      report.summary.crews.some((crew) => normalizeDt(crew.dt).includes(targetDt)) ||
      report.id.includes(targetDt);
    return matchesContractor && matchesDate && matchesDt;
  });
}

function buildRangoTotals(reports: AdminRangoReport[]): RangoTotals {
  const totals = reports.reduce(
    (acc, report) => ({
      reports: acc.reports + 1,
      startedRows: acc.startedRows + report.summary.startedRows,
      inRange: acc.inRange + report.summary.inRange,
      outOfRange: acc.outOfRange + report.summary.outOfRange,
      unvalidated: acc.unvalidated + getUnvalidatedRows(report),
      crews: acc.crews + report.summary.crews.length,
    }),
    { reports: 0, startedRows: 0, inRange: 0, outOfRange: 0, unvalidated: 0, crews: 0 },
  );

  return {
    ...totals,
    deliveryPercent: totals.startedRows ? Number(((totals.inRange / totals.startedRows) * 100).toFixed(2)) : 0,
  };
}

function getPreferredHistoryReports(reports: AdminRangoReport[]) {
  const byDate = new Map<string, AdminRangoReport>();

  reports.forEach((report) => {
    const key = `${report.contractor}:${report.operationalDate}`;
    const current = byDate.get(key);
    if (!current || isPreferredReport(report, current)) byDate.set(key, report);
  });

  return Array.from(byDate.values()).sort(
    (a, b) => b.operationalDate.localeCompare(a.operationalDate) || a.contractor.localeCompare(b.contractor),
  );
}

function isPreferredReport(candidate: AdminRangoReport, current: AdminRangoReport) {
  if (candidate.kind === "closure" && current.kind !== "closure") return true;
  if (candidate.kind !== "closure" && current.kind === "closure") return false;

  return getReportTimestamp(candidate) > getReportTimestamp(current);
}

function getReportTimestamp(report: AdminRangoReport) {
  const parsed = new Date(report.closedAt || report.uploadedAt || report.updatedAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getUnvalidatedRows(report: AdminRangoReport) {
  return Math.max(report.summary.startedRows - report.summary.inRange - report.summary.outOfRange, 0);
}

function normalizeDateRange(range: DateRange): DateRange {
  if (!range.from || !range.to) return range;
  return range.from <= range.to ? range : { from: range.to, to: range.from };
}

function isDateInRange(date: string, range: DateRange) {
  if (!date) return false;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

function normalizeDt(value: unknown) {
  return String(value || "")
    .replace(/^DT-?/i, "")
    .replace(/\D/g, "");
}

function formatDateLabel(value: string) {
  if (!value) return "Sin fecha";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin hora";

  return date.toLocaleString("es-CO", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
