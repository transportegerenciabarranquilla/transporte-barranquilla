import { getLocalDateKey, type ModulacionRegistro } from "../lib/modulacionStorage";
import type { Vehiculo } from "./types";
import { getVehicleUiKey } from "./utils";

export function getModulacionDateKey(registro: ModulacionRegistro) {
  return toDateKey(registro.fechaDespacho || registro.fechaDt || registro.createdAt);
}

export function mergeStoredVehiclesPreservingProgress(currentVehicles: Vehiculo[], storedVehicles: Vehiculo[]) {
  if (!currentVehicles.length) return storedVehicles;

  const currentByKey = new Map(currentVehicles.map((vehicle) => [getVehicleUiKey(vehicle), vehicle]));
  const storedByKey = new Map(storedVehicles.map((vehicle) => [getVehicleUiKey(vehicle), vehicle]));
  const mergedVehicles = currentVehicles
    .map((currentVehicle) => {
      const storedVehicle = storedByKey.get(getVehicleUiKey(currentVehicle));
      return storedVehicle ? mergeVehiclePreservingProgress(currentVehicle, storedVehicle) : currentVehicle;
    })
    .filter((vehicle) => storedByKey.has(getVehicleUiKey(vehicle)));

  storedVehicles.forEach((storedVehicle) => {
    if (!currentByKey.has(getVehicleUiKey(storedVehicle))) mergedVehicles.push(storedVehicle);
  });

  return mergedVehicles;
}

export function getVehicleDateKey(vehicle: Vehiculo) {
  return toDateKey(vehicle.fechaDespacho || vehicle.date || vehicle.createdAt);
}

export function isWithoutResponsible(vehicle: Vehiculo) {
  const responsibleId = vehicle.cedulaResponsable?.trim();
  const responsibleName = vehicle.nombreResponsable?.trim();

  return !responsibleId && !responsibleName;
}

export function toDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
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

export function isViewingToday(value: string) {
  return !value || value === getLocalDateKey();
}

export function formatCurrentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
}

function mergeVehiclePreservingProgress(currentVehicle: Vehiculo, storedVehicle: Vehiculo) {
  const visitados = Math.max(Number(currentVehicle.visitados || 0), Number(storedVehicle.visitados || 0));
  return {
    ...storedVehicle,
    visitados: Math.min(visitados, storedVehicle.clientes || visitados),
  };
}
