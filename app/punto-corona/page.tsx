"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileDown,
  FileSpreadsheet,
  LockKeyhole,
  MapPinCheck,
  RotateCcw,
  Save,
  Upload,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  getPuntoCoronaClosureReportId,
  getPuntoCoronaCurrentReportId,
  PUNTO_CORONA_CONTRACTOR,
  PUNTO_CORONA_ROUTES_STORAGE_KEY,
  readPuntoCoronaRouteReports,
  savePuntoCoronaRouteReports,
  type PuntoCoronaCrewSummary,
  type PuntoCoronaRouteReport,
} from "../lib/puntoCoronaRoutesStorage";
import { refreshRemoteRecords } from "../lib/remoteStore";
import { SEGUIMIENTO_STORAGE_KEY } from "../lib/seguimientoStorage";
import { notifyStorageChange, useStorageSnapshot } from "../lib/storageEvents";
import { loadSeguimientoVehiculos } from "../seguimiento/services/vehicleRecords";
import type { Vehiculo } from "../seguimiento/types";
import { downloadPuntoCoronaPdf } from "./pdfReportService";
import { createClosureReport, parsePuntoCoronaRouteFile } from "./routeReportService";

const DATA_REFRESH_MS = 30_000;

type AccessState = "checking" | "allowed" | "denied";

export default function PuntoCoronaPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reports = useStorageSnapshot<PuntoCoronaRouteReport[]>(
    [PUNTO_CORONA_ROUTES_STORAGE_KEY],
    readPuntoCoronaRouteReports,
    [],
  );
  const seguimientoVehicles = useStorageSnapshot<Vehiculo[]>(
    [SEGUIMIENTO_STORAGE_KEY],
    loadSeguimientoVehiculos,
    [],
  );
  const [access, setAccess] = useState<AccessState>("checking");
  const [message, setMessage] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body) => {
        const session = body?.session;
        setAccess(session?.contractor === PUNTO_CORONA_CONTRACTOR && !session?.isAdmin ? "allowed" : "denied");
      })
      .catch(() => setAccess("denied"));
  }, []);

  useEffect(() => {
    void refreshRemoteRecords("/api/seguimiento");
    void refreshRemoteRecords("/api/punto-corona-routes");

    const interval = window.setInterval(() => {
      void refreshRemoteRecords("/api/seguimiento");
      void refreshRemoteRecords("/api/punto-corona-routes");
    }, DATA_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, []);

  const availableDates = useMemo(() => {
    return Array.from(new Set(reports.map((report) => report.operationalDate).filter(Boolean))).sort().reverse();
  }, [reports]);

  useEffect(() => {
    if (selectedDate || !availableDates.length) return;
    setSelectedDate(availableDates[0]);
  }, [availableDates, selectedDate]);

  const activeDate = selectedDate || availableDates[0] || "";
  const currentReport = useMemo(
    () => reports.find((report) => report.id === getPuntoCoronaCurrentReportId(activeDate)),
    [activeDate, reports],
  );
  const closureReport = useMemo(
    () => reports.find((report) => report.id === getPuntoCoronaClosureReportId(activeDate)),
    [activeDate, reports],
  );
  const visibleReport = closureReport ?? currentReport ?? null;
  const seguimientoPuntoCorona = useMemo(
    () => seguimientoVehicles.filter((vehicle) => vehicle.transportista === PUNTO_CORONA_CONTRACTOR),
    [seguimientoVehicles],
  );

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!seguimientoPuntoCorona.length) {
      setMessage("Primero debe estar cargado el seguimiento de Punto Corona para cruzar los DT.");
      return;
    }

    setIsImporting(true);
    setMessage("");

    try {
      const report = await parsePuntoCoronaRouteFile(file, seguimientoPuntoCorona);
      await savePuntoCoronaRouteReports([report]);
      setSelectedDate(report.operationalDate);
      setMessage(`Archivo cargado. Se tomaron ${report.summary.matchedDts} DT del seguimiento actual.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar el archivo.");
    } finally {
      setIsImporting(false);
    }
  }

  async function handleCloseDay() {
    if (!currentReport) return;

    try {
      const closure = createClosureReport(currentReport);
      await savePuntoCoronaRouteReports([closure]);
      setMessage(`Cierre guardado para ${formatDate(closure.operationalDate)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el cierre.");
    }
  }

  async function handleReopenDay() {
    if (!closureReport || isReopening) return;
    setIsReopening(true);
    setMessage("");

    try {
      const response = await fetch(`/api/punto-corona-routes?id=${encodeURIComponent(closureReport.id)}`, {
        method: "DELETE",
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo quitar el cierre.");

      notifyStorageChange(PUNTO_CORONA_ROUTES_STORAGE_KEY);
      await refreshRemoteRecords("/api/punto-corona-routes", { force: true });
      setMessage(`Cierre retirado para ${formatDate(closureReport.operationalDate)}. Puedes volver a cargar o cerrar cuando corresponda.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo quitar el cierre.");
    } finally {
      setIsReopening(false);
    }
  }

  async function handleDownloadPdf() {
    if (!visibleReport || isDownloading) return;
    setIsDownloading(true);
    setDownloadError("");

    try {
      await downloadPuntoCoronaPdf(visibleReport);
    } catch {
      setDownloadError("No se pudo generar el PDF. Intenta nuevamente.");
    } finally {
      setIsDownloading(false);
    }
  }

  if (access === "checking") {
    return <main className="min-h-screen bg-[#f4f7fb]" />;
  }

  if (access === "denied") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f7fb] px-5 text-slate-900">
        <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-lg">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-emerald-50 text-emerald-700">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-[#10223d]">Modulo Punto Corona</h1>
          <p className="mt-2 text-sm text-slate-500">Este modulo solo esta disponible para la sesion de Punto Corona.</p>
          <button
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#10223d] px-4 py-2 text-sm font-semibold text-white"
            onClick={() => router.push("/")}
            type="button"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-white/60 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="Volver"
              className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-50"
              onClick={() => router.push("/")}
              type="button"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Punto Corona</p>
              <h1 className="truncate text-2xl font-semibold text-[#10223d]">Entrega en rango y modulacion</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
              onChange={(event) => setSelectedDate(event.target.value)}
              value={activeDate}
            >
              {availableDates.length ? (
                availableDates.map((date) => (
                  <option key={date} value={date}>
                    {formatDate(date)}
                  </option>
                ))
              ) : (
                <option value="">Sin reportes</option>
              )}
            </select>
            <input
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
              ref={fileInputRef}
              type="file"
            />
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <Upload className="h-4 w-4" />
              {isImporting ? "Cargando" : "Subir archivo"}
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={!currentReport || Boolean(closureReport)}
              onClick={handleCloseDay}
              type="button"
            >
              <Save className="h-4 w-4" />
              Cierre
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={!visibleReport || isDownloading}
              onClick={handleDownloadPdf}
              type="button"
            >
              <FileDown className="h-4 w-4" />
              {isDownloading ? "PDF" : "Descargar PDF"}
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {closureReport ? (
              <button
                className="inline-flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isReopening}
                onClick={handleReopenDay}
                type="button"
              >
                <RotateCcw className="h-4 w-4" />
                {isReopening ? "Quitando" : "Quitar cierre"}
              </button>
            ) : null}
          </div>
          <div className="min-h-10 flex-1 text-right">
            {message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{message}</p> : null}
            {downloadError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{downloadError}</p> : null}
          </div>
        </div>

        {visibleReport ? (
          <>
            <SummaryGrid report={visibleReport} />
            <Charts report={visibleReport} />
            <StatusCharts report={visibleReport} />
            <CrewTable crews={visibleReport.summary.crews} />
          </>
        ) : (
          <EmptyState onUpload={() => fileInputRef.current?.click()} />
        )}
      </section>
    </main>
  );
}

function StatusCharts({ report }: { report: PuntoCoronaRouteReport }) {
  const summary = report.summary;
  const deliveryItems = [
    { color: "bg-emerald-500", label: "En rango", value: summary.inRange },
    { color: "bg-red-500", label: "Fuera de rango", value: summary.outOfRange },
    { color: "bg-slate-300", label: "Abiertas sin validar", value: Math.max(summary.startedRows - summary.inRange - summary.outOfRange, 0) },
  ];
  const modulationItems = [
    { color: "bg-[#1264ff]", label: "Concluidos", value: summary.concluded },
    { color: "bg-red-500", label: "Rechazados", value: summary.returned },
    { color: "bg-amber-400", label: "Abiertos", value: summary.openRows },
  ];

  return (
    <div className="mb-5 grid gap-4 lg:grid-cols-2">
      <StackedChart title="Distribucion de entrega" total={summary.startedRows} items={deliveryItems} />
      <StackedChart title="Distribucion de modulacion" total={summary.startedRows} items={modulationItems} />
    </div>
  );
}

function StackedChart({
  items,
  title,
  total,
}: {
  items: Array<{ color: string; label: string; value: number }>;
  title: string;
  total: number;
}) {
  const safeTotal = Math.max(total, 1);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[#10223d]">{title}</h2>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{total} visitas</span>
      </div>
      <div className="mt-5 flex h-5 overflow-hidden rounded-full bg-slate-100">
        {items.map((item) => (
          <div
            className={`${item.color} min-w-0`}
            key={item.label}
            style={{ width: `${(item.value / safeTotal) * 100}%` }}
            title={`${item.label}: ${item.value}`}
          />
        ))}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {items.map((item) => (
          <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2" key={item.label}>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
              <span className="truncate text-xs font-semibold text-slate-600">{item.label}</span>
            </div>
            <p className="mt-1 text-lg font-semibold text-[#10223d]">
              {item.value}
              <span className="ml-2 text-xs font-medium text-slate-500">{((item.value / safeTotal) * 100).toFixed(1)}%</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryGrid({ report }: { report: PuntoCoronaRouteReport }) {
  const summary = report.summary;

  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<MapPinCheck />} label="% entrega en rango" value={`${summary.deliveryRangePercent.toFixed(2)}%`} tone="emerald" />
      <Metric icon={<CheckCircle2 />} label="% modulacion" value={`${summary.modulationPercent.toFixed(2)}%`} tone="blue" />
      <Metric icon={<XCircle />} label="Fuera de rango" value={summary.outOfRange} tone="red" />
      <Metric icon={<Clock3 />} label="Visitas abiertas" value={summary.openRows} tone="amber" />
    </div>
  );
}

function Charts({ report }: { report: PuntoCoronaRouteReport }) {
  const summary = report.summary;

  return (
    <div className="mb-5 grid gap-4 xl:grid-cols-[380px_1fr]">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-[#10223d]">Resumen del archivo</h2>
        <div className="mt-5 space-y-4">
          <ProgressBar label="Entrega en rango" value={summary.deliveryRangePercent} color="bg-emerald-500" />
          <ProgressBar label="Modulacion" value={summary.modulationPercent} color="bg-[#1264ff]" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <SmallStat label="Visitados" value={summary.startedRows} />
          <SmallStat label="No iniciados" value={summary.ignoredNotStarted} />
          <SmallStat label="Concluidos" value={summary.concluded} />
          <SmallStat label="Rechazados" value={summary.returned} />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[#10223d]">Graficas del reporte</h2>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{summary.startedRows} visitas</span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <DonutChart
            color="#10b981"
            label="Entrega en rango"
            total={summary.startedRows}
            value={summary.inRange}
          />
          <DonutChart
            color="#1264ff"
            label="Modulacion"
            total={summary.concluded + summary.returned}
            value={summary.concluded}
          />
        </div>
      </div>
    </div>
  );
}

function CrewTable({ crews }: { crews: PuntoCoronaCrewSummary[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-[#10223d]">Detalle por tripulacion</h2>
        <span className="text-sm font-medium text-slate-500">{crews.length} registros</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-4 py-3">DT</th>
              <th className="px-4 py-3">Tripulacion</th>
              <th className="px-4 py-3">Placa</th>
              <th className="px-4 py-3 text-right">Visitados</th>
              <th className="px-4 py-3 text-right">En rango</th>
              <th className="px-4 py-3 text-right">Fuera</th>
              <th className="px-4 py-3 text-right">% rango</th>
              <th className="px-4 py-3 text-right">% modulacion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {crews.map((crew) => (
              <tr className="hover:bg-slate-50/70" key={crew.key}>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-[#10223d]">{crew.dt}</td>
                <td className="min-w-56 px-4 py-3 text-slate-700">{crew.driverName}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{crew.truckLicensePlate}</td>
                <td className="px-4 py-3 text-right font-medium">{crew.totalStarted}</td>
                <td className="px-4 py-3 text-right text-emerald-700">{crew.inRange}</td>
                <td className="px-4 py-3 text-right text-red-700">{crew.outOfRange}</td>
                <td className="px-4 py-3 text-right font-semibold">{crew.deliveryRangePercent.toFixed(2)}%</td>
                <td className="px-4 py-3 text-right font-semibold">{crew.modulationPercent.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  tone: "emerald" | "blue" | "red" | "amber";
}) {
  const styles = {
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`grid h-10 w-10 place-items-center rounded-md ${styles[tone]}`}>
        <span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}

function ProgressBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        <span className="text-sm font-semibold text-[#10223d]">{value.toFixed(2)}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function DonutChart({
  color,
  label,
  total,
  value,
}: {
  color: string;
  label: string;
  total: number;
  value: number;
}) {
  const percent = total ? Number(((value / total) * 100).toFixed(2)) : 0;
  const background = `conic-gradient(${color} ${percent * 3.6}deg, #e2e8f0 0deg)`;

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center gap-4">
        <div className="grid h-28 w-28 shrink-0 place-items-center rounded-full" style={{ background }}>
          <div className="grid h-20 w-20 place-items-center rounded-full bg-white">
            <span className="text-xl font-semibold text-[#10223d]">{percent.toFixed(1)}%</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#10223d]">{label}</p>
          <p className="mt-1 text-sm text-slate-500">
            {value} de {total || 0}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <section className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-slate-300 bg-white/70 p-8 text-center">
      <div>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-md bg-emerald-50 text-emerald-700">
          <FileSpreadsheet className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-[#10223d]">Sin reporte cargado</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
          Sube el archivo descargado de rutas. La carga nueva reemplaza el reporte actual del dia y conserva el cierre
          cuando lo guardes.
        </p>
        <button
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          onClick={onUpload}
          type="button"
        >
          <Upload className="h-4 w-4" />
          Subir archivo
        </button>
      </div>
    </section>
  );
}

function formatDate(date: string) {
  if (!date) return "Sin fecha";
  return new Date(`${date}T00:00:00`).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
