import { Trash2, Truck } from "lucide-react";
import type { Vehiculo } from "../types";
import { getProgress, getStatus, getVehicleUiKey, progressColor } from "../utils";
import { StatusBadge } from "./StatusBadge";

export function VehiclesTable({
  vehicles,
  onSelectVehicle,
  onDeleteVehicle,
  onUpdateVehicle,
  onUpdateVisited,
}: {
  vehicles: Vehiculo[];
  onSelectVehicle: (vehicle: Vehiculo) => void;
  onDeleteVehicle: (recordKey: string) => void;
  onUpdateVehicle: (recordKey: string, changes: Partial<Vehiculo>) => void;
  onUpdateVisited: (recordKey: string, visitados: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-lg font-semibold text-[#10223d]">Vehiculos en ruta</h2>
        <p className="mt-1 text-sm text-slate-500">Selecciona una fila para ver el detalle operativo.</p>
      </div>

      <div className="max-h-[620px] overflow-auto">
        <table className="w-full min-w-[1080px]">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500 shadow-[0_1px_0_rgba(226,232,240,1)]">
            <tr>
              <th className="px-4 py-3 text-left">Vehiculo</th>
              <th className="px-4 py-3 text-left">DT</th>
              <th className="px-4 py-3 text-left">Responsable</th>
              <th className="px-4 py-3 text-left">Fecha DT</th>
              <th className="px-4 py-3 text-left">Despacho</th>
              <th className="px-4 py-3 text-left">Cajas</th>
              <th className="px-4 py-3 text-left">Clientes</th>
              <th className="px-4 py-3 text-left">Ruta</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {vehicles.map((item) => {
              const progress = getProgress(item);
              const status = getStatus(progress, item);
              const recordKey = getVehicleUiKey(item);

              return (
                <tr
                  className="cursor-pointer transition hover:bg-[#f8fbff]"
                  key={recordKey}
                  onClick={() => onSelectVehicle(item)}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#e9f3ff] text-[#10223d]">
                        <Truck size={18} />
                      </span>
                      <EditableText value={item.vehiculo} onChange={(value) => onUpdateVehicle(recordKey, { vehiculo: value })} strong />
                    </div>
                  </td>
                  <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>
                    <EditableText value={item.transporte} onChange={(value) => onUpdateVehicle(recordKey, { transporte: value })} />
                  </td>
                  <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>
                    <EditableText value={item.responsable} onChange={(value) => onUpdateVehicle(recordKey, { responsable: value })} strong />
                  </td>
                  <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>
                    <EditableDate value={item.fechaDt} onChange={(value) => onUpdateVehicle(recordKey, { fechaDt: value })} />
                  </td>
                  <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>
                    <EditableDate value={item.fechaDespacho} onChange={(value) => onUpdateVehicle(recordKey, { fechaDespacho: value })} />
                  </td>
                  <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>
                    <EditableNumber value={item.cajas} onChange={(value) => onUpdateVehicle(recordKey, { cajas: value })} />
                  </td>
                  <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>
                    <EditableNumber value={item.clientes} onChange={(value) => onUpdateVehicle(recordKey, { clientes: value })} />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex min-w-64 items-center gap-3" onClick={(event) => event.stopPropagation()}>
                      <input
                        className="h-7 w-16 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-[#0f7c58]"
                        max={item.clientes}
                        min={0}
                        onChange={(event) => onUpdateVisited(recordKey, Number(event.target.value))}
                        type="number"
                        value={item.visitados}
                      />
                      <span className="text-xs text-slate-400">/ {item.clientes}</span>
                      <div className="h-2 min-w-24 flex-1 rounded-full bg-slate-200">
                        <div className={`h-1.5 rounded-full ${progressColor(progress)}`} style={{ width: `${progress}%` }} />
                      </div>
                      <span className="w-10 text-sm font-semibold text-slate-700">{progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-4 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                    <button
                      aria-label={`Borrar vehiculo ${item.transporte || item.vehiculo}`}
                      className="inline-grid h-8 w-8 place-items-center rounded-md text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                      onClick={() => onDeleteVehicle(recordKey)}
                      type="button"
                    >
                      <Trash2 size={17} />
                    </button>
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

function EditableText({
  value,
  onChange,
  strong = false,
}: {
  value: string;
  onChange: (value: string) => void;
  strong?: boolean;
}) {
  return (
    <input
      className={`h-8 w-full min-w-28 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none transition hover:border-slate-200 hover:bg-white focus:border-[#0f7c58] focus:bg-white ${
        strong ? "font-semibold text-[#10223d]" : "text-slate-700"
      }`}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      type="text"
      value={value}
    />
  );
}

function EditableDate({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      className="h-8 w-36 rounded-md border border-transparent bg-transparent px-2 text-sm text-slate-700 outline-none transition hover:border-slate-200 hover:bg-white focus:border-[#0f7c58] focus:bg-white"
      onChange={(event) => onChange(event.target.value)}
      type="date"
      value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""}
    />
  );
}

function EditableNumber({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <input
      className="h-8 w-24 rounded-md border border-transparent bg-transparent px-2 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-200 hover:bg-white focus:border-[#0f7c58] focus:bg-white"
      min={0}
      onChange={(event) => onChange(Number(event.target.value))}
      type="number"
      value={value}
    />
  );
}
