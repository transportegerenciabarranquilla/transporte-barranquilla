import { contractorLabel } from "./contractors";
import { RANGE_HOUR_WINDOWS, rangeHour, recordedRangeTime } from "./rangeHours";
import type { PuntoCoronaRouteRow } from "./puntoCoronaRoutesStorage";

export type RangeVehicleRow = Pick<PuntoCoronaRouteRow, "status" | "withinRadius" | "truckLicensePlate" | "outOfRadiusRecordedAt" | "outOfRadiusTime"> & { contractor: string; date: string };

export const RANGE_VEHICLE_WINDOWS = [
  ...RANGE_HOUR_WINDOWS,
  { value: "16-24", label: "4 p. m. en adelante", start: 16, end: 24 },
];

export const RANGE_VEHICLE_EVENING_WINDOWS = [
  { value: "16-18", label: "4–6 p. m.", start: 16, end: 18 },
  { value: "18-20", label: "6–8 p. m.", start: 18, end: 20 },
  { value: "20-22", label: "8–10 p. m.", start: 20, end: 22 },
  { value: "22-24", label: "10 p. m.–12 a. m.", start: 22, end: 24 },
];

export function countRangeVehiclesByWeekday(rows: RangeVehicleRow[], selectedContractor: string | null = null) {
  const days = new Map<string, { weekday: number; vehicles: Set<string> }>();
  for (const row of rows) {
    const contractor = contractorLabel(row.contractor) || "Sin contratista";
    if (contractor === "Punto Corona" || (selectedContractor && contractor !== selectedContractor) || row.status === "NOT_STARTED") continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    const date = new Date(`${row.date}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.date) continue;
    const day = days.get(row.date) ?? { weekday: (date.getUTCDay() + 6) % 7, vehicles: new Set<string>() };
    days.set(row.date, day);
    if (row.withinRadius !== false) continue;
    const plate = normalizeVehiclePlate(row.truckLicensePlate);
    if (plate && plate !== "SINPLACA") day.vehicles.add(JSON.stringify([contractor, plate]));
  }
  const result = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    .map(label => ({ label, days: 0, total: 0 }));
  for (const day of days.values()) {
    result[day.weekday].days++;
    result[day.weekday].total += day.vehicles.size;
  }
  return result;
}

function normalizeVehiclePlate(value: RangeVehicleRow["truckLicensePlate"]) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^CO(?=[A-Z]{3}\d{3}$)/, "");
}

export function countRangeVehicles(rows: RangeVehicleRow[], selected: string) {
  const window = [...RANGE_VEHICLE_WINDOWS, ...RANGE_VEHICLE_EVENING_WINDOWS].find(item => item.value === selected);
  if (!window) return [];
  const groups = new Map<string, { contractor: string; vehicles: Set<string>; missingPlate: number }>();
  for (const row of rows) {
    if (row.status === "NOT_STARTED" || !row.date) continue;
    const contractor = contractorLabel(row.contractor) || "Sin contratista";
    const group = groups.get(contractor) ?? { contractor, vehicles: new Set<string>(), missingPlate: 0 };
    groups.set(contractor, group);
    const hour = rangeHour(recordedRangeTime(row));
    if (row.withinRadius !== false || hour === null || hour < window.start || hour >= window.end) continue;
    const plate = normalizeVehiclePlate(row.truckLicensePlate);
    if (!plate || plate === "SINPLACA") group.missingPlate++;
    else group.vehicles.add(plate);
  }
  return [...groups.values()].map(group => ({ contractor: group.contractor,
    vehicleCount: group.vehicles.size, missingPlate: group.missingPlate,
  })).sort((a, b) => a.contractor.localeCompare(b.contractor, "es-CO"));
}
