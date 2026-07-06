"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpDown, CalendarDays, Clock3, RotateCcw, Save, Search, ShieldAlert, Truck, Users, X } from "lucide-react";
import { SEGUIMIENTO_STORAGE_KEY, saveSeguimientoVehiculos } from "../lib/seguimientoStorage";
import { useStorageSnapshot } from "../lib/storageEvents";
import { isLogisticosContractor } from "../lib/contractors";
import { loadSeguimientoVehiculos, prepareSeguimientoVehicles } from "../seguimiento/services/vehicleRecords";
import type { Vehiculo } from "../seguimiento/types";
import { getStatus, getVehicleUiKey, hasTimeValue, toDateKey } from "../seguimiento/utils";

const META_RELEVO_MINUTES = 10 * 60 + 30;
const SIF_ALERT_MINUTES = 13 * 60;
const META_RELEVO_SECONDS = META_RELEVO_MINUTES * 60;
const SIF_ALERT_SECONDS = SIF_ALERT_MINUTES * 60;
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
  const [routeTimeSort, setRouteTimeSort] = useState<"desc" | "asc">("desc");
  const [selectedVehicleKey, setSelectedVehicleKey] = useState<string | null>(null);
  const [relevadores] = useState<Persona[]>([]);
  const [canAccessJornada, setCanAccessJornada] = useState<boolean | null>(null);
  const vehiculos = draftVehiculos ?? storedVehiculos;
  const jornadaVehiculos = useMemo(() => vehiculos.filter(isLogisticosVehicle), [vehiculos]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch("/api/session/session", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((body) => {
        const session = body?.session;
        setCanAccessJornada(Boolean(session?.isAdmin || isLogisticosContractor(session?.contractor)));
      })
      .catch(() => setCanAccessJornada(false));
  }, []);

  const rows = useMemo(() => {
    return jornadaVehiculos
      .filter((vehicle) => toDateKey(vehicle.fechaDespacho || vehicle.date || vehicle.createdAt) === selectedDate)
      .map((vehicle) => buildJornadaRow(vehicle, now))
      .sort((a, b) => getStableRowOrder(a.vehicle).localeCompare(getStableRowOrder(b.vehicle), "es-CO", { numeric: true }));
  }, [jornadaVehiculos, now, selectedDate]);

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
  const relevoRows = useMemo(() => rows.filter((row) => row.requiereRelevo), [rows]);
  const filteredRows = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    const filtered = rows.filter((row) => {
      const searchable = `${row.vehicle.vehiculo} ${row.vehicle.transporte} ${row.vehicle.responsable} ${row.vehicle.territorio} ${row.vehicle.relevador}`.toLowerCase();
      const matchesSearch = !searchTerm || searchable.includes(searchTerm);
      const matchesState = !stateFilter || row.state === stateFilter || (stateFilter === "done" && row.state === "lateDone");
      const matchesClassification = !classificationFilter || row.clasificacion === classificationFilter;

      return matchesSearch && matchesState && matchesClassification;
    });

    return [...filtered].sort((a, b) => {
      const elapsedDiff = routeTimeSort === "desc" ? b.elapsedSeconds - a.elapsedSeconds : a.elapsedSeconds - b.elapsedSeconds;
      if (elapsedDiff !== 0) return elapsedDiff;
      return getStableRowOrder(a.vehicle).localeCompare(getStableRowOrder(b.vehicle), "es-CO", { numeric: true });
    });
  }, [classificationFilter, routeTimeSort, rows, search, stateFilter]);
  const selectedVehicle = useMemo(() => {
    if (!selectedVehicleKey) return null;
    return jornadaVehiculos.find((vehicle) => getVehicleUiKey(vehicle) === selectedVehicleKey) ?? null;
  }, [jornadaVehiculos, selectedVehicleKey]);

  function updateVehicle(recordKey: string, changes: Partial<Vehiculo>) {
    const next = prepareSeguimientoVehicles(
      vehiculos.map((vehicle) => {
        if (getVehicleUiKey(vehicle) !== recordKey) return vehicle;

        const updated = { ...vehicle, ...changes };
        const metaRelevo = calculateMetaRelevo(updated.horaSalida);
        const clasificacion = classifyRelevo(updated.horaSalida, updated.horaInicioRelevo);
        const hasSifAlert = hasSifPotential(updated, now);

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

  function toggleRouteTimeSort() {
    setRouteTimeSort((current) => (current === "desc" ? "asc" : "desc"));
  }

  if (canAccessJornada === null) {
    return <main className="min-h-screen" />;
  }

  if (!canAccessJornada) {
    return (
      <main className="grid min-h-screen place-items-center px-5 text-slate-900">
        <section className="glass-panel max-w-lg rounded-lg p-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-amber-50 text-amber-700">
            <ShieldAlert size={23} />
          </span>
          <h1 className="mt-4 text-2xl font-semibold text-[#10223d]">Modulo no disponible</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Jornada laboral esta habilitado solo para Logisticos y administradores.
          </p>
          <button className="tech-button mt-5 rounded-md px-4 py-2 text-sm font-semibold" onClick={() => router.push("/")} type="button">
            Volver al portal
          </button>
        </section>
      </main>
    );
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
                <p className="mt-0.5 text-xs text-slate-500">Cada fila es una ruta. El color indica si sigue en jornada, requiere relevo o tiene alerta SIF.</p>
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
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
              <LegendItem tone="ok" label="En jornada" detail="Aun no llega a 10h 30m desde la salida." />
              <LegendItem tone="warn" label="Pendiente relevo" detail="Supero 10h 30m y no tiene inicio de relevo." />
              <LegendItem tone="danger" label="Alerta SIF" detail="Supero 13h de jornada laboral." />
            </div>
            {relevoRows.length ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
                <span className="inline-flex items-center gap-1 font-bold">
                  <Clock3 size={13} />
                  Relevar ahora
                </span>
                {relevoRows.slice(0, 6).map((row) => (
                  <button
                    className="rounded-md bg-white px-2 py-1 font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100"
                    key={getVehicleUiKey(row.vehicle)}
                    onClick={() => setSelectedVehicleKey(getVehicleUiKey(row.vehicle))}
                    title={`DT ${row.vehicle.transporte} - ${row.elapsedLabel}`}
                    type="button"
                  >
                    {row.vehicle.vehiculo || "Sin placa"} - {row.elapsedLabel}
                  </button>
                ))}
                {relevoRows.length > 6 ? <span className="font-semibold">+{relevoRows.length - 6} mas</span> : null}
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] table-fixed">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <HeaderCell width="w-[110px]" title="Estado" detail="Jornada" />
                  <HeaderCell width="w-[88px]" title="Placa" detail="Vehiculo" />
                  <HeaderCell width="w-[64px]" title="Fecha" detail="Despacho" />
                  <HeaderCell width="w-[72px]" title="Salida" detail="Hora ruta" />
                  <th className="w-[116px] px-1.5 py-1.5 text-left">
                    <div className="flex items-center gap-1">
                      <div className="min-w-0">
                        <span className="block text-[9px] font-bold uppercase tracking-[0.08em] text-[#10223d]">Tiempo</span>
                        <span className="mt-0.5 block truncate text-[8px] font-medium normal-case tracking-normal text-slate-500">Desde salida</span>
                      </div>
                      <button
                        aria-label="Ordenar por tiempo en ruta"
                        className="inline-grid h-5 w-5 place-items-center rounded bg-[#10223d]/10 text-[#10223d] transition hover:bg-[#10223d]/15 hover:text-[#0f7c58]"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleRouteTimeSort();
                        }}
                        title={routeTimeSort === "desc" ? "Mayor tiempo primero" : "Menor tiempo primero"}
                        type="button"
                      >
                        <ArrowUpDown size={11} />
                      </button>
                    </div>
                  </th>
                  <HeaderCell align="center" width="w-[58px]" title="Clientes" detail="Prog." />
                  <HeaderCell align="center" width="w-[58px]" title="Visitados" detail="Aten." />
                  <HeaderCell width="w-[78px]" title="Meta" detail="+10:30" />
                  <HeaderCell width="w-[132px]" title="Inicio relevo" detail="Editable" />
                  <HeaderCell width="w-[148px]" title="Relevador" detail="Asignado" />
                  <HeaderCell width="w-[90px]" title="Resultado" detail="Efectivo/no" />
                  <HeaderCell width="w-[130px]" title="Causal" detail="Desvio" />
                  <HeaderCell width="w-[188px]" title="Investigacion" detail="Observacion" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.length ? (
                  filteredRows.map((row) => {
                    const key = getVehicleUiKey(row.vehicle);
                    return (
                      <tr className={`${rowTone(row.state)} cursor-pointer`} key={key} onClick={() => setSelectedVehicleKey(key)}>
                        <td className="px-1 py-0.5">
                          <StatusBadge state={row.state} label={row.statusLabel} />
                        </td>
                        <td className="truncate px-1 py-0.5 text-[11px] font-semibold text-[#10223d]" title={row.vehicle.vehiculo}>{row.vehicle.vehiculo}</td>
                        <td className="px-1 py-0.5 text-[11px] text-slate-700">{formatCompactDate(row.vehicle.fechaDespacho || row.vehicle.fechaDt)}</td>
                        <td className="px-1 py-0.5">
                          <span className="inline-flex h-6 w-16 items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 font-mono text-[11px] font-semibold text-[#10223d]">
                            {timeInputValue(row.vehicle.horaSalida) || "-"}
                          </span>
                        </td>
                        <td className="px-1 py-0.5 text-[11px] font-semibold text-slate-700">{row.elapsedLabel}</td>
                        <td className="px-0.5 py-0.5 text-center text-[11px] text-slate-700">{row.vehicle.clientes}</td>
                        <td className="px-0.5 py-0.5 text-center text-[11px] font-semibold text-[#10223d]">{row.vehicle.visitados}</td>
                        <td className="px-1 py-0.5 text-[11px] font-semibold text-slate-700">{row.metaRelevo}</td>
                        <td className="px-1 py-0.5">
                          <div className="flex items-center gap-1">
                            <TimeInput value={timeInputValue(row.vehicle.horaInicioRelevo)} onChange={(value) => updateVehicle(key, { horaInicioRelevo: value || "Pendiente" })} />
                            <button
                              aria-label="Quitar relevo"
                              className="grid h-6 w-6 place-items-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-100"
                              onClick={(event) => {
                                event.stopPropagation();
                                updateVehicle(key, { horaInicioRelevo: "Pendiente", clasificacionRelevo: "Pendiente" });
                              }}
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
                            onClick={(event) => event.stopPropagation()}
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
                            onClick={(event) => event.stopPropagation()}
                          />
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-5 py-12 text-center text-sm font-medium text-slate-500" colSpan={13}>
                      No hay rutas de seguimiento para esta fecha o filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {selectedVehicle ? <VehiclePeopleDrawer vehicle={selectedVehicle} onClose={() => setSelectedVehicleKey(null)} /> : null}
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

function LegendItem({ detail, label, tone }: { detail: string; label: string; tone: "ok" | "warn" | "danger" }) {
  const colors = {
    danger: "border-red-100 bg-red-50 text-red-700",
    ok: "border-emerald-100 bg-emerald-50 text-emerald-700",
    warn: "border-amber-100 bg-amber-50 text-amber-700",
  };

  return (
    <div className={`inline-flex min-h-7 max-w-[420px] items-center gap-2 rounded-md border px-2.5 py-1 ${colors[tone]}`}>
      <p className="shrink-0 font-semibold">{label}</p>
      <p className="truncate text-[10px] opacity-80" title={detail}>{detail}</p>
    </div>
  );
}

function HeaderCell({
  align = "left",
  detail,
  title,
  width,
}: {
  align?: "left" | "center";
  detail: string;
  title: string;
  width: string;
}) {
  const alignClass = align === "center" ? "text-center" : "text-left";

  return (
    <th className={`${width} px-1.5 py-1.5 ${alignClass}`}>
      <span className="block text-[9px] font-bold uppercase tracking-[0.08em] text-[#10223d]">{title}</span>
      <span className="mt-0.5 block truncate text-[8px] font-medium normal-case tracking-normal text-slate-500" title={detail}>{detail}</span>
    </th>
  );
}

function TimeInput({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  return (
    <label className="relative block">
      <Clock3 className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
      <input
        className="h-7 w-[92px] rounded-md border border-slate-200 bg-white pl-2 pr-5 font-mono text-[11px] font-semibold text-[#10223d] outline-none transition focus:border-[#f5bd19] focus:ring-2 focus:ring-[#f5bd19]/20"
        onChange={(event) => onChange(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        step={1}
        type="time"
        value={value}
      />
    </label>
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
    <div className="relative" onClick={(event) => event.stopPropagation()}>
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
        <div className="absolute left-0 right-0 top-7 z-[80] max-h-48 overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-xl">
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

function VehiclePeopleDrawer({ vehicle, onClose }: { vehicle: Vehiculo; onClose: () => void }) {
  const people = getVehiclePeople(vehicle);

  return (
    <div className="fixed inset-0 z-[120] flex justify-end bg-[#10223d]/45 backdrop-blur-sm">
      <aside className="h-full w-full max-w-md overflow-y-auto bg-white shadow-[0_0_70px_rgba(16,34,61,0.24)]">
        <div className="sticky top-0 border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Detalle del vehiculo</p>
              <h2 className="mt-1 text-2xl font-semibold text-[#10223d]">{vehicle.vehiculo || "Sin placa"}</h2>
              <p className="mt-1 text-sm text-slate-500">DT {vehicle.transporte || "-"}</p>
            </div>
            <button
              aria-label="Cerrar detalle"
              className="grid h-10 w-10 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-[#10223d]"
              onClick={onClose}
              type="button"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="space-y-3 p-5">
          <div className="mb-2 flex items-center gap-2 text-[#10223d]">
            <Users size={18} />
            <h3 className="text-sm font-semibold">Personas del vehiculo</h3>
          </div>

          {people.length ? (
            people.map((person) => (
              <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={`${person.rol}-${person.nombre}-${person.cedula || ""}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{person.rol}</p>
                <p className="mt-1 text-sm font-semibold text-[#10223d]">{person.nombre}</p>
                <p className="mt-0.5 text-xs text-slate-500">{person.cedula ? `CC ${person.cedula}` : "Sin cedula registrada"}</p>
              </article>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-medium text-slate-500">
              Este vehiculo no tiene personas registradas.
            </div>
          )}
        </div>
      </aside>
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

function isLogisticosVehicle(vehicle: Vehiculo) {
  return isLogisticosContractor(vehicle.transportista);
}

function buildJornadaRow(vehicle: Vehiculo, now: Date) {
  const salidaSeconds = parseTimeToSeconds(vehicle.horaSalida);
  const relevoSeconds = parseTimeToSeconds(vehicle.horaInicioRelevo);
  const metaRelevo = calculateMetaRelevo(vehicle.horaSalida);
  const clasificacion = classifyRelevo(vehicle.horaSalida, vehicle.horaInicioRelevo);
  const hasRelevo = relevoSeconds !== null;
  const avance = vehicle.clientes ? Math.min(100, Math.round(((vehicle.visitados || 0) / vehicle.clientes) * 100)) : 0;
  const isFinished = getStatus(avance, vehicle) === "Finalizado";

  if (salidaSeconds === null) {
    return {
      alertaSif: false,
      avance,
      clasificacion,
      elapsedSeconds: 0,
      elapsedLabel: "Sin hora",
      metaRelevo,
      requiereRelevo: false,
      state: "empty" as JornadaState,
      statusLabel: "Sin hora salida",
      vehicle,
    };
  }

  const elapsedSeconds = getJornadaElapsedSeconds(vehicle, salidaSeconds, relevoSeconds, isFinished, now);
  const alertaSif = elapsedSeconds >= SIF_ALERT_SECONDS;
  const state: JornadaState = hasRelevo ? (alertaSif ? "lateDone" : "done") : alertaSif ? "danger" : elapsedSeconds >= META_RELEVO_SECONDS ? "warn" : "ok";
  const statusLabel = hasRelevo
    ? "Relevo realizado"
    : isFinished
      ? "Ruta finalizada"
    : alertaSif
      ? "Alerta SIF potencial"
      : elapsedSeconds >= META_RELEVO_SECONDS
        ? "Pendiente relevo"
        : "En jornada";

  return {
    alertaSif,
    avance,
    clasificacion,
    elapsedSeconds,
    elapsedLabel: formatDuration(elapsedSeconds),
    metaRelevo,
    requiereRelevo: !hasRelevo && !isFinished && elapsedSeconds >= META_RELEVO_SECONDS,
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

function hasSifPotential(vehicle: Vehiculo, now: Date) {
  const salidaSeconds = parseTimeToSeconds(vehicle.horaSalida);
  if (salidaSeconds === null) return false;

  const relevoSeconds = parseTimeToSeconds(vehicle.horaInicioRelevo);
  const progress = vehicle.clientes ? Math.min(100, Math.round(((vehicle.visitados || 0) / vehicle.clientes) * 100)) : 0;
  const elapsedSeconds = getJornadaElapsedSeconds(vehicle, salidaSeconds, relevoSeconds, getStatus(progress, vehicle) === "Finalizado", now);
  return elapsedSeconds >= SIF_ALERT_SECONDS;
}

function getJornadaElapsedSeconds(
  vehicle: Vehiculo,
  salidaSeconds: number,
  relevoSeconds: number | null,
  isFinished: boolean,
  now: Date,
  finishedElapsedSeconds?: Map<string, number>,
) {
  const vehicleKey = getVehicleUiKey(vehicle);

  if (!isFinished) finishedElapsedSeconds?.delete(vehicleKey);
  if (relevoSeconds !== null) {
    finishedElapsedSeconds?.delete(vehicleKey);
    return diffSecondsFromStart(salidaSeconds, relevoSeconds);
  }

  const arrivalSeconds = parseTimeToSeconds(vehicle.horaLlegada);
  if (isFinished && arrivalSeconds !== null) {
    finishedElapsedSeconds?.delete(vehicleKey);
    return diffSecondsFromStart(salidaSeconds, arrivalSeconds);
  }

  const savedRouteSeconds = parseDurationToSeconds(vehicle.tiempoRuta);
  if (isFinished && savedRouteSeconds !== null) {
    finishedElapsedSeconds?.delete(vehicleKey);
    return savedRouteSeconds;
  }

  const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const currentElapsedSeconds = diffSecondsFromStart(salidaSeconds, nowSeconds);

  if (!isFinished) return currentElapsedSeconds;

  const frozenElapsedSeconds = finishedElapsedSeconds?.get(vehicleKey);
  if (frozenElapsedSeconds !== undefined) return frozenElapsedSeconds;

  finishedElapsedSeconds?.set(vehicleKey, currentElapsedSeconds);
  return currentElapsedSeconds;
}

function diffFromStart(startMinutes: number, endMinutes: number) {
  let diff = endMinutes - startMinutes;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function diffSecondsFromStart(startSeconds: number, endSeconds: number) {
  let diff = endSeconds - startSeconds;
  if (diff < 0) diff += 24 * 3600;
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

function parseTimeToSeconds(value: string | undefined) {
  if (!hasTimeValue(value)) return null;
  const match = value?.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function parseDurationToSeconds(value: string | undefined) {
  if (!hasTimeValue(value)) return null;
  const match = value?.match(/^(\d+):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return null;

  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
}

function formatTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function timeInputValue(value: string | undefined) {
  const seconds = parseTimeToSeconds(value);
  if (seconds === null) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainderSeconds = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainderSeconds).padStart(2, "0")}`;
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

function getVehiclePeople(vehicle: Vehiculo) {
  const people = [
    {
      rol: "Responsable",
      nombre: cleanPersonValue(vehicle.nombreResponsable) || cleanPersonValue(vehicle.responsable),
      cedula: cleanPersonValue(vehicle.cedulaResponsable),
    },
    {
      rol: "Conductor / Auxiliar 1",
      nombre: cleanPersonValue(vehicle.nombreAuxiliar1),
      cedula: cleanPersonValue(vehicle.cedulaAuxiliar1),
    },
    {
      rol: "Auxiliar 2",
      nombre: cleanPersonValue(vehicle.nombreAuxiliar2),
      cedula: cleanPersonValue(vehicle.cedulaAuxiliar2),
    },
    {
      rol: "Relevador",
      nombre: cleanPersonValue(vehicle.relevador),
      cedula: "",
    },
  ].filter((person) => person.nombre || person.cedula);

  const seen = new Set<string>();
  return people.filter((person) => {
    const key = `${person.rol}-${person.nombre}-${person.cedula}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanPersonValue(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "-" || normalized.toLowerCase() === "pendiente") return "";
  return normalized;
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
