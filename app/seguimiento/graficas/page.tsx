"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ClipboardList, Clock3, PackageCheck, Route, Truck, Users } from "lucide-react";
import { AnalyticsDateRangeFilter, normalizeDateRange } from "../components/AnalyticsDateFilter";
import { AnalyticsViewToggle } from "../components/AnalyticsViewToggle";
import { CHECKIN_STORAGE_KEY } from "../../lib/checkinStorage";
import { MODULACION_STORAGE_KEY } from "../../lib/modulacionStorage";
import { SEGUIMIENTO_STORAGE_KEY } from "../../lib/seguimientoStorage";
import { useStorageSnapshot } from "../../lib/storageEvents";
import { useContractorBrand } from "../../lib/contractorBranding";
import type { Vehiculo } from "../types";
import { ROUTE_STATUSES, calculateRouteTime, getPlannedProgress, getStatus, getVehicleRecordKey, hasTimeValue, normalizeCajasTotal } from "../utils";
import { loadSeguimientoVehiculos } from "../services/vehicleRecords";

export default function SeguimientoGraficasPage() {
  const router = useRouter();
  const brand = useContractorBrand();
  const [dateRange, setDateRange] = useState(() => {
    const today = getTodayKey();
    return { from: today, to: today };
  });
  const vehicles = useStorageSnapshot<Vehiculo[]>(
    [SEGUIMIENTO_STORAGE_KEY, MODULACION_STORAGE_KEY, CHECKIN_STORAGE_KEY],
    loadSeguimientoVehiculos,
    [],
  );
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
    const params = new URLSearchParams(window.location.search);
    const fecha = params.get("fecha") || getTodayKey();
    setDateRange(normalizeDateRange(params.get("desde") || fecha, params.get("hasta") || fecha));
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setDateLabel(formatDateRangeLabel(dateRange));
  }, [dateRange]);

  const rangeVehicles = useMemo(() => vehicles.filter((vehicle) => isVehicleInRange(vehicle, dateRange)), [dateRange, vehicles]);

  const resumen = useMemo(() => {
    const clientes = rangeVehicles.reduce((total, item) => total + (item.clientes || 0), 0);
    const visitados = rangeVehicles.reduce((total, item) => total + (item.visitados || 0), 0);
    const cajas = normalizeCajasTotal(rangeVehicles.reduce((total, item) => total + (item.cajas || 0), 0));
    const hl = rangeVehicles.reduce((total, item) => total + (item.hl || 0), 0);
    const avance = getVisitProgress(visitados, clientes);
    const retrasados = now ? rangeVehicles.filter((vehicle) => getPlannedProgress(vehicle, now).isBehind).length : 0;
    const retrasadosPercent = rangeVehicles.length ? Number(((retrasados / rangeVehicles.length) * 100).toFixed(1)) : 0;

    return {
      vehiculos: rangeVehicles.length,
      cajas,
      hl: hl.toFixed(1),
      clientes,
      visitados,
      avance,
      retrasados,
      retrasadosPercent,
      tiempoPromedio: formatSeconds(getAverageRouteSeconds(rangeVehicles, now)),
    };
  }, [now, rangeVehicles]);

  const statusCounts = useMemo(() => {
    return ROUTE_STATUSES.map((status) => ({
      status,
      count: rangeVehicles.filter((vehicle) => getVehicleStatus(vehicle) === status).length,
    }));
  }, [rangeVehicles]);

  return (
    <main className="min-h-screen text-slate-900">
      <header className="sticky top-0 z-20 border-b border-white/50 bg-white/80 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100"
              onClick={() => router.push(dateRange.to ? `/seguimiento?fecha=${encodeURIComponent(dateRange.to)}` : "/seguimiento")}
              type="button"
              aria-label="Volver a seguimiento"
            >
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Analítica diaria</p>
              <h1 className="text-2xl font-semibold text-[#10223d]">Seguimiento {brand.name}</h1>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <AnalyticsDateRangeFilter value={dateRange} onChange={setDateRange} />
            <AnalyticsViewToggle active="seguimiento" />
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard icon={<Truck size={21} />} label="Vehículos" value={resumen.vehiculos} detail="Rutas del día" />
          <SummaryCard icon={<Users size={21} />} label="Clientes" value={`${resumen.visitados}/${resumen.clientes}`} detail={`${formatPercent(resumen.avance)} visitados`} />
          <SummaryCard icon={<AlertTriangle size={21} />} label="Retrasados" value={resumen.retrasados} detail={`${formatPercent(resumen.retrasadosPercent)} de rutas`} />
          <SummaryCard icon={<PackageCheck size={21} />} label="Cajas" value={resumen.cajas} detail={`${resumen.hl} HL`} />
          <SummaryCard icon={<Clock3 size={21} />} label="Tiempo prom." value={resumen.tiempoPromedio} detail="Promedio de rutas" />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <Panel title="Avance global" icon={<Route size={18} />}>
            <div className="flex flex-col items-center gap-5 md:flex-row md:justify-center">
              <Gauge value={resumen.avance} />
              <div className="w-full max-w-xs space-y-4">
                <ProgressLine label="Visitas" value={resumen.avance} color="bg-[#0f7c58]" />
                <p className="text-sm text-slate-500">Retraso calculado por ritmo planeado por cliente.</p>
              </div>
            </div>
          </Panel>

          <Panel title="Estado de flota" icon={<Truck size={16} />} compact>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {statusCounts.map(({ status, count }) => (
                <StatusTile key={status} label={status} count={count} tone={getStatusTone(status)} />
              ))}
              <StatusTile label="Retraso" count={resumen.retrasados} tone="red" />
            </div>
          </Panel>
        </div>

        <div className="data-shell mt-5 rounded-lg">
          <div className="flex flex-col gap-1 border-b border-slate-200/70 bg-white/78 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList size={15} className="text-[#10223d]" />
              <div>
                <h2 className="text-sm font-semibold leading-5 text-[#10223d]">Detalle por vehículo</h2>
                <p className="text-[10px] leading-4 text-slate-500">Comparación de avance contra el ritmo planeado por cliente.</p>
              </div>
            </div>
            <span className="rounded-md border border-cyan-100 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-[#07556b]">
              {dateLabel}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[720px] table-fixed text-[10px]">
              <thead className="sticky top-0 z-10 text-[8px] uppercase tracking-[0.08em]">
                <tr>
                  <th className="w-48 px-2 py-0.5 text-left">Vehículo / DT</th>
                  <th className="w-72 px-2 py-0.5 text-left">Responsable</th>
                  <th className="w-24 px-2 py-0.5 text-center">Visitas</th>
                  <th className="w-40 px-2 py-0.5 text-center">Avance</th>
                  <th className="w-24 px-2 py-0.5 text-right">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rangeVehicles.map((vehicle) => {
                  const percentage = getVisitProgress(vehicle.visitados, vehicle.clientes);
                  const plannedProgress = now ? getPlannedProgress(vehicle, now) : null;
                  const delayed = Boolean(plannedProgress?.isBehind);

                  return (
                    <tr className={delayed ? "bg-red-50/60" : ""} key={getVehicleRecordKey(vehicle)}>
                      <td className="px-2 py-[2px]">
                        <div className="flex items-center gap-1.5">
                          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded ${delayed ? "bg-red-100 text-red-600" : "bg-[#e9f3ff] text-[#10223d]"}`}>
                            {delayed ? <AlertTriangle size={11} /> : <Truck size={11} />}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[10px] font-semibold leading-3.5 text-[#10223d]">{vehicle.vehiculo}</p>
                            <p className="truncate text-[10px] leading-3 text-slate-500">{vehicle.transporte}</p>
                          </div>
                        </div>
                      </td>
                      <td className="truncate px-2 py-[2px] text-[10px] font-medium text-slate-600" title={vehicle.responsable}>
                        {vehicle.responsable}
                      </td>
                      <td className="px-2 py-[2px] text-center text-[10px] font-semibold text-[#10223d]">
                        {vehicle.visitados} / {vehicle.clientes}
                      </td>
                      <td className="px-2 py-[2px]">
                        <div className="mx-auto flex max-w-32 items-center gap-1.5">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                            <div className={`h-2 rounded-full ${delayed ? "bg-gradient-to-r from-red-500 to-orange-400" : "bg-gradient-to-r from-[#0f7c58] to-[#00b8d9]"}`} style={{ width: `${percentage}%` }} />
                          </div>
                          <span className={`w-10 text-[10px] font-semibold ${delayed ? "text-red-600" : "text-[#10223d]"}`}>{formatPercent(percentage)}</span>
                        </div>
                      </td>
                      <td className="px-2 py-[2px] text-right">
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
    <div className="tech-card rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-md bg-gradient-to-br from-[#10223d] to-[#1264ff] text-white shadow-lg shadow-blue-500/20">{icon}</span>
        <span className="relative h-2.5 w-2.5 rounded-full bg-[#11a36a]">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#11a36a]/40" />
        </span>
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-[#10223d]">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </div>
  );
}

function Panel({ title, icon, children, compact = false }: { title: string; icon: ReactNode; children: ReactNode; compact?: boolean }) {
  return (
    <section className={`glass-panel rounded-lg ${compact ? "p-3" : "p-5"}`}>
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
        <defs>
          <linearGradient id="gaugeGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#1264ff" />
            <stop offset="55%" stopColor="#00b8d9" />
            <stop offset="100%" stopColor="#0f7c58" />
          </linearGradient>
        </defs>
        <circle cx="55" cy="55" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="11" />
        <circle
          cx="55"
          cy="55"
          r={radius}
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="11"
          className="drop-shadow-sm"
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-4xl font-semibold text-[#10223d]">{formatPercent(value)}</p>
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
        <span className="font-semibold text-[#10223d]">{formatPercent(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

type StatusTone = "green" | "blue" | "slate" | "red" | "amber" | "violet" | "orange" | "indigo";

function StatusTile({ label, count, tone }: { label: string; count: number; tone: StatusTone }) {
  const colors = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    red: "bg-red-50 text-red-700 border-red-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    orange: "bg-orange-50 text-orange-700 border-orange-100",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
  };

  return (
    <div className={`rounded-md border px-3 py-2.5 ${colors[tone]}`}>
      <p className="truncate text-xs font-semibold">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-none">{count}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const style = status === "Retraso" ? "bg-red-50 text-red-700 border-red-200" : "bg-[#f5de2a] text-[#1f2937] border-[#e3cb18]";
  return <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${style}`}>{status}</span>;
}

function getVehicleStatus(vehicle: Vehiculo) {
  const progress = getVisitProgress(vehicle.visitados, vehicle.clientes);
  return getStatus(progress, vehicle);
}

function getVisitProgress(visitados: number, clientes: number) {
  if (!clientes) return 0;
  return Math.min(100, Number(((visitados / clientes) * 100).toFixed(1)));
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function getStatusTone(status: string): StatusTone {
  const tones: Record<string, StatusTone> = {
    "Pendiente por salir": "slate",
    "En ruta": "green",
    Pernoctado: "violet",
    Cargando: "amber",
    "Cambio de fecha": "orange",
    Recargue: "blue",
    Retornando: "indigo",
    Finalizado: "green",
  };

  return tones[status] ?? "slate";
}

function isVehicleInRange(vehicle: Vehiculo, range: { from: string; to: string }) {
  const dateKey = parseDate(vehicle.fechaDespacho || vehicle.date || vehicle.createdAt);
  return Boolean(dateKey) && dateKey >= range.from && dateKey <= range.to;
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

function formatDateRangeLabel(range: { from: string; to: string }) {
  if (range.from === range.to) return formatDateLabel(range.from);
  return `${formatDateLabel(range.from)} - ${formatDateLabel(range.to)}`;
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
  if (seconds <= 0) return "00:00:00";
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

