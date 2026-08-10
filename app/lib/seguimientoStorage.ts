import type { Vehiculo } from "../seguimiento/types";
import { deleteRemoteRecords, readRemoteRecords, saveRemoteRecords, waitForRemoteSaves } from "./remoteStore";

export const SEGUIMIENTO_STORAGE_KEY = "bavaria.seguimiento.vehiculos";

export function readSeguimientoVehiculos() {
  if (typeof window === "undefined") return [];
  return readRemoteRecords<Vehiculo>("/api/seguimiento");
}

export function saveSeguimientoVehiculos(records: Vehiculo[], options: { deleteMissing?: boolean } = {}) {
  return saveRemoteRecords("/api/seguimiento", records, { extraBody: { deleteMissing: options.deleteMissing === true } });
}

export async function deleteSeguimientoVehiculo(recordId: string) {
  await waitForRemoteSaves("/api/seguimiento");
  return deleteRemoteRecords<Vehiculo>("/api/seguimiento", [recordId], {
    getKey: (record) => String(record.recordId || ""),
  });
}
