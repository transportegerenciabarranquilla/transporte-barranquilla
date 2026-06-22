import type { ReactNode } from "react";
import { Boxes, CalendarDays, Clock3, MapPin, PackageCheck, Route, Trash2, Truck, Users, X } from "lucide-react";
import type { Vehiculo } from "../types";
import { ROUTE_STATUSES, calculateRouteTime, getProgress, getStatus } from "../utils";
import { StatusBadge } from "./StatusBadge";

export function VehicleDrawer({
  vehicle,
  now,
  onClose,
  onDeleteVehicle,
  onUpdateVehicle,
  recordKey,
}: {
  vehicle: Vehiculo;
  now: Date;
  onClose: () => void;
  onDeleteVehicle: (recordKey: string) => void;
  onUpdateVehicle: (recordKey: string, changes: Partial<Vehiculo>) => void;
  recordKey: string;
}) {
  const progress = getProgress(vehicle);
  const capacity = vehicle.capacidad ? Math.round((vehicle.peso / vehicle.capacidad) * 100) : 0;
  const routeTime = calculateRouteTime(vehicle, now);
  const status = getStatus(progress, vehicle);

  function updateVehicle(changes: Partial<Vehiculo>) {
    onUpdateVehicle(recordKey, changes);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#10223d]/45 backdrop-blur-sm">
      <aside className="h-full w-full max-w-md overflow-y-auto bg-white shadow-[0_0_70px_rgba(16,34,61,0.24)]">
        <div className="sticky top-0 border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Detalle del vehiculo</p>
              <h2 className="mt-1 text-2xl font-semibold text-[#10223d]">{vehicle.vehiculo}</h2>
            </div>
            <button
              className="grid h-10 w-10 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-[#10223d]"
              onClick={onClose}
              type="button"
              aria-label="Cerrar detalle"
            >
              <X size={20} />
            </button>
          </div>
          <button
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-md border border-red-200 px-3 text-sm font-semibold text-red-600 transition hover:bg-red-50"
            onClick={() => onDeleteVehicle(recordKey)}
            type="button"
          >
            <Trash2 size={17} />
            Borrar DT
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="rounded-lg bg-[#10223d] p-5 text-white">
            <p className="text-sm text-white/65">Avance de ruta</p>
            <div className="mt-3 flex items-end justify-between">
              <span className="text-4xl font-semibold text-[#f5bd19]">{progress}%</span>
              <StatusBadge status={status} />
            </div>
            <div className="mt-4 h-2 rounded-full bg-white/15">
              <div className="h-2 rounded-full bg-[#f5bd19]" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2 text-[#10223d]">
              <Clock3 size={18} />
              <p className="text-sm font-semibold">Seguimiento de ruta</p>
            </div>

            <div className="grid gap-3">
              <label className="grid gap-1">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Estado</span>
                <select
                  className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-[#f5bd19]"
                  onChange={(event) => updateVehicle({ status: event.target.value })}
                  value={status}
                >
                  {ROUTE_STATUSES.map((routeStatus) => (
                    <option key={routeStatus} value={routeStatus}>
                      {routeStatus}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <EditableTime
                  label="Hora salida"
                  value={vehicle.horaSalida}
                  onChange={(value) =>
                    updateVehicle({
                      horaSalida: value || "Pendiente",
                      status: value ? "En ruta" : "Pendiente por salir",
                    })
                  }
                />
                <EditableTime
                  label="Hora llegada"
                  value={vehicle.horaLlegada}
                  onChange={(value) =>
                    updateVehicle({
                      horaLlegada: value || "Pendiente",
                      status: value ? "Finalizado" : "En ruta",
                    })
                  }
                />
              </div>

              <div className="rounded-md bg-slate-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Tiempo en ruta</p>
                <p className="mt-1 text-2xl font-semibold text-[#10223d]">{routeTime}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <EditableInfo icon={<CalendarDays size={18} />} label="Mes" value={vehicle.mes} onChange={(value) => updateVehicle({ mes: String(value) })} />
            <EditableInfo icon={<MapPin size={18} />} label="CD" value={vehicle.cd} onChange={(value) => updateVehicle({ cd: String(value) })} />
            <EditableInfo icon={<Route size={18} />} label="Llave" value={vehicle.llave} onChange={(value) => updateVehicle({ llave: String(value) })} />
            <EditableInfo icon={<Truck size={18} />} label="Vehiculo" value={vehicle.vehiculo} onChange={(value) => updateVehicle({ vehiculo: String(value) })} />
            <EditableInfo icon={<Truck size={18} />} label="Transporte" value={vehicle.transporte} onChange={(value) => updateVehicle({ transporte: String(value) })} />
            <EditableInfo icon={<MapPin size={18} />} label="Centro" value={vehicle.centro} onChange={(value) => updateVehicle({ centro: String(value) })} />
            <EditableInfo icon={<Truck size={18} />} label="Cod transportista" value={vehicle.codTransportista} onChange={(value) => updateVehicle({ codTransportista: String(value) })} />
            <EditableInfo icon={<CalendarDays size={18} />} label="Fecha de DT" type="date" value={vehicle.fechaDt} onChange={(value) => updateVehicle({ fechaDt: String(value) })} />
            <EditableInfo icon={<CalendarDays size={18} />} label="Fecha despacho" type="date" value={vehicle.fechaDespacho} onChange={(value) => updateVehicle({ fechaDespacho: String(value) })} />
            <EditableInfo icon={<Truck size={18} />} label="Transportista" value={vehicle.transportista} onChange={(value) => updateVehicle({ transportista: String(value) })} />
            <EditableInfo icon={<Users size={18} />} label="Responsable" value={vehicle.responsable} onChange={(value) => updateVehicle({ responsable: String(value) })} />
            <EditableInfo icon={<Users size={18} />} label="Cedula RR" value={vehicle.cedulaResponsable || ""} onChange={(value) => updateVehicle({ cedulaResponsable: String(value) })} />
            <EditableInfo icon={<Users size={18} />} label="Cedula conductor / auxiliar 1" value={vehicle.cedulaAuxiliar1 || ""} onChange={(value) => updateVehicle({ cedulaAuxiliar1: String(value) })} />
            <EditableInfo icon={<Users size={18} />} label="Cedula auxiliar 2" value={vehicle.cedulaAuxiliar2 || ""} onChange={(value) => updateVehicle({ cedulaAuxiliar2: String(value) })} />
            <EditableInfo icon={<MapPin size={18} />} label="Territorio" value={vehicle.territorio} onChange={(value) => updateVehicle({ territorio: String(value) })} />
            <EditableInfo icon={<Route size={18} />} label="Viaje" value={vehicle.viaje} onChange={(value) => updateVehicle({ viaje: String(value) })} />
            <EditableInfo icon={<Route size={18} />} label="Bloque" value={vehicle.bloque} onChange={(value) => updateVehicle({ bloque: String(value) })} />
            <EditableInfo icon={<Route size={18} />} label="Clientes" type="number" value={vehicle.clientes} onChange={(value) => updateVehicle({ clientes: Number(value) })} />
            <EditableInfo icon={<Route size={18} />} label="Visitados" type="number" value={vehicle.visitados} onChange={(value) => updateVehicle({ visitados: Number(value) })} />
            <EditableInfo icon={<PackageCheck size={18} />} label="HL" type="number" value={vehicle.hl} onChange={(value) => updateVehicle({ hl: Number(value) })} />
            <EditableInfo icon={<Boxes size={18} />} label="Cajas" type="number" value={vehicle.cajas} onChange={(value) => updateVehicle({ cajas: Number(value) })} />
            <Info icon={<Boxes size={18} />} label="Cajas rechazadas" value={vehicle.cajasRechazadas || 0} />
            <Info icon={<PackageCheck size={18} />} label="Cajas gestionadas" value={vehicle.cajasGestionadas || 0} />
            <Info icon={<Boxes size={18} />} label="Tope maximo" value={vehicle.topeMaximoCajas || 0} />
            <Info icon={<PackageCheck size={18} />} label="Refusal neto" value={`${vehicle.refusal || 0}%`} />
            <EditableInfo icon={<Boxes size={18} />} label="Peso DT" type="number" value={vehicle.peso} onChange={(value) => updateVehicle({ peso: Number(value) })} />
            <EditableInfo icon={<Boxes size={18} />} label="Capacidad peso vehiculo" type="number" value={vehicle.capacidad} onChange={(value) => updateVehicle({ capacidad: Number(value) })} />
            <EditableInfo icon={<PackageCheck size={18} />} label="Validador de peso" value={vehicle.validadorPeso} onChange={(value) => updateVehicle({ validadorPeso: String(value) })} />
            <Info icon={<Route size={18} />} label="Avance en ruta" value={`${progress}%`} />
            <EditableInfo icon={<Route size={18} />} label="Meta relevo" value={vehicle.metaRelevo} onChange={(value) => updateVehicle({ metaRelevo: String(value) })} />
            <EditableInfo icon={<Clock3 size={18} />} label="Hora inicio relevo" value={vehicle.horaInicioRelevo} onChange={(value) => updateVehicle({ horaInicioRelevo: String(value) })} />
            <EditableInfo icon={<Route size={18} />} label="Clasificacion relevo" value={vehicle.clasificacionRelevo} onChange={(value) => updateVehicle({ clasificacionRelevo: String(value) })} />
            <EditableInfo icon={<PackageCheck size={18} />} label="Alerta SIF potencial" value={vehicle.alertaSifPotencial} onChange={(value) => updateVehicle({ alertaSifPotencial: String(value) })} />
            <EditableInfo icon={<Users size={18} />} label="Relevador" value={vehicle.relevador} onChange={(value) => updateVehicle({ relevador: String(value) })} />
            <EditableInfo icon={<Route size={18} />} label="Causal desviado" value={vehicle.causalDesviado} onChange={(value) => updateVehicle({ causalDesviado: String(value) })} />
            <EditableInfo icon={<Clock3 size={18} />} label="Clasificacion on time" value={vehicle.clasificacionOnTime} onChange={(value) => updateVehicle({ clasificacionOnTime: String(value) })} />
            <EditableInfo icon={<PackageCheck size={18} />} label="Recargue" value={vehicle.recargue} onChange={(value) => updateVehicle({ recargue: String(value) })} />
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[#10223d]">Capacidad del vehiculo</p>
              <span className="text-sm font-semibold text-slate-600">{capacity}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-[#0f7c58]" style={{ width: `${capacity}%` }} />
            </div>
            <p className="mt-3 text-sm text-slate-500">
              {vehicle.peso.toLocaleString("es-CO")} kg de {vehicle.capacidad.toLocaleString("es-CO")} kg disponibles.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function EditableTime({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <input
        className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-[#f5bd19]"
        onChange={(event) => onChange(event.target.value)}
        type="time"
        value={value === "Pendiente" || value === "-" ? "" : value}
      />
    </label>
  );
}

function EditableInfo({
  icon,
  label,
  onChange,
  type = "text",
  value,
}: {
  icon: ReactNode;
  label: string;
  onChange: (value: string | number) => void;
  type?: "date" | "number" | "text";
  value: string | number;
}) {
  const inputValue = type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? "" : value;

  return (
    <label className="rounded-lg border border-slate-200 bg-white p-4">
      <span className="mb-3 flex items-center gap-2 text-[#10223d]">
        {icon}
        <span className="text-sm font-medium text-slate-500">{label}</span>
      </span>
      <input
        className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#f5bd19] focus:bg-white"
        min={type === "number" ? 0 : undefined}
        onChange={(event) => onChange(type === "number" ? Number(event.target.value) : event.target.value)}
        type={type}
        value={inputValue}
      />
    </label>
  );
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-[#10223d]">
        {icon}
        <p className="text-sm font-medium text-slate-500">{label}</p>
      </div>
      <p className="font-semibold text-slate-900">{value}</p>
    </div>
  );
}
