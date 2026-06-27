import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Clock3, Trash2, Truck } from "lucide-react";
import type { Vehiculo } from "../types";
import { ROUTE_STATUSES, calculateRouteTime, getProgress, getStatus, getVehicleUiKey, progressColor } from "../utils";
import { StatusBadge } from "./StatusBadge";

export function VehiclesTable({
  vehicles,
  now,
  onSelectVehicle,
  onDeleteVehicle,
  onUpdateVehicle,
  onUpdateVisited,
}: {
  vehicles: Vehiculo[];
  now: Date;
  onSelectVehicle: (vehicle: Vehiculo) => void;
  onDeleteVehicle: (recordKey: string) => void;
  onUpdateVehicle: (recordKey: string, changes: Partial<Vehiculo>) => void;
  onUpdateVisited: (recordKey: string, visitados: number) => void;
}) {
  const [routeSortOrder, setRouteSortOrder] = useState<"desc" | "asc">("desc");
  const duplicatedDt = useMemo(() => {
    const counts = new Map<string, number>();
    vehicles.forEach((vehicle) => {
      const key = normalizeDt(vehicle.transporte);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
  }, [vehicles]);
  const sortedVehicles = useMemo(() => {
    const nextVehicles = [...vehicles];
    nextVehicles.sort((a, b) => {
      const aVisited = Number(a.visitados || 0);
      const bVisited = Number(b.visitados || 0);

      return routeSortOrder === "desc" ? bVisited - aVisited : aVisited - bVisited;
    });
    return nextVehicles;
  }, [routeSortOrder, vehicles]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <div>
          <h2 className="text-base font-semibold text-[#10223d]">Vehículos en ruta</h2>
          <p className="text-xs text-slate-500">Selecciona una fila para ver el detalle.</p>
        </div>
        <span className="rounded-full bg-[#e9f3ff] px-2.5 py-1 text-xs font-bold text-[#10223d]">{vehicles.length} rutas</span>
      </div>

      <div className="max-h-[620px] overflow-auto">
        <table className="w-full min-w-[900px] table-fixed text-[10px]">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[9px] uppercase tracking-[0.06em] text-slate-500 shadow-[0_1px_0_rgba(226,232,240,1)]">
            <tr>
              <th className="w-28 px-2 py-1.5 text-left">Vehículo</th>
              <th className="w-20 px-2 py-1.5 text-left">DT</th>
              <th className="w-36 px-2 py-1.5 text-left">Responsable</th>
              <th className="w-28 px-2 py-1.5 text-left">Fecha despacho</th>
              <th className="w-16 px-2 py-1.5 text-left">Cajas</th>
              <th className="w-16 px-2 py-1.5 text-left">Clientes</th>
              <th className="w-48 px-2 py-1.5 text-left">
                <div className="inline-flex items-center gap-1">
                  Ruta
                  <button
                    aria-label="Ordenar por visitados"
                    className="inline-grid h-4 w-4 place-items-center rounded text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                    onClick={() => setRouteSortOrder((current) => (current === "desc" ? "asc" : "desc"))}
                    title={routeSortOrder === "desc" ? "Mas visitados primero" : "Menos visitados primero"}
                    type="button"
                  >
                    <ArrowUpDown size={10} />
                  </button>
                </div>
              </th>
              <th className="w-24 px-2 py-1.5 text-left">Tiempo</th>
              <th className="w-28 px-2 py-1.5 text-left">Estado</th>
              <th className="w-10 px-1.5 py-1.5 text-right"></th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {sortedVehicles.map((item) => {
              const progress = getProgress(item);
              const status = getStatus(progress, item);
              const recordKey = getVehicleUiKey(item);
              const isDuplicatedDt = duplicatedDt.has(normalizeDt(item.transporte));

              return (
                <tr
                  className="cursor-pointer transition hover:bg-[#f8fbff]"
                  key={recordKey}
                  onClick={() => onSelectVehicle(item)}
                >
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-[#e9f3ff] text-[#10223d]">
                        <Truck size={13} />
                      </span>
                      <EditableText value={item.vehiculo} onChange={(value) => onUpdateVehicle(recordKey, { vehiculo: value })} strong />
                    </div>
                  </td>
                  <td className="px-2 py-1" onClick={(event) => event.stopPropagation()}>
                    <EditableText
                      className={isDuplicatedDt ? "border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-50 focus:border-red-400 focus:bg-white" : undefined}
                      title={isDuplicatedDt ? "DT duplicado" : undefined}
                      value={item.transporte}
                      onChange={(value) => onUpdateVehicle(recordKey, { transporte: value })}
                    />
                  </td>
                  <td className="px-2 py-1" onClick={(event) => event.stopPropagation()}>
                    <EditableText value={item.responsable} onChange={(value) => onUpdateVehicle(recordKey, { responsable: value })} strong />
                  </td>
                  <td className="px-2 py-1" onClick={(event) => event.stopPropagation()}>
                    <EditableDate value={item.fechaDespacho} onChange={(value) => onUpdateVehicle(recordKey, { fechaDespacho: value })} />
                  </td>
                  <td className="px-2 py-1" onClick={(event) => event.stopPropagation()}>
                    <EditableNumber allowDecimal value={item.cajas} onChange={(value) => onUpdateVehicle(recordKey, { cajas: value })} />
                  </td>
                  <td className="px-2 py-1" onClick={(event) => event.stopPropagation()}>
                    <EditableNumber value={item.clientes} onChange={(value) => onUpdateVehicle(recordKey, { clientes: value })} />
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                      <EditableNumber
                        className="h-6 w-12 rounded border border-slate-200 px-1.5 text-[10px] outline-none focus:border-[#0f7c58]"
                        value={item.visitados}
                        onChange={(value) => onUpdateVisited(recordKey, value)}
                      />
                      <span className="text-[9px] text-slate-400">/ {item.clientes}</span>
                      <div className="h-1.5 min-w-12 flex-1 rounded-full bg-slate-200">
                        <div className={`h-1.5 rounded-full ${progressColor(progress)}`} style={{ width: `${progress}%` }} />
                      </div>
                      <span className="w-8 text-[10px] font-semibold text-slate-700">{progress}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-slate-100 px-1.5 py-1 font-mono text-[10px] font-semibold text-[#10223d]">
                      <Clock3 size={11} className="text-[#0f7c58]" />
                      {calculateRouteTime(item, now)}
                    </span>
                  </td>
                  <td className="px-2 py-1" onClick={(event) => event.stopPropagation()}>
                    <StatusSelect
                      status={status}
                      onChange={(nextStatus) =>
                        onUpdateVehicle(recordKey, {
                          status: nextStatus,
                          recargue: nextStatus === "Recargue" ? "Si" : item.recargue,
                        })
                      }
                    />
                  </td>
                  <td className="px-1.5 py-1 text-right" onClick={(event) => event.stopPropagation()}>
                    <button
                      aria-label={`Borrar vehiculo ${item.transporte || item.vehiculo}`}
                      className="inline-grid h-6 w-6 place-items-center rounded text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                      onClick={() => onDeleteVehicle(recordKey)}
                      type="button"
                    >
                      <Trash2 size={14} />
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

function StatusSelect({ status, onChange }: { status: string; onChange: (status: string) => void }) {
  return (
    <div className="relative inline-flex max-w-full">
      <StatusBadge status={status} />
      <select
        aria-label="Cambiar estado"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onChange={(event) => onChange(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        value={status}
      >
        {ROUTE_STATUSES.map((routeStatus) => (
          <option key={routeStatus} value={routeStatus}>
            {routeStatus}
          </option>
        ))}
      </select>
    </div>
  );
}

function EditableText({
  className,
  value,
  onChange,
  title,
  strong = false,
}: {
  className?: string;
  value: string;
  onChange: (value: string) => void;
  title?: string;
  strong?: boolean;
}) {
  return (
    <input
      className={`h-6 w-full min-w-0 truncate rounded border border-transparent bg-transparent px-1 text-[10px] outline-none transition hover:border-slate-200 hover:bg-white focus:border-[#0f7c58] focus:bg-white ${
        strong ? "font-semibold text-[#10223d]" : "text-slate-700"
      } ${className || ""}`}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      title={title}
      type="text"
      value={value}
    />
  );
}

function EditableDate({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      className="h-6 w-full min-w-0 rounded border border-transparent bg-transparent px-0.5 text-[10px] text-slate-700 outline-none transition hover:border-slate-200 hover:bg-white focus:border-[#0f7c58] focus:bg-white"
      onChange={(event) => onChange(event.target.value)}
      type="date"
      value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""}
    />
  );
}

function EditableNumber({ allowDecimal = false, className, value, onChange }: { allowDecimal?: boolean; className?: string; value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(value ? String(value) : "");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(value ? String(value) : "");
  }, [focused, value]);

  return (
    <input
      className={className || "h-6 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-[10px] font-medium text-slate-700 outline-none transition hover:border-slate-200 hover:bg-white focus:border-[#0f7c58] focus:bg-white"}
      min={0}
      onBlur={() => {
        if (!draft) onChange(0);
        setFocused(false);
      }}
      onChange={(event) => {
        const cleanValue = cleanNumberInput(event.target.value, allowDecimal);
        setDraft(cleanValue);
        if (cleanValue) onChange(Number(cleanValue));
      }}
      onFocus={() => setFocused(true)}
      placeholder="0"
      type="text"
      value={draft}
    />
  );
}

function cleanNumberInput(value: string, allowDecimal: boolean) {
  const cleanValue = value.replace(",", ".").replace(/[^\d.]/g, "");
  if (!allowDecimal) return cleanValue.replace(/\D/g, "");

  const [integer = "", ...decimals] = cleanValue.split(".");
  return decimals.length ? `${integer}.${decimals.join("")}` : integer;
}

function normalizeDt(value: string | number | undefined) {
  return String(value ?? "")
    .replace(/^DT-?/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}
