"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, ShieldAlert,  Map, UserCheck } from "lucide-react";
import { readSeguimientoVehiculos } from "../../lib/seguimientoStorage";
import { initialVehicles } from "../data";
import type { Vehiculo } from "../types";
import { getStatus } from "../utils";

export default function SeguimientoRefusalPage() {
  const router = useRouter();

  const [vehicles] = useState<Vehiculo[]>(() => {
    const stored = readSeguimientoVehiculos();
    return stored.length ? stored : initialVehicles;
  });

  const todayVehicles = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return vehicles.filter((vehicle) => {
      const vehicleDate = vehicle.fechaDt || vehicle.date || vehicle.createdAt;
      if (!vehicleDate) return true;
      const vDate = new Date(vehicleDate).toISOString().split("T")[0];
      return vDate === today;
    });
  }, [vehicles]);

  // Cálculos dinámicos para Refusal (basados en datos de modulación)
  const refusalData = useMemo(() => {
    const reportadas = todayVehicles.reduce((acc, v) => acc + (v.cajasReportadas || 0), 0);
    const gestionadas = todayVehicles.reduce((acc, v) => acc + (v.cajasGestionadas || 0), 0);
    const rechazadas = todayVehicles.reduce((acc, v) => acc + (v.cajasRechazadas || 0), 0);
    const clientesRechazan = todayVehicles.filter(v => (v.cajasRechazadas || 0) > 0).length;
    
    const porcentajeRefusal = reportadas > 0 ? (rechazadas / reportadas) * 100 : 0;

    return {
      reportadas,
      gestionadas,
      rechazadas,
      clientesRechazan,
      topeMaximo: 45,
      porcentaje: porcentajeRefusal.toFixed(2),
    };
  }, [todayVehicles]);

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      {/* Header con Navegación */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 sm:px-6">
          <div className="flex gap-2">
            <button
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              onClick={() => router.push("/seguimiento-graficas")}
            >
              <ArrowLeft size={14} />
              VOLVER
            </button>
            <button
              className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors border border-red-100"
              onClick={() => router.push("/seguimiento-refusal")}
            >
              <ShieldAlert size={14} />
              REFUSAL
            </button>
          </div>
          <div className="flex items-center gap-2 bg-slate-900 px-4 py-1.5 rounded-full text-[10px] font-black text-white tracking-widest uppercase">
            <BarChart3 size={12} className="text-yellow-400" />
            Seguimiento Refusal
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Panel de Métricas Superiores */}
          <div className="lg:col-span-8 space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <MetricCard label="Cajas Reportadas" value={refusalData.reportadas} />
              <MetricCard label="Cajas Gestionadas" value={refusalData.gestionadas} />
              <MetricCard label="Cajas Rechazadas" value={refusalData.rechazadas} color="text-red-600" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase">Clientes que Rechazan</span>
                <span className="text-2xl font-black text-[#10223d]">{refusalData.clientesRechazan}</span>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase">Tope Máximo Cajas</span>
                <span className="text-2xl font-black text-[#10223d]">{refusalData.topeMaximo}</span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">% Refusal Día</p>
              <p className="text-5xl font-black text-emerald-500 tracking-tighter">{refusalData.porcentaje}%</p>
            </div>

            {/* Tabla Supervisor */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-yellow-400 px-5 py-2.5 flex items-center gap-2">
                <UserCheck size={16} className="text-[#10223d]" />
                <h3 className="text-[#10223d] text-[10px] font-black uppercase tracking-widest">Resumen por Supervisor</h3>
              </div>
              <table className="w-full text-[11px]">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="px-5 py-2.5 text-left font-black uppercase">Supervisor</th>
                    <th className="px-5 py-2.5 text-center font-black uppercase">Reportadas</th>
                    <th className="px-5 py-2.5 text-center font-black uppercase">Gestionadas</th>
                    <th className="px-5 py-2.5 text-center font-black uppercase">Rechazadas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-[#10223d]">Tony G / Cristian C</td>
                    <td className="px-5 py-3.5 text-center font-black">{refusalData.reportadas}</td>
                    <td className="px-5 py-3.5 text-center font-black">{refusalData.gestionadas}</td>
                    <td className="px-5 py-3.5 text-center font-black text-red-600">{refusalData.rechazadas}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Panel Lateral de Gráficas */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Capacidad de Rechazo</h3>
              <RefusalGauge value={refusalData.rechazadas} max={45} />
              <p className="mt-4 text-2xl font-black text-[#10223d]">{refusalData.rechazadas}</p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Status Refusal</h3>
              <RefusalGauge value={parseFloat(refusalData.porcentaje)} max={5} isPercentage />
              <p className="mt-4 text-2xl font-black text-[#10223d]">{refusalData.porcentaje}%</p>
            </div>

            {/* Territorio */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-yellow-400 px-5 py-2.5 flex items-center gap-2">
                <Map size={16} className="text-[#10223d]" />
                <h3 className="text-[#10223d] text-[10px] font-black uppercase tracking-widest">Territorio</h3>
              </div>
              <div className="p-4 space-y-3">
                <TerritorioRow label="PALMAR DE VARELA" value={17} />
                <TerritorioRow label="SANTO TOMAS" value={2} />
              </div>
            </div>
          </div>
        </div>

        {/* Detalle Refusal Tabla Inferior */}
        <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-yellow-400 px-5 py-2.5 flex items-center gap-2">
            <ShieldAlert size={16} className="text-[#10223d]" />
            <h3 className="text-[#10223d] text-[10px] font-black uppercase tracking-widest">Detalle Refusal</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="px-5 py-2.5 text-left font-black uppercase">Bloque</th>
                  <th className="px-5 py-2.5 text-left font-black uppercase">Vehículo</th>
                  <th className="px-5 py-2.5 text-left font-black uppercase">Responsable</th>
                  <th className="px-5 py-2.5 text-center font-black uppercase">Estatus</th>
                  <th className="px-5 py-2.5 text-right font-black uppercase">Cajas Rechazo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {todayVehicles.filter(v => (v.cajasRechazadas || 0) > 0).map((v) => (
                  <tr key={v.transporte} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-slate-500">Tony G / Cristian C</td>
                    <td className="px-5 py-3.5 font-black text-[#10223d]">{v.transporte}</td>
                    <td className="px-5 py-3.5 font-bold text-slate-600">{v.responsable || "---"}</td>
                    <td className="px-5 py-3.5 text-center">
                      <StatusPill status={getVehicleStatus(v)} />
                    </td>
                    <td className="px-5 py-3.5 text-right font-black text-red-600">{v.cajasRechazadas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    "Pendiente por salir": "bg-slate-50 text-slate-700 border-slate-200",
    "En ruta": "bg-blue-50 text-blue-600 border-blue-100",
    Pernoctado: "bg-violet-50 text-violet-700 border-violet-100",
    Cargando: "bg-amber-50 text-amber-700 border-amber-100",
    "Cambio de fecha": "bg-orange-50 text-orange-700 border-orange-100",
    Finalizado: "bg-emerald-50 text-emerald-700 border-emerald-100",
  };

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${styles[status] ?? styles.Cargando}`}>
      {status}
    </span>
  );
}

function getVehicleStatus(vehicle: Vehiculo) {
  const progress = vehicle.clientes ? Math.min(100, Math.round((vehicle.visitados / vehicle.clientes) * 100)) : 0;
  return getStatus(progress, vehicle);
}

function MetricCard({ label, value, color = "text-[#10223d]" }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-center">
      <p className="text-[9px] font-black text-slate-400 uppercase mb-2">{label}</p>
      <p className={`text-3xl font-black ${color} tracking-tighter`}>{value}</p>
    </div>
  );
}

function TerritorioRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center text-[10px] font-bold border-b border-slate-50 pb-2">
      <span className="text-slate-500">{label}</span>
      <span className="text-[#10223d] font-black">{value}</span>
    </div>
  );
}

function RefusalGauge({ value, max, isPercentage = false }: { value: number; max: number; isPercentage?: boolean }) {
  const percentage = Math.min(100, (value / max) * 100);
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (percentage / 100) * circumference;
  
  const getColor = () => {
    if (percentage < 30) return "#22c55e"; // Verde
    if (percentage < 70) return "#eab308"; // Amarillo
    return "#ef4444"; // Rojo
  };

  return (
    <div className="relative w-32 h-32 flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="10" />
        <circle 
          cx="50" cy="50" r="40" fill="none" 
          stroke={getColor()} 
          strokeWidth="10" strokeDasharray={circumference} 
          strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-black text-[#10223d] tracking-tighter">{value}{isPercentage ? '%' : ''}</span>
      </div>
    </div>
  );
}
