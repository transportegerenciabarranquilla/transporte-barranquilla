import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Clock3, SearchX, Trash2, Truck } from "lucide-react";
import type { Vehiculo } from "../types";
import { ROUTE_STATUSES, calculateRouteTime, getPlannedProgress, getPlannedTimeInputValue, getProgress, getStatus, getVehicleRecordKey, getVehicleUiKey, progressColor, toDateKey } from "../utils";
import { StatusBadge } from "./StatusBadge";

export function VehiclesTable({
  vehicles,
  operationalDate,
  now,
  onSelectVehicle,
  onDeleteVehicle,
  onUpdateVehicle,
  onUpdateVisited,
}: {
  vehicles: Vehiculo[];
  operationalDate: string;
  now: Date;
  onSelectVehicle: (vehicle: Vehiculo) => void;
  onDeleteVehicle: (recordKey: string) => void;
  onUpdateVehicle: (recordKey: string, changes: Partial<Vehiculo>) => void;
  onUpdateVisited: (recordKey: string, visitados: number) => void;
}) {
  const selectedDate = operationalDate || getLocalDateKey();
  const visibleVehicles = useMemo(
    () => vehicles.filter((vehicle) => toDateKey(vehicle.fechaDespacho) === selectedDate),
    [selectedDate, vehicles],
  );
  const [routeSortOrder, setRouteSortOrder] = useState<"desc" | "asc">("desc");
  const [sortedVehicleKeys, setSortedVehicleKeys] = useState(() => sortVehicleKeys(visibleVehicles, "desc"));
  const duplicatedDt = useMemo(() => {
    const counts = new Map<string, number>();
    visibleVehicles.forEach((vehicle) => {
      const key = getVehicleRecordKey(vehicle);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key));
  }, [visibleVehicles]);

  useEffect(() => {
    setSortedVehicleKeys((currentKeys) => {
      const vehicleKeys = visibleVehicles.map(getVehicleUiKey);
      const vehicleKeySet = new Set(vehicleKeys);
      const currentKeySet = new Set(currentKeys);
      const existingKeys = currentKeys.filter((key) => vehicleKeySet.has(key));
      const newKeys = vehicleKeys.filter((key) => !currentKeySet.has(key));

      return [...existingKeys, ...newKeys];
    });
  }, [visibleVehicles]);

  const sortedVehicles = useMemo(() => {
    const vehiclesByKey = new Map(visibleVehicles.map((vehicle) => [getVehicleUiKey(vehicle), vehicle]));
    return sortedVehicleKeys.flatMap((key) => {
      const vehicle = vehiclesByKey.get(key);
      return vehicle ? [vehicle] : [];
    });
  }, [sortedVehicleKeys, visibleVehicles]);

  function handleSortByRoute() {
    const nextOrder = routeSortOrder === "desc" ? "asc" : "desc";
    setRouteSortOrder(nextOrder);
    setSortedVehicleKeys(sortVehicleKeys(visibleVehicles, nextOrder));
  }

  return (
    <div className="data-shell rounded-lg">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 bg-white/86 px-4 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[#10223d]">Vehículos en ruta</h2>
          <p className="text-xs text-slate-500">Selecciona una fila para ver el detalle.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-xs font-bold text-[#07556b]">{visibleVehicles.length} rutas</span>
          <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">Click para detalle</span>
        </div>
      </div>

      {sortedVehicles.length ? (
      <div className="max-h-[650px] overflow-auto">
        <table className="data-table w-full min-w-[1040px] table-fixed text-[11px]">
          <thead className="sticky top-0 z-10 text-[10px] uppercase tracking-[0.08em]">
            <tr>
              <th className="w-28 px-2 py-1.5 text-left">Vehículo</th>
              <th className="w-20 px-2 py-1.5 text-left">DT</th>
              <th className="w-36 px-2 py-1.5 text-left">Responsable</th>
              <th className="w-28 px-2 py-1.5 text-left">Fecha despacho</th>
              <th className="w-16 px-2 py-1.5 text-left">Clientes</th>
              <th className="w-48 px-2 py-1.5 text-left">
                <div className="inline-flex items-center gap-1">
                  Ruta
                  <button
                    aria-label="Ordenar por visitados"
                    className="inline-grid h-4 w-4 place-items-center rounded text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                    onClick={handleSortByRoute}
                    title={routeSortOrder === "desc" ? "Mas visitados primero" : "Menos visitados primero"}
                    type="button"
                  >
                    <ArrowUpDown size={10} />
                  </button>
                </div>
              </th>
              <th className="w-24 px-2 py-1.5 text-left">Tiempo</th>
              <th className="w-32 px-2 py-1.5 text-left">Tiempo planeado</th>
              <th className="w-28 px-2 py-1.5 text-left">Estado</th>
              <th className="w-10 px-1.5 py-1.5 text-right"></th>
            </tr>
          </thead>

          <tbody>
            {sortedVehicles.map((item) => {
              const progress = getProgress(item);
              const status = getStatus(progress, item);
              const recordKey = getVehicleUiKey(item);
              const isDuplicatedDt = duplicatedDt.has(getVehicleRecordKey(item));
              const plannedProgress = getPlannedProgress(item, now);
              const isBehindPlan = plannedProgress.isBehind;
              const plannedTimeValue = getPlannedTimeInputValue(item.tiempoPlaneado);

              return (
                <tr
                  className={isBehindPlan ? "cursor-pointer bg-red-50/55" : "cursor-pointer"}
                  key={recordKey}
                  onClick={() => onSelectVehicle(item)}
                >
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-[#10223d] to-[#1264ff] text-white shadow-sm">
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
                  <td className="px-2 py-1">
                    <span className="block truncate rounded-md border border-slate-100 bg-white/78 px-2 py-1 text-[11px] font-semibold text-[#10223d]" title={item.responsable}>
                      {item.responsable || "Sin responsable"}
                    </span>
                  </td>
                  <td className="px-2 py-1" onClick={(event) => event.stopPropagation()}>
                    <EditableDate value={item.fechaDespacho} onChange={(value) => onUpdateVehicle(recordKey, { fechaDespacho: value })} />
                  </td>
                  <td className="px-2 py-1" onClick={(event) => event.stopPropagation()}>
                    <EditableNumber value={item.clientes} onChange={(value) => onUpdateVehicle(recordKey, { clientes: value })} />
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                      <EditableNumber
                        className="h-7 w-12 rounded border border-slate-200 px-1.5 text-[11px] outline-none focus:border-[#0f7c58]"
                        value={item.visitados}
                        onChange={(value) => onUpdateVisited(recordKey, value)}
                      />
                      <span className="text-[9px] text-slate-400">/ {item.clientes}</span>
                      <div className="h-2 min-w-12 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div className={`h-2 rounded-full ${progressColor(progress)} shadow-[0_0_12px_rgba(0,184,217,0.22)]`} style={{ width: `${progress}%` }} />
                      </div>
                      <span className="number-pill w-11 text-[10px] text-slate-700">{formatPercent(progress)}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-cyan-100 bg-cyan-50 px-2 py-1 font-mono text-[11px] font-semibold text-[#07556b]">
                      <Clock3 size={11} className="text-[#0f7c58]" />
                      {calculateRouteTime(item, now)}
                    </span>
                  </td>
                  <td className="px-2 py-1" onClick={(event) => event.stopPropagation()}>
                    <div className={`rounded border px-1.5 py-1 ${isBehindPlan ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
                      <EditableText
                        className={`font-mono ${isBehindPlan ? "text-red-700" : "text-emerald-800"}`}
                        value={plannedTimeValue}
                        onChange={(value) => onUpdateVehicle(recordKey, { tiempoPlaneado: value })}
                      />
                      <p className="mt-0.5 text-[9px] font-semibold">
                        Esperado {plannedProgress.label}
                      </p>
                    </div>
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
      ) : (
        <div className="grid min-h-56 place-items-center px-4 py-10 text-center">
          <div>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-slate-100 text-slate-400">
              <SearchX size={22} />
            </span>
            <h3 className="mt-3 text-base font-semibold text-[#10223d]">Sin rutas para mostrar</h3>
            <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">Ajusta los filtros o carga el seguimiento diario para ver la tabla operativa.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function getLocalDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
      className={`h-7 w-full min-w-0 truncate rounded border border-transparent bg-transparent px-1 text-[11px] outline-none transition hover:border-slate-200 hover:bg-white focus:border-[#0f7c58] focus:bg-white ${
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
      className="h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-0.5 text-[11px] text-slate-700 outline-none transition hover:border-slate-200 hover:bg-white focus:border-[#0f7c58] focus:bg-white"
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
      className={className || "h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-[11px] font-medium text-slate-700 outline-none transition hover:border-slate-200 hover:bg-white focus:border-[#0f7c58] focus:bg-white"}
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

function sortVehicleKeys(vehicles: Vehiculo[], order: "desc" | "asc") {
  return [...vehicles]
    .sort((a, b) => {
      const aVisited = Number(a.visitados || 0);
      const bVisited = Number(b.visitados || 0);

      return order === "desc" ? bVisited - aVisited : aVisited - bVisited;
    })
    .map(getVehicleUiKey);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}
