"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  LockKeyhole,
  MapPinCheck,
  RotateCcw,
  Save,
  Truck,
  Upload,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  getDispatchDateKey,
  MODULACION_STORAGE_KEY,
  normalizeDt,
  readModulacionRegistros,
  type ModulacionRegistro,
} from "../lib/modulacionStorage";
import {
  PUNTO_CORONA_ROUTES_STORAGE_KEY,
  readPuntoCoronaRouteReports,
  savePuntoCoronaRouteReports,
  type PuntoCoronaCrewSummary,
  type PuntoCoronaRouteReport,
  type PuntoCoronaRouteRow,
} from "../lib/puntoCoronaRoutesStorage";
import { refreshRemoteRecords } from "../lib/remoteStore";
import { saveSeguimientoVehiculos, SEGUIMIENTO_STORAGE_KEY } from "../lib/seguimientoStorage";
import { notifyStorageChange, useStorageSnapshot } from "../lib/storageEvents";
import { CONTRACTORS } from "../lib/contractors";
import { loadSeguimientoVehiculos, prepareSeguimientoVehicles } from "../seguimiento/services/vehicleRecords";
import type { Vehiculo } from "../seguimiento/types";
import { downloadPuntoCoronaPdf } from "./pdfReportService";
import { createClosureReport, parsePuntoCoronaRouteFile } from "./routeReportService";

const DATA_REFRESH_MS = 30_000;
const ALLOWED_CONTRACTORS = new Set<string>(CONTRACTORS);
const NOT_STARTED = "NOT_STARTED";
const RETURNED = "DEFINITELY_RETURNED";
const WAITING_MODULATION = "WAITING_MODULATION";
const PARTIAL_DELIVERY = "PARTIAL_DELIVERY";

type AccessState = "checking" | "allowed" | "denied";
type RangeDetail = "inRange" | "outOfRange" | "unvalidated";
type ModulationDetail = "modulated" | `cause:${string}`;

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
  const modulaciones = useStorageSnapshot<ModulacionRegistro[]>(
    [MODULACION_STORAGE_KEY],
    readModulacionRegistros,
    [],
  );
  const [access, setAccess] = useState<AccessState>("checking");
  const [message, setMessage] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [selectedRangeDetail, setSelectedRangeDetail] = useState<RangeDetail | null>(null);
  const [selectedModulationDetail, setSelectedModulationDetail] = useState<ModulationDetail | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [contractor, setContractor] = useState("");

  useEffect(() => {
    fetch("/api/session/session", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body) => {
        const session = body?.session;
        const sessionContractor = session?.contractor || "";
        setContractor(sessionContractor);
        setAccess(!session?.isAdmin && ALLOWED_CONTRACTORS.has(sessionContractor) ? "allowed" : "denied");
      })
      .catch(() => setAccess("denied"));
  }, []);

  useEffect(() => {
    void refreshRemoteRecords("/api/seguimiento");
    void refreshRemoteRecords("/api/punto-corona-routes");
    void refreshRemoteRecords("/api/modulaciones");

    const interval = window.setInterval(() => {
      void refreshRemoteRecords("/api/seguimiento");
      void refreshRemoteRecords("/api/punto-corona-routes");
      void refreshRemoteRecords("/api/modulaciones");
    }, DATA_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, []);

  const availableDates = useMemo(() => {
    return Array.from(new Set(reports.filter((report) => report.contractor === contractor).map((report) => report.operationalDate).filter(Boolean))).sort().reverse();
  }, [contractor, reports]);

  useEffect(() => {
    if (selectedDate || !availableDates.length) return;
    setSelectedDate(availableDates[0]);
  }, [availableDates, selectedDate]);

  const activeDate = selectedDate || availableDates[0] || "";
  const currentReport = useMemo(
    () => reports.find((report) => report.contractor === contractor && report.operationalDate === activeDate && report.kind === "current") ?? null,
    [activeDate, contractor, reports],
  );
  const closureReport = useMemo(
    () => reports.find((report) => report.contractor === contractor && report.operationalDate === activeDate && report.kind === "closure") ?? null,
    [activeDate, contractor, reports],
  );
  const visibleReport = closureReport ?? currentReport ?? null;

  useEffect(() => {
    setSelectedRangeDetail(null);
    setSelectedModulationDetail(null);
  }, [activeDate, visibleReport?.id]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    let seguimientoContratista = seguimientoVehicles;
    if (!seguimientoContratista.length) {
      await refreshRemoteRecords("/api/seguimiento", { force: true });
      seguimientoContratista = loadSeguimientoVehiculos();
    }

    if (!seguimientoContratista.length) {
      setMessage(`Primero debe estar cargado el seguimiento de ${contractor} para cruzar los DT.`);
      return;
    }

    setIsImporting(true);
    setMessage("");

    try {
      const report = await parsePuntoCoronaRouteFile(file, seguimientoContratista, contractor);
      await savePuntoCoronaRouteReports([report]);
      const clientSync = await updateSeguimientoClientsFromBees(seguimientoContratista, report);
      setSelectedDate(report.operationalDate);
      setMessage(
        `Archivo cargado. Se tomaron ${report.summary.matchedDts} DT del seguimiento actual y se actualizaron clientes en ${clientSync.updated} DT.`,
      );
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
      await downloadPuntoCoronaPdf(visibleReport, modulaciones);
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
          <h1 className="mt-4 text-xl font-semibold text-[#10223d]">Modulo Rango</h1>
          <p className="mt-2 text-sm text-slate-500">Este modulo solo esta disponible para sesiones de contratistas.</p>
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
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{contractor || "Contratista"}</p>
              <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                <h1 className="truncate text-2xl font-semibold text-[#10223d]">Rango</h1>
                <p className="pb-0.5 text-xs font-semibold text-slate-500">
                  Ultima carga: {visibleReport?.uploadedAt ? formatDateTime(visibleReport.uploadedAt) : "Sin archivo"}
                </p>
              </div>
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
            <SummaryGrid modulaciones={modulaciones} report={visibleReport} />
            <Charts modulaciones={modulaciones} report={visibleReport} />
            <StatusCharts
              modulaciones={modulaciones}
              onSelectModulation={(detail) => {
                setSelectedModulationDetail(detail);
                setSelectedRangeDetail(null);
              }}
              onSelectRange={(range) => {
                setSelectedRangeDetail(range);
                setSelectedModulationDetail(null);
              }}
              report={visibleReport}
              selectedModulation={selectedModulationDetail}
              selectedRange={selectedRangeDetail}
            />
            {selectedRangeDetail ? (
              <RangeClientDetail onClose={() => setSelectedRangeDetail(null)} range={selectedRangeDetail} report={visibleReport} />
            ) : null}
            {selectedModulationDetail ? (
              <ModulationClientDetail detail={selectedModulationDetail} modulaciones={modulaciones} onClose={() => setSelectedModulationDetail(null)} report={visibleReport} />
            ) : null}
            <CrewTable modulaciones={modulaciones} report={visibleReport} />
          </>
        ) : (
          <EmptyState onUpload={() => fileInputRef.current?.click()} />
        )}
      </section>
    </main>
  );
}

function StatusCharts({
  modulaciones,
  onSelectModulation,
  onSelectRange,
  report,
  selectedModulation,
  selectedRange,
}: {
  modulaciones: ModulacionRegistro[];
  onSelectModulation: (detail: ModulationDetail) => void;
  onSelectRange: (range: RangeDetail) => void;
  report: PuntoCoronaRouteReport;
  selectedModulation: ModulationDetail | null;
  selectedRange: RangeDetail | null;
}) {
  const summary = report.summary;
  const modulationStats = getReportModulationStats(report, modulaciones);
  const deliveryItems = [
    { color: "bg-emerald-500", key: "inRange", label: "Visitas iniciadas en rango", value: summary.inRange },
    { color: "bg-red-500", key: "outOfRange", label: "Visitas iniciadas fuera de rango", value: summary.outOfRange },
    { color: "bg-slate-300", key: "unvalidated", label: "Visitas iniciadas sin validacion", value: Math.max(summary.startedRows - summary.inRange - summary.outOfRange, 0) },
  ];
  const modulationItems = [
    { color: "bg-[#1264ff]", key: "modulated", label: "Visitas moduladas", value: modulationStats.modulated },
    ...modulationStats.causes.map((cause) => ({
      color: getCauseColor(cause.label),
      key: `cause:${cause.label}`,
      label: cause.label,
      value: cause.value,
    })),
  ];

  return (
    <div className="mb-5 grid gap-4 lg:grid-cols-2">
      <StackedChart
        items={deliveryItems}
        onSelectItem={(key) => onSelectRange(key as RangeDetail)}
        selectedKey={selectedRange ?? undefined}
        title="Distribucion de entrega en rango"
        total={summary.startedRows}
      />
      <StackedChart
        items={modulationItems}
        onSelectItem={(key) => onSelectModulation(key as ModulationDetail)}
        selectedKey={selectedModulation ?? undefined}
        title="Distribucion de modulacion"
        total={summary.startedRows}
      />
    </div>
  );
}

function StackedChart({
  items,
  onSelectItem,
  selectedKey,
  title,
  total,
}: {
  items: Array<{ color: string; key?: string; label: string; value: number }>;
  onSelectItem?: (key: string) => void;
  selectedKey?: string;
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
        {items.map((item) => {
          const isInteractive = Boolean(item.key && onSelectItem);
          return (
            <button
              aria-label={`${item.label}: ${item.value}`}
              className={`${item.color} min-w-0 transition ${isInteractive ? "cursor-pointer hover:brightness-95" : "cursor-default"}`}
              disabled={!isInteractive}
              key={item.label}
              onClick={() => item.key && onSelectItem?.(item.key)}
              style={{ width: `${(item.value / safeTotal) * 100}%` }}
              title={`${item.label}: ${item.value}`}
              type="button"
            />
          );
        })}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {items.map((item) => {
          const isInteractive = Boolean(item.key && onSelectItem);
          const isSelected = item.key && item.key === selectedKey;
          return (
          <button
            className={`rounded-md border bg-slate-50 px-3 py-2 text-left transition ${
              isSelected ? "border-[#10223d] ring-2 ring-[#10223d]/10" : "border-slate-100"
            } ${isInteractive ? "hover:border-[#10223d]/30 hover:bg-white" : "cursor-default"}`}
            disabled={!isInteractive}
            key={item.label}
            onClick={() => item.key && onSelectItem?.(item.key)}
            type="button"
          >
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
              <span className="truncate text-xs font-semibold text-slate-600">{item.label}</span>
            </div>
            <p className="mt-1 text-lg font-semibold text-[#10223d]">
              {item.value}
              <span className="ml-2 text-xs font-medium text-slate-500">{((item.value / safeTotal) * 100).toFixed(1)}%</span>
            </p>
          </button>
        );
        })}
      </div>
    </div>
  );
}

function RangeClientDetail({ onClose, range, report }: { onClose: () => void; range: RangeDetail; report: PuntoCoronaRouteReport }) {
  const rows = getRowsForRange(report, range);
  const title = getRangeTitle(range);

  return (
    <section className="mb-5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-[#10223d]">{title}</h2>
          <p className="text-xs text-slate-500">Clientes del archivo seleccionado para {formatDate(report.operationalDate)}.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{rows.length} clientes</span>
          <button className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full min-w-[760px] table-fixed text-xs">
          <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="w-24 px-3 py-2 text-left">DT</th>
              <th className="w-24 px-3 py-2 text-left">Placa</th>
              <th className="w-44 px-3 py-2 text-left">Cliente</th>
              <th className="w-48 px-3 py-2 text-left">Tripulacion</th>
              <th className="px-3 py-2 text-left">Motivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length ? (
              rows.map((row) => (
                <tr className={range === "outOfRange" ? "bg-red-50/45" : "bg-white"} key={row.id}>
                  <td className="px-3 py-2 font-semibold text-[#10223d]">{row.dt || "-"}</td>
                  <td className="px-3 py-2 text-slate-700">{row.truckLicensePlate || "-"}</td>
                  <td className="px-3 py-2">
                    <span className="block truncate font-semibold text-[#10223d]" title={row.pocName || row.pocExternalId}>{row.pocName || "Sin nombre"}</span>
                    <span className="block truncate text-[10px] text-slate-500">{row.pocExternalId || "Sin codigo"}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{row.driverName || "-"}</td>
                  <td className="px-3 py-2 text-slate-600">{getRangeReason(row, range)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-8 text-center text-sm font-medium text-slate-500" colSpan={5}>
                  No hay clientes para este grupo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModulationClientDetail({
  detail,
  modulaciones,
  onClose,
  report,
}: {
  detail: ModulationDetail;
  modulaciones: ModulacionRegistro[];
  onClose: () => void;
  report: PuntoCoronaRouteReport;
}) {
  const rows = getRowsForModulationDetail(report, modulaciones, detail);
  const title = getModulationDetailTitle(detail);

  return (
    <section className="mb-5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-[#10223d]">{title}</h2>
          <p className="text-xs text-slate-500">Clientes del archivo seleccionado para {formatDate(report.operationalDate)}.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{rows.length} clientes</span>
          <button className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>
      </div>
      <div className="max-h-72 overflow-auto">
        <table className="w-full min-w-[760px] table-fixed text-xs">
          <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="w-24 px-3 py-2 text-left">DT</th>
              <th className="w-24 px-3 py-2 text-left">Placa</th>
              <th className="w-44 px-3 py-2 text-left">Cliente</th>
              <th className="w-48 px-3 py-2 text-left">Tripulacion</th>
              <th className="px-3 py-2 text-left">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length ? (
              rows.map((row) => (
                <tr className="bg-white" key={row.id}>
                  <td className="px-3 py-2 font-semibold text-[#10223d]">{row.dt || "-"}</td>
                  <td className="px-3 py-2 text-slate-700">{row.truckLicensePlate || "-"}</td>
                  <td className="px-3 py-2">
                    <span className="block truncate font-semibold text-[#10223d]" title={row.pocName || row.pocExternalId}>{row.pocName || "Sin nombre"}</span>
                    <span className="block truncate text-[10px] text-slate-500">{row.pocExternalId || "Sin codigo"}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{row.driverName || "-"}</td>
                  <td className="px-3 py-2 text-slate-600">{getModulationDetailReason(row, detail)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-8 text-center text-sm font-medium text-slate-500" colSpan={5}>
                  No hay clientes para este grupo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryGrid({ modulaciones, report }: { modulaciones: ModulacionRegistro[]; report: PuntoCoronaRouteReport }) {
  const summary = report.summary;
  const modulationStats = getReportModulationStats(report, modulaciones);

  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<MapPinCheck />} label="% entrega en rango" value={`${summary.deliveryRangePercent.toFixed(2)}%`} tone="emerald" />
      <Metric icon={<CheckCircle2 />} label="% modulacion real" value={`${modulationStats.percent.toFixed(2)}%`} tone="blue" />
      <Metric icon={<CheckCircle2 />} label="Moduladas" value={modulationStats.modulated} tone="blue" />
      <Metric icon={<XCircle />} label="Fuera de rango" value={summary.outOfRange} tone="red" />
    </div>
  );
}

function Charts({ modulaciones, report }: { modulaciones: ModulacionRegistro[]; report: PuntoCoronaRouteReport }) {
  const summary = report.summary;
  const modulationStats = getReportModulationStats(report, modulaciones);

  return (
    <div className="mb-5 grid gap-4 xl:grid-cols-[380px_1fr]">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-[#10223d]">Resumen del archivo</h2>
        <div className="mt-5 space-y-4">
          <ProgressBar label="Entrega en rango" value={summary.deliveryRangePercent} color="bg-emerald-500" />
          <ProgressBar label="Modulacion real" value={modulationStats.percent} color="bg-[#1264ff]" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <SmallStat label="Visitas iniciadas" value={summary.startedRows} />
          <SmallStat label="Moduladas" value={modulationStats.modulated} />
          {modulationStats.causes.slice(0, 2).map((cause) => (
            <SmallStat key={cause.label} label={cause.label} value={cause.value} />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[#10223d]">Graficas del reporte</h2>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{summary.startedRows} visitas</span>
        </div>
        <div className="mt-5 grid gap-4">
          <DonutChart
            color="#10b981"
            label="Entrega en rango"
            total={summary.startedRows}
            value={summary.inRange}
          />
          <DonutChart
            color="#1264ff"
            label="Modulacion real"
            total={modulationStats.modulated + modulationStats.rejected}
            value={modulationStats.modulated}
          />
        </div>
      </div>
    </div>
  );
}

function CrewTable({ modulaciones, report }: { modulaciones: ModulacionRegistro[]; report: PuntoCoronaRouteReport }) {
  const crews = report.summary.crews;

  return (
    <div className="data-shell rounded-lg">
      <div className="flex items-center justify-between border-b border-slate-200/70 bg-white/78 px-4 py-3 backdrop-blur">
        <div>
          <h2 className="text-base font-semibold text-[#10223d]">Detalle por tripulacion</h2>
          <p className="text-xs text-slate-500">Resumen por placa del reporte de rango.</p>
        </div>
        <span className="rounded-md border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-xs font-bold text-[#07556b]">{crews.length} registros</span>
      </div>
      <div className="max-h-[620px] overflow-auto">
        <table className="data-table w-full min-w-[980px] table-fixed text-[10px]">
          <thead className="sticky top-0 z-10 text-[9px] uppercase tracking-[0.08em]">
            <tr>
              <th className="w-28 px-2 py-1.5 text-left">Placa</th>
              <th className="w-44 px-2 py-1.5 text-left">Tripulacion</th>
              <th className="w-20 px-2 py-1.5 text-right">Iniciadas</th>
              <th className="w-20 px-2 py-1.5 text-right">En rango</th>
              <th className="w-20 px-2 py-1.5 text-right">Fuera</th>
              <th className="w-24 px-2 py-1.5 text-right">% entrega</th>
              <th className="w-24 px-2 py-1.5 text-right">Moduladas</th>
              <th className="w-36 px-2 py-1.5 text-right">Causales</th>
              <th className="w-24 px-2 py-1.5 text-right">% mod.</th>
              <th className="w-32 px-2 py-1.5 text-right">Avance seg.</th>
            </tr>
          </thead>
          <tbody>
            {crews.map((crew) => {
              const modulationStats = getCrewModulationStats(report, crew, modulaciones);

              return (
                <tr key={crew.key}>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-gradient-to-br from-[#10223d] to-[#1264ff] text-white shadow-sm">
                        <Truck size={13} />
                      </span>
                      <span className="truncate font-semibold text-[#10223d]" title={crew.truckLicensePlate}>
                        {crew.truckLicensePlate}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <span className="block truncate rounded bg-white/62 px-1.5 py-1 text-[10px] font-semibold text-[#10223d]" title={crew.driverName}>
                      {crew.driverName}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right"><span className="number-pill">{crew.totalStarted}</span></td>
                  <td className="px-2 py-1 text-right text-emerald-700"><span className="number-pill border-emerald-100 bg-emerald-50">{crew.inRange}</span></td>
                  <td className="px-2 py-1 text-right text-red-700"><span className="number-pill border-red-100 bg-red-50">{crew.outOfRange}</span></td>
                  <td className="px-2 py-1 text-right font-semibold text-[#10223d]">{crew.deliveryRangePercent.toFixed(2)}%</td>
                  <td className="px-2 py-1 text-right text-[#07556b]"><span className="number-pill border-cyan-100 bg-cyan-50">{modulationStats.modulated}</span></td>
                  <td className="px-2 py-1 text-right">
                    <CausePills causes={modulationStats.causes} />
                  </td>
                  <td className="px-2 py-1 text-right font-semibold text-[#10223d]">{modulationStats.percent.toFixed(2)}%</td>
                  <td className="px-2 py-1 text-right font-semibold text-slate-700">{formatSeguimientoProgress(crew)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getRowsForRange(report: PuntoCoronaRouteReport, range: RangeDetail) {
  return report.rows
    .filter((row) => row.status !== NOT_STARTED)
    .filter((row) => {
      if (range === "inRange") return row.withinRadius === true;
      if (range === "outOfRange") return row.withinRadius === false;
      return row.withinRadius !== true && row.withinRadius !== false;
    })
    .sort((a, b) => a.dt.localeCompare(b.dt, "es-CO", { numeric: true }) || a.pocName.localeCompare(b.pocName, "es-CO"));
}

function getRowsForModulationDetail(report: PuntoCoronaRouteReport, modulaciones: ModulacionRegistro[], detail: ModulationDetail) {
  const modulationKeys = getReportModulationKeys(report, modulaciones);
  const candidateRows = report.rows.filter((row) => row.status !== NOT_STARTED && isRejectedForModulation(row.status));

  return candidateRows
    .filter((row) => {
      const isModulated = modulationKeys.has(getRouteModulationKey(row));
      if (detail === "modulated") return isModulated;

      return !isModulated && getPendingCauseLabel(row) === getModulationDetailCause(detail);
    })
    .sort((a, b) => a.dt.localeCompare(b.dt, "es-CO", { numeric: true }) || a.pocName.localeCompare(b.pocName, "es-CO"));
}

function getRangeTitle(range: RangeDetail) {
  if (range === "inRange") return "Clientes en rango";
  if (range === "outOfRange") return "Clientes fuera de rango";
  return "Clientes sin validacion de rango";
}

function getModulationDetailTitle(detail: ModulationDetail) {
  if (detail === "modulated") return "Clientes modulados";
  return `Clientes con ${getModulationDetailCause(detail)}`;
}

function getRangeReason(row: PuntoCoronaRouteRow, range: RangeDetail) {
  if (range === "inRange") return "Visita iniciada en rango";
  if (range === "unvalidated") return "Sin validacion de rango";

  const reason = (row.outOfRadiusReason || row.skippedReason || "").trim();
  return reason || "Fuera de rango";
}

function getModulationDetailReason(row: PuntoCoronaRouteRow, detail: ModulationDetail) {
  if (detail === "modulated") return "Visita modulada";
  return getPendingCauseLabel(row);
}

function getModulationDetailCause(detail: ModulationDetail) {
  return detail.startsWith("cause:") ? detail.slice("cause:".length) : "";
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

function CausePills({ causes }: { causes: Array<{ label: string; value: number }> }) {
  if (!causes.length) {
    return <span className="text-[10px] font-semibold text-slate-400">-</span>;
  }

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {causes.map((cause) => (
        <span className="number-pill min-w-0 border-amber-100 bg-amber-50 text-[10px] text-amber-700" key={cause.label} title={cause.label}>
          {cause.label}: {cause.value}
        </span>
      ))}
    </div>
  );
}

function formatSeguimientoProgress(crew: PuntoCoronaCrewSummary) {
  const visitados = Number(crew.seguimientoVisitados || 0);
  const clientes = Number(crew.seguimientoClientes || 0);
  const progress = Number(crew.seguimientoProgress || 0);

  if (!clientes) return "Sin dato";
  return `${visitados}/${clientes} (${progress.toFixed(2)}%)`;
}

function getReportModulationStats(report: PuntoCoronaRouteReport, modulaciones: ModulacionRegistro[]) {
  return getModulationStats(report.rows, getReportModulationKeys(report, modulaciones));
}

function getCrewModulationStats(report: PuntoCoronaRouteReport, crew: PuntoCoronaCrewSummary, modulaciones: ModulacionRegistro[]) {
  return getModulationStats(
    report.rows.filter(
      (row) =>
        row.dt === crew.dt &&
        row.driverName === crew.driverName &&
        row.truckLicensePlate === crew.truckLicensePlate,
    ),
    getReportModulationKeys(report, modulaciones),
  );
}

function getModulationStats(rows: PuntoCoronaRouteRow[], modulationKeys: Set<string>) {
  const startedRows = rows.filter((row) => row.status !== NOT_STARTED);
  const rejectedCandidateRows = startedRows.filter((row) => isRejectedForModulation(row.status));
  const modulated = new Set(rejectedCandidateRows.map(getRouteModulationKey).filter((key) => key && modulationKeys.has(key))).size;
  const rejectedRows = rejectedCandidateRows.filter((row) => !modulationKeys.has(getRouteModulationKey(row)));
  const rejected = rejectedRows.length;
  const open = startedRows.length - modulated - rejected;

  return {
    modulated,
    rejected,
    causes: getCauseCounts(rejectedRows),
    open,
    percent: getRealModulationPercent(modulated, rejected),
  };
}

function isRejectedForModulation(status: string) {
  return status === RETURNED || status === WAITING_MODULATION || status === PARTIAL_DELIVERY;
}

function getCauseCounts(rows: PuntoCoronaRouteRow[]) {
  const counts = new Map<string, number>();

  rows.forEach((row) => {
    const label = getPendingCauseLabel(row);
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function getPendingCauseLabel(row: PuntoCoronaRouteRow) {
  if (row.status === WAITING_MODULATION) return "Esperando mod.";
  if (row.status === PARTIAL_DELIVERY) return "Visita parcial";

  const causal = (row.skippedReason || row.outOfRadiusReason || "").trim();
  return causal || "Devuelta";
}

function getCauseColor(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("parcial")) return "bg-amber-400";
  if (normalized.includes("esperando")) return "bg-cyan-500";
  return "bg-red-500";
}

function getReportModulationKeys(report: PuntoCoronaRouteReport, modulaciones: ModulacionRegistro[]) {
  const routeKeys = new Set(report.rows.map(getRouteModulationKey).filter(Boolean));
  const keys = new Set<string>();

  modulaciones.forEach((record) => {
    if (record.contratista && report.contractor && record.contratista !== report.contractor) return;
    if (getDispatchDateKey(record) !== report.operationalDate) return;

    const key = getRecordModulationKey(record);
    if (key && routeKeys.has(key)) keys.add(key);
  });

  return keys;
}

function getRouteModulationKey(row: Pick<PuntoCoronaRouteRow, "dt" | "pocExternalId">) {
  const dt = normalizeDt(row.dt);
  const cliente = normalizeClienteCode(row.pocExternalId);
  return dt && cliente ? `${dt}:${cliente}` : "";
}

function getRecordModulationKey(record: Pick<ModulacionRegistro, "dt" | "codigoCliente">) {
  const dt = normalizeDt(record.dt);
  const cliente = normalizeClienteCode(record.codigoCliente);
  return dt && cliente ? `${dt}:${cliente}` : "";
}

function normalizeClienteCode(value: string | number | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

async function updateSeguimientoClientsFromBees(vehicles: Vehiculo[], report: PuntoCoronaRouteReport) {
  const statsByDt = getBeesClientStatsByDt(report);
  if (!statsByDt.size) return { updated: 0 };

  const exactDateDts = new Set(
    vehicles
      .filter((vehicle) => getVehicleDateKey(vehicle) === report.operationalDate)
      .map((vehicle) => normalizeDt(vehicle.transporte))
      .filter(Boolean),
  );
  let updated = 0;

  const nextVehicles = vehicles.map((vehicle) => {
    const dt = normalizeDt(vehicle.transporte);
    const stats = statsByDt.get(dt);
    if (!dt || !stats) return vehicle;
    if (exactDateDts.has(dt) && getVehicleDateKey(vehicle) !== report.operationalDate) return vehicle;

    const clientes = Math.max(Number(vehicle.clientes || 0), stats.clientes);
    const visitados = Math.max(Number(vehicle.visitados || 0), stats.visitados);
    updated += 1;
    return {
      ...vehicle,
      clientes,
      visitados: Math.min(visitados, clientes || visitados),
    };
  });

  if (updated) {
    await saveSeguimientoVehiculos(prepareSeguimientoVehicles(nextVehicles));
  }

  return { updated };
}

function getBeesClientStatsByDt(report: PuntoCoronaRouteReport) {
  const statsByDt = new Map<string, { clientes: Set<string>; visitados: Set<string> }>();

  report.rows.forEach((row) => {
    const dt = normalizeDt(row.dt);
    const clientKey = normalizeClienteCode(row.pocExternalId) || row.id;
    if (!dt || !clientKey) return;

    const stats = statsByDt.get(dt) || { clientes: new Set<string>(), visitados: new Set<string>() };
    stats.clientes.add(clientKey);
    if (row.status !== NOT_STARTED) stats.visitados.add(clientKey);
    statsByDt.set(dt, stats);
  });

  return new Map(
    Array.from(statsByDt.entries()).map(([dt, stats]) => [
      dt,
      {
        clientes: stats.clientes.size,
        visitados: stats.visitados.size,
      },
    ]),
  );
}

function getVehicleDateKey(vehicle: Pick<Vehiculo, "fechaDespacho" | "date" | "createdAt">) {
  const value = vehicle.fechaDespacho || vehicle.date || vehicle.createdAt;
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(Number);
    if (day && month && year) return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function getRealModulationPercent(modulated: number, rejected: number) {
  const totalWithResult = modulated + rejected;
  return totalWithResult ? Number(((modulated / totalWithResult) * 100).toFixed(2)) : 0;
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
