export const ASISTENCIA_STORAGE_KEY = "bavaria.asistencia.registros";

export type AsistenciaRegistro = {
  id: string;
  contratista: string;
  dt: string;
  cedulaResponsable: string;
  cedulaAuxiliar1: string;
  cedulaAuxiliar2: string;
  nombreResponsable?: string;
  nombreAuxiliar1?: string;
  nombreAuxiliar2?: string;
  llave: string;
  createdAt: string;
};

export function readAsistenciaRegistros() {
  if (typeof window === "undefined") return [];
  return readRemoteRecords<AsistenciaRegistro>("/api/asistencias");
}

export function saveAsistenciaRegistros(records: AsistenciaRegistro[]) {
  return saveRemoteRecords("/api/asistencias", records);
}

export function normalizeContractor(value: string) {
  return value.toUpperCase().replace(/\s+/g, "-");
}

export function createAttendanceKey(contratista: string, dt: string) {
  return `${normalizeContractor(contratista)}-${dt}`;
}

export function removeAsistenciaByDt(dt: string | number | undefined) {
  if (typeof window === "undefined") return;

  const targetDt = String(dt ?? "").replace(/^DT-?/i, "").replace(/\D/g, "");
  if (!targetDt) return;

  const records = readAsistenciaRegistros();
  const nextRecords = records.filter((record) => String(record.dt ?? "").replace(/^DT-?/i, "").replace(/\D/g, "") !== targetDt);
  void saveAsistenciaRegistros(nextRecords).catch(() => undefined);
}
import { readRemoteRecords, saveRemoteRecords } from "./remoteStore";
