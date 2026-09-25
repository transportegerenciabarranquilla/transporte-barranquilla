import type { Vehiculo } from "../seguimiento/types";

export type RoutePerformanceRow = {
  fila: number;
  date: string;
  plate: string;
  originalPlate: string;
  trip: string;
  plannedKm: number;
  executedKm: number;
  differenceKm: number;
  rangePercent: number | null;
  outsidePercent: number | null;
};
export type MatchedRoutePerformance = RoutePerformanceRow & {
  match: "matched" | "missing" | "ambiguous";
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

export function parsePerformancePercent(value: unknown, fila: number): number | null {
  if (value == null || String(value).trim() === "") return null;
  const text = typeof value === "string" ? value.trim().replace(/\s*%$/, "") : value;
  const parsed = numericCell(text);
  // Excel percentage cells are stored as fractions; strings such as "92,31 %" are percentage points.
  const percent = parsed === null ? null : typeof value === "number" && parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed;
  if (percent === null || percent < 0 || percent > 100) throw new Error(`Fila ${fila}: ENTREGA RANGO debe ser un porcentaje entre 0 y 100.`);
  return percent;
}

export function parseRoutePerformanceRows(data: unknown[][]): RoutePerformanceRow[] {
  const headers = (data[0] ?? []).map(headerKey);
  const required = ["fecha_viaje2", "PLACA", "PLAN_KM", "EJE_KM", "DIFERENCIAKM", "ENTREGA RANGO"];
  for (const label of required) {
    if (!headers.includes(headerKey(label))) throw new Error(`Falta la columna ${label} en la primera fila del Excel.`);
  }
  for (const label of [...required, "PLACAORIGINAL", "Viaje"]) {
    if (headers.filter((header) => header === headerKey(label)).length > 1) throw new Error(`La columna ${label} está repetida.`);
  }
  const rows: RoutePerformanceRow[] = [];
  data.slice(1).forEach((cells, index) => {
    if (cells.every((value) => value == null || String(value).trim() === "")) return;
    const fila = index + 2;
    const read = (label: string) => cells[headers.indexOf(headerKey(label))];
    const date = performanceDate(read("fecha_viaje2"));
    const plate = String(read("PLACA") ?? "").trim();
    const originalPlate = String(read("PLACAORIGINAL") ?? "").trim();
    if (!date) throw new Error(`Fila ${fila}: fecha_viaje2 no es una fecha válida.`);
    if (!normalizePerformancePlate(plate) && !normalizePerformancePlate(originalPlate)) throw new Error(`Fila ${fila}: falta la placa.`);
    const plannedKm = numericCell(read("PLAN_KM"));
    const executedKm = numericCell(read("EJE_KM"));
    const differenceKm = numericCell(read("DIFERENCIAKM"));
    if (plannedKm === null || plannedKm < 0 || executedKm === null || executedKm < 0 || differenceKm === null) throw new Error(`Fila ${fila}: revisa PLAN_KM, EJE_KM y DIFERENCIAKM; deben ser números.`);
    const rangePercent = parsePerformancePercent(read("ENTREGA RANGO"), fila);
    rows.push({ fila, date, plate, originalPlate, trip: String(read("Viaje") ?? "").trim(), plannedKm, executedKm, differenceKm, rangePercent, outsidePercent: rangePercent === null ? null : 100 - rangePercent });
  });
  if (!rows.length) throw new Error("La primera hoja no contiene viajes para comparar.");
  return rows;
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
    const empty = { ...row, matchedPlate: "", rr: "", driver: "", contractor: "", dt: "" };
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
    if (!candidates.length) return { ...empty, match: "missing" };
    if (candidates.length > 1) return { ...empty, match: "ambiguous" };
    const vehicle = candidates[0];
    return {
      ...empty, match: "matched", matchedPlate: vehicle.vehiculo,
      rr: personName(vehicle.nombreResponsable) || personName(vehicle.responsable) || (vehicle.cedulaResponsable ? `CC ${vehicle.cedulaResponsable}` : ""),
      driver: personName(vehicle.nombreAuxiliar1) || (vehicle.cedulaAuxiliar1 ? `CC ${vehicle.cedulaAuxiliar1}` : ""),
      contractor: vehicle.transportista || "", dt: vehicle.transporte || "",
    };
  });
}

export function summarizePerformanceCrews(rows: MatchedRoutePerformance[]) {
  const groups = new Map<string, { key: string; rr: string; driver: string; contractor: string; trips: number; rangeSum: number }>();
  for (const row of rows) {
    if (row.match !== "matched" || row.rangePercent === null || (!row.rr && !row.driver)) continue;
    const key = JSON.stringify([row.contractor, row.rr, row.driver].map((value) => value.trim().toLocaleLowerCase("es")));
    const group = groups.get(key) ?? { key, rr: row.rr, driver: row.driver, contractor: row.contractor, trips: 0, rangeSum: 0 };
    group.trips += 1;
    group.rangeSum += row.rangePercent;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ ...group, rangePercent: group.rangeSum / group.trips }))
    .sort((a, b) => a.rangePercent - b.rangePercent || a.rr.localeCompare(b.rr, "es"));
}
