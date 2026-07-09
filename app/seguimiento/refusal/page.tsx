"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, CalendarDays, CheckCircle2, ClipboardList, Package, TrendingDown, Users, X, XCircle } from "lucide-react";
import { AnalyticsDateRangeFilter, normalizeDateRange } from "../components/AnalyticsDateFilter";
import { AnalyticsViewToggle } from "../components/AnalyticsViewToggle";
import { CHECKIN_STORAGE_KEY, getCheckinByDt, readCheckinCajasRegistros, type CheckinCajasRegistro } from "../../lib/checkinStorage";
import { getLocalDateKey, MODULACION_STORAGE_KEY, normalizeDt, readModulacionRegistros, summarizeModulaciones, type ModulacionRegistro } from "../../lib/modulacionStorage";
import { SEGUIMIENTO_STORAGE_KEY } from "../../lib/seguimientoStorage";
import { useStorageSnapshot } from "../../lib/storageEvents";
import { useContractorBrand } from "../../lib/contractorBranding";
import { loadSeguimientoVehiculos } from "../services/vehicleRecords";
import type { Vehiculo } from "../types";
import { getProgress, getStatus, normalizeCajasTotal } from "../utils";

const PALETTE = {
  safe: "#00b8d9",
  danger: "#ef4444",
  track: "#e2e8f0",
};

const EMPTY_MODULACIONES: ModulacionRegistro[] = [];
const EMPTY_CHECKINS: CheckinCajasRegistro[] = [];

export default function SeguimientoRefusalPage() {
  const router = useRouter();
  const brand = useContractorBrand();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyMode, setHistoryMode] = useState<HistoryMode>("day");
  const [dateRange, setDateRange] = useState(() => {
    const today = todayKey();
    return { from: today, to: today };
  });
  const vehicles = useStorageSnapshot<Vehiculo[]>([SEGUIMIENTO_STORAGE_KEY], loadSeguimientoVehiculos, []);
  const allModulaciones = useStorageSnapshot<ModulacionRegistro[]>([MODULACION_STORAGE_KEY], readModulacionRegistros, EMPTY_MODULACIONES);
  const checkins = useStorageSnapshot<CheckinCajasRegistro[]>([CHECKIN_STORAGE_KEY], readCheckinCajasRegistros, EMPTY_CHECKINS);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fecha = params.get("fecha") || todayKey();
    setDateRange(normalizeDateRange(params.get("desde") || fecha, params.get("hasta") || fecha));
  }, []);

  const activeVehiculos = useMemo(() => {
    const loaded = loadSeguimientoVehiculos();
    return loaded.length ? loaded : vehicles;
  }, [vehicles]);

  const rangeVehicles = useMemo(() => activeVehiculos.filter((vehicle) => isVehicleInRange(vehicle, dateRange)), [activeVehiculos, dateRange]);
  const seguimientoDts = useMemo(() => new Set(activeVehiculos.map((vehicle) => normalizeDt(vehicle.transporte)).filter(Boolean)), [activeVehiculos]);
  const modulaciones = useMemo(
    () => allModulaciones.filter((registro) => isDateInRange(getModulacionDateKey(registro), dateRange) && seguimientoDts.has(normalizeDt(registro.dt))),
    [allModulaciones, dateRange, seguimientoDts],
  );

  const refusalData = useMemo(() => {
    const totalCajasSeguimiento = normalizeCajasTotal(rangeVehicles.reduce((acc, vehicle) => acc + (vehicle.cajas || 0), 0));
    const seguimientoKeys = new Set(rangeVehicles.map((vehicle) => `${normalizeDt(vehicle.transporte)}:${getVehicleDateKey(vehicle)}`).filter(Boolean));
    const byVehicle = rangeVehicles.map((vehicle) => {
      const vehicleKey = `${normalizeDt(vehicle.transporte)}:${getVehicleDateKey(vehicle)}`;
      const registrosDt = modulaciones.filter((registro) => `${normalizeDt(registro.dt)}:${getModulacionDateKey(registro)}` === vehicleKey);
      const checkin = getCheckinByDt(checkins, vehicle.transporte);

      return summarizeModulaciones(registrosDt, vehicle.cajas || 0, checkin?.totalCajas);
    });
    const modulacionesSinSeguimiento = modulaciones.filter((registro) => !seguimientoKeys.has(`${normalizeDt(registro.dt)}:${getModulacionDateKey(registro)}`));
    const resumenSinSeguimiento = summarizeModulaciones(modulacionesSinSeguimiento, 0);
    const rechazadas = byVehicle.reduce((acc, resumen) => acc + resumen.cajasRechazadas, 0) + resumenSinSeguimiento.cajasRechazadas;
    const gestionadas = byVehicle.reduce((acc, resumen) => acc + resumen.cajasGestionadas, 0) + resumenSinSeguimiento.cajasGestionadas;
    const pendientes = byVehicle.reduce((acc, resumen) => acc + resumen.cajasPendientes, 0) + resumenSinSeguimiento.cajasPendientes;
    const checkinAplicadas = byVehicle.filter((resumen) => resumen.tieneCheckin).length;

    return {
      totalCajasSeguimiento,
      rechazadas,
      gestionadas,
      pendientes,
      checkinAplicadas,
      topeMaximo: Math.floor(totalCajasSeguimiento / 100) || 1,
      porcentaje: totalCajasSeguimiento ? Number(((pendientes / totalCajasSeguimiento) * 100).toFixed(2)) : 0,
    };
  }, [checkins, modulaciones, rangeVehicles]);

  const modulationRows = useMemo(() => {
    const rows = modulaciones
      .map((modulacion) => {
        const vehicle = findVehicleForModulacion(modulacion, rangeVehicles, activeVehiculos);
        const checkin = getCheckinByDt(checkins, modulacion.dt);
        const tieneCheckin = typeof checkin?.totalCajas === "number";

        return {
          bloque: getBloque(vehicle, modulacion),
          cajasRechazo: getCajasRechazoFinal(modulacion, checkin),
          id: modulacion.id,
          responsable: vehicle?.nombreResponsable || vehicle?.responsable || modulacion.personaNombre || modulacion.persona || "Sin responsable",
          status: vehicle ? getStatus(getProgress(vehicle), vehicle) : "Sin seguimiento",
          tieneCheckin,
          vehiculo: vehicle?.vehiculo || `DT ${modulacion.dt}`,
        };
      });

    return groupModulationRowsByVehicle(rows).sort((a, b) => b.cajasRechazo - a.cajasRechazo);
  }, [activeVehiculos, checkins, modulaciones, rangeVehicles]);

  const refusalTone = getRefusalTone(refusalData.porcentaje);
  const historySummaries = useMemo(
    () => buildRefusalHistorySummaries(activeVehiculos, allModulaciones, checkins, historyMode),
    [activeVehiculos, allModulaciones, checkins, historyMode],
  );

  return (
    <main className="min-h-screen text-slate-900">
      <header className="sticky top-0 z-20 border-b border-white/50 bg-white/80 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              aria-label="Volver a seguimiento"
              className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100"
              onClick={() => router.push(dateRange.to ? `/seguimiento?fecha=${encodeURIComponent(dateRange.to)}` : "/seguimiento")}
              type="button"
            >
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#dc2626]">Analitica diaria</p>
              <h1 className="text-2xl font-semibold text-[#10223d]">Control refusal {brand.name}</h1>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <AnalyticsDateRangeFilter value={dateRange} onChange={setDateRange} />
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-[#10223d] shadow-sm transition hover:bg-slate-50"
              onClick={() => setHistoryOpen(true)}
              type="button"
            >
              <BarChart3 size={16} />
              Historico
            </button>
            <AnalyticsViewToggle active="refusal" />
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <RefusalMetric icon={<Package size={21} />} label="Cajas seguimiento" value={refusalData.totalCajasSeguimiento} />
          <RefusalMetric icon={<XCircle size={21} />} label="Rechazadas" value={refusalData.rechazadas} tone="red" />
          <RefusalMetric icon={<CheckCircle2 size={21} />} label="Gestionadas" value={refusalData.gestionadas} tone="green" />
          <RefusalMetric icon={<Users size={21} />} label="Checkins" value={refusalData.checkinAplicadas} tone="amber" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="glass-panel rounded-lg p-4">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-[#10223d]">
                <TrendingDown size={19} />
                <h2 className="text-lg font-semibold">Resumen de refusal</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${refusalTone.badge}`}>{refusalTone.label}</span>
            </div>

            <div className="grid gap-6 md:grid-cols-[220px_1fr] md:items-center">
              <RefusalGauge value={refusalData.pendientes} max={refusalData.topeMaximo} percentage={refusalData.porcentaje} />
              <div className="space-y-4">
                <ProgressLine label="Refusal final" value={refusalData.pendientes} max={refusalData.topeMaximo} color={refusalTone.isDanger ? "bg-red-600" : "bg-gradient-to-r from-[#0f7c58] to-[#00b8d9]"} />
                <ProgressLine label="Gestionadas" value={refusalData.gestionadas} max={refusalData.rechazadas} color="bg-gradient-to-r from-[#0f7c58] to-[#00b8d9]" />
                <div className="rounded-lg border border-cyan-100 bg-cyan-50/70 p-4">
                  <p className="text-sm font-semibold text-[#10223d]">Tope maximo: {refusalData.topeMaximo} cajas</p>
                  <p className="mt-1 text-sm text-slate-500">Usa cajas checkin por DT; si no existen, toma el pendiente modulado actual.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="data-shell rounded-lg">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/78 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-gradient-to-br from-[#10223d] to-[#1264ff] text-white shadow-lg shadow-blue-500/20">
                  <ClipboardList size={18} />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-[#10223d]">Detalle de modulaciones - {brand.name}</h2>
                  <p className="truncate text-xs text-slate-500">Rechazo por ruta, responsable y estado operativo.</p>
                </div>
              </div>
              <span className="shrink-0 rounded-md border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm font-semibold text-[#07556b]">{modulationRows.length}</span>
            </div>

            <div className="max-h-[430px] overflow-y-auto">
              <table className="data-table w-full table-fixed text-[10px]">
                <thead className="sticky top-0 z-10 text-[8px] uppercase tracking-[0.08em]">
                  <tr>
                    <th className="w-[20%] px-2 py-1.5 text-left">Bloque</th>
                    <th className="w-[18%] px-2 py-1.5 text-left">Vehiculo</th>
                    <th className="w-[34%] px-2 py-1.5 text-left">Responsable</th>
                    <th className="w-[16%] px-2 py-1.5 text-left">Status</th>
                    <th className="w-[12%] px-2 py-1.5 text-right">Cajas</th>
                  </tr>
                </thead>
                <tbody>
                  {modulationRows.length ? (
                    modulationRows.map((item, index) => (
                      <tr className={index % 2 === 0 ? "bg-white" : ""} key={item.id}>
                        <td className="truncate px-2 py-1.5 text-[10px] font-semibold text-slate-600" title={item.bloque}>{item.bloque}</td>
                        <td className="px-2 py-1.5" title={item.vehiculo}>
                          <span className="rounded bg-[#e8f7ff] px-1.5 py-0.5 text-[10px] font-bold text-[#07556b]">{item.vehiculo}</span>
                        </td>
                        <td className="truncate px-2 py-1.5 text-[10px] text-slate-600" title={item.responsable}>{item.responsable}</td>
                        <td className="px-2 py-1.5">
                          <span className="inline-flex max-w-full truncate rounded-md border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800" title={item.status}>{item.status}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-[10px] text-slate-700"><span className="number-pill border-red-100 bg-red-50 text-red-700">{item.cajasRechazo}</span></td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-8 text-center text-xs font-medium text-slate-500" colSpan={5}>
                        No se han registrado modulaciones para este dia.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>

      {historyOpen ? (
        <RefusalHistoryModal
          mode={historyMode}
          onClose={() => setHistoryOpen(false)}
          onModeChange={setHistoryMode}
          summaries={historySummaries}
        />
      ) : null}
    </main>
  );
}

type HistoryMode = "day" | "week" | "month";

type RefusalHistorySummary = {
  key: string;
  label: string;
  rangeLabel: string;
  rutas: number;
  totalCajasSeguimiento: number;
  rechazadas: number;
  gestionadas: number;
  pendientes: number;
  porcentaje: number;
};

function RefusalHistoryModal({
  mode,
  onClose,
  onModeChange,
  summaries,
}: {
  mode: HistoryMode;
  onClose: () => void;
  onModeChange: (mode: HistoryMode) => void;
  summaries: RefusalHistorySummary[];
}) {
  const modeLabel = getHistoryModeLabel(mode);
  const totalSeguimiento = summaries.reduce((total, summary) => total + summary.totalCajasSeguimiento, 0);
  const totalRechazadas = summaries.reduce((total, summary) => total + summary.rechazadas, 0);
  const totalGestionadas = summaries.reduce((total, summary) => total + summary.gestionadas, 0);
  const totalPendientes = summaries.reduce((total, summary) => total + summary.pendientes, 0);
  const totalPorcentaje = totalSeguimiento ? Number(((totalPendientes / totalSeguimiento) * 100).toFixed(2)) : 0;
  const worstRefusal = summaries.reduce<RefusalHistorySummary | null>(
    (worst, summary) => (!worst || summary.porcentaje > worst.porcentaje || (summary.porcentaje === worst.porcentaje && summary.pendientes > worst.pendientes) ? summary : worst),
    null,
  );
  const bestManaged = summaries.reduce<RefusalHistorySummary | null>(
    (best, summary) => (!best || summary.gestionadas > best.gestionadas ? summary : best),
    null,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-3 py-5 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-lg bg-white shadow-2xl shadow-slate-950/25">
        <div className="flex flex-col gap-3 border-b border-slate-800 bg-[#10223d] px-5 py-4 text-white sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-white/10 text-red-200 ring-1 ring-white/15">
              <CalendarDays size={19} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-200">Historico refusal</p>
              <h2 className="text-xl font-semibold leading-tight">Lectura consolidada por {modeLabel.toLowerCase()}</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-200">
                Refusal final = cajas rechazadas menos gestionadas. El porcentaje compara lo pendiente contra las cajas del seguimiento.
              </p>
            </div>
          </div>
          <button
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/15 text-slate-200 transition hover:bg-white/10 hover:text-white"
            onClick={onClose}
            type="button"
            aria-label="Cerrar historico refusal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
            <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
              <HistoryModeButton active={mode === "day"} label="Dia" onClick={() => onModeChange("day")} />
              <HistoryModeButton active={mode === "week"} label="Semana" onClick={() => onModeChange("week")} />
              <HistoryModeButton active={mode === "month"} label="Mes" onClick={() => onModeChange("month")} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <HistoryKpi label="Seguimiento" value={formatNumber(totalSeguimiento)} detail={`${summaries.length} periodos`} icon={<Package size={16} />} />
              <HistoryKpi label="Rechazadas" value={formatNumber(totalRechazadas)} detail="reportadas" icon={<XCircle size={16} />} tone="red" />
              <HistoryKpi label="Gestionadas" value={formatNumber(totalGestionadas)} detail="cerradas" icon={<CheckCircle2 size={16} />} tone="green" />
              <HistoryKpi label="Refusal final" value={`${totalPorcentaje.toFixed(2)}%`} detail={`${formatNumber(totalPendientes)} pendientes`} icon={<TrendingDown size={16} />} tone={totalPorcentaje > 1 ? "red" : "green"} />
            </div>
          </div>
        </div>

        <div className="max-h-[66vh] overflow-y-auto bg-slate-50/70 px-5 py-4">
          {summaries.length ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(560px,0.95fr)]">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <InsightCard
                    accent="red"
                    label="Mayor riesgo"
                    title={worstRefusal?.label ?? "-"}
                    detail={worstRefusal ? `${worstRefusal.porcentaje.toFixed(2)}% final | ${formatNumber(worstRefusal.pendientes)} cajas pendientes` : "Sin datos"}
                  />
                  <InsightCard
                    accent="green"
                    label="Mayor gestion"
                    title={bestManaged?.label ?? "-"}
                    detail={bestManaged ? `${formatNumber(bestManaged.gestionadas)} gestionadas de ${formatNumber(bestManaged.rechazadas)} rechazadas` : "Sin datos"}
                  />
                </div>

                <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="px-4 pt-4">
                      <h3 className="text-sm font-semibold text-[#10223d]">Refusal final por {modeLabel.toLowerCase()}</h3>
                      <p className="text-xs text-slate-500">Ordenado del periodo mas reciente al mas antiguo.</p>
                    </div>
                    <span className="mx-4 mt-4 w-fit rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 sm:mt-0">{summaries.length} periodos</span>
                  </div>
                  <div className="divide-y divide-slate-100 px-3 pb-3">
                    {summaries.map((summary) => (
                      <RefusalPeriodRow key={summary.key} modeLabel={modeLabel} summary={summary} />
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-3 py-2.5">
                  <div>
                    <h3 className="text-sm font-semibold text-[#10223d]">Detalle numerico</h3>
                    <p className="text-xs text-slate-500">Seguimiento, rechazo, gestion y saldo final.</p>
                  </div>
                  <span className="rounded-md bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700">{totalPorcentaje.toFixed(2)}%</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] table-fixed text-[11px]">
                    <thead className="bg-slate-100 text-[9px] uppercase tracking-[0.08em] text-slate-500">
                      <tr>
                        <th className="w-[24%] px-2.5 py-2 text-left">Periodo</th>
                        <th className="w-[10%] px-2 py-2 text-right">Rutas</th>
                        <th className="w-[18%] px-2 py-2 text-right">Seguim.</th>
                        <th className="w-[12%] px-2 py-2 text-right">Rech.</th>
                        <th className="w-[12%] px-2 py-2 text-right">Gest.</th>
                        <th className="w-[12%] px-2 py-2 text-right">Final</th>
                        <th className="w-[12%] px-2 py-2 text-right">% Final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaries.map((summary) => {
                        const tone = getRefusalTone(summary.porcentaje);

                        return (
                          <tr key={summary.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                            <td className="px-2.5 py-2">
                              <p className="truncate font-semibold text-[#10223d]">{summary.label}</p>
                              <p className="truncate text-[10px] text-slate-500">{summary.rangeLabel}</p>
                            </td>
                            <td className="px-2 py-2 text-right font-semibold text-slate-700">{formatNumber(summary.rutas)}</td>
                            <td className="px-2 py-2 text-right font-semibold text-slate-700">{formatNumber(summary.totalCajasSeguimiento)}</td>
                            <td className="px-2 py-2 text-right font-semibold text-red-600">{formatNumber(summary.rechazadas)}</td>
                            <td className="px-2 py-2 text-right font-semibold text-[#0f7c58]">{formatNumber(summary.gestionadas)}</td>
                            <td className="px-2 py-2 text-right font-semibold text-slate-700">{formatNumber(summary.pendientes)}</td>
                            <td className={`px-2 py-2 text-right font-semibold ${tone.isDanger ? "text-red-600" : "text-[#0f7c58]"}`}>{summary.porcentaje.toFixed(2)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No hay datos de refusal para construir el historico.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function HistoryModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`h-8 rounded-md px-4 text-sm font-semibold transition ${
        active ? "bg-[#10223d] text-white shadow-sm shadow-slate-900/20" : "text-[#10223d] hover:bg-slate-100"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function HistoryKpi({
  detail,
  icon,
  label,
  tone = "navy",
  value,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  tone?: "navy" | "red" | "green";
  value: ReactNode;
}) {
  const valueColor = tone === "red" ? "text-red-600" : tone === "green" ? "text-[#0f7c58]" : "text-[#10223d]";
  const iconClass = tone === "red" ? "bg-red-50 text-red-600" : tone === "green" ? "bg-emerald-50 text-[#0f7c58]" : "bg-slate-100 text-[#10223d]";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${iconClass}`}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
        <p className={`truncate text-base font-semibold leading-5 ${valueColor}`}>{value}</p>
        <p className="truncate text-[11px] leading-4 text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function InsightCard({ accent, detail, label, title }: { accent: "red" | "green"; detail: string; label: string; title: string }) {
  const accentClass = accent === "red" ? "border-red-100 bg-red-50/35 text-red-600" : "border-emerald-100 bg-emerald-50/45 text-[#0f7c58]";

  return (
    <div className={`rounded-lg border bg-white p-4 shadow-sm ${accentClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-[#10223d]">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function RefusalPeriodRow({ modeLabel, summary }: { modeLabel: string; summary: RefusalHistorySummary }) {
  const tone = getRefusalTone(summary.porcentaje);
  const progressWidth = Math.max(2, Math.min(100, summary.porcentaje));

  return (
    <div className="grid gap-3 py-3 lg:grid-cols-[minmax(120px,0.7fr)_minmax(0,1.3fr)_auto] lg:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-5 text-[#10223d]">{summary.label}</p>
        <p className="truncate text-[11px] leading-4 text-slate-500">{summary.rangeLabel}</p>
      </div>
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
          <span>{modeLabel}</span>
          <span>{formatNumber(summary.pendientes)} pendientes de {formatNumber(summary.totalCajasSeguimiento)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-2 rounded-full" style={{ backgroundColor: tone.color, width: `${progressWidth}%` }} />
        </div>
      </div>
      <div className="grid min-w-[250px] grid-cols-3 gap-2">
        <MetricPill label="Rutas" value={formatNumber(summary.rutas)} />
        <MetricPill label="Final" value={formatNumber(summary.pendientes)} />
        <MetricPill label="% Final" value={`${summary.porcentaje.toFixed(2)}%`} tone={tone.isDanger ? "red" : "green"} />
      </div>
    </div>
  );
}

function MetricPill({ label, tone = "navy", value }: { label: string; tone?: "navy" | "red" | "green"; value: string }) {
  const valueClass = tone === "red" ? "text-red-600" : tone === "green" ? "text-[#0f7c58]" : "text-[#10223d]";

  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-right">
      <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <p className={`text-xs font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function buildRefusalHistorySummaries(
  vehicles: Vehiculo[],
  allModulaciones: ModulacionRegistro[],
  checkins: CheckinCajasRegistro[],
  mode: HistoryMode,
) {
  const seguimientoDts = new Set(vehicles.map((vehicle) => normalizeDt(vehicle.transporte)).filter(Boolean));
  const eligibleModulaciones = allModulaciones.filter((registro) => seguimientoDts.has(normalizeDt(registro.dt)) && getModulacionDateKey(registro));
  const groups = new Map<string, ReturnType<typeof getHistoryGroup> & { dates: Set<string> }>();

  vehicles.forEach((vehicle) => {
    const dateKey = getVehicleDateKey(vehicle);
    if (!dateKey) return;
    const group = getHistoryGroup(dateKey, mode);
    const current = groups.get(group.key) ?? { ...group, dates: new Set<string>() };
    current.dates.add(dateKey);
    groups.set(group.key, current);
  });

  eligibleModulaciones.forEach((registro) => {
    const dateKey = getModulacionDateKey(registro);
    if (!dateKey) return;
    const group = getHistoryGroup(dateKey, mode);
    const current = groups.get(group.key) ?? { ...group, dates: new Set<string>() };
    current.dates.add(dateKey);
    groups.set(group.key, current);
  });

  return Array.from(groups.values())
    .sort((left, right) => right.key.localeCompare(left.key))
    .map((group) => {
      const groupVehicles = vehicles.filter((vehicle) => {
        const dateKey = getVehicleDateKey(vehicle);
        return dateKey >= group.from && dateKey <= group.to;
      });
      const groupModulaciones = eligibleModulaciones.filter((registro) => {
        const dateKey = getModulacionDateKey(registro);
        return dateKey >= group.from && dateKey <= group.to;
      });

      return summarizeRefusalHistoryGroup(group, groupVehicles, groupModulaciones, checkins);
    });
}

function summarizeRefusalHistoryGroup(
  group: ReturnType<typeof getHistoryGroup>,
  vehicles: Vehiculo[],
  modulaciones: ModulacionRegistro[],
  checkins: CheckinCajasRegistro[],
): RefusalHistorySummary {
  const totalCajasSeguimiento = normalizeCajasTotal(vehicles.reduce((total, vehicle) => total + (vehicle.cajas || 0), 0));
  const seguimientoKeys = new Set(vehicles.map((vehicle) => `${normalizeDt(vehicle.transporte)}:${getVehicleDateKey(vehicle)}`).filter(Boolean));
  const byVehicle = vehicles.map((vehicle) => {
    const vehicleKey = `${normalizeDt(vehicle.transporte)}:${getVehicleDateKey(vehicle)}`;
    const registrosDt = modulaciones.filter((registro) => `${normalizeDt(registro.dt)}:${getModulacionDateKey(registro)}` === vehicleKey);
    const checkin = getCheckinByDt(checkins, vehicle.transporte);

    return summarizeModulaciones(registrosDt, vehicle.cajas || 0, checkin?.totalCajas);
  });
  const modulacionesSinSeguimiento = modulaciones.filter((registro) => !seguimientoKeys.has(`${normalizeDt(registro.dt)}:${getModulacionDateKey(registro)}`));
  const resumenSinSeguimiento = summarizeModulaciones(modulacionesSinSeguimiento, 0);
  const rechazadas = byVehicle.reduce((total, resumen) => total + resumen.cajasRechazadas, 0) + resumenSinSeguimiento.cajasRechazadas;
  const gestionadas = byVehicle.reduce((total, resumen) => total + resumen.cajasGestionadas, 0) + resumenSinSeguimiento.cajasGestionadas;
  const pendientes = byVehicle.reduce((total, resumen) => total + resumen.cajasPendientes, 0) + resumenSinSeguimiento.cajasPendientes;
  const porcentaje = totalCajasSeguimiento ? Number(((pendientes / totalCajasSeguimiento) * 100).toFixed(2)) : 0;

  return {
    key: group.key,
    label: group.label,
    rangeLabel: group.rangeLabel,
    rutas: vehicles.length,
    totalCajasSeguimiento,
    rechazadas,
    gestionadas,
    pendientes,
    porcentaje,
  };
}

function getHistoryGroup(dateKey: string, mode: HistoryMode) {
  if (mode === "week") {
    const from = getWeekStartKey(dateKey);
    const to = addDaysKey(from, 6);

    return {
      from,
      key: from,
      label: `Semana ${formatShortDate(from)}`,
      rangeLabel: `${formatShortDate(from)} - ${formatShortDate(to)}`,
      to,
    };
  }

  if (mode === "month") {
    const key = dateKey.slice(0, 7);
    const from = `${key}-01`;
    const to = getMonthEndKey(key);

    return {
      from,
      key,
      label: formatMonthLabel(key),
      rangeLabel: key,
      to,
    };
  }

  return {
    from: dateKey,
    key: dateKey,
    label: formatShortDate(dateKey),
    rangeLabel: formatLongDate(dateKey),
    to: dateKey,
  };
}

function getHistoryModeLabel(mode: HistoryMode) {
  const labels: Record<HistoryMode, string> = {
    day: "Dia",
    week: "Semana",
    month: "Mes",
  };

  return labels[mode];
}

function getWeekStartKey(dateKey: string) {
  const date = dateFromKey(dateKey);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);

  return dateToKey(date);
}

function addDaysKey(dateKey: string, days: number) {
  const date = dateFromKey(dateKey);
  date.setDate(date.getDate() + days);

  return dateToKey(date);
}

function getMonthEndKey(monthKey: string) {
  const [year = 0, month = 1] = monthKey.split("-").map(Number);
  return dateToKey(new Date(year, month, 0));
}

function dateFromKey(dateKey: string) {
  const [year = 0, month = 1, day = 1] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateToKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function formatShortDate(dateKey: string) {
  const [year = 0, month = 1, day = 1] = dateKey.split("-").map(Number);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

function formatLongDate(dateKey: string) {
  const [year = 0, month = 1, day = 1] = dateKey.split("-").map(Number);
  return `${day} de ${MONTH_NAMES[month - 1] ?? ""} de ${year}`;
}

function formatMonthLabel(monthKey: string) {
  const [year = "", month = "1"] = monthKey.split("-");
  const monthName = MONTH_NAMES[Number(month) - 1] ?? monthKey;

  return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);
}

function RefusalMetric({ icon, label, value, tone = "navy" }: { icon: ReactNode; label: string; value: ReactNode; tone?: "navy" | "red" | "green" | "amber" }) {
  const colors = {
    navy: "bg-[#e9f3ff] text-[#10223d]",
    red: "bg-red-50 text-red-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };

  return (
    <div className="tech-card rounded-lg p-5">
      <span className={`mb-4 grid h-11 w-11 place-items-center rounded-md ${colors[tone]} shadow-sm`}>{icon}</span>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}

function RefusalGauge({ value, max, percentage }: { value: number; max: number; percentage: number }) {
  const progress = Math.min(100, (value / max) * 100);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  const tone = getRefusalTone(percentage);

  return (
    <div className="relative mx-auto grid h-52 w-52 place-items-center">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 110 110">
        <defs>
        </defs>
        <circle cx="55" cy="55" r={radius} fill="none" stroke={PALETTE.track} strokeWidth="11" />
        <circle cx="55" cy="55" r={radius} fill="none" stroke={tone.color} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" strokeWidth="11" />
      </svg>
      <div className="absolute text-center">
        <p className="text-4xl font-semibold" style={{ color: tone.color }}>{percentage.toFixed(2)}%</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{value} / {max} cajas</p>
      </div>
    </div>
  );
}

function ProgressLine({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-semibold text-[#10223d]">{value} cajas</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(100, max ? (value / max) * 100 : 0)}%` }} />
      </div>
    </div>
  );
}

function getRefusalTone(value: number) {
  if (value <= 1) return { color: PALETTE.safe, isDanger: false, label: "Controlado", badge: "border-emerald-100 bg-emerald-50 text-emerald-700" };
  return { color: PALETTE.danger, isDanger: true, label: "En peligro", badge: "border-red-100 bg-red-50 text-red-700" };
}

function getBloque(vehicle: Vehiculo | undefined, modulacion: ModulacionRegistro) {
  const candidates = [vehicle?.bloque, vehicle?.transportista, modulacion.contratista].filter(Boolean) as string[];
  const value = candidates.find((item) => item.trim() && item.trim().toLowerCase() !== "pendiente");
  return value || "Sin bloque";
}

function findVehicleForModulacion(modulacion: ModulacionRegistro, rangeVehicles: Vehiculo[], allVehicles: Vehiculo[]) {
  const targetDt = normalizeDt(modulacion.dt);
  if (!targetDt) return undefined;

  return (
    rangeVehicles.find((vehicle) => normalizeDt(vehicle.transporte) === targetDt && getVehicleDateKey(vehicle) === getModulacionDateKey(modulacion)) ||
    allVehicles.find((vehicle) => normalizeDt(vehicle.transporte) === targetDt)
  );
}

function getCajasRechazoFinal(modulacion: ModulacionRegistro, checkin: CheckinCajasRegistro | undefined) {
  return typeof checkin?.totalCajas === "number" ? checkin.totalCajas : Number(modulacion.totalCajas || 0);
}

function groupModulationRowsByVehicle<T extends { bloque: string; cajasRechazo: number; id: string; responsable: string; status: string; tieneCheckin: boolean; vehiculo: string }>(rows: T[]) {
  const grouped = new Map<string, T>();

  rows.forEach((row) => {
    const key = normalizeVehicle(row.vehiculo) || row.vehiculo;
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, { ...row });
      return;
    }

    if (current.tieneCheckin) return;
    if (row.tieneCheckin) {
      current.cajasRechazo = row.cajasRechazo;
      current.tieneCheckin = true;
      return;
    }

    current.cajasRechazo += row.cajasRechazo;
  });

  return Array.from(grouped.values());
}

function normalizeVehicle(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

function todayKey() {
  return getLocalDateKey();
}

function isVehicleInRange(vehicle: Vehiculo, range: { from: string; to: string }) {
  return isDateInRange(getVehicleDateKey(vehicle), range);
}

function getModulacionDateKey(registro: ModulacionRegistro) {
  return toDateKey(registro.fechaDespacho || registro.fechaDt || registro.createdAt);
}

function getVehicleDateKey(vehicle: Vehiculo) {
  return toDateKey(vehicle.fechaDespacho || vehicle.date || vehicle.createdAt);
}

function isDateInRange(dateKey: string, range: { from: string; to: string }) {
  if (!dateKey) return false;
  return dateKey >= range.from && dateKey <= range.to;
}

function toDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(Number);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return getLocalDateKey(parsed);
}
