"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ClipboardList, Eye, PackageCheck, Search, UsersRound, X } from "lucide-react";
import {
  getLocalDateKey,
  MODULACION_STORAGE_KEY,
  normalizeDt,
  readModulacionRegistros,
  saveModulacionRegistro,
  type ModulacionRegistro,
} from "../lib/modulacionStorage";
import { readSeguimientoVehiculos, SEGUIMIENTO_STORAGE_KEY } from "../lib/seguimientoStorage";
import { refreshRemoteRecords } from "../lib/remoteStore";
import { useStorageSnapshot } from "../lib/storageEvents";
import { getVehiculosSeguimiento } from "./utils";
import { ModulacionHeader } from "./components/ModulacionHeader";
import type { Vehiculo } from "../seguimiento/types";

const MODULACION_REFRESH_MS = 30_000;

export default function ModulacionPage() {
  const router = useRouter();
  const registros = useStorageSnapshot<ModulacionRegistro[]>([MODULACION_STORAGE_KEY], readModulacionRegistros, []);
  const seguimientoVehiculos = useStorageSnapshot<Vehiculo[]>([SEGUIMIENTO_STORAGE_KEY], readSeguimientoVehiculos, []);
  const [selectedRegistroId, setSelectedRegistroId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateKey());
  const [search, setSearch] = useState("");
  const [telefonosCliente, setTelefonosCliente] = useState<Record<string, string>>({});
  const [telefonosJefeComercial, setTelefonosJefeComercial] = useState<Record<string, string>>({});
  const [telefonosPreventista, setTelefonosPreventista] = useState<Record<string, string>>({});
  const [nombresPreventista, setNombresPreventista] = useState<Record<string, string>>({});

  const vehiculosSeguimiento = useMemo(
    () => mergeVehiclesByDt(seguimientoVehiculos, getVehiculosSeguimiento()),
    [seguimientoVehiculos],
  );

  useEffect(() => {
    void refreshRemoteRecords("/api/modulaciones");
    const interval = window.setInterval(() => {
      void refreshRemoteRecords("/api/modulaciones");
    }, MODULACION_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, []);

  const registrosFiltrados = useMemo(() => {
    return registros
      .filter((registro) => !selectedDate || getLocalDateKey(new Date(registro.createdAt)) === selectedDate)
      .filter((registro) => {
        const term = search.trim().toLowerCase();
        if (!term) return true;

        return `${registro.dt} ${registro.codigoCliente} ${registro.nombreCliente} ${registro.telefonoCliente} ${registro.com} ${registro.jefeComercial} ${registro.telefonoJefeComercial} ${registro.preventista} ${registro.persona} ${registro.personaNombre} ${registro.causal} ${registro.comentario} ${registro.comentarioModulador}`
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
    const registroDate = getRegistroDateKey(registroSeleccionado);
    const vehiclesByDt = vehiculosSeguimiento.filter((vehiculo) => normalizeDt(vehiculo.transporte) === normalizeDt(registroSeleccionado.dt));
    return vehiclesByDt.find((vehiculo) => getVehicleDateKey(vehiculo) === registroDate) ?? vehiclesByDt[0] ?? null;
  }, [registroSeleccionado, vehiculosSeguimiento]);

  useEffect(() => {
    if (
      !registroSeleccionado?.codigoCliente ||
      (registroSeleccionado.telefonoCliente && registroSeleccionado.telefonoJefeComercial && registroSeleccionado.telefonoPreventista && registroSeleccionado.preventistaNombre) ||
      (telefonosCliente[registroSeleccionado.codigoCliente] &&
        telefonosJefeComercial[registroSeleccionado.codigoCliente] &&
        telefonosPreventista[registroSeleccionado.codigoCliente] &&
        nombresPreventista[registroSeleccionado.codigoCliente])
    ) {
      return;
    }

    const controller = new AbortController();
    fetch(`/api/clientes?codigo=${encodeURIComponent(registroSeleccionado.codigoCliente)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) return;
        const telefono = body.cliente?.telefono || "";
        const telefonoJefe = body.cliente?.telefonoJefeComercial || "";
        const telefonoPreventista = body.cliente?.telefonoPreventista || "";
        const preventistaNombre = body.cliente?.preventistaNombre || "";
        if (telefono) setTelefonosCliente((current) => ({ ...current, [registroSeleccionado.codigoCliente]: telefono }));
        if (telefonoJefe) setTelefonosJefeComercial((current) => ({ ...current, [registroSeleccionado.codigoCliente]: telefonoJefe }));
        if (telefonoPreventista) setTelefonosPreventista((current) => ({ ...current, [registroSeleccionado.codigoCliente]: telefonoPreventista }));
        if (preventistaNombre) setNombresPreventista((current) => ({ ...current, [registroSeleccionado.codigoCliente]: preventistaNombre }));
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [nombresPreventista, registroSeleccionado, telefonosCliente, telefonosJefeComercial, telefonosPreventista]);

  function updateCajasGestionadas(id: string, value: string) {
    const nextRecord = registros.find((registro) => registro.id === id);
    if (!nextRecord) return;

    saveModulacionRegistro({ ...nextRecord, cajasGestionadas: value.replace(/\D/g, "") });
  }

  function updateComentarioModulador(id: string, value: string) {
    const nextRecord = registros.find((registro) => registro.id === id);
    if (!nextRecord) return;

    saveModulacionRegistro({ ...nextRecord, comentarioModulador: value });
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

        <section className="data-shell rounded-lg">
          <div className="flex flex-col gap-2 border-b border-slate-200/70 bg-white/78 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList size={16} className="text-[#10223d]" />
              <div>
                <h2 className="text-sm font-semibold text-[#10223d]">Tabla de modulaciones</h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {selectedDate ? `Mostrando registros del ${selectedDate}` : "Mostrando todos los dias"}
                </p>
              </div>
            </div>
            <span className="rounded-md border border-cyan-100 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-[#07556b]">
              {registrosFiltrados.length} modulacion{registrosFiltrados.length === 1 ? "" : "es"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[1160px] table-fixed">
              <thead className="sticky top-0 z-10 text-[10px] uppercase tracking-[0.1em]">
                <tr>
                  <th className="w-[105px] px-3 py-2 text-left">Fecha / hora</th>
                  <th className="w-[115px] px-3 py-2 text-left">DT</th>
                  <th className="w-[170px] px-3 py-2 text-left">Cliente</th>
                  <th className="w-[165px] px-3 py-2 text-left">Persona</th>
                  <th className="w-[165px] px-3 py-2 text-left">Causal</th>
                  <th className="w-[90px] px-3 py-2 text-center">Rechaz.</th>
                  <th className="w-[135px] px-3 py-2 text-center">Gestion.</th>
                  <th className="px-3 py-2 text-left">Comentario</th>
                  <th className="w-[95px] px-3 py-2 text-right">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {registrosFiltrados.length ? (
                  registrosFiltrados.map((registro) => (
                    <tr key={registro.id}>
                      <td className="px-3 py-2">
                        <p className="text-xs font-semibold text-[#10223d]">{formatDate(registro.createdAt)}</p>
                        <p className="text-[11px] text-slate-500">{formatTime(registro.createdAt)}</p>
                      </td>
                      <td className="px-3 py-2 text-xs font-semibold leading-4 text-[#10223d]"><span className="rounded bg-[#e8f7ff] px-1.5 py-0.5 text-[#07556b]">DT {registro.dt}</span></td>
                      <td className="px-3 py-2">
                        <p className="truncate text-xs font-semibold text-slate-700">{registro.codigoCliente}</p>
                        <p className="truncate text-[11px] text-slate-500" title={registro.nombreCliente || "-"}>{registro.nombreCliente || "-"}</p>
                      </td>
                      <td className="px-3 py-2">
                        <span className="block truncate rounded border border-cyan-100 bg-cyan-50 px-2 py-1 text-xs font-semibold leading-4 text-[#07556b]" title={registro.personaNombre || registro.persona}>
                          {registro.personaNombre || registro.persona}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <p className="line-clamp-2 text-xs font-medium leading-4 text-slate-600" title={registro.causal}>{registro.causal}</p>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="number-pill border-red-100 bg-red-50 text-red-700">{registro.totalCajas}</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1.5">
                          <input
                            className="h-7 w-14 rounded-md border border-slate-200 bg-white/90 px-1.5 text-center text-xs font-semibold text-[#10223d] outline-none transition focus:border-[#00b8d9]"
                            inputMode="numeric"
                            onChange={(event) => updateCajasGestionadas(registro.id, event.target.value)}
                            placeholder="0"
                            type="text"
                            value={getEditableGestionadas(registro.cajasGestionadas)}
                          />
                          <GestionBadge registro={registro} />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <p className="truncate text-xs text-slate-600" title={registro.comentario || "-"}>{registro.comentario || "-"}</p>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-cyan-100 bg-cyan-50 px-2 text-[11px] font-semibold text-[#07556b] transition hover:border-[#00b8d9] hover:bg-white"
                          onClick={() => setSelectedRegistroId(registro.id)}
                          type="button"
                        >
                          <Eye size={13} />
                          Ver
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
            onChangeComentarioModulador={updateComentarioModulador}
            onClose={() => setSelectedRegistroId(null)}
            registro={registroSeleccionado}
            selectedVehicle={vehiculoSeleccionado}
            telefonoCliente={registroSeleccionado.telefonoCliente || telefonosCliente[registroSeleccionado.codigoCliente] || ""}
            telefonoJefeComercial={registroSeleccionado.telefonoJefeComercial || telefonosJefeComercial[registroSeleccionado.codigoCliente] || ""}
            telefonoPreventista={registroSeleccionado.telefonoPreventista || telefonosPreventista[registroSeleccionado.codigoCliente] || ""}
            preventistaNombre={registroSeleccionado.preventistaNombre || nombresPreventista[registroSeleccionado.codigoCliente] || ""}
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
  telefonoCliente,
  telefonoJefeComercial,
  telefonoPreventista,
  preventistaNombre,
  onChangeGestionadas,
  onChangeComentarioModulador,
}: {
  onClose: () => void;
  registro: ModulacionRegistro;
  selectedVehicle: Vehiculo | null;
  telefonoCliente: string;
  telefonoJefeComercial: string;
  telefonoPreventista: string;
  preventistaNombre: string;
  onChangeGestionadas: (id: string, value: string) => void;
  onChangeComentarioModulador: (id: string, value: string) => void;
}) {
  const [comentarioModuladorDraft, setComentarioModuladorDraft] = useState(registro.comentarioModulador || "");

  useEffect(() => {
    setComentarioModuladorDraft(registro.comentarioModulador || "");
  }, [registro.id]);

  function persistComentarioModulador() {
    if ((registro.comentarioModulador || "") === comentarioModuladorDraft) return;
    onChangeComentarioModulador(registro.id, comentarioModuladorDraft);
  }

  function handleClose() {
    persistComentarioModulador();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#10223d]/50 px-4 py-6 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="relative border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-start gap-3 pr-12">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[#e9f3ff] text-[#10223d]">
              <PackageCheck size={20} />
            </span>
            <div className="[&>h2:nth-of-type(2)]:hidden">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0f7c58]">Detalle de modulacion</p>
              <h2 className="mt-1 text-xl font-semibold leading-tight text-[#10223d]">{registro.nombreCliente || "Cliente sin nombre"}</h2>
              <p className="mt-0.5 text-sm font-semibold text-slate-500">
                Cliente {registro.codigoCliente} - DT {registro.dt} - Placa {selectedVehicle?.vehiculo || "-"}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-[#10223d]">DT {registro.dt} · Cliente {registro.codigoCliente}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {formatDate(registro.createdAt)} · {formatTime(registro.createdAt)}
              </p>
            </div>
          </div>
          <button
            aria-label="Cerrar detalle"
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-[#10223d]"
            onClick={handleClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(92vh-76px)] overflow-y-auto p-4">
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
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

          <div className="grid gap-3 lg:grid-cols-[1fr_230px]">
            <div className="grid gap-2 sm:grid-cols-2">
              <DetailTile label="Datos del cliente">
                <p className="text-base font-bold leading-tight text-[#10223d]">{registro.nombreCliente || "Cliente sin nombre"}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Codigo del cliente {registro.codigoCliente}</p>
                <DetailLine label="Telefono" value={telefonoCliente || "-"} />
              </DetailTile>
              <DetailTile label="Datos de ventas">
                <DetailLine label="Jefe" value={registro.jefeComercial || "-"} />
                <DetailLine label="Tel. jefe" value={telefonoJefeComercial || "-"} />
                <DetailLine label="Preventista" value={preventistaNombre || registro.preventista || "-"} />
                <DetailLine label="Tel. preventista" value={telefonoPreventista || "-"} />
              </DetailTile>
              <DetailTile label="Ruta">
                <DetailLine label="DT" value={registro.dt} />
                <DetailLine label="Placa" value={selectedVehicle?.vehiculo || "-"} />
                <DetailLine label="Contratista" value={registro.contratista || selectedVehicle?.transportista || "-"} />
              </DetailTile>
              <DetailTile label="Gestion RR">
                <DetailLine label="Responsable" value={selectedVehicle?.responsable || registro.personaNombre || registro.persona} />
                <DetailLine label="Causal" value={registro.causal} />
              </DetailTile>
              <DetailTile label="Comentario RR">
                <p className="text-sm font-semibold leading-5 text-[#10223d]">{registro.comentario || "-"}</p>
              </DetailTile>
              <DetailTile label="Nota modulador">
                <p className="text-sm font-semibold leading-5 text-[#10223d]">{registro.comentarioModulador || "Sin nota interna"}</p>
              </DetailTile>
            </div>

            <aside className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#10223d]">
                <UsersRound size={16} />
                Modulador
              </div>
              <label className="mb-3 block">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Comentario interno</span>
                <textarea
                  className="mt-2 min-h-20 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#10223d] outline-none transition focus:border-[#f5bd19]"
                  onBlur={persistComentarioModulador}
                  onChange={(event) => setComentarioModuladorDraft(event.target.value)}
                  placeholder="Agrega una nota interna de modulacion"
                  value={comentarioModuladorDraft}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Cajas gestionadas</span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-[#10223d] outline-none transition focus:border-[#f5bd19]"
                  inputMode="numeric"
                  onChange={(event) => onChangeGestionadas(registro.id, event.target.value)}
                  placeholder="0"
                  type="text"
                  value={getEditableGestionadas(registro.cajasGestionadas)}
                />
              </label>
              <div className="mt-3">
                <GestionProgress registro={registro} />
              </div>
              <button
                className="mt-4 h-10 w-full rounded-md bg-[#10223d] text-sm font-semibold text-white transition hover:bg-[#1b355b]"
                onClick={handleClose}
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

function getEditableGestionadas(value: string | undefined) {
  return value && value !== "0" ? value : "";
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
      className={`inline-flex h-7 items-center gap-1 rounded-full border px-1.5 text-[11px] font-semibold ${config.className}`}
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
      <svg className="h-5 w-7 overflow-visible" viewBox="0 0 48 34" fill="none">
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

function DetailTile({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="min-h-24 rounded-md border border-slate-200 bg-white p-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <div className="mt-1 break-words">{children}</div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="mt-0.5 flex items-start justify-between gap-3 text-xs first:mt-0">
      <span className="font-medium text-slate-500">{label}</span>
      <span className="text-right font-semibold text-[#10223d]">{value}</span>
    </span>
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

function mergeVehiclesByDt(primary: Vehiculo[], fallback: Vehiculo[]) {
  const vehicles = new Map<string, Vehiculo>();

  fallback.forEach((vehicle) => {
    vehicles.set(getVehicleLookupKey(vehicle), vehicle);
  });
  primary.forEach((vehicle) => {
    vehicles.set(getVehicleLookupKey(vehicle), vehicle);
  });

  return Array.from(vehicles.values());
}

function getVehicleLookupKey(vehicle: Vehiculo) {
  return `${normalizeDt(vehicle.transporte)}:${getVehicleDateKey(vehicle)}`;
}

function getRegistroDateKey(registro: ModulacionRegistro) {
  return toDateKey(registro.fechaDespacho || registro.fechaDt || registro.createdAt);
}

function getVehicleDateKey(vehicle: Vehiculo) {
  return toDateKey(vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || vehicle.createdAt);
}

function toDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(Number);
    if ([day, month, year].every(Number.isFinite)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}
