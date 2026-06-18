"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ClipboardList, Eye, PackageCheck, Search, Truck, X } from "lucide-react";
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
  const [registros, setRegistros] = useState<ModulacionRegistro[]>(() => readModulacionRegistros());
  const [vehiculosSeguimiento] = useState(() => getVehiculosSeguimiento());
  const [selectedRegistroId, setSelectedRegistroId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateKey());
  const [search, setSearch] = useState("");

  const registrosFiltrados = useMemo(() => {
    return registros
      .filter((registro) => !selectedDate || getLocalDateKey(new Date(registro.createdAt)) === selectedDate)
      .filter((registro) => {
        const term = search.trim().toLowerCase();
        if (!term) return true;

        return `${registro.dt} ${registro.codigoCliente} ${registro.nombreCliente} ${registro.persona} ${registro.causal} ${registro.comentario}`
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

  function updateCajasReubicadas(id: string, value: string) {
    const nextRecords = registros.map((registro) =>
      registro.id === id ? { ...registro, cajasReubicadas: value.replace(/\D/g, "") } : registro,
    );

    saveModulacionRegistros(nextRecords);
    setRegistros(nextRecords);
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <ModulacionHeader onBack={() => router.push("/")} />

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Modulo interno</p>
            <h1 className="mt-1 text-3xl font-semibold text-[#10223d]">Modulaciones por dia</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Consulta, filtra y actualiza las modulaciones registradas desde el formulario publico.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Registros visibles</p>
            <p className="mt-1 text-2xl font-semibold text-[#10223d]">{registrosFiltrados.length}</p>
          </div>
        </div>

        <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
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
          <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList size={19} className="text-[#10223d]" />
              <div>
                <h2 className="text-lg font-semibold text-[#10223d]">Tabla de modulaciones</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedDate ? `Mostrando registros del ${selectedDate}` : "Mostrando todos los dias"}
                </p>
              </div>
            </div>
            <span className="rounded-md bg-[#e9f3ff] px-3 py-2 text-sm font-semibold text-[#10223d]">
              {registrosFiltrados.length} modulacion{registrosFiltrados.length === 1 ? "" : "es"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px]">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-5 py-4 text-left">Fecha / hora</th>
                  <th className="px-5 py-4 text-left">DT</th>
                  <th className="px-5 py-4 text-left">Cliente</th>
                  <th className="px-5 py-4 text-left">Persona</th>
                  <th className="px-5 py-4 text-left">Causal</th>
                  <th className="px-5 py-4 text-center">Rechazadas</th>
                  <th className="px-5 py-4 text-center">Reubicadas</th>
                  <th className="px-5 py-4 text-left">Comentario</th>
                  <th className="px-5 py-4 text-right">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registrosFiltrados.length ? (
                  registrosFiltrados.map((registro) => (
                    <tr className="transition hover:bg-slate-50" key={registro.id}>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[#10223d]">{formatDate(registro.createdAt)}</p>
                        <p className="text-sm text-slate-500">{formatTime(registro.createdAt)}</p>
                      </td>
                      <td className="px-5 py-4 font-semibold text-[#10223d]">DT {registro.dt}</td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-700">{registro.codigoCliente}</p>
                        <p className="max-w-44 truncate text-sm text-slate-500">{registro.nombreCliente || "-"}</p>
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-600">{registro.persona}</td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-600">{registro.causal}</td>
                      <td className="px-5 py-4 text-center">
                        <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">{registro.totalCajas}</span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <input
                          className="h-9 w-20 rounded-md border border-slate-200 px-2 text-center text-sm font-semibold text-[#10223d] outline-none transition focus:border-[#f5bd19]"
                          inputMode="numeric"
                          onChange={(event) => updateCajasReubicadas(registro.id, event.target.value)}
                          type="text"
                          value={registro.cajasReubicadas || "0"}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <p className="max-w-72 truncate text-sm text-slate-600">{registro.comentario || "-"}</p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-100 px-2.0 text-xs font-semibold text-[#10223d] transition hover:border-[#f5bd19] hover:bg-[#fff8e6]"
                          onClick={() => setSelectedRegistroId(registro.id)}
                          type="button"
                        >
                          <Eye size={4} />
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
            onChangeReubicadas={updateCajasReubicadas}
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
  onChangeReubicadas,
}: {
  onClose: () => void;
  registro: ModulacionRegistro;
  selectedVehicle: Vehiculo | null;
  onChangeReubicadas: (id: string, value: string) => void;
}) {
  const details = [
    ["Codigo cliente", registro.codigoCliente],
    ["Nombre cliente", registro.nombreCliente || "-"],
    ["Placa de vehiculo", selectedVehicle?.vehiculo || "-"],
    ["Transportista", selectedVehicle?.transportista || "-"],
    ["Responsable", selectedVehicle?.responsable || registro.persona],
    ["Territorio", selectedVehicle?.territorio || "-"],
    ["Causal", registro.causal],
    ["Comentario", registro.comentario || "-"],
  ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#10223d]/50 px-4 py-6 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="relative border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-start gap-3 pr-12">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[#e9f3ff] text-[#10223d]">
              <PackageCheck size={20} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0f7c58]">Detalle de modulacion</p>
              <h2 className="mt-1 text-xl font-semibold text-[#10223d]">DT {registro.dt}</h2>
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

        <div className="max-h-[calc(92vh-84px)] overflow-y-auto p-5">
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <ModalMetric label="Rechazadas" value={registro.totalCajas} tone="red" />
            <ModalMetric label="Reubicadas" value={registro.cajasReubicadas || "0"} tone="green" />
            <ModalMetric label="Persona" value={registro.persona} tone="blue" />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
            <div className="grid gap-3 sm:grid-cols-2">
              {details.map(([label, value]) => (
                <DetailTile key={label} label={label} value={value} />
              ))}
            </div>

            <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#10223d]">
                <Truck size={16} />
                Gestion
              </div>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Cajas reubicadas</span>
                <input
                  className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-[#10223d] outline-none transition focus:border-[#f5bd19]"
                  inputMode="numeric"
                  onChange={(event) => onChangeReubicadas(registro.id, event.target.value)}
                  type="text"
                  value={registro.cajasReubicadas || "0"}
                />
              </label>
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

function ModalMetric({ label, value, tone }: { label: string; value: string | number; tone: "red" | "green" | "blue" }) {
  const colors = {
    red: "bg-red-50 text-red-700",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-[#e9f3ff] text-[#10223d]",
  };

  return (
    <div className={`rounded-lg p-4 ${colors[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-[0.12em] opacity-75">{label}</p>
      <p className="mt-2 truncate text-2xl font-semibold">{value}</p>
    </div>
  );
}

function DetailTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-[#10223d]">{value}</p>
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
