"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Package, ShieldAlert, Table2 } from "lucide-react";
import { AnalyticsViewToggle } from "../../components/AnalyticsViewToggle";
import { getOperationalModulaciones, MODULACION_STORAGE_KEY, readModulacionRegistros, type ModulacionRegistro } from "../../../lib/modulacionStorage";
import { readSeguimientoVehiculos, SEGUIMIENTO_STORAGE_KEY } from "../../../lib/seguimientoStorage";
import { useStorageSnapshot } from "../../../lib/storageEvents";
import type { Vehiculo } from "../../types";

type RefusalRow = {
  causal: string;
  com: string;
  establecimiento: string;
  jefeVentas: string;
  placa: string;
  rechazadas: number;
  registro: ModulacionRegistro;
  rr: string;
};

export default function RefusalComPage() {
  const router = useRouter();
  const vehicles = useStorageSnapshot<Vehiculo[]>(
    [SEGUIMIENTO_STORAGE_KEY],
    readSeguimientoVehiculos,
    [],
  );
  const modulaciones = useStorageSnapshot<ModulacionRegistro[]>([MODULACION_STORAGE_KEY], readModulacionRegistros, []);
  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDateLabel(new Date().toLocaleDateString("es-CO"));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  const todayVehicles = useMemo(() => vehicles.filter(isTodayVehicle), [vehicles]);
  const operationalModulaciones = useMemo(
    () => getOperationalModulaciones(modulaciones, todayVehicles),
    [modulaciones, todayVehicles],
  );

  const rows = useMemo(() => {
    const vehicleByDt = new Map(todayVehicles.map((vehicle) => [normalizeDt(vehicle.transporte), vehicle]));

    return operationalModulaciones
      .map((registro) => {
        const vehicle = vehicleByDt.get(normalizeDt(registro.dt));

        return {
          causal: registro.causal || "Sin causal",
          com: getCom(registro, vehicle),
          establecimiento: registro.nombreCliente || `Cliente ${registro.codigoCliente}`,
          jefeVentas: getJefeVentas(vehicle),
          placa: vehicle?.vehiculo || `DT-${registro.dt}`,
          rechazadas: Number(registro.totalCajas || 0),
          registro,
          rr: registro.persona || vehicle?.responsable || "Sin asistencia",
        };
      })
      .sort((a, b) => b.rechazadas - a.rechazadas);
  }, [operationalModulaciones, todayVehicles]);

  const totals = useMemo(() => {
    const cajasRechazadas = rows.reduce((total, row) => total + row.rechazadas, 0);
    const cajasGestionadas = operationalModulaciones.reduce((total, registro) => total + Number(registro.cajasGestionadas || 0), 0);
    const cajasReportadas = todayVehicles.reduce((total, vehicle) => total + Number(vehicle.cajas || 0), 0);
    const refusal = cajasReportadas ? Number(((cajasRechazadas / cajasReportadas) * 100).toFixed(2)) : 0;

    return {
      cajasGestionadas,
      cajasRechazadas,
      cajasReportadas,
      refusal,
    };
  }, [operationalModulaciones, rows, todayVehicles]);

  const byJefe = useMemo(() => groupRows(rows, (row) => row.jefeVentas).slice(0, 6), [rows]);
  const byCausal = useMemo(() => groupRows(rows, (row) => row.causal).slice(0, 8), [rows]);
  const byCom = useMemo(() => groupRows(rows, (row) => row.com).slice(0, 18), [rows]);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              aria-label="Volver a graficas"
              className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100"
              onClick={() => router.push("/seguimiento/graficas")}
              type="button"
            >
              <ArrowLeft size={19} />
            </button>
            <img className="h-11 w-11 rounded-md object-contain" src="/favicon.ico" alt="Bavaria" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Detalle refusal</p>
              <h1 className="text-2xl font-semibold text-[#10223d]">refusal-com</h1>
            </div>
          </div>
          <AnalyticsViewToggle active="refusal-com" />
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-[#e9f3ff] text-[#10223d]">
                <ShieldAlert size={18} />
              </span>
              <div>
                <h2 className="text-base font-semibold text-[#10223d]">Detalle refusal por COM</h2>
                <p className="mt-0.5 text-xs text-slate-500">Resumen del dia cruzado con modulaciones y seguimiento.</p>
              </div>
            </div>
            <span className="rounded-md bg-[#e9f3ff] px-2.5 py-1.5 text-xs font-semibold text-[#10223d]">{dateLabel || "Hoy"}</span>
          </div>
          <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
              <TopMetric label="% refusal dia" value={`${totals.refusal.toLocaleString("es-CO")}%`} highlight />
              <TopMetric label="Cajas reportadas" value={totals.cajasReportadas} />
              <TopMetric label="Cajas gestionadas" value={totals.cajasGestionadas} />
              <TopMetric label="Cajas rechazadas" value={totals.cajasRechazadas} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.8fr]">
          <ChartPanel icon={<BarChart3 size={16} />} title="Cajas de rechazo por jefe de ventas">
            <HorizontalBars data={byJefe} color="bg-red-600" />
          </ChartPanel>
          <ChartPanel icon={<ShieldAlert size={16} />} title="Cajas rechazadas por causal">
            <VerticalBars data={byCausal} total={totals.cajasRechazadas} />
          </ChartPanel>
        </div>

        <div className="mt-4">
          <ChartPanel icon={<Package size={16} />} title="Cajas de rechazo por COM">
            <ComBars data={byCom} />
          </ChartPanel>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Table2 size={17} className="text-[#10223d]" />
              <h3 className="text-base font-semibold text-[#10223d]">Detalle refusal</h3>
            </div>
            <span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600">{rows.length} registros</span>
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[1040px]">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Establecimiento</th>
                  <th className="px-3 py-2 text-left">Causal</th>
                  <th className="px-3 py-2 text-left">RR</th>
                  <th className="px-3 py-2 text-left">Placa</th>
                  <th className="px-3 py-2 text-left">Jefe de ventas</th>
                  <th className="px-3 py-2 text-left">COM</th>
                  <th className="px-3 py-2 text-right">Cajas rechazadas</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row, index) => (
                    <tr className={index % 2 === 0 ? "bg-white" : "bg-slate-50"} key={row.registro.id}>
                      <td className="px-3 py-1.5 text-xs font-medium text-slate-700">{row.establecimiento}</td>
                      <td className="px-3 py-1.5 text-xs font-semibold text-slate-700">{row.causal}</td>
                      <td className="px-3 py-1.5 text-xs text-slate-700">{row.rr}</td>
                      <td className="px-3 py-1.5 text-xs font-semibold text-[#10223d]">{row.placa}</td>
                      <td className="px-3 py-1.5 text-xs text-slate-700">{row.jefeVentas}</td>
                      <td className="px-3 py-1.5 text-xs font-semibold text-[#10223d]">{row.com}</td>
                      <td className="px-3 py-1.5 text-right text-xs font-black text-red-700">{row.rechazadas}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm font-medium text-slate-500" colSpan={7}>
                      No hay registros de refusal para hoy.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}

function TopMetric({ label, value, highlight = false }: { label: string; value: ReactNode; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${highlight ? "text-[#0f7c58]" : "text-[#10223d]"}`}>{value}</p>
    </div>
  );
}

function ChartPanel({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-[#10223d]">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-[#e9f3ff]">{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function HorizontalBars({ data, color }: { data: Array<{ label: string; value: number }>; color: string }) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="space-y-2">
      {data.map((item, index) => (
        <div className="grid grid-cols-[120px_1fr_34px] items-center gap-2" key={item.label}>
          <span className="truncate text-[11px] font-semibold text-slate-700">{item.label}</span>
          <div className="h-5 rounded-sm bg-slate-100">
            <div className={`h-5 rounded-sm ${index === 0 ? "bg-red-500" : color}`} style={{ opacity: index === 0 ? 1 : 0.55, width: `${Math.max(5, (item.value / max) * 100)}%` }} />
          </div>
          <span className="text-right text-[11px] font-black text-slate-700">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function VerticalBars({ data, total }: { data: Array<{ label: string; value: number }>; total: number }) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="flex min-h-40 items-end gap-3 overflow-x-auto pb-1">
      {data.map((item, index) => (
        <div className="flex min-w-20 flex-1 flex-col items-center gap-2" key={item.label}>
          <span className="text-[10px] font-black text-slate-600">{total ? `${((item.value / total) * 100).toFixed(2)}%` : "0%"}</span>
          <div
            className={`w-full rounded-t-sm ${index === 0 ? "bg-red-500" : "bg-red-300"}`}
            style={{ height: `${Math.max(18, (item.value / max) * 110)}px`, opacity: index === 0 ? 1 : 0.75 }}
          />
          <span className="line-clamp-2 text-center text-[10px] font-semibold leading-tight text-slate-700">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function ComBars({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="flex min-h-32 items-end gap-2 overflow-x-auto pb-1">
      {data.map((item) => (
        <div className="flex min-w-14 flex-col items-center gap-1.5" key={item.label}>
          <span className="text-[10px] font-black text-slate-700">{item.value}</span>
          <div className="w-10 rounded-t-sm bg-[#f5bd19]" style={{ height: `${Math.max(12, (item.value / max) * 92)}px` }} />
          <span className="max-w-16 truncate text-[10px] font-black text-slate-700">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function groupRows(rows: RefusalRow[], getLabel: (row: RefusalRow) => string) {
  const totals = new Map<string, number>();

  rows.forEach((row) => {
    const label = getLabel(row) || "Sin asignacion";
    totals.set(label, (totals.get(label) || 0) + row.rechazadas);
  });

  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function getCom(registro: ModulacionRegistro, vehicle: Vehiculo | undefined) {
  const candidates = [vehicle?.bloque, vehicle?.viaje, vehicle?.territorio].filter(Boolean) as string[];
  const found = candidates.find((value) => /^COM/i.test(value.trim()));
  if (found) return found.trim().toUpperCase();

  const code = String(registro.codigoCliente || registro.dt || "0").replace(/\D/g, "");
  return code ? `COM${code.slice(-3).padStart(3, "0")}` : "Sin asignacion";
}

function getJefeVentas(vehicle: Vehiculo | undefined) {
  return vehicle?.territorio && vehicle.territorio !== "Pendiente" ? vehicle.territorio : vehicle?.responsable || "Sin asignacion";
}

function isTodayVehicle(vehicle: Vehiculo) {
  return isToday(vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || vehicle.createdAt);
}

function isToday(value: string | undefined) {
  if (!value) return false;

  const today = new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10) === toDateKey(today);

  return toDateKey(parsed) === toDateKey(today);
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeDt(value: string | number | undefined) {
  return String(value ?? "")
    .replace(/^DT-?/i, "")
    .replace(/\D/g, "");
}
