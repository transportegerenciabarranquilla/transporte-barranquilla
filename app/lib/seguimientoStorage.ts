import type { Vehiculo } from "../seguimiento/types";
import { readRemoteRecords, saveRemoteRecords } from "./remoteStore";

export const SEGUIMIENTO_STORAGE_KEY = "bavaria.seguimiento.vehiculos";

export function readSeguimientoVehiculos() {
  if (typeof window === "undefined") return [];
  return readRemoteRecords<Vehiculo>("/api/seguimiento");
}

export function saveSeguimientoVehiculos(records: Vehiculo[], options: { deleteMissing?: boolean } = {}) {
  return saveRemoteRecords("/api/seguimiento", records, { extraBody: { deleteMissing: options.deleteMissing === true } });
}
