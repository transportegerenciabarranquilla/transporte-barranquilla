import type { Vehiculo } from "../seguimiento/types";
import type { JornadaChanges } from "./jornadaPersistence";
import { getVehicleUiKey } from "../seguimiento/utils";
import { deleteRemoteRecords, readRemoteRecords, saveRemoteRecords, waitForRemoteSaves } from "./remoteStore";

export const SEGUIMIENTO_STORAGE_KEY = "bavaria.seguimiento.vehiculos";

export function readSeguimientoVehiculos() {
  if (typeof window === "undefined") return [];
  return readRemoteRecords<Vehiculo>("/api/seguimiento");
}

export function saveSeguimientoVehiculos(records: Vehiculo[], options: { deleteMissing?: boolean; partial?: boolean } = {}) {
  return saveRemoteRecords("/api/seguimiento", records, {
    extraBody: { deleteMissing: options.deleteMissing === true },
    mergeByKey: getVehicleUiKey,
  });
}

export async function saveSeguimientoLiquidado(recordId: string, liquidado: boolean, liquidadoUpdatedAt: string) {
  const record = readSeguimientoVehiculos().find((item) => item.recordId === recordId);
  if (!record) throw new Error("Recarga la página antes de editar esta ruta.");
  return saveSeguimientoChanges({ ...record, liquidado, liquidadoUpdatedAt }, { liquidado });
}

export async function saveSeguimientoChanges(record: Vehiculo, changes: Partial<Vehiculo>) {
  if (!record.recordId) throw new Error("Recarga la página antes de editar esta ruta.");
  const [saved] = await saveRemoteRecords<Vehiculo>("/api/seguimiento", [record], {
    method: "PATCH",
    mergeByKey: getVehicleUiKey,
    extraBody: { recordId: record.recordId, changes },
  });
  if (saved?.recordId !== record.recordId) throw new Error("No se confirmó el guardado de la ruta.");
  return saved;
}

export async function saveSeguimientoVisitados(record: Vehiculo) {
  const [saved] = await saveRemoteRecords<Vehiculo>("/api/seguimiento", [record], {
    method: "PATCH",
    mergeByKey: getVehicleUiKey,
    extraBody: { recordId: record.recordId, changes: { visitados: record.visitados } },
  });
  if (saved?.recordId !== record.recordId || saved.visitados !== record.visitados) {
    throw new Error("No se confirmó la cantidad de clientes visitados. Intenta nuevamente.");
  }
  return saved;
}

export async function saveSeguimientoJornada(record: Vehiculo, changes: JornadaChanges) {
  if (!record.recordId) throw new Error("Recarga la página antes de editar esta ruta.");
  const [saved] = await saveRemoteRecords<Vehiculo>("/api/seguimiento", [record], {
    method: "PATCH",
    mergeByKey: getVehicleUiKey,
    extraBody: { recordId: record.recordId, changes },
  });
  if (saved?.recordId !== record.recordId) throw new Error("No se confirmó el guardado de la jornada.");
  return saved;
}

export async function deleteSeguimientoVehiculo(vehicle: Pick<Vehiculo, "recordId" | "transporte" | "vehiculo" | "fechaDespacho">) {
  await waitForRemoteSaves("/api/seguimiento");
  return deleteRemoteRecords<Vehiculo>("/api/seguimiento", [String(vehicle.recordId || "")], {
    extraBody: {
      routes: [{ transporte: vehicle.transporte, vehiculo: vehicle.vehiculo, fechaDespacho: vehicle.fechaDespacho }],
    },
    getKey: (record) => String(record.recordId || ""),
  });
}
