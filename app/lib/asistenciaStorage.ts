export const ASISTENCIA_STORAGE_KEY = "bavaria.asistencia.registros";

export type AsistenciaRegistro = {
  id: string;
  contratista: string;
  dt: string;
  cedulaResponsable: string;
  cedulaAuxiliar1: string;
  cedulaAuxiliar2: string;
  llave: string;
  createdAt: string;
};

export function normalizeContractor(value: string) {
  return value.toUpperCase().replace(/\s+/g, "-");
}

export function createAttendanceKey(contratista: string, dt: string) {
  return `${normalizeContractor(contratista)}-${dt}`;
}
