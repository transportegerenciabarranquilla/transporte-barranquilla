"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  ShieldAlert,
  Map,
  UserCheck,
  ClipboardList,
  TrendingDown,
  Package,
  CheckCircle2,
  XCircle,
  Users,
  AlertTriangle,
} from "lucide-react";

import { readSeguimientoVehiculos } from "../../lib/seguimientoStorage";
import {
  readModulacionRegistros,
  normalizeDt,
  summarizeModulaciones,
  type ModulacionRegistro,
} from "../../lib/modulacionStorage";

import { initialVehicles } from "../data";
import type { Vehiculo } from "../types";

/* ================= PALETA UNIFICADA ================= */
// Verde  → seguro / gestionado
// Ámbar  → advertencia
// Rojo   → crítico / rechazado
// Azul marino → neutro / total

const PALETTE = {
  safe: "#22c55e",   // verde
  warn: "#f59e0b",   // ámbar
  danger: "#ef4444", // rojo
  navy: "#10223d",   // azul marino
  track: "#e2e8f0",  // gris claro (fondo arco)
};

/* ================= TIPOS UI ================= */

type MetricCardProps = {
  label: string;
  value: number | string;
  color?: string;
  icon?: React.ReactNode;
  accent?: string;
};

type TerritorioRowProps = {
  label: string;
  value: number;
  max: number;
  index: number;
};

type RefusalGaugeProps = {
  value: number;
  max: number;
};

/* ================= HELPERS FECHAS EXCEL ================= */

function parseExcelDate(value: string | undefined) {
  if (!value) return null;

  if (typeof value === "string" && value.includes("/")) {
    const [d, m, y] = value.split("/").map(Number);
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function toKey(date: Date | null) {
  if (!date) return null;
  return date.toISOString().split("T")[0];
}

/* ================= PAGE ================= */

export default function SeguimientoRefusalPage() {
  const router = useRouter();

  const [vehicles] = useState<Vehiculo[]>(() => {
    try {
      const stored = readSeguimientoVehiculos();
      return stored?.length ? stored : initialVehicles;
    } catch {
      return initialVehicles;
    }
  });

  /* ================= SOLO MODULACIONES HOY ================= */

  const modulaciones = useMemo<ModulacionRegistro[]>(() => {
    const registros = readModulacionRegistros();
    const todayKey = new Date().toISOString().split("T")[0];

    return registros.filter((r) => {
      const date = parseExcelDate(r.createdAt as unknown as string);
      return toKey(date) === todayKey;
    });
  }, []);

  /* ================= SOLO VEHÍCULOS HOY ================= */

  const todayVehicles = useMemo(() => {
    const todayKey = new Date().toISOString().split("T")[0];

    return vehicles.filter((vehicle) => {
      const raw = vehicle.fechaDt || vehicle.date || vehicle.createdAt;

      const date =
        typeof raw === "string" && raw.includes("/")
          ? parseExcelDate(raw)
          : new Date(raw);

      return toKey(date) === todayKey;
    });
  }, [vehicles]);

  /* ================= DATA ================= */

  const refusalData = useMemo(() => {
    const totalCajasSeguimiento = todayVehicles.reduce(
      (acc, v) => acc + (v.cajas || 0),
      0
    );

    const resumenMod = summarizeModulaciones(
      modulaciones,
      totalCajasSeguimiento
    );

    return {
      totalCajasSeguimiento,
      rechazadas: resumenMod.cajasRechazadas,
      gestionadas: resumenMod.cajasReubicadas,
      pendientes: resumenMod.cajasPendientes,
      clientesRechazan: resumenMod.clientesRechazan,
      topeMaximo:
        resumenMod.topeMaximoCajas ||
        Math.floor(totalCajasSeguimiento / 100) ||
        1,
      porcentaje: resumenMod.refusal.toFixed(2),
      moduladores: resumenMod.moduladores,
    };
  }, [todayVehicles, modulaciones]);

  /* ================= TERRITORIO ================= */

  const territorioData = useMemo(() => {
    const map: Record<string, number> = {};

    modulaciones.forEach((m) => {
      const vh = todayVehicles.find(
        (v) => normalizeDt(v.transporte) === normalizeDt(m.dt)
      );

      const t = vh?.territorio || "SIN ASIGNAR";
      map[t] = (map[t] || 0) + Number(m.totalCajas || 0);
    });

    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [modulaciones, todayVehicles]);

  const maxTerritorio = Math.max(...territorioData.map((t) => t.value), 1);

  const refusalPct = parseFloat(refusalData.porcentaje);
  const refusalColor =
    refusalPct < 30
      ? "text-emerald-500"
      : refusalPct < 70
      ? "text-amber-500"
      : "text-red-500";

  /* ================= UI ================= */

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      {/* ── HEADER ── */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-10 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex gap-2">
            <button
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              onClick={() => router.push("/seguimiento/graficas")}
            >
              <ArrowLeft size={14} /> VOLVER
            </button>

            <button className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 shadow-sm">
              <ShieldAlert size={14} /> REFUSAL
            </button>
          </div>

          <div className="flex items-center gap-2 bg-[#10223d] px-4 py-1.5 rounded-full text-[10px] font-black text-white tracking-widest uppercase shadow">
            <BarChart3 size={12} className="text-yellow-400" />
            Operación Galapa &nbsp;·&nbsp; {new Date().toLocaleDateString()}
          </div>
        </div>
      </header>

      {/* ── BODY ── */}
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {todayVehicles.length === 0 ? (
          <div className="bg-white p-20 rounded-3xl border-2 border-dashed border-slate-200 text-center shadow-inner">
            <ShieldAlert size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 font-black uppercase tracking-widest">
              No hay vehículos disponibles en el sistema
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* ── COLUMNA IZQUIERDA ── */}
            <div className="lg:col-span-8 space-y-5">

              {/* Métricas principales */}
              <div className="grid grid-cols-3 gap-4">
                <MetricCard
                  label="Cajas Seguimiento"
                  value={refusalData.totalCajasSeguimiento}
                  icon={<Package size={18} className="text-[#10223d]" />}
                  accent="border-t-[#10223d]"
                />
                <MetricCard
                  label="Cajas Gestionadas"
                  value={refusalData.gestionadas}
                  color="text-emerald-600"
                  icon={<CheckCircle2 size={18} className="text-emerald-500" />}
                  accent="border-t-emerald-500"
                />
                <MetricCard
                  label="Cajas Rechazadas"
                  value={refusalData.rechazadas}
                  color="text-red-600"
                  icon={<XCircle size={18} className="text-red-500" />}
                  accent="border-t-red-500"
                />
              </div>

              {/* Clientes impactados + Tope */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-lg bg-amber-50">
                      <Users size={16} className="text-amber-500" />
                    </span>
                    <span className="text-[10px] font-black text-slate-400 uppercase leading-tight">
                      Clientes<br />
                    </span>
                  </div>
                  <span className="text-3xl font-black text-[#10223d]">
                    {refusalData.clientesRechazan}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-lg bg-red-50">
                      <AlertTriangle size={16} className="text-red-500" />
                    </span>
                    <span className="text-[10px] font-black text-slate-400 uppercase leading-tight">
                      Tope Permitido<br />
                    </span>
                  </div>
                  <span className="text-3xl font-black text-red-600">
                    {refusalData.topeMaximo}
                  </span>
                </div>
              </div>

              {/* % Refusal */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-50/60 to-transparent pointer-events-none" />
                <div className="flex items-center justify-center gap-2 mb-1">
                  <TrendingDown size={14} className="text-slate-400" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    % Refusal Real (Pendiente)
                  </p>
                </div>
                <p className={`text-6xl font-black tracking-tighter ${refusalColor}`}>
                  {refusalData.porcentaje}%
                </p>
              </div>

              {/* Personal en operación */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-yellow-400 px-5 py-2.5 flex items-center gap-2">
                  <UserCheck size={16} className="text-[#10223d]" />
                  <h3 className="text-[#10223d] text-[10px] font-black uppercase tracking-widest">
                    Personal en Operación
                  </h3>
                </div>

                <div className="p-4 flex flex-wrap gap-2">
                  {refusalData.moduladores.length > 0 ? (
                    refusalData.moduladores.map((m) => (
                      <span
                        key={m}
                        className="bg-[#10223d] text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wide shadow-sm"
                      >
                        {m}
                      </span>
                    ))
                  ) : (
                    <p className="text-[10px] text-slate-400 font-bold">
                      No hay registros de personal hoy
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── COLUMNA DERECHA ── */}
            <div className="lg:col-span-4 space-y-5">

              {/* Gauge */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                  Capacidad de Rechazo
                </h3>
                <RefusalGauge
                  value={refusalData.rechazadas}
                  max={refusalData.topeMaximo}
                />
                {/* Leyenda del gauge */}
                <div className="mt-4 flex gap-3 text-[9px] font-black uppercase">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: PALETTE.safe }} />
                    Seguro
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: PALETTE.warn }} />
                    Alerta
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: PALETTE.danger }} />
                    Crítico
                  </span>
                </div>
              </div>

              {/* Territorio */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-yellow-400 px-5 py-2.5 flex items-center gap-2">
                  <Map size={16} className="text-[#10223d]" />
                  <h3 className="text-[#10223d] text-[10px] font-black uppercase tracking-widest">
                    Impacto por Territorio
                  </h3>
                </div>

                <div className="p-4 space-y-3">
                  {territorioData.length > 0 ? (
                    territorioData.map((t, i) => (
                      <TerritorioRow
                        key={t.label}
                        label={t.label}
                        value={t.value}
                        max={maxTerritorio}
                        index={i}
                      />
                    ))
                  ) : (
                    <p className="text-[10px] text-slate-400 font-bold text-center py-4">
                      Sin rechazos hoy
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── TABLA DETALLE ── */}
            <div className="lg:col-span-12 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-yellow-400 px-5 py-2.5 flex items-center gap-2">
                <ClipboardList size={16} className="text-[#10223d]" />
                <h3 className="text-[#10223d] text-[10px] font-black uppercase tracking-widest">
                  Detalle de Modulaciones Hoy
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-[#10223d] text-white">
                      <th className="px-5 py-3 text-left font-black uppercase tracking-wide">
                        DT / Cliente
                      </th>
                      <th className="px-5 py-3 text-center font-black uppercase tracking-wide">
                        Cajas Rechazo
                      </th>
                      <th className="px-5 py-3 text-center font-black uppercase tracking-wide">
                        Reubicadas
                      </th>
                      <th className="px-5 py-3 text-right font-black uppercase tracking-wide">
                        Causal
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {modulaciones.length > 0 ? (
                      modulaciones.map((m, i) => (
                        <tr
                          key={m.id}
                          className={`transition-colors hover:bg-slate-50 ${
                            i % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                          }`}
                        >
                          <td className="px-5 py-3.5 font-black text-[#10223d]">
                            {m.dt}
                            <span className="text-[10px] text-slate-400 font-bold ml-2">
                              ({m.codigoCliente})
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="inline-flex items-center justify-center font-black text-red-600 bg-red-50 rounded-full px-2.5 py-0.5 text-[11px]">
                              {m.totalCajas}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="inline-flex items-center justify-center font-bold text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-0.5 text-[11px]">
                              {m.cajasReubicadas || 0}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right font-bold text-slate-500 uppercase">
                            {m.causal}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-5 py-12 text-center text-slate-400 font-bold"
                        >
                          No se han registrado modulaciones el día de hoy
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </section>
    </main>
  );
}

/* ================= COMPONENTS ================= */

function MetricCard({
  label,
  value,
  color = "text-[#10223d]",
  icon,
  accent = "border-t-[#10223d]",
}: MetricCardProps) {
  return (
    <div
      className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center border-t-4 ${accent} transition-shadow hover:shadow-md`}
    >
      {icon && (
        <div className="flex justify-center mb-2">{icon}</div>
      )}
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className={`text-3xl font-black ${color}`}>{value}</p>
    </div>
  );
}

// Colores de barra de territorio — misma paleta semáforo que el gauge
function getBarColor(index: number, pct: number): string {
  if (pct >= 70) return PALETTE.danger;
  if (pct >= 40) return PALETTE.warn;
  return PALETTE.safe;
}

function TerritorioRow({ label, value, max, index }: TerritorioRowProps) {
  const pct = Math.min(100, (value / max) * 100);
  const barColor = getBarColor(index, pct);

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-bold">
        <span className="text-slate-600 uppercase">{label}</span>
        <span className="font-black" style={{ color: barColor }}>
          {value}
        </span>
      </div>
      {/* Barra de progreso con el mismo color semáforo que el gauge */}
      <div className="h-1.5 w-full rounded-full" style={{ background: PALETTE.track }}>
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
    </div>
  );
}

function RefusalGauge({ value, max }: RefusalGaugeProps) {
  const percentage = Math.min(100, (value / max) * 100);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  // Misma lógica de color que las barras de territorio
  const arcColor =
    percentage < 30 ? PALETTE.safe : percentage < 70 ? PALETTE.warn : PALETTE.danger;

  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        {/* Pista de fondo */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={PALETTE.track}
          strokeWidth="10"
        />
        {/* Arco de progreso */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={arcColor}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
        />
      </svg>

      {/* Texto central */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-2xl font-black leading-none"
          style={{ color: arcColor }}
        >
          {value}
        </span>
        <span className="text-[9px] font-black text-slate-400 uppercase mt-0.5">
          / {max}
        </span>
      </div>
    </div>
  );
}