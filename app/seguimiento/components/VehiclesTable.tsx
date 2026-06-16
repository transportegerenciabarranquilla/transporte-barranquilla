import { Truck } from "lucide-react";
import type { Vehiculo } from "../types";
import { getProgress, getStatus, getVehicleRecordKey, progressColor } from "../utils";
import { StatusBadge } from "./StatusBadge";

export function VehiclesTable({
  vehicles,
  onSelectVehicle,
  onUpdateVehicle,
  onUpdateVisited,
}: {
  vehicles: Vehiculo[];
  onSelectVehicle: (vehicle: Vehiculo) => void;
  onUpdateVehicle: (recordKey: string, changes: Partial<Vehiculo>) => void;
  onUpdateVisited: (recordKey: string, visitados: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-[#10223d]">Vehiculos en ruta</h2>
        <p className="mt-1 text-sm text-slate-500">Selecciona una fila para ver el detalle operativo.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px]">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-5 py-4 text-left">Vehiculo</th>
              <th className="px-5 py-4 text-left">DT</th>
              <th className="px-5 py-4 text-left">Responsable</th>
              <th className="px-5 py-4 text-left">Territorio</th>
              <th className="px-5 py-4 text-left">Fecha</th>
              <th className="px-5 py-4 text-left">Salida</th>
              <th className="px-5 py-4 text-left">Cajas</th>
              <th className="px-5 py-4 text-left">Clientes</th>
              <th className="px-5 py-4 text-left">Visitados</th>
              <th className="px-5 py-4 text-left">Avance</th>
              <th className="px-5 py-4 text-left">Estado</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {vehicles.map((item) => {
              const progress = getProgress(item);
              const status = getStatus(progress);
              const recordKey = getVehicleRecordKey(item);

              return (
                <tr
                  className="cursor-pointer transition hover:bg-[#f8fbff]"
                  key={recordKey}
                  onClick={() => onSelectVehicle(item)}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-md bg-[#e9f3ff] text-[#10223d]">
                        <Truck size={19} />
                      </span>
                      <EditableText value={item.vehiculo} onChange={(value) => onUpdateVehicle(recordKey, { vehiculo: value })} />
                    </div>
                  </td>
                  <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                    <EditableText value={item.transporte} onChange={(value) => onUpdateVehicle(recordKey, { transporte: value })} />
                  </td>
                  <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                    <EditableText value={item.responsable} onChange={(value) => onUpdateVehicle(recordKey, { responsable: value })} />
                  </td>
                  <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                    <EditableText value={item.territorio} onChange={(value) => onUpdateVehicle(recordKey, { territorio: value })} />
                  </td>
                  <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                    <EditableText value={item.fechaDespacho} onChange={(value) => onUpdateVehicle(recordKey, { fechaDespacho: value })} />
                  </td>
                  <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                    <EditableText value={item.horaSalida} onChange={(value) => onUpdateVehicle(recordKey, { horaSalida: value })} />
                  </td>
                  <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                    <EditableNumber value={item.cajas} onChange={(value) => onUpdateVehicle(recordKey, { cajas: value })} />
                  </td>
                  <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                    <EditableNumber value={item.clientes} onChange={(value) => onUpdateVehicle(recordKey, { clientes: value })} />
                  </td>
                  <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                    <input
                      className="h-10 w-20 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[#f5bd19]"
                      max={item.clientes}
                      min={0}
                      onChange={(event) => onUpdateVisited(recordKey, Number(event.target.value))}
                      type="number"
                      value={item.visitados}
                    />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex min-w-36 items-center gap-3">
                      <div className="h-2 flex-1 rounded-full bg-slate-200">
                        <div className={`h-2 rounded-full ${progressColor(progress)}`} style={{ width: `${progress}%` }} />
                      </div>
                      <span className="w-10 text-sm font-semibold text-slate-700">{progress}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditableText({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      className="h-10 w-full min-w-28 rounded-md border border-transparent bg-transparent px-2 text-sm text-slate-700 outline-none transition hover:border-slate-200 hover:bg-white focus:border-[#f5bd19] focus:bg-white"
      onChange={(event) => onChange(event.target.value)}
      type="text"
      value={value}
    />
  );
}

function EditableNumber({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <input
      className="h-10 w-24 rounded-md border border-transparent bg-transparent px-2 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-200 hover:bg-white focus:border-[#f5bd19] focus:bg-white"
      min={0}
      onChange={(event) => onChange(Number(event.target.value))}
      type="number"
      value={value}
    />
  );
}
