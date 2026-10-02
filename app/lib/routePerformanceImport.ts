import type { Vehiculo } from "../seguimiento/types";
import { deliveryPerformance } from "./routePerformanceMetrics";

export type RoutePerformanceRow = {
  fila: number;
  date: string;
  plate: string;
  originalPlate: string;
  trip: string;
  excelContractor: string;
  excelRr: string;
  excelDriver: string;
  excelDt: string;
  excelMatch: string;
  plannedKm: number;
  executedKm: number;
  differenceKm: number;
  adherenceKmPercent: number | null;
  plannedClients?: number | null;
  visitedClients?: number | null;
  plannedMinutes?: number | null;
  executedMinutes?: number | null;
  adherenceHoursPercent?: number | null;
  rangePercent: number | null;
  outsidePercent: number | null;
};
export type MatchedRoutePerformance = RoutePerformanceRow & {
  match: "matched" | "missing" | "ambiguous";
  matchSource: "seguimiento" | "archivo" | "none";
  matchedPlate: string;
  rr: string;
  driver: string;
  contractor: string;
  dt: string;
};
export type PerformanceVehicle = Pick<Vehiculo, "vehiculo" | "fechaDespacho" | "fechaDt" | "date" | "createdAt" | "viaje" | "nombreResponsable" | "responsable" | "nombreAuxiliar1" | "cedulaResponsable" | "cedulaAuxiliar1" | "transportista" | "transporte">;

const headerKey = (value: unknown) => String(value ?? "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
export const normalizePerformancePlate = (value: unknown) => headerKey(value).replace(/^CO(?=[A-Z]{3}\d{3}$)/, "");

export function performanceDate(value: unknown): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return "";
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  // Excel serial dates in the default 1900 system, for cells without date formatting.
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 61 || value > 2958465) return "";
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T ])/);
  const key = local ? `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}` : iso?.[1] ?? "";
  const date = new Date(`${key}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key ? key : "";
}

function numericCell(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(text)) return null;
  const number = Number(text.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

export function parsePerformancePercent(value: unknown, fila: number, label = "ENTREGA RANGO"): number | null {
  if (value == null || String(value).trim() === "") return null;
  const text = typeof value === "string" ? value.trim().replace(/\s*%$/, "") : value;
  const parsed = numericCell(text);
  // Excel percentage cells are stored as fractions; strings such as "92,31 %" are percentage points.
  const percent = parsed === null ? null : typeof value === "number" && parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed;
  if (percent === null || percent < 0 || percent > 100) throw new Error(`Fila ${fila}: ${label} debe ser un porcentaje entre 0 y 100.`);
  return percent;
}

export function parseRoutePerformanceRows(data: unknown[][]): RoutePerformanceRow[] {
  const headers = (data[0] ?? []).map(headerKey);
  const required = ["fecha_viaje2", "PLACA", "PLAN_KM", "EJE_KM", "DIFERENCIAKM", "ENTREGA RANGO"];
  const aliases: Record<string, string[]> = {
    fecha_viaje2: ["Fecha"],
    PLACAORIGINAL: ["Placa original"],
    PLAN_KM: ["Plan km"],
    EJE_KM: ["Ejecutado km"],
    DIFERENCIAKM: ["Diferencia km"],
    "ENTREGA RANGO": ["Entrega en rango %", "Entrega en rango MyGeotab %"],
    ADH_KM: ["Adherencia km %"],
    CLIPLAN: ["Clientes planeados"],
    CLIVISITADOS: ["Clientes visitados"],
    PLAN_HR: ["Horas planeadas"],
    EJECUTADO_HR: ["Horas ejecutadas"],
    ADH_HRS: ["Adherencia horas %"],
  };
  const columnIndex = (label: string) => [label, ...(aliases[label] || [])].map(headerKey).map((key) => headers.indexOf(key)).find((index) => index >= 0) ?? -1;
  for (const label of required) {
    if (columnIndex(label) < 0) throw new Error(`Falta la columna ${label} en la primera fila del Excel.`);
  }
  for (const label of [...required, "PLACAORIGINAL", "Viaje", "ADH_KM", "CONTRATISTA", "TRANSPORTISTA"]) {
    if (headers.filter((header) => header === headerKey(label)).length > 1) throw new Error(`La columna ${label} está repetida.`);
  }
  const rows: RoutePerformanceRow[] = [];
  data.slice(1).forEach((cells, index) => {
    if (cells.every((value) => value == null || String(value).trim() === "")) return;
    // Power BI appends a single text cell describing the export filters.
    // Only skip that precise footer; malformed trip rows must still fail.
    if (/^Filtros aplicados\s*:/i.test(String(cells[0] ?? "").trim()) && cells.slice(1).every((value) => value == null || String(value).trim() === "")) return;
    const fila = index + 2;
    const read = (label: string) => cells[columnIndex(label)];
    const date = performanceDate(read("fecha_viaje2"));
    const plate = String(read("PLACA") ?? "").trim();
    const originalPlate = String(read("PLACAORIGINAL") ?? "").trim();
    if (!date) throw new Error(`Fila ${fila}: fecha_viaje2 no es una fecha válida.`);
    if (!normalizePerformancePlate(plate) && !normalizePerformancePlate(originalPlate)) throw new Error(`Fila ${fila}: falta la placa.`);
    const plannedKm = numericCell(read("PLAN_KM"));
    const executedKm = numericCell(read("EJE_KM"));
    const differenceKm = numericCell(read("DIFERENCIAKM"));
    if (plannedKm === null || plannedKm < 0 || executedKm === null || executedKm < 0 || differenceKm === null) throw new Error(`Fila ${fila}: revisa PLAN_KM, EJE_KM y DIFERENCIAKM; deben ser números.`);
    const readCount = (label: string) => {
      const raw = read(label);
      if (raw == null || String(raw).trim() === "") return null;
      const count = numericCell(raw);
      if (count === null || count < 0 || !Number.isInteger(count)) throw new Error(`Fila ${fila}: ${label} debe ser un entero no negativo.`);
      return count;
    };
    const plannedClients = readCount("CLIPLAN");
    const visitedClients = readCount("CLIVISITADOS");
    if (plannedClients !== null && visitedClients !== null && visitedClients > plannedClients) throw new Error(`Fila ${fila}: CLIVISITADOS no puede superar CLIPLAN.`);
    const reportedRange = parsePerformancePercent(read("ENTREGA RANGO"), fila);
    const rangePercent = plannedClients !== null && visitedClients !== null ? (plannedClients > 0 ? visitedClients / plannedClients * 100 : null) : reportedRange;
    const plannedMinutes = parsePerformanceMinutes(read("PLAN_HR"), fila, "PLAN_HR");
    const executedMinutes = parsePerformanceMinutes(read("EJECUTADO_HR"), fila, "EJECUTADO_HR");
    const adherenceHoursPercent = parsePerformancePercent(read("ADH_HRS"), fila, "ADH_HRS");
    const adherenceKmPercent = columnIndex("ADH_KM") >= 0 ? parsePerformancePercent(read("ADH_KM"), fila, "ADH_KM") : null;
    const excelContractor = String((headers.includes(headerKey("CONTRATISTA")) ? read("CONTRATISTA") : undefined) || (headers.includes(headerKey("TRANSPORTISTA")) ? read("TRANSPORTISTA") : undefined) || "").trim();
    const excelRr = String(read("RR") ?? "").trim();
    const excelDriver = String(read("Conductor") ?? "").trim();
    const excelDt = String(read("DT") ?? "").trim();
    const excelMatch = String(read("Cruce") ?? "").trim();
    rows.push({ fila, date, plate, originalPlate, trip: String(read("Viaje") ?? "").trim(), excelContractor, excelRr, excelDriver, excelDt, excelMatch, plannedKm, executedKm, differenceKm, adherenceKmPercent, plannedClients, visitedClients, plannedMinutes, executedMinutes, adherenceHoursPercent, rangePercent, outsidePercent: rangePercent === null ? null : 100 - rangePercent });
  });
  if (!rows.length) throw new Error("La primera hoja no contiene viajes para comparar.");
  return rows;
}

export function parsePerformanceMinutes(value: unknown, fila: number, label: string): number | null {
  if (value == null || String(value).trim() === "") return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.round(value * 1440);
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getHours() * 60 + value.getMinutes();
  const match = String(value).trim().match(/^(\d+):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) throw new Error(`Fila ${fila}: ${label} debe tener formato horas:minutos.`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function tripKey(value: string): string {
  const text = String(value ?? "").trim().toLowerCase().replace(/^viaje\s*/, "");
  return /^\d+$/.test(text) ? String(Number(text)) : "";
}

function personName(value: string | undefined): string {
  const text = value?.trim() ?? "";
  return ["", "SINIDENTIFICAR", "SINRESPONSABLE", "SINCONDUCTOR", "PENDIENTE"].includes(headerKey(text)) ? "" : text;
}

export function matchRoutePerformance(rows: RoutePerformanceRow[], vehicles: PerformanceVehicle[]): MatchedRoutePerformance[] {
  const index = new Map<string, PerformanceVehicle[]>();
  for (const vehicle of vehicles) {
    const plate = normalizePerformancePlate(vehicle.vehiculo);
    const date = performanceDate(vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || vehicle.createdAt);
    if (!plate || !date) continue;
    const key = `${date}:${plate}`;
    const candidates = index.get(key) ?? [];
    candidates.push(vehicle);
    index.set(key, candidates);
  }
  return rows.map((row) => {
    const empty = { ...row, matchedPlate: "", rr: row.excelRr, driver: row.excelDriver, contractor: row.excelContractor, dt: row.excelDt };
    const plate = normalizePerformancePlate(row.plate);
    const original = normalizePerformancePlate(row.originalPlate);
    let candidates = index.get(`${row.date}:${plate}`) ?? [];
    if (!candidates.length && original && original !== plate) candidates = index.get(`${row.date}:${original}`) ?? [];
    const trip = tripKey(row.trip);
    if (trip) {
      const sameTrip = candidates.filter((vehicle) => tripKey(vehicle.viaje) === trip);
      // Missing trip data can only be used when the plate/date identifies a single record.
      candidates = sameTrip.length ? sameTrip : candidates.filter((vehicle) => !tripKey(vehicle.viaje));
    }
    if (!candidates.length) {
      const reportedMatch = headerKey(row.excelMatch);
      if (reportedMatch === "COINCIDE" || reportedMatch === "COINCIDEENARCHIVO") return { ...empty, match: "matched", matchSource: "archivo" };
      if (reportedMatch === "VARIASCOINCIDENCIAS") return { ...empty, match: "ambiguous", matchSource: "archivo" };
      return { ...empty, match: "missing", matchSource: row.excelMatch ? "archivo" : "none" };
    }
    if (candidates.length > 1) return { ...empty, match: "ambiguous", matchSource: "seguimiento" };
    const vehicle = candidates[0];
    return {
      ...empty, match: "matched", matchSource: "seguimiento", matchedPlate: vehicle.vehiculo,
      rr: row.excelRr || personName(vehicle.nombreResponsable) || personName(vehicle.responsable) || (vehicle.cedulaResponsable ? `CC ${vehicle.cedulaResponsable}` : ""),
      driver: row.excelDriver || personName(vehicle.nombreAuxiliar1) || (vehicle.cedulaAuxiliar1 ? `CC ${vehicle.cedulaAuxiliar1}` : ""),
      contractor: row.excelContractor || vehicle.transportista || "", dt: row.excelDt || vehicle.transporte || "",
    };
  });
}

export function summarizePerformanceCrews(rows: MatchedRoutePerformance[]) {
  const groups = new Map<string, { key: string; rr: string; driver: string; contractor: string; trips: number; rows: MatchedRoutePerformance[] }>();
  for (const row of rows) {
    if (row.match !== "matched" || (!row.rr && !row.driver)) continue;
    const key = JSON.stringify([row.contractor, row.rr, row.driver].map((value) => value.trim().toLocaleLowerCase("es")));
    const group = groups.get(key) ?? { key, rr: row.rr, driver: row.driver, contractor: row.contractor, trips: 0, rows: [] };
    group.trips += 1;
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ rows: trips, ...group }) => ({ ...group, rangePercent: deliveryPerformance(trips).value }))
    .sort((a, b) => (a.rangePercent ?? Infinity) - (b.rangePercent ?? Infinity) || a.rr.localeCompare(b.rr, "es"));
}
