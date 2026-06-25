"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock3, Save, Search, ShieldAlert, Truck } from "lucide-react";
import { SEGUIMIENTO_STORAGE_KEY, saveSeguimientoVehiculos } from "../lib/seguimientoStorage";
import { useStorageSnapshot } from "../lib/storageEvents";
import { loadSeguimientoVehiculos, prepareSeguimientoVehicles } from "../seguimiento/services/vehicleRecords";
import type { Vehiculo } from "../seguimiento/types";
import { getVehicleUiKey, hasTimeValue, toDateKey } from "../seguimiento/utils";

const META_RELEVO_MINUTES = 10 * 60 + 30;
const SIF_ALERT_MINUTES = 13 * 60;
const CAUSALES_DESVIO = [
  "Demora en atencion del cliente",
  "Factores climaticos",
  "Bloqueo de via",
  "Novedades de flota",
  "Investigacion del desvio",
];

type JornadaState = "ok" | "warn" | "danger" | "done" | "empty";

export default function JornadaLaboralPage() {
  const router = useRouter();
  const storedVehiculos = useStorageSnapshot<Vehiculo[]>([SEGUIMIENTO_STORAGE_KEY], loadSeguimientoVehiculos, []);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [selectedDate, setSelectedDate] = useState(getTodayKey);
  const [now, setNow] = useState(() => new Date());
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("");

  useEffect(() => {
    setVehiculos(storedVehiculos);
  }, [storedVehiculos]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  const rows = useMemo(() => {
    return vehiculos
      .filter((vehicle) => toDateKey(vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || vehicle.createdAt) === selectedDate)
      .map((vehicle) => buildJornadaRow(vehicle, now))
      .sort((a, b) => getStableRowOrder(a.vehicle).localeCompare(getStableRowOrder(b.vehicle), "es-CO", { numeric: true }));
  }, [now, selectedDate, vehiculos]);

  const resumen = useMemo(
    () => ({
      rutas: rows.length,
      amarillas: rows.filter((row) => row.state === "warn").length,
      sif: rows.filter((row) => row.state === "danger").length,
      relevadas: rows.filter((row) => row.state === "done").length,
    }),
    [rows],
  );
  const sifRows = useMemo(() => rows.filter((row) => row.state === "danger"), [rows]);
  const filteredRows = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return rows.filter((row) => {
      const searchable = `${row.vehicle.vehiculo} ${row.vehicle.transporte} ${row.vehicle.responsable} ${row.vehicle.territorio}`.toLowerCase();
      const matchesSearch = !searchTerm || searchable.includes(searchTerm);
      const matchesState = !stateFilter || row.state === stateFilter;
      const matchesClassification = !classificationFilter || row.clasificacion === classificationFilter;

      return matchesSearch && matchesState && matchesClassification;
    });
  }, [classificationFilter, rows, search, stateFilter]);

  function updateVehicle(recordKey: string, changes: Partial<Vehiculo>) {
    const next = prepareSeguimientoVehicles(
      vehiculos.map((vehicle) => {
        if (getVehicleUiKey(vehicle) !== recordKey) return vehicle;

        const updated = { ...vehicle, ...changes };
        const metaRelevo = calculateMetaRelevo(updated.horaSalida);
        const clasificacion = classifyRelevo(updated.horaSalida, updated.horaInicioRelevo);
        const hasRelevo = hasTimeValue(updated.horaInicioRelevo);

        return {
          ...updated,
          metaRelevo,
          clasificacionRelevo: clasificacion,
          alertaSifPotencial: hasRelevo ? "No" : updated.alertaSifPotencial,
        };
      }),
    );

    setVehiculos(next);
    setMessage("Guardando cambios...");
    saveSeguimientoVehiculos(next)
      .then((saved) => {
        setVehiculos(saved);
        setMessage("Cambios guardados.");
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "No se pudieron guardar los cambios.");
      });
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              aria-label="Volver al portal"
              className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100"
              onClick={() => router.push("/")}
              type="button"
            >
              <ArrowLeft size={19} />
            </button>
            <span className="grid h-11 w-11 place-items-center rounded-md bg-[#f5bd19] text-[#10223d]">
              <Clock3 size={22} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Modulo operativo</p>
              <h1 className="text-2xl font-semibold text-[#10223d]">Jornada laboral</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                className="h-10 rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm font-semibold text-[#10223d] outline-none transition focus:border-[#f5bd19]"
                onChange={(event) => setSelectedDate(event.target.value)}
                type="date"
                value={selectedDate}
              />
            </label>
            {message ? <span className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">{message}</span> : null}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<Truck size={20} />} label="Rutas" value={resumen.rutas} />
          <Metric icon={<Clock3 size={20} />} label="Entre 10:30 y 13h" value={resumen.amarillas} tone="warn" />
          <Metric icon={<ShieldAlert size={20} />} label="Alerta SIF" value={resumen.sif} tone="danger" />
          <Metric icon={<Save size={20} />} label="Relevadas" value={resumen.relevadas} tone="ok" />
        </div>

        {sifRows.length ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-red-100 text-red-700">
                  <ShieldAlert size={20} />
                </span>
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.12em]">Alerta SIF potencial</p>
                  <p className="mt-1 text-sm">
                    {sifRows.length} ruta{sifRows.length === 1 ? "" : "s"} superaron 13 horas sin relevo registrado.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {sifRows.slice(0, 5).map((row) => (
                  <span className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-red-700 shadow-sm" key={getVehicleUiKey(row.vehicle)}>
                    {row.vehicle.vehiculo} · DT {row.vehicle.transporte} · {row.elapsedLabel}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-3 py-2">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#10223d]">Seguimiento de relevo y jornada laboral</h2>
                <p className="mt-0.5 text-xs text-slate-500">Meta de relevo: 10:30 despues de la salida.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px_150px]">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-xs outline-none transition placeholder:text-slate-400 focus:border-[#f5bd19]"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar placa, DT, responsable"
                    value={search}
                  />
                </label>
                <select
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none transition focus:border-[#f5bd19]"
                  onChange={(event) => setStateFilter(event.target.value)}
                  value={stateFilter}
                >
                  <option value="">Todas las jornadas</option>
                  <option value="ok">En jornada</option>
                  <option value="warn">Pendiente relevo</option>
                  <option value="danger">Alerta SIF</option>
                  <option value="done">Relevadas</option>
                  <option value="empty">Sin hora salida</option>
                </select>
                <select
                  className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none transition focus:border-[#f5bd19]"
                  onChange={(event) => setClassificationFilter(event.target.value)}
                  value={classificationFilter}
                >
                  <option value="">Toda clasif.</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="No efectivo">No efectivo</option>
                  <option value="Pendiente">Pendiente</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px]">
              <thead className="bg-slate-50 text-[9px] uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-1.5 py-1.5 text-left">Jornada</th>
                  <th className="px-1.5 py-1.5 text-left">Placa</th>
                  <th className="px-1.5 py-1.5 text-left">Fecha</th>
                  <th className="px-1.5 py-1.5 text-left">DT</th>
                  <th className="px-1.5 py-1.5 text-left">Salida</th>
                  <th className="px-1.5 py-1.5 text-left">Tiempo</th>
                  <th className="px-1.5 py-1.5 text-center">Cl.</th>
                  <th className="px-1.5 py-1.5 text-center">Vis.</th>
                  <th className="px-1.5 py-1.5 text-left">Avance</th>
                  <th className="px-1.5 py-1.5 text-left">Meta</th>
                  <th className="px-1.5 py-1.5 text-left">Inicio relevo</th>
                  <th className="px-1.5 py-1.5 text-left">Clasif.</th>
                  <th className="px-1.5 py-1.5 text-left">Causal</th>
                  <th className="px-1.5 py-1.5 text-left">Investigacion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.length ? (
                  filteredRows.map((row) => {
                    const key = getVehicleUiKey(row.vehicle);
                    return (
                      <tr className={rowTone(row.state)} key={key}>
                        <td className="px-1.5 py-1">
                          <StatusBadge state={row.state} label={row.statusLabel} />
                        </td>
                        <td className="px-1.5 py-1 text-[11px] font-semibold text-[#10223d]">{row.vehicle.vehiculo}</td>
                        <td className="px-1.5 py-1 text-[11px] text-slate-700">{row.vehicle.fechaDespacho || row.vehicle.fechaDt || "-"}</td>
                        <td className="px-1.5 py-1 text-[11px] font-semibold text-slate-700">{row.vehicle.transporte}</td>
                        <td className="px-1.5 py-1">
                          <span className="inline-flex h-7 w-16 items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-semibold text-[#10223d]">
                            {timeInputValue(row.vehicle.horaSalida) || "-"}
                          </span>
                        </td>
                        <td className="px-1.5 py-1 text-[11px] font-semibold text-slate-700">{row.elapsedLabel}</td>
                        <td className="px-1.5 py-1 text-center text-[11px] text-slate-700">{row.vehicle.clientes}</td>
                        <td className="px-1.5 py-1 text-center text-[11px] font-semibold text-[#10223d]">{row.vehicle.visitados}</td>
                        <td className="px-1.5 py-1">
                          <ProgressCell value={row.avance} />
                        </td>
                        <td className="px-1.5 py-1 text-[11px] font-semibold text-slate-700">{row.metaRelevo}</td>
                        <td className="px-1.5 py-1">
                          <div className="flex items-center gap-1">
                            <TimeInput value={timeInputValue(row.vehicle.horaInicioRelevo)} onChange={(value) => updateVehicle(key, { horaInicioRelevo: value || "Pendiente" })} />
                            <button
                              className="rounded-md border border-slate-200 px-1.5 py-1 text-[9px] font-semibold text-slate-500 transition hover:bg-slate-100"
                              onClick={() => updateVehicle(key, { horaInicioRelevo: "Pendiente", clasificacionRelevo: "Pendiente" })}
                              type="button"
                            >
                              Sin relevo
                            </button>
                          </div>
                        </td>
                        <td className="px-1.5 py-1">
                          <span className="rounded-md bg-white px-1.5 py-1 text-[10px] font-semibold text-[#10223d] shadow-sm">{row.clasificacion}</span>
                        </td>
                        <td className="px-1.5 py-1">
                          <select
                            className="h-7 w-32 rounded-md border border-slate-200 bg-white px-1.5 text-[10px] outline-none transition focus:border-[#f5bd19]"
                            onChange={(event) => updateVehicle(key, { causalDesviado: event.target.value })}
                            value={normalizeSelectValue(row.vehicle.causalDesviado)}
                          >
                            <option value="">Selecciona</option>
                            {CAUSALES_DESVIO.map((causal) => (
                              <option key={causal} value={causal}>
                                {causal}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-1.5 py-1">
                          <textarea
                            className="h-7 w-36 resize-none rounded-md border border-slate-200 px-1.5 py-1 text-[10px] outline-none transition focus:border-[#f5bd19]"
                            defaultValue={row.vehicle.investigacionDesvio || ""}
                            onBlur={(event) => updateVehicle(key, { investigacionDesvio: event.target.value })}
                          />
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-5 py-12 text-center text-sm font-medium text-slate-500" colSpan={14}>
                      No hay rutas de seguimiento para esta fecha o filtro.
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

function Metric({ icon, label, value, tone = "navy" }: { icon: React.ReactNode; label: string; value: number; tone?: "navy" | "warn" | "danger" | "ok" }) {
  const colors = {
    danger: "bg-red-50 text-red-700",
    navy: "bg-[#e9f3ff] text-[#10223d]",
    ok: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-700",
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <span className={`mb-3 grid h-10 w-10 place-items-center rounded-md ${colors[tone]}`}>{icon}</span>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}

function TimeInput({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  return (
    <input
      className="h-7 w-20 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-[#10223d] outline-none transition focus:border-[#f5bd19]"
      onChange={(event) => onChange(event.target.value)}
      type="time"
      value={value}
    />
  );
}

function StatusBadge({ label, state }: { label: string; state: JornadaState }) {
  const styles = {
    danger: "border-red-100 bg-red-50 text-red-700",
    done: "border-emerald-100 bg-emerald-50 text-emerald-700",
    empty: "border-slate-200 bg-slate-50 text-slate-600",
    ok: "border-emerald-100 bg-emerald-50 text-emerald-700",
    warn: "border-amber-100 bg-amber-50 text-amber-700",
  };

  return <span className={`inline-flex max-w-24 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-4 ${styles[state]}`}>{label}</span>;
}

function ProgressCell({ value }: { value: number }) {
  const color = value >= 80 ? "bg-emerald-600" : value >= 45 ? "bg-[#f5bd19]" : "bg-red-500";

  return (
    <div className="flex min-w-24 items-center gap-1.5">
      <div className="h-1.5 flex-1 rounded-full bg-slate-200">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="w-8 text-right text-[11px] font-semibold text-[#10223d]">{value}%</span>
    </div>
  );
}

function buildJornadaRow(vehicle: Vehiculo, now: Date) {
  const salidaMinutes = parseTimeToMinutes(vehicle.horaSalida);
  const relevoMinutes = parseTimeToMinutes(vehicle.horaInicioRelevo);
  const metaRelevo = calculateMetaRelevo(vehicle.horaSalida);
  const clasificacion = classifyRelevo(vehicle.horaSalida, vehicle.horaInicioRelevo);
  const hasRelevo = relevoMinutes !== null;
  const avance = vehicle.clientes ? Math.min(100, Math.round(((vehicle.visitados || 0) / vehicle.clientes) * 100)) : 0;

  if (salidaMinutes === null) {
    return {
      alertaSif: false,
      avance,
      clasificacion,
      elapsedLabel: "Sin hora",
      metaRelevo,
      state: "empty" as JornadaState,
      statusLabel: "Sin hora salida",
      vehicle,
    };
  }

  const elapsedMinutes = hasRelevo ? diffFromStart(salidaMinutes, relevoMinutes) : diffFromStart(salidaMinutes, now.getHours() * 60 + now.getMinutes());
  const alertaSif = !hasRelevo && elapsedMinutes >= SIF_ALERT_MINUTES;
  const state: JornadaState = hasRelevo ? "done" : alertaSif ? "danger" : elapsedMinutes >= META_RELEVO_MINUTES ? "warn" : "ok";
  const statusLabel = hasRelevo
    ? "Relevo realizado"
    : alertaSif
      ? "Alerta SIF potencial"
      : elapsedMinutes >= META_RELEVO_MINUTES
        ? "Pendiente relevo"
        : "En jornada";

  return {
    alertaSif,
    avance,
    clasificacion,
    elapsedLabel: formatDuration(elapsedMinutes),
    metaRelevo,
    state,
    statusLabel,
    vehicle,
  };
}

function calculateMetaRelevo(horaSalida: string | undefined) {
  const salidaMinutes = parseTimeToMinutes(horaSalida);
  if (salidaMinutes === null) return "Pendiente";
  return formatTime((salidaMinutes + META_RELEVO_MINUTES) % (24 * 60));
}

function classifyRelevo(horaSalida: string | undefined, horaInicioRelevo: string | undefined) {
  const salidaMinutes = parseTimeToMinutes(horaSalida);
  const relevoMinutes = parseTimeToMinutes(horaInicioRelevo);
  if (salidaMinutes === null || relevoMinutes === null) return "Pendiente";
  return diffFromStart(salidaMinutes, relevoMinutes) <= META_RELEVO_MINUTES ? "Efectivo" : "No efectivo";
}

function diffFromStart(startMinutes: number, endMinutes: number) {
  let diff = endMinutes - startMinutes;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function parseTimeToMinutes(value: string | undefined) {
  if (!hasTimeValue(value)) return null;
  const match = value?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeInputValue(value: string | undefined) {
  const minutes = parseTimeToMinutes(value);
  return minutes === null ? "" : formatTime(minutes);
}

function normalizeSelectValue(value: string | undefined) {
  if (!value || value === "-") return "";
  return value;
}

function rowTone(state: JornadaState) {
  if (state === "danger") return "bg-red-50/70";
  if (state === "warn") return "bg-amber-50/70";
  return "bg-white transition hover:bg-slate-50";
}

function getStableRowOrder(vehicle: Vehiculo) {
  return [
    vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || vehicle.createdAt || "",
    vehicle.transporte || "",
    vehicle.vehiculo || "",
    vehicle.recordId || "",
  ].join("-");
}

function getTodayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}
