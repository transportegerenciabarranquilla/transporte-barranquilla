"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock3, RotateCcw, Save, Search, ShieldAlert, Truck } from "lucide-react";
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

type JornadaState = "ok" | "warn" | "danger" | "done" | "lateDone" | "empty";
type Persona = { CC: string | number; NOMBRE: string; CARGO: string; CONTRATISTA: string };

export default function JornadaLaboralPage() {
  const router = useRouter();
  const storedVehiculos = useStorageSnapshot<Vehiculo[]>([SEGUIMIENTO_STORAGE_KEY], loadSeguimientoVehiculos, []);
  const [draftVehiculos, setDraftVehiculos] = useState<Vehiculo[] | null>(null);
  const [selectedDate, setSelectedDate] = useState(getTodayKey);
  const [now, setNow] = useState(() => new Date());
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("");
  const [relevadores, setRelevadores] = useState<Persona[]>([]);
  const vehiculos = draftVehiculos ?? storedVehiculos;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/personas?listar=1", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          setMessage(body.error || "No se pudieron cargar los relevadores.");
          return;
        }

        if (Array.isArray(body.personas)) {
          setRelevadores(body.personas);
          if (!body.personas.length) setMessage("No se encontraron personas.");
        }
      })
      .catch(() => setMessage("No se pudieron cargar las personas."));

    return () => controller.abort();
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
      sif: rows.filter((row) => row.alertaSif).length,
      relevadas: rows.filter((row) => row.state === "done" || row.state === "lateDone").length,
    }),
    [rows],
  );
  const sifRows = useMemo(() => rows.filter((row) => row.alertaSif), [rows]);
  const filteredRows = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return rows.filter((row) => {
      const searchable = `${row.vehicle.vehiculo} ${row.vehicle.transporte} ${row.vehicle.responsable} ${row.vehicle.territorio} ${row.vehicle.relevador}`.toLowerCase();
      const matchesSearch = !searchTerm || searchable.includes(searchTerm);
      const matchesState = !stateFilter || row.state === stateFilter || (stateFilter === "done" && row.state === "lateDone");
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
        const hasSifAlert = hasSifPotential(updated.horaSalida, updated.horaInicioRelevo, now);

        return {
          ...updated,
          metaRelevo,
          clasificacionRelevo: clasificacion,
          alertaSifPotencial: hasSifAlert ? "Si" : "No",
        };
      }),
    );

    setDraftVehiculos(next);
    setMessage("Guardando cambios...");
    saveSeguimientoVehiculos(next)
      .then(() => {
        setDraftVehiculos(null);
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
                    {sifRows.length} ruta{sifRows.length === 1 ? "" : "s"} superaron 13 horas en jornada laboral.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {sifRows.slice(0, 5).map((row) => (
                  <span className="rounded-md bg-white px-3 py-2 text-xs font-semibold text-red-700 shadow-sm" key={getVehicleUiKey(row.vehicle)}>
                    {row.vehicle.vehiculo} · DT {row.vehicle.transporte} · {row.elapsedLabel} · {row.statusLabel}
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
                  <option value="lateDone">Relevo con alerta</option>
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
            <table className="w-full min-w-[1030px] table-fixed">
              <thead className="bg-slate-50 text-[9px] uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="w-[86px] px-1.5 py-1 text-left">Jornada</th>
                  <th className="w-[82px] px-1.5 py-1 text-left">Placa</th>
                  <th className="w-[54px] px-1 py-1 text-left">Fecha</th>
                  <th className="w-[60px] px-1 py-1 text-left">Salida</th>
                  <th className="w-[58px] px-1 py-1 text-left">Tiempo</th>
                  <th className="w-[30px] px-0.5 py-1 text-center">Cl.</th>
                  <th className="w-[30px] px-0.5 py-1 text-center">Vis.</th>
                  <th className="w-[105px] px-1 py-1 text-left">Avance</th>
                  <th className="w-[58px] px-1 py-1 text-left">Meta</th>
                  <th className="w-[108px] px-1 py-1 text-left">Inicio</th>
                  <th className="w-[135px] px-1 py-1 text-left">Relevador</th>
                  <th className="w-[78px] px-1 py-1 text-left">Clasif.</th>
                  <th className="w-[110px] px-1 py-1 text-left">Causal</th>
                  <th className="w-[136px] px-1 py-1 text-left">Investigacion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.length ? (
                  filteredRows.map((row) => {
                    const key = getVehicleUiKey(row.vehicle);
                    return (
                      <tr className={rowTone(row.state)} key={key}>
                        <td className="px-1 py-0.5">
                          <StatusBadge state={row.state} label={row.statusLabel} />
                        </td>
                        <td className="truncate px-1 py-0.5 text-[11px] font-semibold text-[#10223d]" title={row.vehicle.vehiculo}>{row.vehicle.vehiculo}</td>
                        <td className="px-1 py-0.5 text-[11px] text-slate-700">{formatCompactDate(row.vehicle.fechaDespacho || row.vehicle.fechaDt)}</td>
                        <td className="px-1 py-0.5">
                          <span className="inline-flex h-6 w-12 items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-semibold text-[#10223d]">
                            {timeInputValue(row.vehicle.horaSalida) || "-"}
                          </span>
                        </td>
                        <td className="px-1 py-0.5 text-[11px] font-semibold text-slate-700">{row.elapsedLabel}</td>
                        <td className="px-0.5 py-0.5 text-center text-[11px] text-slate-700">{row.vehicle.clientes}</td>
                        <td className="px-0.5 py-0.5 text-center text-[11px] font-semibold text-[#10223d]">{row.vehicle.visitados}</td>
                        <td className="px-1 py-0.5">
                          <ProgressCell value={row.avance} />
                        </td>
                        <td className="px-1 py-0.5 text-[11px] font-semibold text-slate-700">{row.metaRelevo}</td>
                        <td className="px-1 py-0.5">
                          <div className="flex items-center gap-1">
                            <TimeInput value={timeInputValue(row.vehicle.horaInicioRelevo)} onChange={(value) => updateVehicle(key, { horaInicioRelevo: value || "Pendiente" })} />
                            <button
                              aria-label="Quitar relevo"
                              className="grid h-6 w-6 place-items-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-100"
                              onClick={() => updateVehicle(key, { horaInicioRelevo: "Pendiente", clasificacionRelevo: "Pendiente" })}
                              type="button"
                            >
                              <RotateCcw size={12} />
                            </button>
                          </div>
                        </td>
                        <td className="px-1 py-0.5">
                          <RelevadorSelect
                            key={`${key}-relevador-${normalizeSelectValue(row.vehicle.relevador) || "empty"}`}
                            relevadores={relevadores}
                            value={normalizeSelectValue(row.vehicle.relevador)}
                            onChange={(value) => updateVehicle(key, { relevador: value || "-" })}
                          />
                        </td>
                        <td className="px-1 py-0.5">
                          <span className="rounded-md bg-white px-1 py-0.5 text-[10px] font-semibold text-[#10223d] shadow-sm">{row.clasificacion}</span>
                        </td>
                        <td className="px-1 py-0.5">
                          <select
                            className="h-6 w-full rounded-md border border-slate-200 bg-white px-1.5 text-[10px] outline-none transition focus:border-[#f5bd19]"
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
                        <td className="px-1 py-0.5">
                          <textarea
                            className="h-6 w-full resize-none rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] outline-none transition focus:border-[#f5bd19]"
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
      className="h-6 w-[76px] rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-[#10223d] outline-none transition focus:border-[#f5bd19]"
      onChange={(event) => onChange(event.target.value)}
      type="time"
      value={value}
    />
  );
}

function RelevadorSelect({
  onChange,
  relevadores,
  value,
}: {
  onChange: (value: string) => void;
  relevadores: Persona[];
  value: string;
}) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [remoteMatches, setRemoteMatches] = useState<Persona[]>([]);
  const selectedValueRef = useRef<string | null>(null);
  const searchTerm = normalizeSearch(draft);

  const matches = useMemo(() => {
    if (searchTerm.length >= 2 && remoteMatches.length) return remoteMatches.slice(0, 8);

    const filtered = searchTerm
      ? relevadores.filter((persona) => {
          const name = persona.NOMBRE || String(persona.CC);
          return normalizeSearch(`${name} ${persona.CC} ${persona.CARGO}`).includes(searchTerm);
        })
      : relevadores;

    return filtered.slice(0, 8);
  }, [remoteMatches, relevadores, searchTerm]);

  useEffect(() => {
    if (searchTerm.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      fetch(`/api/personas?q=${encodeURIComponent(draft)}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = await response.json().catch(() => ({}));
          if (!response.ok || !Array.isArray(body.personas)) return;
          setRemoteMatches(body.personas);
        })
        .catch(() => undefined);
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [draft, searchTerm]);

  function selectName(name: string) {
    selectedValueRef.current = name;
    setDraft(name);
    setOpen(false);
    onChange(name);
  }

  return (
    <div className="relative">
      <input
        className="h-6 w-full rounded-md border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-[#10223d] outline-none transition placeholder:text-slate-400 focus:border-[#f5bd19]"
        onBlur={() => {
          window.setTimeout(() => {
            onChange((selectedValueRef.current ?? draft) || "-");
            selectedValueRef.current = null;
            setOpen(false);
          }, 120);
        }}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraft(nextValue);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Sin relevador"
        title={value || "Sin relevador"}
        value={draft}
      />
      {open ? (
        <div className="absolute left-0 right-0 top-7 z-40 max-h-48 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-xl">
          <button
            className="block w-full px-2 py-1.5 text-left text-[10px] font-medium text-slate-500 hover:bg-slate-50"
            onMouseDown={(event) => {
              event.preventDefault();
              selectName("");
            }}
            type="button"
          >
            Sin relevador
          </button>
          {matches.length ? (
            matches.map((persona) => {
              const name = persona.NOMBRE || String(persona.CC);
              return (
                <button
                  className="block w-full px-2 py-1.5 text-left text-[10px] font-semibold text-[#10223d] hover:bg-[#e9f3ff]"
                  key={`${persona.CC}-${name}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectName(name);
                  }}
                  title={`${name} · ${persona.CARGO || "Sin cargo"}`}
                  type="button"
                >
                  <span className="block truncate">{name}</span>
                  <span className="block truncate text-[9px] font-medium text-slate-500">{persona.CARGO || "Sin cargo"}</span>
                </button>
              );
            })
          ) : (
            <p className="px-2 py-2 text-[10px] font-medium text-slate-500">Sin coincidencias</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ label, state }: { label: string; state: JornadaState }) {
  const styles = {
    danger: "border-red-100 bg-red-50 text-red-700",
    done: "border-emerald-100 bg-emerald-50 text-emerald-700",
    empty: "border-slate-200 bg-slate-50 text-slate-600",
    lateDone: "border-red-200 bg-red-50 text-red-700",
    ok: "border-emerald-100 bg-emerald-50 text-emerald-700",
    warn: "border-amber-100 bg-amber-50 text-amber-700",
  };

  return <span className={`inline-flex max-w-20 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-4 ${styles[state]}`}>{label}</span>;
}

function ProgressCell({ value }: { value: number }) {
  const color = value >= 80 ? "bg-emerald-600" : value >= 45 ? "bg-[#f5bd19]" : "bg-red-500";

  return (
    <div className="flex min-w-20 items-center gap-1">
      <div className="h-1.5 flex-1 rounded-full bg-slate-200">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="w-7 text-right text-[11px] font-semibold text-[#10223d]">{value}%</span>
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
  const alertaSif = elapsedMinutes >= SIF_ALERT_MINUTES;
  const state: JornadaState = hasRelevo ? (alertaSif ? "lateDone" : "done") : alertaSif ? "danger" : elapsedMinutes >= META_RELEVO_MINUTES ? "warn" : "ok";
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

function hasSifPotential(horaSalida: string | undefined, horaInicioRelevo: string | undefined, now: Date) {
  const salidaMinutes = parseTimeToMinutes(horaSalida);
  if (salidaMinutes === null) return false;

  const relevoMinutes = parseTimeToMinutes(horaInicioRelevo);
  const endMinutes = relevoMinutes ?? now.getHours() * 60 + now.getMinutes();
  return diffFromStart(salidaMinutes, endMinutes) >= SIF_ALERT_MINUTES;
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

function normalizeSearch(value: string | number | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatCompactDate(value: string | undefined) {
  const dateKey = toDateKey(value);
  if (!dateKey) return "-";

  const [, month, day] = dateKey.split("-");
  return `${day}/${month}`;
}

function rowTone(state: JornadaState) {
  if (state === "danger" || state === "lateDone") return "bg-red-50/70";
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
