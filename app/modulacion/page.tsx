"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ClipboardList, Eye, PackageCheck, Search, UserRound, UsersRound, X } from "lucide-react";
import {
  getLocalDateKey,
  normalizeDt,
  readModulacionRegistros,
  saveModulacionRegistros,
  type ModulacionRegistro,
} from "../lib/modulacionStorage";
import { getVehiculosSeguimiento } from "./utils";
import { ModulacionHeader } from "./components/ModulacionHeader";
import type { Vehiculo } from "../seguimiento/types";

export default function ModulacionPage() {
  const router = useRouter();
  const [registros, setRegistros] = useState<ModulacionRegistro[]>([]);
  const [vehiculosSeguimiento, setVehiculosSeguimiento] = useState<Vehiculo[]>([]);
  const [selectedRegistroId, setSelectedRegistroId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateKey());
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setRegistros(readModulacionRegistros());
      setVehiculosSeguimiento(getVehiculosSeguimiento());
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  const registrosFiltrados = useMemo(() => {
    return registros
      .filter((registro) => !selectedDate || getLocalDateKey(new Date(registro.createdAt)) === selectedDate)
      .filter((registro) => {
        const term = search.trim().toLowerCase();
        if (!term) return true;

        return `${registro.dt} ${registro.codigoCliente} ${registro.nombreCliente} ${registro.com} ${registro.preventista} ${registro.persona} ${registro.personaNombre} ${registro.causal} ${registro.comentario}`
          .toLowerCase()
          .includes(term);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [registros, search, selectedDate]);

  const registroSeleccionado = useMemo(
    () => registros.find((registro) => registro.id === selectedRegistroId) ?? null,
    [registros, selectedRegistroId],
  );

  const vehiculoSeleccionado = useMemo(() => {
    if (!registroSeleccionado) return null;
    return vehiculosSeguimiento.find((vehiculo) => normalizeDt(vehiculo.transporte) === normalizeDt(registroSeleccionado.dt)) ?? null;
  }, [registroSeleccionado, vehiculosSeguimiento]);

  function updateCajasGestionadas(id: string, value: string) {
    const nextRecords = registros.map((registro) =>
      registro.id === id ? { ...registro, cajasGestionadas: value.replace(/\D/g, "") } : registro,
    );

    saveModulacionRegistros(nextRecords);
    setRegistros(nextRecords);
  }

  function updateComentario(id: string, value: string) {
    const nextRecords = registros.map((registro) => (registro.id === id ? { ...registro, comentario: value } : registro));

    saveModulacionRegistros(nextRecords);
    setRegistros(nextRecords);
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <ModulacionHeader onBack={() => router.push("/")} />

      <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:py-7">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Modulo interno</p>
            <h1 className="mt-1 text-2xl font-semibold text-[#10223d]">Modulaciones por dia</h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">
              Consulta, filtra y actualiza las modulaciones registradas desde el formulario publico.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Registros visibles</p>
            <p className="mt-0.5 text-xl font-semibold text-[#10223d]">{registrosFiltrados.length}</p>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto] lg:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#f5bd19]"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por DT, cliente, persona, causal o comentario"
                value={search}
              />
            </div>

            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none transition focus:border-[#f5bd19]"
                onChange={(event) => setSelectedDate(event.target.value)}
                type="date"
                value={selectedDate}
              />
            </div>

            <div className="flex gap-2">
              <button
                className="h-11 rounded-md bg-[#10223d] px-4 text-sm font-semibold text-white transition hover:bg-[#1b355b]"
                onClick={() => setSelectedDate(getLocalDateKey())}
                type="button"
              >
                Hoy
              </button>
              <button
                className="h-11 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                onClick={() => setSelectedDate("")}
                type="button"
              >
                Todas
              </button>
            </div>
          </div>
        </div>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList size={17} className="text-[#10223d]" />
              <div>
                <h2 className="text-base font-semibold text-[#10223d]">Tabla de modulaciones</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {selectedDate ? `Mostrando registros del ${selectedDate}` : "Mostrando todos los dias"}
                </p>
              </div>
            </div>
            <span className="rounded-md bg-[#e9f3ff] px-2.5 py-1.5 text-xs font-semibold text-[#10223d]">
              {registrosFiltrados.length} modulacion{registrosFiltrados.length === 1 ? "" : "es"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px]">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Fecha / hora</th>
                  <th className="px-4 py-3 text-left">DT</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Persona</th>
                  <th className="px-4 py-3 text-left">Causal</th>
                  <th className="px-4 py-3 text-center">Rechazadas</th>
                  <th className="px-4 py-3 text-center">Gestionadas</th>
                  <th className="px-4 py-3 text-left">Comentario</th>
                  <th className="px-4 py-3 text-right">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registrosFiltrados.length ? (
                  registrosFiltrados.map((registro) => (
                    <tr className="transition hover:bg-slate-50" key={registro.id}>
                      <td className="px-4 py-2.5">
                        <p className="text-sm font-semibold text-[#10223d]">{formatDate(registro.createdAt)}</p>
                        <p className="text-xs text-slate-500">{formatTime(registro.createdAt)}</p>
                      </td>
                      <td className="px-4 py-2.5 text-sm font-semibold text-[#10223d]">DT {registro.dt}</td>
                      <td className="px-4 py-2.5">
                        <p className="text-sm font-medium text-slate-700">{registro.codigoCliente}</p>
                        <p className="max-w-40 truncate text-xs text-slate-500">{registro.nombreCliente || "-"}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e9f3ff] px-2 py-1 text-xs font-semibold text-[#10223d]">
                          <UserRound size={13} />
                          {registro.personaNombre || registro.persona}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm font-medium text-slate-600">{registro.causal}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">{registro.totalCajas}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-2">
                          <input
                            className="h-8 w-16 rounded-md border border-slate-200 px-2 text-center text-sm font-semibold text-[#10223d] outline-none transition focus:border-[#f5bd19]"
                            inputMode="numeric"
                            onChange={(event) => updateCajasGestionadas(registro.id, event.target.value)}
                            type="text"
                            value={registro.cajasGestionadas || "0"}
                          />
                          <GestionBadge registro={registro} />
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="max-w-64 truncate text-xs text-slate-600">{registro.comentario || "-"}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-100 px-2 text-xs font-semibold text-[#10223d] transition hover:border-[#f5bd19] hover:bg-[#fff8e6]"
                          onClick={() => setSelectedRegistroId(registro.id)}
                          type="button"
                        >
                          <Eye size={14} />
                          Modulador
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-5 py-12 text-center text-sm font-medium text-slate-500" colSpan={9}>
                      No hay modulaciones para los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {registroSeleccionado ? (
          <ModulacionDetailModal
            onChangeGestionadas={updateCajasGestionadas}
            onChangeComentario={updateComentario}
            onClose={() => setSelectedRegistroId(null)}
            registro={registroSeleccionado}
            selectedVehicle={vehiculoSeleccionado}
          />
        ) : null}
      </section>
    </main>
  );
}

function ModulacionDetailModal({
  onClose,
  registro,
  selectedVehicle,
  onChangeGestionadas,
  onChangeComentario,
}: {
  onClose: () => void;
  registro: ModulacionRegistro;
  selectedVehicle: Vehiculo | null;
  onChangeGestionadas: (id: string, value: string) => void;
  onChangeComentario: (id: string, value: string) => void;
}) {
  const details = [
    ["Codigo cliente", registro.codigoCliente],
    ["Nombre cliente", registro.nombreCliente || "-"],
    ["COM", registro.com || "-"],
    ["Preventista", registro.preventista || "-"],
    ["Placa de vehiculo", selectedVehicle?.vehiculo || "-"],
    ["Transportista", selectedVehicle?.transportista || "-"],
    ["Responsable", selectedVehicle?.responsable || registro.personaNombre || registro.persona],
    ["Territorio", selectedVehicle?.territorio || "-"],
    ["Causal", registro.causal],
    ["Comentario", registro.comentario || "-"],
  ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#10223d]/50 px-4 py-6 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="relative border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-start gap-3 pr-12">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[#e9f3ff] text-[#10223d]">
              <PackageCheck size={20} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0f7c58]">Detalle de modulacion</p>
              <h2 className="mt-1 text-lg font-semibold text-[#10223d]">DT {registro.dt} · Cliente {registro.codigoCliente}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {formatDate(registro.createdAt)} · {formatTime(registro.createdAt)}
              </p>
            </div>
          </div>
          <button
            aria-label="Cerrar detalle"
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-[#10223d]"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(92vh-76px)] overflow-y-auto p-4">
          <div className="mb-4 grid gap-2 sm:grid-cols-3">
            <ModalMetric label="Rechazadas" value={registro.totalCajas} tone="red" />
            <ModalMetric
              label="Gestionadas"
              value={
                <span className="flex items-center gap-2">
                  {registro.cajasGestionadas || "0"}
                  <GestionBadge registro={registro} showLabel />
                </span>
              }
              tone="green"
            />
            <ModalMetric label="Modulador" value={registro.personaNombre || registro.persona} tone="blue" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
            <div className="grid gap-2 sm:grid-cols-2">
              {details.map(([label, value]) => (
                <DetailTile key={label} label={label} value={value} />
              ))}
            </div>

            <aside className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#10223d]">
                <UsersRound size={16} />
                Gestion
              </div>
              <label className="mb-4 block">
                <span className="text-sm font-medium text-slate-700">Comentario</span>
                <textarea
                  className="mt-2 min-h-24 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#10223d] outline-none transition focus:border-[#f5bd19]"
                  onChange={(event) => onChangeComentario(registro.id, event.target.value)}
                  value={registro.comentario}
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Cajas gestionadas</span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-[#10223d] outline-none transition focus:border-[#f5bd19]"
                  inputMode="numeric"
                  onChange={(event) => onChangeGestionadas(registro.id, event.target.value)}
                  type="text"
                  value={registro.cajasGestionadas || "0"}
                />
              </label>
              <div className="mt-3">
                <GestionProgress registro={registro} />
              </div>
              <button
                className="mt-4 h-10 w-full rounded-md bg-[#10223d] text-sm font-semibold text-white transition hover:bg-[#1b355b]"
                onClick={onClose}
                type="button"
              >
                Cerrar
              </button>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}

type GestionStatus = "empty" | "half" | "done";

function getGestionStatus(registro: ModulacionRegistro): GestionStatus {
  const rechazadas = Number(registro.totalCajas) || 0;
  const gestionadas = Number(registro.cajasGestionadas) || 0;

  if (rechazadas > 0 && gestionadas >= rechazadas) return "done";
  if (gestionadas > 0) return "half";
  return "empty";
}

function GestionBadge({ registro, showLabel = false }: { registro: ModulacionRegistro; showLabel?: boolean }) {
  const status = getGestionStatus(registro);
  const config = {
    empty: {
      label: "Esperando",
      className: "border-red-200 bg-red-50 text-red-700 shadow-[0_0_18px_rgba(220,38,38,0.14)]",
      botClassName: "robot-wait",
    },
    half: {
      label: "Gestionando",
      className: "border-amber-200 bg-amber-50 text-amber-700 shadow-[0_0_18px_rgba(245,189,25,0.2)]",
      botClassName: "robot-ready",
    },
    done: {
      label: "Gol",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[0_0_18px_rgba(15,124,88,0.2)]",
      botClassName: "robot-kick",
    },
  }[status];

  return (
    <span
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-2 text-xs font-semibold ${config.className}`}
      title={config.label}
    >
      <MiniRobot status={status} className={config.botClassName} />
      {showLabel ? config.label : null}
    </span>
  );
}

function MiniRobot({ status, className }: { status: GestionStatus; className: string }) {
  const colors = {
    empty: { shell: "#dc2626", eye: "#fee2e2", glow: "#fecaca" },
    half: { shell: "#d97706", eye: "#fef3c7", glow: "#fde68a" },
    done: { shell: "#0f7c58", eye: "#dcfce7", glow: "#bbf7d0" },
  }[status];

  return (
    <span className={`robot-bot ${className}`} aria-hidden="true">
      <svg className="h-7 w-9 overflow-visible" viewBox="0 0 48 34" fill="none">
        <path d="M19 5h10" stroke={colors.shell} strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="24" cy="3.5" r="2.5" fill={colors.glow} stroke={colors.shell} strokeWidth="1.4" />
        <rect x="8" y="8" width="27" height="20" rx="8" fill="#10223d" stroke={colors.shell} strokeWidth="2.3" />
        <rect x="12" y="12" width="19" height="11" rx="5" fill={colors.shell} opacity="0.18" />
        <circle cx="17" cy="17.5" r="3.2" fill={colors.eye} />
        <circle cx="26" cy="17.5" r="3.2" fill={colors.eye} />
        <circle cx="17" cy="17.5" r="1.1" fill="#10223d" />
        <circle cx="26" cy="17.5" r="1.1" fill="#10223d" />
        <path d="M17 24c2.7 2 6.5 2 9.2 0" stroke={colors.eye} strokeWidth="1.8" strokeLinecap="round" />
        <path className="robot-leg" d="M28 27l4 4" stroke={colors.shell} strokeWidth="2.3" strokeLinecap="round" />
        <path d="M15 27l-3 4" stroke={colors.shell} strokeWidth="2.3" strokeLinecap="round" />
        <circle className="robot-ball" cx="40" cy="27" r="4.2" fill="#f8fafc" stroke="#10223d" strokeWidth="1.2" />
        <path className="robot-ball" d="M37.5 27h5M40 24.6v4.8" stroke="#10223d" strokeWidth="0.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function GestionProgress({ registro }: { registro: ModulacionRegistro }) {
  const rechazadas = Number(registro.totalCajas) || 0;
  const gestionadas = Number(registro.cajasGestionadas) || 0;
  const progress = rechazadas ? Math.min(100, Math.round((gestionadas / rechazadas) * 100)) : 0;
  const status = getGestionStatus(registro);
  const barColor = status === "done" ? "bg-emerald-500" : status === "half" ? "bg-amber-400" : "bg-red-500";

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Avance</span>
        <span className="text-sm font-semibold text-[#10223d]">{progress}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-2 text-xs font-medium text-slate-500">
        {gestionadas.toLocaleString("es-CO")} de {rechazadas.toLocaleString("es-CO")} cajas
      </p>
    </div>
  );
}

function ModalMetric({ label, value, tone }: { label: string; value: ReactNode; tone: "red" | "green" | "blue" }) {
  const colors = {
    red: "bg-red-50 text-red-700",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-[#e9f3ff] text-[#10223d]",
  };

  return (
    <div className={`rounded-lg p-3 ${colors[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-[0.12em] opacity-75">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold">{value}</p>
    </div>
  );
}

function DetailTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";

  return date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("es-CO");
}
