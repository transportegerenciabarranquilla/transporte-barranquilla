"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ClipboardList, Clock3, PackageCheck, Route, Truck, Users, X } from "lucide-react";
import { AnalyticsViewToggle } from "../components/AnalyticsViewToggle";
import { CHECKIN_STORAGE_KEY } from "../../lib/checkinStorage";
import { MODULACION_STORAGE_KEY } from "../../lib/modulacionStorage";
import { SEGUIMIENTO_STORAGE_KEY } from "../../lib/seguimientoStorage";
import { useStorageSnapshot } from "../../lib/storageEvents";
import type { Vehiculo } from "../types";
import { ROUTE_STATUSES, calculateRouteTime, getStatus, getVehicleRecordKey, hasTimeValue } from "../utils";
import { loadSeguimientoVehiculos } from "../services/vehicleRecords";

const DELAY_THRESHOLD = 25;

export default function SeguimientoGraficasPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(getTodayKey);
  const vehicles = useStorageSnapshot<Vehiculo[]>(
    [SEGUIMIENTO_STORAGE_KEY, MODULACION_STORAGE_KEY, CHECKIN_STORAGE_KEY],
    loadSeguimientoVehiculos,
    [],
  );
  const [closedAlerts, setClosedAlerts] = useState<string[]>([]);
  const [dateLabel, setDateLabel] = useState("");
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDateLabel(new Date().toLocaleDateString("es-CO"));
      setNow(new Date());
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const fecha = new URLSearchParams(window.location.search).get("fecha") || getTodayKey();
    setSelectedDate(fecha);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setDateLabel(formatDateLabel(selectedDate));
  }, [selectedDate]);

  const todayVehicles = useMemo(() => vehicles.filter((vehicle) => isVehicleForDate(vehicle, selectedDate)), [selectedDate, vehicles]);

  const resumen = useMemo(() => {
    const clientes = todayVehicles.reduce((total, item) => total + (item.clientes || 0), 0);
    const visitados = todayVehicles.reduce((total, item) => total + (item.visitados || 0), 0);
    const cajas = todayVehicles.reduce((total, item) => total + (item.cajas || 0), 0);
    const hl = todayVehicles.reduce((total, item) => total + (item.hl || 0), 0);
    const avance = getVisitProgress(visitados, clientes);

    return {
      vehiculos: todayVehicles.length,
      cajas,
      hl: hl.toFixed(1),
      clientes,
      visitados,
      avance,
      tiempoPromedio: formatSeconds(getAverageRouteSeconds(todayVehicles, now)),
    };
  }, [now, todayVehicles]);

  const alertasCriticas = useMemo(() => {
    return todayVehicles
      .map((vehicle) => ({
        ...vehicle,
        currentProgress: getVisitProgress(vehicle.visitados, vehicle.clientes),
      }))
      .filter((vehicle) => resumen.avance - vehicle.currentProgress > DELAY_THRESHOLD)
      .filter((vehicle) => !closedAlerts.includes(getVehicleRecordKey(vehicle)));
  }, [closedAlerts, resumen.avance, todayVehicles]);
  const statusCounts = useMemo(() => {
    return ROUTE_STATUSES.map((status) => ({
      status,
      count: todayVehicles.filter((vehicle) => getVehicleStatus(vehicle) === status).length,
    }));
  }, [todayVehicles]);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <div className="fixed right-5 top-20 z-50 w-full max-w-sm space-y-3">
        {alertasCriticas.map((vehicle) => (
          <div className="rounded-lg border border-red-100 bg-white p-4 shadow-xl" key={getVehicleRecordKey(vehicle)}>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-red-50 text-red-600">
                <AlertTriangle size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-red-600">Retraso operativo</p>
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  DT <span className="font-semibold text-[#10223d]">{vehicle.transporte}</span> está{" "}
                  <span className="font-semibold text-red-600">{(resumen.avance - vehicle.currentProgress).toFixed(1)}%</span> por debajo
                  del promedio.
                </p>
                <button
                  className="mt-3 rounded-md bg-[#10223d] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#1b355b]"
                  onClick={() => setClosedAlerts((current) => [...current, getVehicleRecordKey(vehicle)])}
                  type="button"
                >
                  Confirmar seguimiento
                </button>
              </div>
              <button
                className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setClosedAlerts((current) => [...current, getVehicleRecordKey(vehicle)])}
                type="button"
                aria-label="Cerrar alerta"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100"
              onClick={() => router.push(selectedDate ? `/seguimiento?fecha=${encodeURIComponent(selectedDate)}` : "/seguimiento")}
              type="button"
              aria-label="Volver a seguimiento"
            >
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Analítica diaria</p>
              <h1 className="text-2xl font-semibold text-[#10223d]">Seguimiento operativo</h1>
            </div>
          </div>
          <AnalyticsViewToggle active="seguimiento" />
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon={<Truck size={21} />} label="Vehículos" value={resumen.vehiculos} detail="Rutas del día" />
          <SummaryCard icon={<Users size={21} />} label="Clientes" value={`${resumen.visitados}/${resumen.clientes}`} detail={`${resumen.avance}% visitados`} />
          <SummaryCard icon={<PackageCheck size={21} />} label="Cajas" value={resumen.cajas} detail={`${resumen.hl} HL`} />
          <SummaryCard icon={<Clock3 size={21} />} label="Tiempo prom." value={resumen.tiempoPromedio} detail="Promedio de rutas" />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <Panel title="Avance global" icon={<Route size={18} />}>
            <div className="flex flex-col items-center gap-5 md:flex-row md:justify-center">
              <Gauge value={resumen.avance} />
              <div className="w-full max-w-xs space-y-4">
                <ProgressLine label="Visitas" value={resumen.avance} color="bg-[#0f7c58]" />
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-[#10223d]">{alertasCriticas.length} alertas activas</p>
                  <p className="mt-1 text-sm text-slate-500">Umbral de retraso: {DELAY_THRESHOLD}% contra el promedio.</p>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Estado de flota" icon={<Truck size={16} />} compact>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {statusCounts.map(({ status, count }) => (
                <StatusTile key={status} label={status} count={count} tone={getStatusTone(status)} />
              ))}
              <StatusTile label="Con alerta" count={alertasCriticas.length} tone="red" />
            </div>
          </Panel>
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList size={17} className="text-[#10223d]" />
              <div>
                <h2 className="text-base font-semibold text-[#10223d]">Detalle por vehículo</h2>
                <p className="mt-0.5 text-xs text-slate-500">Comparación de avance contra el promedio del día.</p>
              </div>
            </div>
            <span className="rounded-md bg-[#e9f3ff] px-2.5 py-1.5 text-xs font-semibold text-[#10223d]">
              {dateLabel}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Vehículo / DT</th>
                  <th className="px-4 py-3 text-left">Responsable</th>
                  <th className="px-4 py-3 text-center">Visitas</th>
                  <th className="px-4 py-3 text-center">Avance</th>
                  <th className="px-4 py-3 text-right">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {todayVehicles.map((vehicle) => {
                  const percentage = getVisitProgress(vehicle.visitados, vehicle.clientes);
                  const delayed = resumen.avance - percentage > DELAY_THRESHOLD;

                  return (
                    <tr className={delayed ? "bg-red-50/50" : "transition hover:bg-slate-50"} key={getVehicleRecordKey(vehicle)}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className={`grid h-10 w-10 place-items-center rounded-md ${delayed ? "bg-red-100 text-red-600" : "bg-[#e9f3ff] text-[#10223d]"}`}>
                            {delayed ? <AlertTriangle size={18} /> : <Truck size={18} />}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-[#10223d]">{vehicle.vehiculo}</p>
                            <p className="text-xs text-slate-500">{vehicle.transporte}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-sm font-medium text-slate-600">{vehicle.responsable}</td>
                      <td className="px-4 py-2.5 text-center text-sm font-semibold text-[#10223d]">
                        {vehicle.visitados} / {vehicle.clientes}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="mx-auto flex max-w-44 items-center gap-3">
                          <div className="h-2 flex-1 rounded-full bg-slate-200">
                            <div className={`h-2 rounded-full ${delayed ? "bg-red-500" : "bg-[#0f7c58]"}`} style={{ width: `${percentage}%` }} />
                          </div>
                          <span className={`w-10 text-sm font-semibold ${delayed ? "text-red-600" : "text-[#10223d]"}`}>{percentage}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <StatusPill status={delayed ? "Retraso" : getStatus(percentage, vehicle)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}

function SummaryCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: ReactNode; detail: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-md bg-[#e9f3ff] text-[#10223d]">{icon}</span>
        <span className="h-2 w-2 rounded-full bg-[#0f7c58]" />
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-[#10223d]">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function Panel({ title, icon, children, compact = false }: { title: string; icon: ReactNode; children: ReactNode; compact?: boolean }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${compact ? "p-3" : "p-5"}`}>
      <div className={`flex items-center gap-2 text-[#10223d] ${compact ? "mb-3" : "mb-5"}`}>
        {icon}
        <h2 className={compact ? "text-base font-semibold" : "text-lg font-semibold"}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Gauge({ value }: { value: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative grid h-48 w-48 place-items-center">
      <svg className="-rotate-90" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="11" />
        <circle
          cx="55"
          cy="55"
          r={radius}
          fill="none"
          stroke="#0f7c58"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="11"
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-4xl font-semibold text-[#10223d]">{value}%</p>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Global</p>
      </div>
    </div>
  );
}

function ProgressLine({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-semibold text-[#10223d]">{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

type StatusTone = "green" | "blue" | "slate" | "red" | "amber" | "violet" | "orange";

function StatusTile({ label, count, tone }: { label: string; count: number; tone: StatusTone }) {
  const colors = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    red: "bg-red-50 text-red-700 border-red-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    orange: "bg-orange-50 text-orange-700 border-orange-100",
  };

  return (
    <div className={`rounded-md border px-3 py-2.5 ${colors[tone]}`}>
      <p className="truncate text-xs font-semibold">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-none">{count}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Finalizado: "bg-emerald-50 text-emerald-700 border-emerald-100",
    "En ruta": "bg-blue-50 text-blue-700 border-blue-100",
    "Pendiente por salir": "bg-slate-50 text-slate-700 border-slate-200",
    Pernoctado: "bg-violet-50 text-violet-700 border-violet-100",
    Cargando: "bg-amber-50 text-amber-700 border-amber-100",
    "Cambio de fecha": "bg-orange-50 text-orange-700 border-orange-100",
    Recargue: "bg-cyan-50 text-cyan-700 border-cyan-100",
    Retraso: "bg-red-50 text-red-700 border-red-100",
  };

  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${styles[status] ?? styles.Cargando}`}>{status}</span>;
}

function getVehicleStatus(vehicle: Vehiculo) {
  const progress = getVisitProgress(vehicle.visitados, vehicle.clientes);
  return getStatus(progress, vehicle);
}

function getVisitProgress(visitados: number, clientes: number) {
  if (!clientes) return 0;
  return Math.min(100, Number(((visitados / clientes) * 100).toFixed(1)));
}

function getStatusTone(status: string): StatusTone {
  const tones: Record<string, StatusTone> = {
    "Pendiente por salir": "slate",
    "En ruta": "blue",
    Pernoctado: "violet",
    Cargando: "amber",
    "Cambio de fecha": "orange",
    Recargue: "blue",
    Finalizado: "green",
  };

  return tones[status] ?? "slate";
}

function isVehicleForDate(vehicle: Vehiculo, dateKey: string) {
  return parseDate(vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || vehicle.createdAt) === dateKey;
}

function parseDate(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(Number);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function getTodayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return dateKey;
  return new Date(year, month - 1, day).toLocaleDateString("es-CO");
}

function getAverageRouteSeconds(vehicles: Vehiculo[], now: Date | null) {
  const routeDurations = vehicles
    .map((vehicle) => {
      if (now && hasTimeValue(vehicle.horaSalida)) return durationToSeconds(calculateRouteTime(vehicle, now));
      return durationToSeconds(vehicle.tiempoRuta);
    })
    .filter((seconds) => seconds > 0);

  const total = routeDurations.reduce((acc, seconds) => acc + seconds, 0);

  return routeDurations.length ? total / routeDurations.length : 0;
}

function durationToSeconds(value: string | undefined) {
  if (!value || value === "Pendiente") return 0;

  const [hours = 0, minutes = 0, seconds = 0] = value.split(":").map(Number);
  if (![hours, minutes, seconds].every(Number.isFinite)) return 0;

  return hours * 3600 + minutes * 60 + seconds;
}

function formatSeconds(seconds: number) {
  if (seconds <= 0) return "00:00";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

