"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, Package, TrendingDown, Users, XCircle } from "lucide-react";
import { AnalyticsViewToggle } from "../components/AnalyticsViewToggle";
import { CHECKIN_STORAGE_KEY, getCheckinByDt, readCheckinCajasRegistros, type CheckinCajasRegistro } from "../../lib/checkinStorage";
import { getLocalDateKey, MODULACION_STORAGE_KEY, normalizeDt, readModulacionRegistros, summarizeModulaciones, type ModulacionRegistro } from "../../lib/modulacionStorage";
import { SEGUIMIENTO_STORAGE_KEY } from "../../lib/seguimientoStorage";
import { useStorageSnapshot } from "../../lib/storageEvents";
import { loadSeguimientoVehiculos } from "../services/vehicleRecords";
import type { Vehiculo } from "../types";
import { getProgress, getStatus } from "../utils";

const PALETTE = {
  safe: "#0f7c58",
  danger: "#dc2626",
  track: "#e2e8f0",
};

const EMPTY_MODULACIONES: ModulacionRegistro[] = [];
const EMPTY_CHECKINS: CheckinCajasRegistro[] = [];

export default function SeguimientoRefusalPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const vehicles = useStorageSnapshot<Vehiculo[]>([SEGUIMIENTO_STORAGE_KEY], loadSeguimientoVehiculos, []);
  const allModulaciones = useStorageSnapshot<ModulacionRegistro[]>([MODULACION_STORAGE_KEY], readModulacionRegistros, EMPTY_MODULACIONES);
  const checkins = useStorageSnapshot<CheckinCajasRegistro[]>([CHECKIN_STORAGE_KEY], readCheckinCajasRegistros, EMPTY_CHECKINS);

  useEffect(() => {
    const fecha = new URLSearchParams(window.location.search).get("fecha") || todayKey();
    setSelectedDate(fecha);
  }, []);

  const activeVehiculos = useMemo(() => {
    const loaded = loadSeguimientoVehiculos();
    return loaded.length ? loaded : vehicles;
  }, [vehicles]);

  const todayVehicles = useMemo(() => activeVehiculos.filter((vehicle) => isVehicleForDate(vehicle, selectedDate)), [activeVehiculos, selectedDate]);
  const seguimientoDts = useMemo(() => new Set(activeVehiculos.map((vehicle) => normalizeDt(vehicle.transporte)).filter(Boolean)), [activeVehiculos]);
  const modulaciones = useMemo(
    () => allModulaciones.filter((registro) => getModulacionDateKey(registro) === selectedDate && seguimientoDts.has(normalizeDt(registro.dt))),
    [allModulaciones, selectedDate, seguimientoDts],
  );

  const refusalData = useMemo(() => {
    const totalCajasSeguimiento = todayVehicles.reduce((acc, vehicle) => acc + (vehicle.cajas || 0), 0);
    const seguimientoDts = new Set(todayVehicles.map((vehicle) => normalizeDt(vehicle.transporte)).filter(Boolean));
    const byVehicle = todayVehicles.map((vehicle) => {
      const registrosDt = modulaciones.filter((registro) => normalizeDt(registro.dt) === normalizeDt(vehicle.transporte));
      const checkin = getCheckinByDt(checkins, vehicle.transporte);

      return summarizeModulaciones(registrosDt, vehicle.cajas || 0, checkin?.totalCajas);
    });
    const modulacionesSinSeguimiento = modulaciones.filter((registro) => !seguimientoDts.has(normalizeDt(registro.dt)));
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
  }, [checkins, modulaciones, todayVehicles]);

  const modulationRows = useMemo(() => {
    const rows = modulaciones
      .map((modulacion) => {
        const vehicle = findVehicleForModulacion(modulacion, todayVehicles, activeVehiculos);
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
  }, [activeVehiculos, checkins, modulaciones, todayVehicles]);

  const refusalTone = getRefusalTone(refusalData.porcentaje);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              aria-label="Volver a seguimiento"
              className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100"
              onClick={() => router.push(selectedDate ? `/seguimiento?fecha=${encodeURIComponent(selectedDate)}` : "/seguimiento")}
              type="button"
            >
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#dc2626]">Analitica diaria</p>
              <h1 className="text-2xl font-semibold text-[#10223d]">Control de refusal</h1>
            </div>
          </div>
          <AnalyticsViewToggle active="refusal" />
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[#10223d]">
            <CalendarDays size={18} />
            <div>
              <p className="text-sm font-semibold">Filtro por dia</p>
              <p className="text-xs text-slate-500">{formatDateLabel(selectedDate)}</p>
            </div>
          </div>
          <input
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-[#10223d] outline-none transition focus:border-[#f5bd19]"
            onChange={(event) => setSelectedDate(event.target.value)}
            type="date"
            value={selectedDate}
          />
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <RefusalMetric icon={<Package size={21} />} label="Cajas seguimiento" value={refusalData.totalCajasSeguimiento} />
          <RefusalMetric icon={<XCircle size={21} />} label="Rechazadas" value={refusalData.rechazadas} tone="red" />
          <RefusalMetric icon={<CheckCircle2 size={21} />} label="Gestionadas" value={refusalData.gestionadas} tone="green" />
          <RefusalMetric icon={<Users size={21} />} label="Checkins" value={refusalData.checkinAplicadas} tone="amber" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_0.95fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
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
                <ProgressLine label="Refusal final" value={refusalData.pendientes} max={refusalData.topeMaximo} color="bg-[#dc2626]" />
                <ProgressLine label="Gestionadas" value={refusalData.gestionadas} max={refusalData.rechazadas} color="bg-[#0f7c58]" />
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-[#10223d]">Tope maximo: {refusalData.topeMaximo} cajas</p>
                  <p className="mt-1 text-sm text-slate-500">Usa cajas checkin por DT; si no existen, toma el pendiente modulado actual.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <ClipboardList size={16} className="shrink-0 text-[#10223d]" />
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-[#10223d]">Detalle de modulaciones</h2>
                  <p className="truncate text-[11px] text-slate-500">Rechazo por ruta.</p>
                </div>
              </div>
              <span className="shrink-0 rounded-md bg-[#e9f3ff] px-2 py-1 text-[11px] font-semibold text-[#10223d]">{modulationRows.length}</span>
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              <table className="w-full table-fixed">
                <thead className="sticky top-0 z-10 bg-[#242424] text-[9px] uppercase tracking-[0.03em] text-white shadow-[0_1px_0_#e2e8f0]">
                  <tr>
                    <th className="w-[18%] px-1.5 py-1.5 text-left">Bloque</th>
                    <th className="w-[18%] px-1.5 py-1.5 text-left">Vehiculo</th>
                    <th className="w-[34%] px-1.5 py-1.5 text-left">Responsable</th>
                    <th className="w-[18%] px-1.5 py-1.5 text-left">Status</th>
                    <th className="w-[12%] px-1.5 py-1.5 text-right">Cajas</th>
                  </tr>
                </thead>
                <tbody>
                  {modulationRows.length ? (
                    modulationRows.map((item, index) => (
                      <tr className={index % 2 === 0 ? "bg-white" : "bg-slate-100"} key={item.id}>
                        <td className="truncate px-1.5 py-1 text-[11px] font-medium text-slate-600" title={item.bloque}>{item.bloque}</td>
                        <td className="truncate px-1.5 py-1 text-[11px] font-semibold text-slate-700" title={item.vehiculo}>{item.vehiculo}</td>
                        <td className="truncate px-1.5 py-1 text-[11px] text-slate-600" title={item.responsable}>{item.responsable}</td>
                        <td className="px-1.5 py-1">
                          <span className="inline-flex max-w-full truncate rounded-sm bg-yellow-300 px-1 py-0.5 text-[10px] font-semibold text-[#10223d]" title={item.status}>{item.status}</span>
                        </td>
                        <td className="px-1.5 py-1 text-right text-[11px] font-bold text-slate-700">{item.cajasRechazo}</td>
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
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <span className={`mb-4 grid h-11 w-11 place-items-center rounded-md ${colors[tone]}`}>{icon}</span>
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
  if (value <= 1) return { color: PALETTE.safe, label: "Controlado", badge: "border-emerald-100 bg-emerald-50 text-emerald-700" };
  return { color: PALETTE.danger, label: "En peligro", badge: "border-red-100 bg-red-50 text-red-700" };
}

function getBloque(vehicle: Vehiculo | undefined, modulacion: ModulacionRegistro) {
  const candidates = [vehicle?.bloque, vehicle?.transportista, modulacion.contratista].filter(Boolean) as string[];
  const value = candidates.find((item) => item.trim() && item.trim().toLowerCase() !== "pendiente");
  return value || "Sin bloque";
}

function findVehicleForModulacion(modulacion: ModulacionRegistro, todayVehicles: Vehiculo[], allVehicles: Vehiculo[]) {
  const targetDt = normalizeDt(modulacion.dt);
  if (!targetDt) return undefined;

  return (
    todayVehicles.find((vehicle) => normalizeDt(vehicle.transporte) === targetDt) ||
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

function isVehicleForDate(vehicle: Vehiculo, dateKey: string) {
  return toDateKey(vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || vehicle.createdAt) === dateKey;
}

function getModulacionDateKey(registro: ModulacionRegistro) {
  return toDateKey(registro.fechaDespacho || registro.fechaDt || registro.createdAt);
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

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString("es-CO");
}
