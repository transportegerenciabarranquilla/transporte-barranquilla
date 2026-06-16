import type { Vehiculo } from "../seguimiento/types";

export const SEGUIMIENTO_STORAGE_KEY = "bavaria.seguimiento.vehiculos";

export function readSeguimientoVehiculos() {
  if (typeof window === "undefined") return [];

  const current = localStorage.getItem(SEGUIMIENTO_STORAGE_KEY);
  if (!current) return [];

  try {
    const parsed = JSON.parse(current);
    return Array.isArray(parsed) ? (parsed as Vehiculo[]) : [];
  } catch {
    return [];
  }
}

export function saveSeguimientoVehiculos(records: Vehiculo[]) {
  localStorage.setItem(SEGUIMIENTO_STORAGE_KEY, JSON.stringify(records));
}

