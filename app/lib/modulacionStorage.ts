export const MODULACION_STORAGE_KEY = "bavaria.modulacion.registros";

export type ModulacionRegistro = {
  id: string;
  dt: string;
  codigoCliente: string;
  nombreCliente?: string;
  totalCajas: string;
  cajasReubicadas?: string;
  persona: string;
  causal: string;
  comentario: string;
  imagenNombre: string;
  imagenVista: string;
  createdAt: string;
};

export type ModulacionResumen = {
  cajasRechazadas: number;
  cajasReubicadas: number;
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
  if (!value) return false;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10) === getLocalDateKey();

  return getLocalDateKey(parsed) === getLocalDateKey();
}

export function readModulacionRegistros() {
  if (typeof window === "undefined") return [];

  const current = localStorage.getItem(MODULACION_STORAGE_KEY);
  if (!current) return [];

  try {
    const parsed = JSON.parse(current);
    return Array.isArray(parsed) ? (parsed as ModulacionRegistro[]) : [];
  } catch {
    return [];
  }
}

export function saveModulacionRegistros(records: ModulacionRegistro[]) {
  localStorage.setItem(MODULACION_STORAGE_KEY, JSON.stringify(records));
}

export function getModulacionesByDt(records: ModulacionRegistro[], dt: string | number | undefined) {
  const targetDt = normalizeDt(dt);
  if (!targetDt) return [];

  return records.filter((record) => normalizeDt(record.dt) === targetDt);
}

export function summarizeModulaciones(records: ModulacionRegistro[], totalCajasSalida = 0, cajasCheckin?: number) {
  const cajasRechazadas = records.reduce((total, record) => total + Number(record.totalCajas || 0), 0);
  const cajasReubicadas = records.reduce((total, record) => total + Number(record.cajasReubicadas || 0), 0);
  const cajasPendientesModulacion = Math.max(cajasRechazadas - cajasReubicadas, 0);
  const tieneCheckin = typeof cajasCheckin === "number" && Number.isFinite(cajasCheckin);
  const cajasPendientes = tieneCheckin ? Math.max(cajasCheckin, 0) : cajasPendientesModulacion;
  const moduladores = Array.from(new Set(records.map((record) => record.persona?.trim()).filter(Boolean))) as string[];
  const causales = Array.from(new Set(records.map((record) => record.causal).filter(Boolean)));

  return {
    cajasRechazadas,
    cajasReubicadas,
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
