"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock3, Route, ShieldCheck, UserRoundX } from "lucide-react";
import { useRouter } from "next/navigation";
import type { AsistenciaRegistro } from "../lib/asistenciaStorage";
import { ASISTENCIA_STORAGE_KEY, readAsistenciaRegistros } from "../lib/asistenciaStorage";
import { getLocalDateKey, MODULACION_STORAGE_KEY, readModulacionRegistros, type ModulacionRegistro } from "../lib/modulacionStorage";
import { refreshRemoteRecords } from "../lib/remoteStore";
import { readSeguimientoVehiculos, SEGUIMIENTO_STORAGE_KEY } from "../lib/seguimientoStorage";
import { useStorageSnapshot } from "../lib/storageEvents";
import type { Vehiculo } from "../seguimiento/types";
import { getProgress, getStatus, isLateDepartureTime } from "../seguimiento/utils";

const REFRESH_MS = 45_000;

type AlertItem = {
  id: string;
  title: string;
  value: number;
  detail: string;
  tone: string;
  accent: string;
  href: string;
  icon: "responsible" | "attendance" | "late" | "progress" | "modulation";
};

export function OperationalAlerts({ isAdmin = false, isPeople = false }: { isAdmin?: boolean; isPeople?: boolean }) {
  const router = useRouter();
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const vehicles = useStorageSnapshot<Vehiculo[]>([SEGUIMIENTO_STORAGE_KEY], readSeguimientoVehiculos, []);
  const attendances = useStorageSnapshot<AsistenciaRegistro[]>([ASISTENCIA_STORAGE_KEY], readAsistenciaRegistros, []);
  const modulaciones = useStorageSnapshot<ModulacionRegistro[]>([MODULACION_STORAGE_KEY], readModulacionRegistros, []);

  useEffect(() => {
    if (isPeople) return;

    function refreshAll() {
      void Promise.all([
        refreshRemoteRecords("/api/seguimiento"),
        refreshRemoteRecords("/api/asistencias"),
        refreshRemoteRecords("/api/modulaciones"),
      ]).finally(() => setLastUpdatedAt(formatTime(new Date())));
    }

    refreshAll();

    const interval = window.setInterval(() => {
      refreshAll();
    }, REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [isPeople]);

  const todayKey = getLocalDateKey();
  const alerts = useMemo(() => buildAlerts(vehicles, attendances, modulaciones, todayKey, isAdmin), [attendances, isAdmin, modulaciones, todayKey, vehicles]);
  const totalIssues = alerts.reduce((total, alert) => total + alert.value, 0);
  const maxAlertValue = Math.max(...alerts.map((alert) => alert.value), 1);
  const criticalAlerts = alerts.filter((alert) => alert.value > 0).length;

  if (isPeople) return null;

  return (
    <section className="mb-7">
      <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white/90 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex items-start gap-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-md ${totalIssues ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"}`}>
              {totalIssues ? <Activity size={21} /> : <ShieldCheck size={21} />}
            </span>
            <div>
              <p className="text-sm font-medium text-slate-500">Operacion de hoy</p>
              <h2 className="mt-0.5 text-2xl font-semibold text-[#10223d]">Alertas operativas</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                {totalIssues ? "Prioriza las novedades abiertas por ruta, asistencia y modulacion." : "La operacion no registra novedades criticas en este momento."}
              </p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[420px]">
            <SummaryPill label="Novedades" value={totalIssues} tone={totalIssues ? "amber" : "green"} />
            <SummaryPill label="Frentes" value={criticalAlerts} tone={criticalAlerts ? "blue" : "green"} />
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Actualizado</p>
              <p className="mt-1 truncate text-sm font-semibold text-[#10223d]">{lastUpdatedAt || "Sincronizando"}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="rounded-md bg-white px-2.5 py-1 text-[#10223d] ring-1 ring-slate-200">Fecha {todayKey}</span>
            <span>{vehicles.length} rutas en memoria</span>
            <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />
            <span>{attendances.length} asistencias</span>
            <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:inline-block" />
            <span>{modulaciones.length} modulaciones</span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {alerts.map((alert) => (
          <button
            className={`group relative min-h-36 overflow-hidden rounded-lg border border-slate-200 bg-white/92 p-4 text-left shadow-[0_14px_32px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-[0_18px_42px_rgba(15,23,42,0.11)] ${alert.accent}`}
            key={alert.id}
            onClick={() => router.push(alert.href)}
            type="button"
          >
            <span className="absolute inset-x-0 top-0 h-1 bg-current opacity-70" />
            <span className="flex items-start justify-between gap-3">
              <span className={`grid h-10 w-10 place-items-center rounded-md ${alert.tone}`}>
                <AlertIcon name={alert.icon} />
              </span>
              <span className="text-right">
                <span className="block text-3xl font-semibold leading-none text-[#10223d]">{alert.value}</span>
                <span className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${alert.value ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>
                  {alert.value ? "Revisar" : "OK"}
                </span>
              </span>
            </span>
            <span className="mt-4 block text-sm font-semibold text-[#10223d]">{alert.title}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">{alert.detail}</span>
            <span className="mt-4 block h-1.5 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-current transition-all" style={{ width: `${Math.max(8, (alert.value / maxAlertValue) * 100)}%` }} />
            </span>
            <span className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Abrir detalle</span>
              <ArrowRight className="transition group-hover:translate-x-0.5" size={15} />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function buildAlerts(vehicles: Vehiculo[], attendances: AsistenciaRegistro[], modulaciones: ModulacionRegistro[], todayKey: string, isAdmin: boolean): AlertItem[] {
  const todayVehicles = vehicles.filter((vehicle) => toDateKey(vehicle.fechaDespacho || vehicle.date || vehicle.createdAt) === todayKey);
  const attendanceKeys = new Set(
    attendances
      .map((record) => {
        const dt = normalizeDt(record.dt);
        const date = toDateKey(record.createdAt);
        const contractor = normalizeText(record.contratista);
        return dt && date ? `${contractor}:${dt}:${date}` : "";
      })
      .filter(Boolean),
  );

  const withoutResponsible = todayVehicles.filter(isWithoutResponsible).length;
  const withoutAttendance = todayVehicles.filter((vehicle) => {
    const dt = normalizeDt(vehicle.transporte);
    const date = toDateKey(vehicle.fechaDespacho || vehicle.date || vehicle.createdAt);
    const contractor = normalizeText(vehicle.transportista);
    return dt && date && !attendanceKeys.has(`${contractor}:${dt}:${date}`);
  }).length;
  const lateDepartures = todayVehicles.filter((vehicle) => vehicle.causalSalidaTardia || isLateDepartureTime(vehicle.horaSalida)).length;
  const lowProgress = todayVehicles.filter((vehicle) => {
    const status = getStatus(getProgress(vehicle), vehicle);
    return !["Finalizado", "Pernoctado", "Cambio de fecha"].includes(status) && getProgress(vehicle) < 50;
  }).length;
  const pendingModulation = modulaciones.filter((record) => {
    const date = toDateKey(record.fechaDespacho || record.fechaDt || record.createdAt);
    const rejected = Number(record.totalCajas || 0);
    const managed = Number(record.cajasGestionadas || 0);
    return date === todayKey && rejected > managed;
  }).length;

  const seguimientoToday = `/seguimiento?fecha=${encodeURIComponent(todayKey)}`;
  const adminAlertHref = (alert: string) => `/admin?tab=errores&fecha=${encodeURIComponent(todayKey)}&alerta=${encodeURIComponent(alert)}`;

  return [
    {
      id: "responsible",
      title: "Sin responsable",
      value: withoutResponsible,
      detail: "Rutas de hoy sin cedula o nombre asociado.",
      tone: withoutResponsible ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700",
      accent: withoutResponsible ? "text-red-500" : "text-emerald-500",
      href: isAdmin ? adminAlertHref("sin-responsable") : `${seguimientoToday}&sinResponsable=1`,
      icon: "responsible",
    },
    {
      id: "attendance",
      title: "Sin asistencia",
      value: withoutAttendance,
      detail: "DT de hoy sin registro de asistencia.",
      tone: withoutAttendance ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700",
      accent: withoutAttendance ? "text-amber-500" : "text-emerald-500",
      href: isAdmin ? adminAlertHref("sin-asistencia") : seguimientoToday,
      icon: "attendance",
    },
    {
      id: "late",
      title: "Salidas tardias",
      value: lateDepartures,
      detail: "Rutas con salida posterior al umbral operativo.",
      tone: lateDepartures ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700",
      accent: lateDepartures ? "text-orange-500" : "text-emerald-500",
      href: isAdmin ? adminAlertHref("salida-tardia") : `${seguimientoToday}&estado=${encodeURIComponent("En ruta")}`,
      icon: "late",
    },
    {
      id: "progress",
      title: "Bajo avance",
      value: lowProgress,
      detail: "Rutas activas por debajo de 50% de visitas.",
      tone: lowProgress ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700",
      accent: lowProgress ? "text-sky-500" : "text-emerald-500",
      href: isAdmin ? adminAlertHref("bajo-avance") : `${seguimientoToday}&estado=${encodeURIComponent("En ruta")}`,
      icon: "progress",
    },
    {
      id: "modulation",
      title: "Modulacion pendiente",
      value: pendingModulation,
      detail: "Clientes con cajas rechazadas sin gestion completa.",
      tone: pendingModulation ? "bg-violet-50 text-violet-700" : "bg-emerald-50 text-emerald-700",
      accent: pendingModulation ? "text-violet-500" : "text-emerald-500",
      href: isAdmin ? adminAlertHref("modulacion-pendiente") : "/modulacion",
      icon: "modulation",
    },
  ];
}

function SummaryPill({ label, tone, value }: { label: string; tone: "amber" | "blue" | "green"; value: number }) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : tone === "blue"
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">{label}</p>
      <p className="mt-1 text-xl font-semibold leading-none">{value}</p>
    </div>
  );
}

function AlertIcon({ name }: { name: AlertItem["icon"] }) {
  const props = { size: 20, strokeWidth: 2 };
  if (name === "responsible") return <UserRoundX {...props} />;
  if (name === "attendance") return <CheckCircle2 {...props} />;
  if (name === "late") return <Clock3 {...props} />;
  if (name === "progress") return <Route {...props} />;
  return <AlertTriangle {...props} />;
}

function isWithoutResponsible(vehicle: Vehiculo) {
  return !vehicle.cedulaResponsable?.trim() && !vehicle.nombreResponsable?.trim() && !vehicle.responsable?.trim();
}

function normalizeDt(value: string | number | undefined) {
  return String(value ?? "")
    .replace(/^DT-?/i, "")
    .replace(/\D/g, "");
}

function normalizeText(value: string | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function toDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(Number);
    if ([day, month, year].every(Number.isFinite)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
