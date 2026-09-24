import type { Vehiculo } from "../seguimiento/types";
import { JORNADA_FIELDS } from "./jornadaPersistence";

export const SEGUIMIENTO_TEXT_FIELDS = [
  "mes", "cd", "llave", "transporte", "centro", "codTransportista", "fechaDt",
  "fechaDespacho", "date", "vehiculo", "vehiculoAnterior", "responsable", "territorio",
  "viaje", "bloque", "horaSalida", "horaLlegada", "tiempoRuta", "tiempoPlaneado",
  "status", "recargue", "validadorPeso", "clasificacionOnTime", "causalSalidaTardia",
  "comentarioSalidaTardia", "cedulaResponsable", "cedulaAuxiliar1", "cedulaAuxiliar2",
  "nombreResponsable", "nombreAuxiliar1", "nombreAuxiliar2", ...JORNADA_FIELDS,
] as const;
export const SEGUIMIENTO_NUMBER_FIELDS = ["clientes", "visitados", "cajas", "hl", "peso", "capacidad"] as const;
export const SEGUIMIENTO_EDITABLE_FIELDS = [...SEGUIMIENTO_TEXT_FIELDS, ...SEGUIMIENTO_NUMBER_FIELDS, "liquidado"] as const;

// Solo los campos editados explícitamente se envían; nunca toda la tabla.
export function seguimientoChanges(previous: Vehiculo, next: Vehiculo, explicit: Partial<Vehiculo>) {
  return Object.fromEntries(SEGUIMIENTO_EDITABLE_FIELDS
    .filter((field) => field in explicit || previous[field] !== next[field])
    .map((field) => [field, next[field] ?? ""])) as Partial<Vehiculo>;
}

// Una importación o pestaña antigua no puede deshacer una corrección manual.
export function preserveSeguimientoFields(incoming: Vehiculo, persisted: Vehiculo): Vehiculo {
  const result = { ...incoming, manualUpdatedFields: persisted.manualUpdatedFields };
  for (const field of SEGUIMIENTO_EDITABLE_FIELDS) {
    if (persisted.manualUpdatedFields?.includes(field)) Object.assign(result, { [field]: persisted[field] });
  }
  for (const [field, timestamp] of [["status", "statusUpdatedAt"], ["liquidado", "liquidadoUpdatedAt"], ["clientes", "clientesUpdatedAt"], ["visitados", "visitadosUpdatedAt"], ["fechaDespacho", "dispatchDateUpdatedAt"]] as const) {
    if (persisted.manualUpdatedFields?.includes(field)) result[timestamp] = persisted[timestamp];
  }
  return result;
}

// Postgres puede devolver microsegundos; Date.parse solo conserva milisegundos.
function versionTime(value?: string) {
  const milliseconds = Date.parse(value || "");
  if (!Number.isFinite(milliseconds)) return null;
  const fraction = /\.(\d+)/.exec(value || "")?.[1] || "";
  return BigInt(milliseconds) * BigInt(1000) + BigInt(fraction.padEnd(6, "0").slice(3, 6));
}

export function isOlderSeguimientoRecord(incoming: Pick<Vehiculo, "recordUpdatedAt">, current: Pick<Vehiculo, "recordUpdatedAt">) {
  const currentVersion = versionTime(current.recordUpdatedAt);
  const incomingVersion = versionTime(incoming.recordUpdatedAt);
  return currentVersion !== null && (incomingVersion === null || incomingVersion < currentVersion);
}

export function mergeSeguimientoVersions<T extends Pick<Vehiculo, "recordId" | "recordUpdatedAt">>(current: T[], incoming: T[]) {
  const byId = new Map(current.filter((record) => record.recordId).map((record) => [record.recordId, record]));
  // La ausencia en una lectura completa sigue permitiendo mostrar eliminaciones reales.
  return incoming.map((record) => {
    const previous = byId.get(record.recordId);
    return previous && isOlderSeguimientoRecord(record, previous) ? previous : record;
  });
}
