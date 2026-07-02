"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, ClipboardList, Package, TrendingDown, Users, XCircle } from "lucide-react";
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
              <table className="data-table w-full table-fixed">
                <thead className="sticky top-0 z-10 text-[9px] uppercase tracking-[0.08em]">
                  <tr>
                    <th className="w-[20%] px-2 py-2 text-left">Bloque</th>
                    <th className="w-[18%] px-2 py-2 text-left">Vehiculo</th>
                    <th className="w-[34%] px-2 py-2 text-left">Responsable</th>
                    <th className="w-[16%] px-2 py-2 text-left">Status</th>
                    <th className="w-[12%] px-2 py-2 text-right">Cajas</th>
                  </tr>
                </thead>
                <tbody>
                  {modulationRows.length ? (
                    modulationRows.map((item, index) => (
                      <tr className={index % 2 === 0 ? "bg-white" : ""} key={item.id}>
                        <td className="truncate px-2 py-2 text-[11px] font-semibold text-slate-600" title={item.bloque}>{item.bloque}</td>
                        <td className="px-2 py-2" title={item.vehiculo}>
                          <span className="rounded bg-[#e8f7ff] px-1.5 py-0.5 text-[11px] font-bold text-[#07556b]">{item.vehiculo}</span>
                        </td>
                        <td className="truncate px-2 py-2 text-[11px] text-slate-600" title={item.responsable}>{item.responsable}</td>
                        <td className="px-2 py-2">
                          <span className="inline-flex max-w-full truncate rounded-md border border-amber-100 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800" title={item.status}>{item.status}</span>
                        </td>
                        <td className="px-2 py-2 text-right text-[11px] text-slate-700"><span className="number-pill border-red-100 bg-red-50 text-red-700">{item.cajasRechazo}</span></td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-10 text-center text-sm font-medium text-slate-500" colSpan={5}>
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
    </main>
  );
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
