"use client";

import { useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileDown, Printer } from "lucide-react";
import { CHECKIN_STORAGE_KEY, getCheckinByDt, readCheckinCajasRegistros, type CheckinCajasRegistro } from "../../../lib/checkinStorage";
import { getLocalDateKey, getOperationalModulaciones, MODULACION_STORAGE_KEY, normalizeDt, readModulacionRegistros, summarizeModulaciones, type ModulacionRegistro } from "../../../lib/modulacionStorage";
import { SEGUIMIENTO_STORAGE_KEY } from "../../../lib/seguimientoStorage";
import { useStorageSnapshot } from "../../../lib/storageEvents";
import { initialVehicles } from "../../data";
import { loadSeguimientoVehiculos } from "../../services/vehicleRecords";
import type { Vehiculo } from "../../types";

type RefusalComRow = {
  causal: string;
  com: string;
  establecimiento: string;
  jefeVentas: string;
  placa: string;
  rechazadas: number;
  rr: string;
};

export default function ReportePdfPage() {
  const router = useRouter();
  const vehicles = useStorageSnapshot<Vehiculo[]>(
    [SEGUIMIENTO_STORAGE_KEY, MODULACION_STORAGE_KEY, CHECKIN_STORAGE_KEY],
    () => {
      const stored = loadSeguimientoVehiculos();
      return stored.length ? stored : initialVehicles;
    },
    initialVehicles,
  );
  const modulaciones = useStorageSnapshot<ModulacionRegistro[]>([MODULACION_STORAGE_KEY], readModulacionRegistros, []);
  const checkins = useStorageSnapshot<CheckinCajasRegistro[]>([CHECKIN_STORAGE_KEY], readCheckinCajasRegistros, []);

  const todayVehicles = useMemo(() => vehicles.filter(isTodayVehicle), [vehicles]);
  const todayModulaciones = useMemo(
    () => getOperationalModulaciones(modulaciones, todayVehicles),
    [modulaciones, todayVehicles],
  );

  const seguimiento = useMemo(() => {
    const clientes = todayVehicles.reduce((total, item) => total + (item.clientes || 0), 0);
    const visitados = todayVehicles.reduce((total, item) => total + (item.visitados || 0), 0);
    const cajas = todayVehicles.reduce((total, item) => total + (item.cajas || 0), 0);
    const hl = todayVehicles.reduce((total, item) => total + (item.hl || 0), 0);

    return {
      avance: clientes ? Math.round((visitados / clientes) * 100) : 0,
      cajas,
      clientes,
      hl: hl.toFixed(1),
      vehiculos: todayVehicles.length,
      visitados,
    };
  }, [todayVehicles]);

  const refusal = useMemo(() => {
    const totalCajasSeguimiento = todayVehicles.reduce((acc, vehicle) => acc + (vehicle.cajas || 0), 0);
    const byVehicle = todayVehicles.map((vehicle) => {
      const registrosDt = todayModulaciones.filter((registro) => normalizeDt(registro.dt) === normalizeDt(vehicle.transporte));
      const checkin = getCheckinByDt(checkins, vehicle.transporte);
      return summarizeModulaciones(registrosDt, vehicle.cajas || 0, checkin?.totalCajas);
    });
    const rechazadas = byVehicle.reduce((acc, resumen) => acc + resumen.cajasRechazadas, 0);
    const gestionadas = byVehicle.reduce((acc, resumen) => acc + resumen.cajasGestionadas, 0);
    const pendientes = byVehicle.reduce((acc, resumen) => acc + resumen.cajasPendientes, 0);

    return {
      checkins: byVehicle.filter((resumen) => resumen.tieneCheckin).length,
      gestionadas,
      pendientes,
      porcentaje: totalCajasSeguimiento ? Number(((pendientes / totalCajasSeguimiento) * 100).toFixed(2)) : 0,
      rechazadas,
      totalCajasSeguimiento,
      topeMaximo: Math.floor(totalCajasSeguimiento / 100) || 1,
    };
  }, [checkins, todayModulaciones, todayVehicles]);

  const refusalComRows = useMemo<RefusalComRow[]>(() => {
    const vehicleByDt = new Map(todayVehicles.map((vehicle) => [normalizeDt(vehicle.transporte), vehicle]));

    return todayModulaciones
      .map((registro) => {
        const vehicle = vehicleByDt.get(normalizeDt(registro.dt));

        return {
          causal: registro.causal || "Sin causal",
          com: getCom(registro, vehicle),
          establecimiento: registro.nombreCliente || `Cliente ${registro.codigoCliente}`,
          jefeVentas: vehicle?.territorio && vehicle.territorio !== "Pendiente" ? vehicle.territorio : vehicle?.responsable || "Sin asignacion",
          placa: vehicle?.vehiculo || `DT-${registro.dt}`,
          rechazadas: Number(registro.totalCajas || 0),
          rr: registro.persona || vehicle?.responsable || "Sin asistencia",
        };
      })
      .sort((a, b) => b.rechazadas - a.rechazadas);
  }, [todayModulaciones, todayVehicles]);

  const byCom = useMemo(() => groupRows(refusalComRows, (row) => row.com).slice(0, 12), [refusalComRows]);
  const byCausal = useMemo(() => groupRows(refusalComRows, (row) => row.causal).slice(0, 8), [refusalComRows]);
  const todayLabel = new Date().toLocaleDateString("es-CO");

  return (
    <main className="min-h-screen bg-[#eef2f7] text-slate-900 print:bg-white">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              aria-label="Volver a graficas"
              className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100"
              onClick={() => router.push("/seguimiento/graficas")}
              type="button"
            >
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Reporte consolidado</p>
              <h1 className="text-2xl font-semibold text-[#10223d]">Seguimiento, refusal y refusal-com</h1>
            </div>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#10223d] px-4 text-sm font-semibold text-white transition hover:bg-[#1b355b]"
            onClick={() => window.print()}
            type="button"
          >
            <Printer size={18} />
            Imprimir / guardar PDF
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-6 print:max-w-none print:px-0 print:py-0">
        <div className="mb-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm print:rounded-none print:border-0 print:shadow-none">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <img className="h-14 w-14 rounded-md object-contain" src="/favicon.ico" alt="Bavaria" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Bavaria</p>
                <h2 className="mt-1 text-2xl font-semibold text-[#10223d]">Reporte diario consolidado</h2>
                <p className="mt-1 text-sm text-slate-500">Fecha: {todayLabel}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-2 rounded-md bg-[#e9f3ff] px-3 py-2 text-sm font-semibold text-[#10223d] print:hidden">
              <FileDown size={17} />
              PDF
            </span>
          </div>
        </div>

        <ReportSection title="Seguimiento operativo">
          <MetricGrid>
            <Metric label="Vehiculos" value={seguimiento.vehiculos} />
            <Metric label="Clientes" value={`${seguimiento.visitados}/${seguimiento.clientes}`} />
            <Metric label="Avance" value={`${seguimiento.avance}%`} />
            <Metric label="Cajas / HL" value={`${seguimiento.cajas} / ${seguimiento.hl}`} />
          </MetricGrid>
          <SimpleTable
            headers={["Vehiculo / DT", "Responsable", "Clientes", "Avance", "Cajas"]}
            rows={todayVehicles.slice(0, 20).map((vehicle) => [
              `${vehicle.vehiculo} / ${vehicle.transporte}`,
              vehicle.responsable,
              `${vehicle.visitados || 0}/${vehicle.clientes || 0}`,
              `${vehicle.clientes ? Math.round(((vehicle.visitados || 0) / vehicle.clientes) * 100) : 0}%`,
              String(vehicle.cajas || 0),
            ])}
            empty="No hay vehiculos para hoy."
          />
        </ReportSection>

        <ReportSection title="Refusal">
          <MetricGrid>
            <Metric label="Cajas seguimiento" value={refusal.totalCajasSeguimiento} />
            <Metric label="Rechazadas" value={refusal.rechazadas} tone="red" />
            <Metric label="Gestionadas" value={refusal.gestionadas} tone="green" />
            <Metric label="Refusal final" value={`${refusal.porcentaje}%`} tone={refusal.porcentaje <= 1 ? "green" : "red"} />
          </MetricGrid>
          <div className="grid gap-3 sm:grid-cols-3">
            <InfoBox label="Pendientes finales" value={`${refusal.pendientes} cajas`} />
            <InfoBox label="Tope maximo" value={`${refusal.topeMaximo} cajas`} />
            <InfoBox label="Checkins aplicados" value={refusal.checkins} />
          </div>
          <SimpleTable
            headers={["DT / Cliente", "Persona", "Rechazo", "Gestionadas", "Causal"]}
            rows={todayModulaciones.slice(0, 22).map((item) => [
              `DT ${item.dt} / Cliente ${item.codigoCliente}`,
              item.persona,
              item.totalCajas,
              item.cajasGestionadas || "0",
              item.causal,
            ])}
            empty="No hay modulaciones registradas hoy."
          />
        </ReportSection>

        <ReportSection title="Refusal-com">
          <MetricGrid>
            <Metric label="Registros" value={refusalComRows.length} />
            <Metric label="Cajas rechazadas" value={refusal.rechazadas} tone="red" />
            <Metric label="Por COM" value={byCom.length} />
            <Metric label="Por causal" value={byCausal.length} />
          </MetricGrid>
          <div className="grid gap-4 lg:grid-cols-2">
            <Bars title="Top COM" rows={byCom} />
            <Bars title="Top causales" rows={byCausal} />
          </div>
          <SimpleTable
            headers={["Establecimiento", "Causal", "RR", "Placa", "Jefe ventas", "COM", "Cajas"]}
            rows={refusalComRows.slice(0, 28).map((row) => [row.establecimiento, row.causal, row.rr, row.placa, row.jefeVentas, row.com, String(row.rechazadas)])}
            empty="No hay registros de refusal-com para hoy."
          />
        </ReportSection>
      </section>
    </main>
  );
}

function ReportSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="mb-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm print:mb-0 print:break-after-page print:rounded-none print:border-0 print:shadow-none">
      <h2 className="mb-4 border-b border-slate-200 pb-2 text-xl font-semibold text-[#10223d]">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

function Metric({ label, value, tone = "navy" }: { label: string; value: ReactNode; tone?: "navy" | "red" | "green" }) {
  const colors = {
    green: "text-emerald-700",
    navy: "text-[#10223d]",
    red: "text-red-700",
  };

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${colors[tone]}`}>{value}</p>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}

function Bars({ rows, title }: { rows: Array<{ label: string; value: number }>; title: string }) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h3 className="mb-3 text-sm font-semibold text-[#10223d]">{title}</h3>
      <div className="space-y-2">
        {rows.length ? (
          rows.map((row) => (
            <div className="grid grid-cols-[120px_1fr_42px] items-center gap-2" key={row.label}>
              <span className="truncate text-xs font-semibold text-slate-600">{row.label}</span>
              <div className="h-3 rounded-full bg-slate-100">
                <div className="h-3 rounded-full bg-red-500" style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} />
              </div>
              <span className="text-right text-xs font-semibold text-[#10223d]">{row.value}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">Sin datos.</p>
        )}
      </div>
    </div>
  );
}

function SimpleTable({ empty, headers, rows }: { empty: string; headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.1em] text-slate-500">
          <tr>
            {headers.map((header) => (
              <th className="px-3 py-2" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td className="px-3 py-2 text-slate-700" key={`${rowIndex}-${cellIndex}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-3 py-8 text-center text-sm font-medium text-slate-500" colSpan={headers.length}>
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function groupRows(rows: RefusalComRow[], getLabel: (row: RefusalComRow) => string) {
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

function isTodayVehicle(vehicle: Vehiculo) {
  return isToday(vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || vehicle.createdAt);
}

function isToday(value: string | undefined) {
  return toDateKey(value) === getLocalDateKey();
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
