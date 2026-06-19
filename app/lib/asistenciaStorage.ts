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

export function removeAsistenciaByDt(dt: string | number | undefined) {
  if (typeof window === "undefined") return;

  const targetDt = String(dt ?? "").replace(/^DT-?/i, "").replace(/\D/g, "");
  if (!targetDt) return;

  const current = localStorage.getItem(ASISTENCIA_STORAGE_KEY);
  if (!current) return;

  try {
    const records = JSON.parse(current) as AsistenciaRegistro[];
    if (!Array.isArray(records)) return;

    const nextRecords = records.filter((record) => String(record.dt ?? "").replace(/^DT-?/i, "").replace(/\D/g, "") !== targetDt);
    localStorage.setItem(ASISTENCIA_STORAGE_KEY, JSON.stringify(nextRecords));
    window.dispatchEvent(new Event("storage"));
  } catch {
    return;
  }
}
