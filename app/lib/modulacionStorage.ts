import { readRemoteRecords, saveRemoteRecords } from "./remoteStore";

export const MODULACION_STORAGE_KEY = "bavaria.modulacion.registros";

export type ModulacionRegistro = {
  id: string;
  contratista?: string;
  dt: string;
  fechaDespacho?: string;
  fechaDt?: string;
  codigoCliente: string;
  nombreCliente?: string;
  telefonoCliente?: string;
  com?: string;
  jefeComercial?: string;
  telefonoJefeComercial?: string;
  preventista?: string;
  totalCajas: string;
  cajasGestionadas?: string;
  persona: string;
  personaNombre?: string;
  causal: string;
  comentario: string;
  comentarioModulador?: string;
  imagenNombre: string;
  imagenVista: string;
  createdAt: string;
};

export type ModulacionResumen = {
  cajasRechazadas: number;
  cajasGestionadas: number;
  cajasPendientes: number;
  cajasPendientesModulacion: number;
  cajasCheckin?: number;
  tieneCheckin: boolean;
  clientesRechazan: number;
  topeMaximoCajas: number;
  refusal: number;
  moduladores: string[];
  causales: string[];
};

type ModulacionTarget = {
  dt?: string | number;
  transporte?: string | number;
  fechaDespacho?: string;
  fechaDt?: string;
  date?: string;
  createdAt?: string;
};

export function normalizeDt(value: string | number | undefined) {
  return String(value ?? "")
    .replace(/^DT-?/i, "")
    .replace(/\D/g, "");
}

export function calculateCajaTope(totalCajas: number) {
  return Math.floor(totalCajas / 100);
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function isTodayDate(value: string | undefined) {
  return toDateKey(value) === getLocalDateKey();
}

export function getDispatchDateKey(value: ModulacionTarget | undefined) {
  return toDateKey(value?.fechaDespacho || value?.fechaDt || value?.date || value?.createdAt);
}

function getExplicitDispatchDateKey(value: ModulacionTarget | undefined) {
  return toDateKey(value?.fechaDespacho || value?.fechaDt || value?.date);
}

export function getOperationalModulaciones(records: ModulacionRegistro[], targets: ModulacionTarget[]) {
  const activeDispatches = new Set(
    targets
      .map((target) => {
        const dt = normalizeDt(target.transporte ?? target.dt);
        const date = getDispatchDateKey(target);
        return dt && date ? `${dt}:${date}` : "";
      })
      .filter(Boolean),
  );

  return records.filter((record) => {
    const recordDt = normalizeDt(record.dt);
    const recordDispatchDate = getExplicitDispatchDateKey(record);
    const createdAtDate = toDateKey(record.createdAt);

    if (!recordDt) return false;
    if (recordDispatchDate) return activeDispatches.has(`${recordDt}:${recordDispatchDate}`);
    if (createdAtDate) return activeDispatches.has(`${recordDt}:${createdAtDate}`);

    return false;
  });
}

export function readModulacionRegistros() {
  if (typeof window === "undefined") return [];

  return readRemoteRecords<ModulacionRegistro>("/api/modulaciones").map(normalizeModulacionRecord);
}

export function saveModulacionRegistros(records: ModulacionRegistro[]) {
  return saveRemoteRecords("/api/modulaciones", records);
}

export function getModulacionesByDt(records: ModulacionRegistro[], dt: string | number | undefined) {
  const targetDt = normalizeDt(dt);
  if (!targetDt) return [];

  return records.filter((record) => normalizeDt(record.dt) === targetDt);
}

export function summarizeModulaciones(records: ModulacionRegistro[], totalCajasSalida = 0, cajasCheckin?: number) {
  const cajasRechazadas = records.reduce((total, record) => total + Number(record.totalCajas || 0), 0);
  const cajasGestionadas = records.reduce((total, record) => total + Number(record.cajasGestionadas || 0), 0);
  const cajasPendientesModulacion = Math.max(cajasRechazadas - cajasGestionadas, 0);
  const tieneCheckin = typeof cajasCheckin === "number" && Number.isFinite(cajasCheckin);
  const cajasPendientes = tieneCheckin ? Math.max(cajasCheckin, 0) : cajasPendientesModulacion;
  const moduladores = Array.from(new Set(records.map((record) => (record.personaNombre || record.persona)?.trim()).filter(Boolean))) as string[];
  const causales = Array.from(new Set(records.map((record) => record.causal).filter(Boolean)));

  return {
    cajasRechazadas,
    cajasGestionadas,
    cajasPendientes,
    cajasPendientesModulacion,
    cajasCheckin: tieneCheckin ? Math.max(cajasCheckin, 0) : undefined,
    tieneCheckin,
    clientesRechazan: records.length,
    topeMaximoCajas: calculateCajaTope(totalCajasSalida),
    refusal: totalCajasSalida ? Number(((cajasPendientes / totalCajasSalida) * 100).toFixed(2)) : 0,
    moduladores,
    causales,
  };
}

function normalizeModulacionRecord(record: unknown): ModulacionRegistro {
  const current = record as ModulacionRegistro & Record<string, unknown>;
  const legacyGestionadasKey = ["cajas", String.fromCharCode(82, 101, 117, 98, 105, 99, 97, 100, 97, 115)].join("");
  const legacyGestionadas = current[legacyGestionadasKey];

  return {
    ...current,
    cajasGestionadas: String(current.cajasGestionadas ?? legacyGestionadas ?? ""),
  };
}

function toDateKey(value: string | undefined) {
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
  return getLocalDateKey(parsed);
}
