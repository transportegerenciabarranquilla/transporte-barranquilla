"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, CalendarDays, Package, ShieldAlert, Table2 } from "lucide-react";
import { AnalyticsViewToggle } from "../../components/AnalyticsViewToggle";
import { CHECKIN_STORAGE_KEY, getCheckinByDt, readCheckinCajasRegistros, type CheckinCajasRegistro } from "../../../lib/checkinStorage";
import { MODULACION_STORAGE_KEY, readModulacionRegistros, summarizeModulaciones, type ModulacionRegistro } from "../../../lib/modulacionStorage";
import { SEGUIMIENTO_STORAGE_KEY } from "../../../lib/seguimientoStorage";
import { useStorageSnapshot } from "../../../lib/storageEvents";
import { useContractorBrand } from "../../../lib/contractorBranding";
import { loadSeguimientoVehiculos } from "../../services/vehicleRecords";
import type { Vehiculo } from "../../types";
import { normalizeCajasTotal } from "../../utils";

type RefusalRow = {
  causal: string;
  com: string;
  establecimiento: string;
  gestionadas: number;
  jefeVentas: string;
  placa: string;
  preventista: string;
  reportadas: number;
  rechazadas: number;
  registro: ModulacionRegistro;
  rr: string;
};

export default function RefusalComPage() {
  const router = useRouter();
  const brand = useContractorBrand();
  const todayKey = toDateKey(new Date());
  const [dateRange, setDateRange] = useState(() => ({ from: todayKey, to: todayKey }));
  const vehicles = useStorageSnapshot<Vehiculo[]>(
    [SEGUIMIENTO_STORAGE_KEY, MODULACION_STORAGE_KEY, CHECKIN_STORAGE_KEY],
    loadSeguimientoVehiculos,
    [],
  );
  const modulaciones = useStorageSnapshot<ModulacionRegistro[]>([MODULACION_STORAGE_KEY], readModulacionRegistros, []);
  const checkins = useStorageSnapshot<CheckinCajasRegistro[]>([CHECKIN_STORAGE_KEY], readCheckinCajasRegistros, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fecha = params.get("fecha") || todayKey;
    const from = params.get("desde") || fecha;
    const to = params.get("hasta") || fecha;
    setDateRange(normalizeDateRange(from, to));
  }, [todayKey]);

  const activeVehiculos = useMemo(() => {
    const loaded = loadSeguimientoVehiculos();
    return loaded.length ? loaded : vehicles;
  }, [vehicles]);
  const rangeVehicles = useMemo(() => activeVehiculos.filter((vehicle) => isVehicleInRange(vehicle, dateRange)), [activeVehiculos, dateRange]);
  const visibleModulaciones = useMemo(() => {
    return modulaciones.filter((registro) => isDateInRange(getModulacionDateKey(registro), dateRange));
  }, [dateRange, modulaciones]);

  const refusalData = useMemo(() => {
    const totalCajasSeguimiento = normalizeCajasTotal(rangeVehicles.reduce((total, vehicle) => total + (vehicle.cajas || 0), 0));
    const seguimientoDts = new Set(rangeVehicles.map((vehicle) => normalizeDt(vehicle.transporte)).filter(Boolean));
    const byVehicle = rangeVehicles.map((vehicle) => {
      const registrosDt = visibleModulaciones.filter((registro) => normalizeDt(registro.dt) === normalizeDt(vehicle.transporte));
      const checkin = getCheckinByDt(checkins, vehicle.transporte);

      return summarizeModulaciones(registrosDt, vehicle.cajas || 0, checkin?.totalCajas);
    });
    const modulacionesSinSeguimiento = visibleModulaciones.filter((registro) => !seguimientoDts.has(normalizeDt(registro.dt)));
    const resumenSinSeguimiento = summarizeModulaciones(modulacionesSinSeguimiento, 0);
    const pendientes = byVehicle.reduce((total, resumen) => total + resumen.cajasPendientes, 0) + resumenSinSeguimiento.cajasPendientes;

    return {
      pendientes,
      porcentaje: totalCajasSeguimiento ? Number(((pendientes / totalCajasSeguimiento) * 100).toFixed(2)) : 0,
      totalCajasSeguimiento,
    };
  }, [checkins, rangeVehicles, visibleModulaciones]);

  const rows = useMemo(() => {
    const vehicleByDtAndDate = new Map(rangeVehicles.map((vehicle) => [`${normalizeDt(vehicle.transporte)}:${getVehicleDateKey(vehicle)}`, vehicle]));
    const fallbackVehicleByDt = new Map(activeVehiculos.map((vehicle) => [normalizeDt(vehicle.transporte), vehicle]));

    return visibleModulaciones
      .map((registro) => {
        const normalizedDt = normalizeDt(registro.dt);
        const vehicle = vehicleByDtAndDate.get(`${normalizedDt}:${getModulacionDateKey(registro)}`) || fallbackVehicleByDt.get(normalizedDt);
        const reportadas = Number(registro.totalCajas || 0);
        const gestionadas = Number(registro.cajasGestionadas || 0);

        return {
          causal: registro.causal || "Sin causal",
          com: getCom(registro, vehicle),
          establecimiento: formatCliente(registro.codigoCliente, registro.nombreCliente),
          gestionadas,
          jefeVentas: getJefeVentas(registro, vehicle),
          placa: vehicle?.vehiculo || "Sin placa",
          preventista: getPreventista(registro),
          reportadas,
          rechazadas: Math.max(reportadas - gestionadas, 0),
          registro,
          rr: registro.personaNombre || vehicle?.nombreResponsable || vehicle?.responsable || "Sin asistencia",
        };
      })
      .sort((a, b) => b.rechazadas - a.rechazadas);
  }, [activeVehiculos, rangeVehicles, visibleModulaciones]);

  const totals = useMemo(() => {
    const cajasRechazadas = rows.reduce((total, row) => total + row.rechazadas, 0);
    const cajasGestionadas = rows.reduce((total, row) => total + row.gestionadas, 0);
    const cajasReportadas = rows.reduce((total, row) => total + row.reportadas, 0);

    return {
      cajasGestionadas,
      cajasRechazadas,
      cajasReportadas,
    };
  }, [rows]);

  const byJefe = useMemo(() => groupRows(rows, (row) => row.jefeVentas).slice(0, 6), [rows]);
  const byCausal = useMemo(() => groupRows(rows, (row) => row.causal).slice(0, 8), [rows]);
  const byPreventista = useMemo(() => groupRows(rows, (row) => row.preventista).slice(0, 18), [rows]);

  return (
    <main className="min-h-screen text-slate-900">
      <header className="sticky top-0 z-20 border-b border-white/50 bg-white/80 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              aria-label="Volver a graficas"
              className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100"
              onClick={() => router.push(`/seguimiento/graficas?fecha=${encodeURIComponent(dateRange.to)}`)}
              type="button"
            >
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Detalle refusal</p>
              <h1 className="text-2xl font-semibold text-[#10223d]">refusal-com {brand.name}</h1>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <AnalyticsDateRangeFilter value={dateRange} onChange={setDateRange} />
            <AnalyticsViewToggle active="refusal-com" />
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <div className="glass-panel mb-4 overflow-hidden rounded-lg">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-md bg-[#e9f3ff] text-[#10223d]">
                <ShieldAlert size={18} />
              </span>
              <div>
                <h2 className="text-base font-semibold text-[#10223d]">Detalle refusal por preventista - {brand.name}</h2>
                <p className="mt-0.5 text-xs text-slate-500">Resumen del rango cruzado con modulaciones y seguimiento. Modulaciones cargadas: {modulaciones.length}.</p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
              <TopMetric label="% refusal rango" value={`${refusalData.porcentaje.toFixed(2)}%`} highlight />
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
          <ChartPanel icon={<Package size={16} />} title="Cajas de rechazo por preventista">
            <ComBars data={byPreventista} />
          </ChartPanel>
        </div>

        <div className="data-shell mt-4 rounded-lg">
          <div className="flex flex-col gap-2 border-b border-slate-200/70 bg-white/78 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Table2 size={15} className="text-[#10223d]" />
              <h3 className="text-sm font-semibold text-[#10223d]">Detalle refusal</h3>
            </div>
            <span className="rounded-md border border-cyan-100 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-[#07556b]">{rows.length} registros</span>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[1020px] table-fixed text-[10px]">
              <thead className="sticky top-0 z-10 text-[8px] uppercase tracking-[0.08em]">
                <tr>
                  <th className="w-[210px] px-2 py-1.5 text-left">Establecimiento</th>
                  <th className="w-[180px] px-2 py-1.5 text-left">Causal</th>
                  <th className="w-[190px] px-2 py-1.5 text-left">RR</th>
                  <th className="w-[88px] px-2 py-1.5 text-left">Placa</th>
                  <th className="w-[95px] px-2 py-1.5 text-left">Prev.</th>
                  <th className="w-[170px] px-2 py-1.5 text-left">Jefe ventas</th>
                  <th className="w-[70px] px-2 py-1.5 text-right">Rep.</th>
                  <th className="w-[70px] px-2 py-1.5 text-right">Gest.</th>
                  <th className="w-[70px] px-2 py-1.5 text-right">Rech.</th>
                </tr>
              </thead>
              <tbody>
                  {rows.length ? (
                  rows.map((row, index) => (
                    <tr className={index % 2 === 0 ? "bg-white" : ""} key={row.registro.id}>
                      <td className="truncate px-2 py-1 text-[10px] font-medium text-slate-700" title={row.establecimiento}>{row.establecimiento}</td>
                      <td className="truncate px-2 py-1 text-[10px] font-semibold text-slate-700" title={row.causal}>{row.causal}</td>
                      <td className="truncate px-2 py-1 text-[10px] text-slate-700" title={row.rr}>{row.rr}</td>
                      <td className="px-2 py-1" title={row.placa}><span className="rounded bg-[#e8f7ff] px-1.5 py-0.5 text-[10px] font-bold text-[#07556b]">{row.placa}</span></td>
                      <td className="truncate px-2 py-1 text-[10px] text-slate-700" title={row.preventista}>{row.preventista}</td>
                      <td className="truncate px-2 py-1 text-[10px] text-slate-700" title={row.jefeVentas}>{row.jefeVentas}</td>
                      <td className="px-2 py-1 text-right text-[10px] text-slate-700"><span className="number-pill">{row.reportadas}</span></td>
                      <td className="px-2 py-1 text-right text-[10px] text-emerald-700"><span className="number-pill border-emerald-100 bg-emerald-50">{row.gestionadas}</span></td>
                      <td className="px-2 py-1 text-right text-[10px] text-red-700"><span className="number-pill border-red-100 bg-red-50">{row.rechazadas}</span></td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-8 text-center text-xs font-medium text-slate-500" colSpan={9}>
                      No hay registros de refusal para el rango seleccionado.
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

function AnalyticsDateRangeFilter({
  onChange,
  value,
}: {
  onChange: (value: { from: string; to: string }) => void;
  value: { from: string; to: string };
}) {
  const router = useRouter();

  function updateRange(nextValue: { from: string; to: string }) {
    const normalized = normalizeDateRange(nextValue.from, nextValue.to);
    onChange(normalized);
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    params.set("desde", normalized.from);
    params.set("hasta", normalized.to);
    params.delete("fecha");

    router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#10223d] shadow-sm">
      <CalendarDays size={17} className="text-slate-500" />
      <label className="flex items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Desde</span>
        <input
          className="h-8 w-[132px] bg-transparent text-sm font-semibold text-[#10223d] outline-none"
          onChange={(event) => updateRange({ ...value, from: event.target.value })}
          type="date"
          value={value.from}
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Hasta</span>
        <input
          className="h-8 w-[132px] bg-transparent text-sm font-semibold text-[#10223d] outline-none"
          onChange={(event) => updateRange({ ...value, to: event.target.value })}
          type="date"
          value={value.to}
        />
      </label>
    </div>
  );
}

function TopMetric({ label, value, highlight = false }: { label: string; value: ReactNode; highlight?: boolean }) {
  return (
    <div className="tech-card rounded-lg p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight ${highlight ? "text-[#0f7c58]" : "text-[#10223d]"}`}>{value}</p>
    </div>
  );
}

function ChartPanel({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <section className="glass-panel overflow-hidden rounded-lg">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-[#10223d]">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-[#10223d] to-[#1264ff] text-white">{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function HorizontalBars({ data, color }: { data: Array<{ label: string; value: number }>; color: string }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  if (!data.length) return <EmptyChart />;

  return (
    <div className="space-y-2">
      {data.map((item, index) => (
        <div className="grid grid-cols-[120px_1fr_34px] items-center gap-2" key={item.label}>
          <span className="truncate text-[11px] font-semibold text-slate-700">{item.label}</span>
          <div className="h-5 overflow-hidden rounded-sm bg-slate-100">
            <div className={`h-5 rounded-sm ${index === 0 ? "bg-gradient-to-r from-[#ef4444] to-[#f97316]" : color}`} style={{ opacity: index === 0 ? 1 : 0.62, width: `${Math.max(5, (item.value / max) * 100)}%` }} />
          </div>
          <span className="text-right text-[11px] font-black text-slate-700">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function VerticalBars({ data, total }: { data: Array<{ label: string; value: number }>; total: number }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  if (!data.length) return <EmptyChart />;

  return (
    <div className="flex min-h-40 items-end gap-3 overflow-x-auto pb-1">
      {data.map((item, index) => (
        <div className="flex min-w-20 flex-1 flex-col items-center gap-2" key={item.label}>
          <span className="text-[10px] font-black text-slate-600">{total ? `${((item.value / total) * 100).toFixed(2)}%` : "0%"}</span>
          <div
            className={`w-full rounded-t-sm ${index === 0 ? "bg-gradient-to-t from-[#ef4444] to-[#f97316]" : "bg-gradient-to-t from-[#fecaca] to-[#fda4af]"}`}
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
  if (!data.length) return <EmptyChart />;

  return (
    <div className="flex min-h-32 items-end gap-2 overflow-x-auto pb-1">
      {data.map((item) => (
        <div className="flex min-w-14 flex-col items-center gap-1.5" key={item.label}>
          <span className="text-[10px] font-black text-slate-700">{item.value}</span>
          <div className="w-10 rounded-t-sm bg-gradient-to-t from-[#f5bd19] to-[#00b8d9]" style={{ height: `${Math.max(12, (item.value / max) * 92)}px` }} />
          <span className="max-w-16 truncate text-[10px] font-black text-slate-700">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="grid min-h-24 place-items-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-sm font-medium text-slate-500">
      Sin modulaciones para mostrar en esta fecha.
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
  if (registro.com?.trim()) return registro.com.trim();

  const candidates = [vehicle?.bloque, vehicle?.viaje, vehicle?.territorio].filter(Boolean) as string[];
  const found = candidates.find((value) => /^COM/i.test(value.trim()));
  if (found) return found.trim().toUpperCase();

  return "Sin asignacion";
}

function formatCliente(codigoCliente: string | undefined, nombreCliente: string | undefined) {
  const code = codigoCliente?.trim();
  const name = nombreCliente?.trim();

  if (code && name) return `${code} - ${name}`;
  if (code) return `Cliente ${code}`;
  return name || "Sin cliente";
}

function getJefeVentas(registro: ModulacionRegistro, vehicle: Vehiculo | undefined) {
  if (registro.jefeComercial?.trim()) return registro.jefeComercial.trim();

  return vehicle?.territorio && vehicle.territorio !== "Pendiente" ? vehicle.territorio : vehicle?.responsable || "Sin asignacion";
}

function getPreventista(registro: ModulacionRegistro) {
  return registro.preventistaNombre?.trim() || registro.preventista?.trim() || "Sin asignacion";
}

function isVehicleInRange(vehicle: Vehiculo, range: { from: string; to: string }) {
  return isDateInRange(getVehicleDateKey(vehicle), range);
}

function getModulacionDateKey(record: ModulacionRegistro) {
  return toDateKeyValue(record.fechaDespacho || record.fechaDt || record.createdAt);
}

function getVehicleDateKey(vehicle: Vehiculo) {
  return toDateKeyValue(vehicle.fechaDespacho || vehicle.date || vehicle.createdAt);
}

function normalizeDateRange(from: string, to: string) {
  const today = toDateKey(new Date());
  const start = from || to || today;
  const end = to || from || today;

  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

function isDateInRange(dateKey: string, range: { from: string; to: string }) {
  if (!dateKey) return false;
  return dateKey >= range.from && dateKey <= range.to;
}

function toDateKeyValue(value: string | undefined) {
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

  return toDateKey(parsed);
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeDt(value: string | number | undefined) {
  return String(value ?? "")
    .replace(/^DT-?/i, "")
    .replace(/\D/g, "");
}
