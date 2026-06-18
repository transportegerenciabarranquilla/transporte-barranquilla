"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, ClipboardList, Eye, PackageCheck, PackageX, Percent, Ruler, Truck, UserRound, X } from "lucide-react";
import {
  isTodayDate,
  normalizeDt,
  readModulacionRegistros,
  saveModulacionRegistros,
  summarizeModulaciones,
  type ModulacionRegistro,
} from "../lib/modulacionStorage";
import { getVehiculosSeguimiento } from "./utils";
import { ModulacionHeader } from "./components/ModulacionHeader";
import { SummaryInfo } from "./components/SummaryInfo";
import type { Vehiculo } from "../seguimiento/types";

export default function ModulacionPage() {
  const router = useRouter();
  const [registros, setRegistros] = useState<ModulacionRegistro[]>(() => readModulacionRegistros());
  const [vehiculosSeguimiento] = useState(() => getVehiculosSeguimiento());
  const [selectedRegistroId, setSelectedRegistroId] = useState<string | null>(null);
  const registrosHoy = useMemo(() => registros.filter((registro) => isTodayDate(registro.createdAt)), [registros]);

  const totalCajasVehiculos = useMemo(
    () => vehiculosSeguimiento.reduce((total, vehiculo) => total + Number(vehiculo.cajas || 0), 0),
    [vehiculosSeguimiento],
  );
  const resumen = useMemo(() => summarizeModulaciones(registrosHoy, totalCajasVehiculos), [registrosHoy, totalCajasVehiculos]);
  const registrosRecientes = useMemo(() => registrosHoy.slice(0, 8), [registrosHoy]);
  const moduladoresHoy = useMemo(() => summarizeModuladores(registrosHoy), [registrosHoy]);
  const registroSeleccionado = useMemo(
    () => registrosHoy.find((registro) => registro.id === selectedRegistroId) ?? null,
    [registrosHoy, selectedRegistroId],
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

      <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-10">
        <div className="mb-6">
          <p className="text-sm font-medium text-slate-500">Modulo interno</p>
          <h1 className="mt-1 text-3xl font-semibold text-[#10223d]">Resumen de modulacion</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Consulta los registros enviados desde el link publico de modulacion antes del inicio de sesion.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            icon={<PackageX size={20} />}
            label="Cajas rechazadas"
            value={resumen.cajasRechazadas.toLocaleString("es-CO")}
          />
          <MetricCard
            icon={<PackageCheck size={20} />}
            label="Cajas reubicadas"
            value={resumen.cajasReubicadas.toLocaleString("es-CO")}
          />
          <MetricCard
            icon={<Ruler size={20} />}
            label="Tope maximo"
            value={resumen.topeMaximoCajas.toLocaleString("es-CO")}
          />
          <MetricCard icon={<Percent size={20} />} label="Refusal neto" value={`${resumen.refusal.toLocaleString("es-CO")}%`} />
          <MetricCard icon={<ClipboardList size={20} />} label="Clientes que rechazan" value={resumen.clientesRechazan} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <CajasChart
            cajasPendientes={resumen.cajasPendientes}
            cajasRechazadas={resumen.cajasRechazadas}
            cajasReubicadas={resumen.cajasReubicadas}
            topeMaximoCajas={resumen.topeMaximoCajas}
          />
          <RefusalPanel
            cajasPendientes={resumen.cajasPendientes}
            refusal={resumen.refusal}
            topeMaximoCajas={resumen.topeMaximoCajas}
            totalCajasVehiculos={totalCajasVehiculos}
          />
        </div>

        {registroSeleccionado ? (
          <ModuladorRejectPanel
            onChangeReubicadas={updateCajasReubicadas}
            onClose={() => setSelectedRegistroId(null)}
            registro={registroSeleccionado}
            selectedVehicle={vehiculoSeleccionado}
          />
        ) : null}

        <ModuladoresPanel moduladores={moduladoresHoy} />

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[#10223d]">Registros recientes</h2>
              <p className="mt-1 text-sm text-slate-500">Solo se muestran registros y DT del dia de hoy.</p>
            </div>
          </div>

          {registrosRecientes.length ? (
            <div className="grid gap-3">
              {registrosRecientes.map((registro) => {
                const isSelected = registro.id === selectedRegistroId;

                return (
                <article
                  className={`rounded-md border p-4 transition ${
                    isSelected ? "border-[#f5bd19] bg-[#fff8e6]" : "border-slate-200 bg-white"
                  }`}
                  key={registro.id}
                >
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SummaryInfo label="DT" value={registro.dt} />
                    <SummaryInfo label="Cliente" value={registro.codigoCliente} />
                    <SummaryInfo label="Nombre cliente" value={registro.nombreCliente || "-"} />
                    <SummaryInfo label="Rechazadas" value={registro.totalCajas} />
                    <EditableSummaryNumber
                      label="Reubicadas"
                      onChange={(value) => updateCajasReubicadas(registro.id, value)}
                      value={registro.cajasReubicadas || "0"}
                    />
                    <SummaryInfo label="Persona" value={registro.persona} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-600">
                      <strong className="text-[#10223d]">{registro.causal}:</strong> {registro.comentario}
                    </p>
                    <button
                      className={`inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold transition ${
                        isSelected
                          ? "bg-[#10223d] text-white"
                          : "border border-slate-200 bg-white text-[#10223d] hover:border-[#f5bd19]"
                      }`}
                      onClick={() => setSelectedRegistroId(isSelected ? null : registro.id)}
                      type="button"
                    >
                      <Eye size={17} />
                      {isSelected ? "Ocultar modulador" : "Ver modulador"}
                    </button>
                  </div>
                </article>
              );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Aun no hay registros de modulacion guardados en este navegador.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function ModuladorRejectPanel({
  onClose,
  registro,
  selectedVehicle,
  onChangeReubicadas,
}: {
  onClose: () => void;
  registro: ModulacionRegistro | null;
  selectedVehicle: Vehiculo | null;
  onChangeReubicadas: (id: string, value: string) => void;
}) {
  if (!registro) return null;

  const rows = [
    ["Codigo cliente", registro.codigoCliente],
    ["Nombre cliente", registro.nombreCliente || "-"],
    ["Placa de vehiculo", selectedVehicle?.vehiculo || "-"],
    ["Causal", registro.causal],
    ["Cajas rechazadas", registro.totalCajas],
    ["Transportista", selectedVehicle?.transportista || "-"],
    ["Responsable", selectedVehicle?.responsable || registro.persona],
    ["Fecha", formatDate(registro.createdAt)],
  ];

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="relative bg-[#10223d] px-5 py-4 text-center text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f5bd19]">Modulador CD Galapa</p>
        <h2 className="mt-1 text-2xl font-semibold">Alerta de rechazo</h2>
        <button
          aria-label="Cerrar modulador"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-md text-white transition hover:bg-white/10"
          onClick={onClose}
          type="button"
        >
          <X size={18} />
        </button>
      </div>

      <div className="grid border-b border-slate-200 bg-[#e9f3ff] text-center text-[#10223d] sm:grid-cols-3">
        <div className="border-b border-slate-200 px-4 py-3 font-semibold sm:border-b-0 sm:border-r">
          {selectedVehicle?.centro || "Punto Corona"}
        </div>
        <div className="border-b border-slate-200 px-4 py-3 font-semibold sm:border-b-0 sm:border-r">
          DT {registro.dt}
        </div>
        <div className="px-4 py-3 font-semibold">{registro.persona}</div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
        <div className="divide-y divide-slate-200">
          {rows.map(([label, value]) => (
            <div className="grid min-h-12 sm:grid-cols-[220px_1fr]" key={label}>
              <div className="flex items-center bg-slate-50 px-4 py-3 text-sm font-semibold uppercase text-[#10223d]">
                {label}
              </div>
              <div
                className={`flex items-center px-4 py-3 text-sm font-semibold ${
                  label === "Placa de vehiculo" || label === "Cajas rechazadas"
                    ? "bg-[#f5bd19] text-[#10223d]"
                    : "text-slate-700"
                }`}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        <aside className="border-t border-slate-200 bg-slate-50 p-5 lg:border-l lg:border-t-0">
          <div className="mb-4 inline-flex items-center gap-2 rounded-md bg-[#fff8e6] px-3 py-2 text-sm font-semibold text-[#10223d]">
            <AlertTriangle size={18} />
            Gestion de rechazo
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

          <div className="mt-5 rounded-md bg-white p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#10223d]">
              <Truck size={16} />
              Vehiculo asociado
            </div>
            <p className="text-sm text-slate-600">{selectedVehicle?.vehiculo || "Sin placa asociada"}</p>
            <p className="mt-1 text-xs text-slate-500">{selectedVehicle?.territorio || "Territorio pendiente"}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

type ModuladorResumen = {
  persona: string;
  cantidad: number;
  cajasRechazadas: number;
  cajasReubicadas: number;
  ultimoRegistro: ModulacionRegistro;
};

function summarizeModuladores(registros: ModulacionRegistro[]) {
  const grouped = new Map<string, ModuladorResumen>();

  registros.forEach((registro) => {
    const persona = registro.persona.trim() || "Sin nombre";
    const key = persona.toLowerCase();
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, {
        persona,
        cantidad: 1,
        cajasRechazadas: Number(registro.totalCajas || 0),
        cajasReubicadas: Number(registro.cajasReubicadas || 0),
        ultimoRegistro: registro,
      });
      return;
    }

    current.cantidad += 1;
    current.cajasRechazadas += Number(registro.totalCajas || 0);
    current.cajasReubicadas += Number(registro.cajasReubicadas || 0);

    if (new Date(registro.createdAt).getTime() > new Date(current.ultimoRegistro.createdAt).getTime()) {
      current.ultimoRegistro = registro;
    }
  });

  return Array.from(grouped.values()).sort(
    (a, b) => new Date(b.ultimoRegistro.createdAt).getTime() - new Date(a.ultimoRegistro.createdAt).getTime(),
  );
}

function ModuladoresPanel({ moduladores }: { moduladores: ModuladorResumen[] }) {
  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#10223d]">Moduladores de hoy</h2>
          <p className="mt-1 text-sm text-slate-500">Personas que han registrado modulaciones durante el dia.</p>
        </div>
        <span className="rounded-md bg-[#e9f3ff] px-3 py-2 text-sm font-semibold text-[#10223d]">
          {moduladores.length} activos
        </span>
      </div>

      {moduladores.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {moduladores.map((modulador) => (
            <article className="rounded-md border border-slate-200 p-4" key={modulador.persona}>
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#e9f3ff] text-[#10223d]">
                  <UserRound size={18} />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-[#10223d]">{modulador.persona}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {modulador.cantidad} modulacion{modulador.cantidad === 1 ? "" : "es"} registradas
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <SummaryInfo label="Rechazadas" value={modulador.cajasRechazadas.toLocaleString("es-CO")} />
                <SummaryInfo label="Reubicadas" value={modulador.cajasReubicadas.toLocaleString("es-CO")} />
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span>Ultimo DT {modulador.ultimoRegistro.dt}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock size={14} />
                  {formatTime(modulador.ultimoRegistro.createdAt)}
                </span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
          Aun no hay moduladores registrados hoy.
        </div>
      )}
    </section>
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

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 grid h-10 w-10 place-items-center rounded-md bg-[#e9f3ff] text-[#10223d]">{icon}</div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}

function CajasChart({
  cajasPendientes,
  cajasRechazadas,
  cajasReubicadas,
  topeMaximoCajas,
}: {
  cajasPendientes: number;
  cajasRechazadas: number;
  cajasReubicadas: number;
  topeMaximoCajas: number;
}) {
  const maxValue = Math.max(cajasRechazadas, cajasReubicadas, cajasPendientes, 1);
  const reubicadasWidth = cajasRechazadas ? (cajasReubicadas / cajasRechazadas) * 100 : 0;
  const pendientesWidth = cajasRechazadas ? (cajasPendientes / cajasRechazadas) * 100 : 0;
  const bars = [
    { label: "Rechazadas", value: cajasRechazadas, color: "bg-[#d9480f]" },
    { label: "Reubicadas", value: cajasReubicadas, color: "bg-[#0f7c58]" },
    { label: "Pendientes", value: cajasPendientes, color: "bg-[#f5bd19]" },
    { label: "Tope maximo", value: topeMaximoCajas, color: "bg-[#10223d]" },
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#10223d]">Cajas rechazadas vs reubicadas</h2>
        <p className="mt-1 text-sm text-slate-500">Las pendientes son rechazadas menos reubicadas.</p>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-slate-600">Distribucion de cajas rechazadas</span>
          <span className="font-semibold text-[#10223d]">{cajasRechazadas.toLocaleString("es-CO")}</span>
        </div>
        <div className="flex h-5 overflow-hidden rounded-md bg-slate-200">
          <div className="bg-[#0f7c58]" style={{ width: `${Math.min(reubicadasWidth, 100)}%` }} />
          <div className="bg-[#f5bd19]" style={{ width: `${Math.min(pendientesWidth, 100)}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
          <span>Reubicadas: {cajasReubicadas.toLocaleString("es-CO")}</span>
          <span>Pendientes: {cajasPendientes.toLocaleString("es-CO")}</span>
        </div>
      </div>

      <div className="space-y-4">
        {bars.map((bar) => (
          <div key={bar.label}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-600">{bar.label}</span>
              <span className="font-semibold text-[#10223d]">{bar.value.toLocaleString("es-CO")}</span>
            </div>
            <div className="h-4 overflow-hidden rounded-md bg-slate-100">
              <div className={`h-full rounded-md ${bar.color}`} style={{ width: `${(bar.value / maxValue) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EditableSummaryNumber({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <input
        className="mt-1 h-9 w-28 rounded-md border border-slate-200 px-2 text-sm font-semibold text-[#10223d] outline-none transition focus:border-[#f5bd19]"
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value)}
        type="text"
        value={value}
      />
    </div>
  );
}

function RefusalPanel({
  cajasPendientes,
  refusal,
  topeMaximoCajas,
  totalCajasVehiculos,
}: {
  cajasPendientes: number;
  refusal: number;
  topeMaximoCajas: number;
  totalCajasVehiculos: number;
}) {
  const refusalWidth = Math.min(refusal, 100);
  const topeUsado = topeMaximoCajas ? Math.min((cajasPendientes / topeMaximoCajas) * 100, 100) : 0;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[#10223d]">Refusal y tope</h2>
        <p className="mt-1 text-sm text-slate-500">
          Tope: 1 caja por cada 100 cajas salidas. {totalCajasVehiculos.toLocaleString("es-CO")} cajas generan{" "}
          {topeMaximoCajas.toLocaleString("es-CO")} de tope.
        </p>
      </div>

      <div className="space-y-5">
        <Gauge label="Refusal neto" value={`${refusal.toLocaleString("es-CO")}%`} width={refusalWidth} />
        <Gauge label="Uso del tope" value={`${Math.round(topeUsado).toLocaleString("es-CO")}%`} width={topeUsado} />
      </div>
    </section>
  );
}

function Gauge({ label, value, width }: { label: string; value: string; width: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="font-semibold text-[#10223d]">{value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-md bg-slate-100">
        <div className="h-full rounded-md bg-[#10223d]" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
