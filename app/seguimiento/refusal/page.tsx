"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Map,
  Package,
  TrendingDown,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { AnalyticsViewToggle } from "../components/AnalyticsViewToggle";
import { readSeguimientoVehiculos } from "../../lib/seguimientoStorage";
import { normalizeDt, readModulacionRegistros, summarizeModulaciones, type ModulacionRegistro } from "../../lib/modulacionStorage";
import { initialVehicles } from "../data";
import type { Vehiculo } from "../types";

const PALETTE = {
  safe: "#0f7c58",
  warn: "#f5bd19",
  danger: "#dc2626",
  navy: "#10223d",
  track: "#e2e8f0",
};

export default function SeguimientoRefusalPage() {
  const router = useRouter();
  const [vehicles] = useState<Vehiculo[]>(() => {
    const stored = readSeguimientoVehiculos();
    return stored.length ? stored : initialVehicles;
  });

  const modulaciones = useMemo<ModulacionRegistro[]>(() => {
    return readModulacionRegistros().filter((registro) => toDateKey(registro.createdAt) === todayKey());
  }, []);

  const todayVehicles = useMemo(() => vehicles.filter((vehicle) => toDateKey(vehicle.fechaDt || vehicle.date || vehicle.createdAt) === todayKey()), [vehicles]);

  const refusalData = useMemo(() => {
    const totalCajasSeguimiento = todayVehicles.reduce((acc, vehicle) => acc + (vehicle.cajas || 0), 0);
    const resumen = summarizeModulaciones(modulaciones, totalCajasSeguimiento);

    return {
      totalCajasSeguimiento,
      rechazadas: resumen.cajasRechazadas,
      gestionadas: resumen.cajasReubicadas,
      pendientes: resumen.cajasPendientes,
      clientesRechazan: resumen.clientesRechazan,
      topeMaximo: resumen.topeMaximoCajas || Math.floor(totalCajasSeguimiento / 100) || 1,
      porcentaje: resumen.refusal,
      moduladores: resumen.moduladores,
    };
  }, [modulaciones, todayVehicles]);

  const territorioData = useMemo(() => {
    const map: Record<string, number> = {};

    modulaciones.forEach((modulacion) => {
      const vehicle = todayVehicles.find((item) => normalizeDt(item.transporte) === normalizeDt(modulacion.dt));
      const territorio = vehicle?.territorio || "Sin asignar";
      map[territorio] = (map[territorio] || 0) + Number(modulacion.totalCajas || 0);
    });

    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [modulaciones, todayVehicles]);

  const maxTerritorio = Math.max(...territorioData.map((item) => item.value), 1);
  const refusalTone = getRefusalTone(refusalData.porcentaje);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100"
              onClick={() => router.push("/seguimiento")}
              type="button"
              aria-label="Volver a seguimiento"
            >
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#dc2626]">Analítica diaria</p>
              <h1 className="text-2xl font-semibold text-[#10223d]">Control de refusal</h1>
            </div>
          </div>
          <AnalyticsViewToggle active="refusal" />
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <RefusalMetric icon={<Package size={21} />} label="Cajas seguimiento" value={refusalData.totalCajasSeguimiento} />
          <RefusalMetric icon={<XCircle size={21} />} label="Rechazadas" value={refusalData.rechazadas} tone="red" />
          <RefusalMetric icon={<CheckCircle2 size={21} />} label="Gestionadas" value={refusalData.gestionadas} tone="green" />
          <RefusalMetric icon={<Users size={21} />} label="Clientes" value={refusalData.clientesRechazan} tone="amber" />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-[#10223d]">
                <TrendingDown size={19} />
                <h2 className="text-lg font-semibold">Resumen de refusal</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${refusalTone.badge}`}>
                {refusalTone.label}
              </span>
            </div>

            <div className="grid gap-6 md:grid-cols-[220px_1fr] md:items-center">
              <RefusalGauge value={refusalData.rechazadas} max={refusalData.topeMaximo} percentage={refusalData.porcentaje} />
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="font-medium text-slate-600">Pendientes</span>
                    <span className="font-semibold text-[#10223d]">{refusalData.pendientes} cajas</span>
                  </div>
                  <Progress value={Math.min(100, refusalData.topeMaximo ? (refusalData.pendientes / refusalData.topeMaximo) * 100 : 0)} color="bg-[#dc2626]" />
                </div>
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="font-medium text-slate-600">Gestionadas</span>
                    <span className="font-semibold text-[#10223d]">{refusalData.gestionadas} cajas</span>
                  </div>
                  <Progress value={Math.min(100, refusalData.rechazadas ? (refusalData.gestionadas / refusalData.rechazadas) * 100 : 0)} color="bg-[#0f7c58]" />
                </div>
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-[#10223d]">Tope máximo: {refusalData.topeMaximo} cajas</p>
                  <p className="mt-1 text-sm text-slate-500">El porcentaje se calcula con las cajas pendientes frente al tope permitido.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center gap-2 text-[#10223d]">
              <UserCheck size={19} />
              <h2 className="text-lg font-semibold">Personal y territorio</h2>
            </div>

            <div className="mb-5">
              <p className="mb-3 text-sm font-medium text-slate-500">Personal en operación</p>
              <div className="flex flex-wrap gap-2">
                {refusalData.moduladores.length ? (
                  refusalData.moduladores.map((name) => (
                    <span className="rounded-md bg-[#10223d] px-3 py-2 text-sm font-semibold text-white" key={name}>
                      {name}
                    </span>
                  ))
                ) : (
                  <span className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-500">Sin registros hoy</span>
                )}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2 text-slate-600">
                <Map size={17} />
                <p className="text-sm font-medium">Impacto por territorio</p>
              </div>
              <div className="space-y-3">
                {territorioData.length ? (
                  territorioData.map((item) => (
                    <TerritoryRow key={item.label} label={item.label} value={item.value} max={maxTerritorio} />
                  ))
                ) : (
                  <p className="rounded-lg bg-slate-50 p-4 text-center text-sm font-medium text-slate-500">Sin rechazos registrados hoy</p>
                )}
              </div>
            </div>
          </section>
        </div>

        <section className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList size={19} className="text-[#10223d]" />
              <div>
                <h2 className="text-lg font-semibold text-[#10223d]">Detalle de modulaciones</h2>
                <p className="mt-1 text-sm text-slate-500">Registros del día asociados a rechazo y reubicación.</p>
              </div>
            </div>
            <span className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {modulaciones.length} registros
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-5 py-4 text-left">DT / Cliente</th>
                  <th className="px-5 py-4 text-left">Persona</th>
                  <th className="px-5 py-4 text-center">Rechazo</th>
                  <th className="px-5 py-4 text-center">Reubicadas</th>
                  <th className="px-5 py-4 text-right">Causal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {modulaciones.length ? (
                  modulaciones.map((item) => (
                    <tr className="transition hover:bg-slate-50" key={item.id}>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[#10223d]">DT {item.dt}</p>
                        <p className="text-sm text-slate-500">Cliente {item.codigoCliente}</p>
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-600">{item.persona}</td>
                      <td className="px-5 py-4 text-center">
                        <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">{item.totalCajas}</span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">{item.cajasReubicadas || 0}</span>
                      </td>
                      <td className="px-5 py-4 text-right text-sm font-medium text-slate-600">{item.causal}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-5 py-12 text-center text-sm font-medium text-slate-500" colSpan={5}>
                      No se han registrado modulaciones hoy.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
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
        <circle
          cx="55"
          cy="55"
          r={radius}
          fill="none"
          stroke={tone.color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="11"
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-4xl font-semibold" style={{ color: tone.color }}>
          {percentage.toFixed(2)}%
        </p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          {value} / {max} cajas
        </p>
      </div>
    </div>
  );
}

function Progress({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 rounded-full bg-slate-200">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${value}%` }} />
    </div>
  );
}

function TerritoryRow({ label, value, max }: { label: string; value: number; max: number }) {
  const percentage = Math.min(100, (value / max) * 100);
  const color = percentage > 70 ? "bg-red-500" : percentage > 40 ? "bg-[#f5bd19]" : "bg-[#0f7c58]";

  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-semibold text-[#10223d]">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function getRefusalTone(value: number) {
  if (value < 30) return { color: PALETTE.safe, label: "Controlado", badge: "border-emerald-100 bg-emerald-50 text-emerald-700" };
  if (value < 70) return { color: PALETTE.warn, label: "En alerta", badge: "border-amber-100 bg-amber-50 text-amber-700" };
  return { color: PALETTE.danger, label: "Crítico", badge: "border-red-100 bg-red-50 text-red-700" };
}

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

function toDateKey(value: string | undefined) {
  if (!value) return "";
  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(Number);
    return new Date(year, month - 1, day).toISOString().split("T")[0];
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
}
