"use client";

import { useMemo, useState, type ReactNode,  } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, TrendingUp, Users, AlertTriangle, X, ShieldAlert } from "lucide-react";
import { readSeguimientoVehiculos } from "../../lib/seguimientoStorage";
import { initialVehicles } from "../data";
import type { Vehiculo } from "../types";
import { getStatus, getVehicleRecordKey } from "../utils";

export default function SeguimientoGraficasPage() {
  const router = useRouter();

  const [vehicles] = useState<Vehiculo[]>(() => {
    const stored = readSeguimientoVehiculos();
    return stored.length ? stored : initialVehicles;
  });

  const [alertasCerradas, setAlertasCerradas] = useState<string[]>([]);

  const todayVehicles = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return vehicles.filter((vehicle) => {
      const vehicleDate = vehicle.fechaDt || vehicle.date || vehicle.createdAt;
      if (!vehicleDate) return true;
      const vDate = new Date(vehicleDate).toISOString().split("T")[0];
      return vDate === today;
    });
  }, [vehicles]);

  const resumen = useMemo(() => {
    const totalClientes = todayVehicles.reduce((total, item) => total + (item.clientes || 0), 0);
    const totalVisitados = todayVehicles.reduce((total, item) => total + (item.visitados || 0), 0);
    const totalCajas = todayVehicles.reduce((total, item) => total + (item.cajas || 0), 0);
    const totalHL = todayVehicles.reduce((total, item) => total + (item.hl || 0), 0);
    
    const porcentajeAvance = totalClientes > 0 ? Math.round((totalVisitados / totalClientes) * 100) : 0;

    const totalSegundos = todayVehicles.reduce((acc, v) => {
      const tiempoStr = v.tiempoRuta || "00:00:00";
      const parts = tiempoStr.split(':').map(Number);
      const h = parts[0] || 0;
      const m = parts[1] || 0;
      const s = parts[2] || 0;
      return acc + (h * 3600 + m * 60 + s);
    }, 0);
    const promedioSegundos = todayVehicles.length > 0 ? totalSegundos / todayVehicles.length : 0;

    const ocupacionTotal = todayVehicles.length > 0 ? (totalCajas / (todayVehicles.length * 500)) * 100 : 0;

    return {
      vehiculos: todayVehicles.length,
      cajas: totalCajas,
      hl: totalHL.toFixed(1),
      avance: Math.min(100, porcentajeAvance),
      clientes: totalClientes,
      visitados: totalVisitados,
      tiempoPromedio: formatearSegundos(promedioSegundos),
      capacityOccupation: Math.min(100, ocupacionTotal).toFixed(2),
    };
  }, [todayVehicles]);

  const UMBRAL_RETRASO = 25;

  const alertasCriticas = useMemo(() => {
    if (todayVehicles.length === 0) return [];
    
    const promedioAvance = resumen.avance;
    return todayVehicles
      .map(v => {
        const p = v.clientes ? Math.round((v.visitados / v.clientes) * 100) : 0;
        return { ...v, currentProgress: p };
      })
      .filter(v => {
        const key = getVehicleRecordKey(v);
        return (promedioAvance - v.currentProgress > UMBRAL_RETRASO) && !alertasCerradas.includes(key);
      });
  }, [todayVehicles, resumen.avance, alertasCerradas]);

  const cerrarAlerta = (key: string) => {
    setAlertasCerradas(prev => [...prev, key]);
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="fixed top-20 right-5 z-50 space-y-3 max-w-sm w-full pointer-events-none">
        {alertasCriticas.map((vh) => (
          <div 
            key={getVehicleRecordKey(vh)} 
            className="bg-white border-l-4 border-red-500 shadow-2xl rounded-lg p-4 pointer-events-auto animate-in slide-in-from-right duration-500"
          >
            <div className="flex items-start gap-3">
              <div className="bg-red-100 p-2 rounded-full text-red-600">
                <AlertTriangle size={18} />
              </div>
              <div className="flex-1">
                <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Alerta de Retraso Operativo</h4>
                <p className="text-[10px] text-slate-500 font-bold mt-0.5 leading-relaxed">
                  Vehículo <span className="text-red-600 font-black">{vh.transporte}</span> presenta un retraso crítico de <span className="text-red-600 font-black">{resumen.avance - vh.currentProgress}%</span> frente al promedio.
                </p>
                <button 
                  onClick={() => cerrarAlerta(getVehicleRecordKey(vh))}
                  className="mt-2.5 bg-slate-900 text-white text-[9px] font-black px-3 py-1.5 rounded uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95"
                >
                  Confirmar Seguimiento
                </button>
              </div>
              <button onClick={() => cerrarAlerta(getVehicleRecordKey(vh))} className="text-slate-300 hover:text-slate-500">
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <header className="border-b border-slate-200 bg-white sticky top-0 z-10 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 sm:px-6">
          <div className="flex gap-2">
            <button
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              onClick={() => router.push("/seguimiento")}
            >
              <ArrowLeft size={14} />
              REGRESAR
            </button>
            <button
              className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors border border-red-100"
              onClick={() => router.push("/seguimiento/refusal")}
            >
              <ShieldAlert size={14} />
              REFUSAL
            </button>
          </div>
          <div className="flex items-center gap-2 bg-[#10223d] px-4 py-1.5 rounded-full text-[10px] font-black text-white tracking-widest uppercase">
            <BarChart3 size={12} className="text-yellow-400" />
            Operaciones Tiempo Real
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-3 space-y-4">
            <MetricBox label="Tiempo Promedio" value={resumen.tiempoPromedio} color="text-[#10223d]" />
            <MetricBox label="Ocupación" value={`${resumen.capacityOccupation}%`} color="text-[#10223d]" />
            <div className="grid grid-cols-2 gap-3">
              <SmallBox label="Cajas" value={resumen.cajas} />
              <SmallBox label="Viajes" value={resumen.vehiculos} />
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Estatus de Flota</p>
              <div className="space-y-3">
                <StatusItem label="Termino" count={todayVehicles.filter(v => (v.visitados >= v.clientes && v.clientes > 0)).length} color="bg-emerald-500" />
                <StatusItem label="En Ruta" count={todayVehicles.length} color="bg-blue-500" />
                <StatusItem label="cargando" count={alertasCriticas.length} color="bg-blue-500" />
                <StatusItem label="pernoctado" count={alertasCriticas.length} color="bg-indigo-500" />
                <StatusItem label="Alertas" count={alertasCriticas.length} color="bg-red-500" />
              </div>
            </div>
          </div>

          <div className="lg:col-span-9 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <ChartCard title="Avance Global de Ruta" icon={<TrendingUp size={16}/>}>
                <ModernGauge percentage={resumen.avance} />
              </ChartCard>
              <ChartCard title="Cumplimiento de Visitas" icon={<Users size={16}/>}>
                <ModernProgress visitados={resumen.visitados} total={resumen.clientes} />
              </ChartCard>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-900 px-5 py-3.5 flex justify-between items-center">
                <h3 className="text-white text-xs font-black uppercase tracking-widest">Detalle Operativo Inteligente</h3>
                <span className="bg-yellow-400 text-[#10223d] text-[9px] font-black px-2 py-0.5 rounded">THRESHOLD 25%</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="px-5 py-3 text-left font-black uppercase tracking-tighter">Vehículo / Transporte</th>
                      <th className="px-5 py-3 text-center font-black uppercase tracking-tighter">Visitas</th>
                      <th className="px-5 py-3 text-center font-black uppercase tracking-tighter">Avance %</th>
                      <th className="px-5 py-3 text-right font-black uppercase tracking-tighter">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {todayVehicles.map((vehicle) => {
                      const clientes = vehicle.clientes || 0;
                      const visitados = vehicle.visitados || 0;
                      const percentage = clientes > 0 ? Math.min(100, Math.round((visitados / clientes) * 100)) : 0;
                      const status = getStatus(percentage / 100);
                      const isAtrasado = resumen.avance - percentage > UMBRAL_RETRASO;
                      return (
                        <tr key={getVehicleRecordKey(vehicle)} className={`${isAtrasado ? 'bg-red-50/40' : ''} hover:bg-slate-50/50 transition-colors`}>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              {isAtrasado && <AlertTriangle size={12} className="text-red-500 animate-pulse" />}
                              <div>
                                <p className="font-black text-[#10223d]">{vehicle.transporte}</p>
                                <p className="text-[10px] text-slate-400 font-bold">{vehicle.vehiculo}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-center font-black text-[#10223d]">{visitados} <span className="text-slate-300 mx-1">/</span> {clientes}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3 justify-center">
                              <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                <div className={`h-full transition-all duration-700 ${isAtrasado ? 'bg-red-500' : (percentage === 100 ? 'bg-emerald-500' : 'bg-blue-500')}`} style={{ width: `${percentage}%` }} />
                              </div>
                              <span className={`font-black w-8 ${isAtrasado ? 'text-red-600' : 'text-[#10223d]'}`}>{percentage}%</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right"><StatusPill status={status} isAtrasado={isAtrasado} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-3xl font-black ${color} tracking-tighter`}>{value}</p>
    </div>
  );
}

function SmallBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
      <p className="text-[9px] font-bold text-slate-400 uppercase">{label}</p>
      <p className="text-xl font-black text-[#10223d]">{value}</p>
    </div>
  );
}

function StatusItem({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className={`w-2 h-2 ${color} rounded-full`}></div>
        <span className="font-bold text-slate-600 text-[11px]">{label}</span>
      </div>
      <span className="font-black text-[#10223d] bg-slate-100 px-2 py-0.5 rounded-lg text-[10px]">{count}</span>
    </div>
  );
}

function ChartCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="px-5 py-3.5 border-b border-slate-50 flex items-center gap-2">
        <span className="text-blue-500">{icon}</span>
        <h3 className="text-[10px] font-black text-[#10223d] uppercase tracking-widest">{title}</h3>
      </div>
      <div className="p-6 flex-1 flex items-center justify-center">{children}</div>
    </div>
  );
}

function ModernGauge({ percentage }: { percentage: number }) {
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (percentage / 100) * circumference;
  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="10" />
        <circle cx="50" cy="50" r="40" fill="none" stroke={percentage === 100 ? "#10b981" : "#3b82f6"} strokeWidth="10" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-black text-[#10223d] tracking-tighter">{percentage}%</span>
        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Global</span>
      </div>
    </div>
  );
}

function ModernProgress({ visitados, total }: { visitados: number; total: number }) {
  const percentage = total > 0 ? Math.min(100, (visitados / total) * 100) : 0;
  return (
    <div className="w-full max-w-[200px] space-y-4">
      <div className="flex justify-between items-end">
        <div>
          <p className="text-4xl font-black text-[#10223d] leading-none">{visitados}</p>
          <p className="text-[9px] font-black text-slate-400 uppercase mt-1">Logradas</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-black text-slate-300 leading-none">{total}</p>
          <p className="text-[9px] font-black text-slate-400 uppercase mt-1">Meta</p>
        </div>
      </div>
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
        <div className="h-full bg-yellow-400 transition-all duration-1000" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function StatusPill({ status, isAtrasado }: { status: string; isAtrasado?: boolean }) {
  if (isAtrasado) return <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase border bg-red-50 text-red-600 border-red-100 animate-pulse">Retraso Crítico</span>;
  const styles: Record<string, string> = {
    "Finalizado": "bg-emerald-50 text-emerald-600 border-emerald-100",
    "En ruta": "bg-blue-50 text-blue-600 border-blue-100",
    "Retornando": "bg-indigo-50 text-indigo-600 border-indigo-100",
    "Cargando": "bg-slate-50 text-slate-500 border-slate-100",
  };
  const label = status === "Finalizado" ? "Terminado" : status;
  return <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${styles[status] || "bg-slate-50 text-slate-400"}`}>{label}</span>;
}

function formatearSegundos(segundos: number): string {
  if (segundos <= 0) return "00:00:00";
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}