import type { ReactNode } from "react";
import { Boxes, CalendarDays, Clock3, MapPin, PackageCheck, Route, Truck, Users, X } from "lucide-react";
import type { Vehiculo } from "../types";
import { getProgress, getStatus } from "../utils";
import { StatusBadge } from "./StatusBadge";

export function VehicleDrawer({ vehicle, onClose }: { vehicle: Vehiculo; onClose: () => void }) {
  const progress = getProgress(vehicle);
  const capacity = Math.round((vehicle.peso / vehicle.capacidad) * 100);

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
        </div>

        <div className="space-y-5 p-5">
          <div className="rounded-lg bg-[#10223d] p-5 text-white">
            <p className="text-sm text-white/65">Avance de ruta</p>
            <div className="mt-3 flex items-end justify-between">
              <span className="text-4xl font-semibold text-[#f5bd19]">{progress}%</span>
              <StatusBadge status={getStatus(progress)} />
            </div>
            <div className="mt-4 h-2 rounded-full bg-white/15">
              <div className="h-2 rounded-full bg-[#f5bd19]" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Info icon={<CalendarDays size={18} />} label="Mes" value={vehicle.mes} />
            <Info icon={<MapPin size={18} />} label="CD" value={vehicle.cd} />
            <Info icon={<Route size={18} />} label="Llave" value={vehicle.llave} />
            <Info icon={<Truck size={18} />} label="Transporte" value={vehicle.transporte} />
            <Info icon={<MapPin size={18} />} label="Centro" value={vehicle.centro} />
            <Info icon={<Truck size={18} />} label="Cod transportista" value={vehicle.codTransportista} />
            <Info icon={<CalendarDays size={18} />} label="Fecha de DT" value={vehicle.fechaDt} />
            <Info icon={<CalendarDays size={18} />} label="Fecha despacho" value={vehicle.fechaDespacho} />
            <Info icon={<Truck size={18} />} label="Transportista" value={vehicle.transportista} />
            <Info icon={<Users size={18} />} label="Responsable" value={vehicle.responsable} />
            <Info icon={<Users size={18} />} label="Cedula RR" value={vehicle.cedulaResponsable || "-"} />
            <Info icon={<Users size={18} />} label="Cedula conductor / auxiliar 1" value={vehicle.cedulaAuxiliar1 || "-"} />
            <Info icon={<Users size={18} />} label="Cedula auxiliar 2" value={vehicle.cedulaAuxiliar2 || "-"} />
            <Info icon={<MapPin size={18} />} label="Territorio" value={vehicle.territorio} />
            <Info icon={<Route size={18} />} label="Viaje" value={vehicle.viaje} />
            <Info icon={<Route size={18} />} label="Bloque" value={vehicle.bloque} />
            <Info icon={<Clock3 size={18} />} label="Hora salida" value={vehicle.horaSalida} />
            <Info icon={<Route size={18} />} label="Clientes" value={`${vehicle.visitados}/${vehicle.clientes}`} />
            <Info icon={<PackageCheck size={18} />} label="HL" value={vehicle.hl} />
            <Info icon={<Boxes size={18} />} label="Cajas" value={vehicle.cajas} />
            <Info icon={<Boxes size={18} />} label="Cajas rechazadas" value={vehicle.cajasRechazadas || 0} />
            <Info icon={<PackageCheck size={18} />} label="Cajas reubicadas" value={vehicle.cajasReubicadas || 0} />
            <Info icon={<Boxes size={18} />} label="Tope maximo" value={vehicle.topeMaximoCajas || 0} />
            <Info icon={<PackageCheck size={18} />} label="Refusal neto" value={`${vehicle.refusal || 0}%`} />
            <Info icon={<Boxes size={18} />} label="Peso DT" value={`${vehicle.peso.toLocaleString("es-CO")} kg`} />
            <Info icon={<Boxes size={18} />} label="Capacidad peso vehiculo" value={`${vehicle.capacidad.toLocaleString("es-CO")} kg`} />
            <Info icon={<PackageCheck size={18} />} label="Validador de peso" value={vehicle.validadorPeso} />
            <Info icon={<Route size={18} />} label="Avance en ruta" value={`${progress}%`} />
            <Info icon={<Clock3 size={18} />} label="Hora llegada" value={vehicle.horaLlegada} />
            <Info icon={<Clock3 size={18} />} label="Tiempo en ruta" value={vehicle.tiempoRuta} />
            <Info icon={<Route size={18} />} label="Meta relevo" value={vehicle.metaRelevo} />
            <Info icon={<Clock3 size={18} />} label="Hora inicio relevo" value={vehicle.horaInicioRelevo} />
            <Info icon={<Route size={18} />} label="Clasificacion relevo" value={vehicle.clasificacionRelevo} />
            <Info icon={<PackageCheck size={18} />} label="Alerta SIF potencial" value={vehicle.alertaSifPotencial} />
            <Info icon={<Users size={18} />} label="Relevador" value={vehicle.relevador} />
            <Info icon={<Route size={18} />} label="Causal desviado" value={vehicle.causalDesviado} />
            <Info icon={<Clock3 size={18} />} label="Clasificacion on time" value={vehicle.clasificacionOnTime} />
            <Info icon={<PackageCheck size={18} />} label="Recargue" value={vehicle.recargue} />
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
