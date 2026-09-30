import { contractorLabel } from "./contractors";
import { RANGE_HOUR_WINDOWS, rangeHour, recordedRangeTime } from "./rangeHours";
import type { PuntoCoronaRouteRow } from "./puntoCoronaRoutesStorage";

export type RangeVehicleRow = Pick<PuntoCoronaRouteRow, "status" | "withinRadius" | "truckLicensePlate" | "outOfRadiusRecordedAt" | "outOfRadiusTime"> & { contractor: string; date: string };

export function countRangeVehicles(rows: RangeVehicleRow[], selected: string) {
  const window = RANGE_HOUR_WINDOWS.find(item => item.value === selected);
  if (!window) return [];
  const groups = new Map<string, { contractor: string; vehicles: Set<string>; missingPlate: number }>();
  for (const row of rows) {
    if (row.status === "NOT_STARTED" || !row.date) continue;
    const contractor = contractorLabel(row.contractor) || "Sin contratista";
    const group = groups.get(contractor) ?? { contractor, vehicles: new Set<string>(), missingPlate: 0 };
    groups.set(contractor, group);
    const hour = rangeHour(recordedRangeTime(row));
    if (row.withinRadius !== false || hour === null || hour < window.start || hour >= window.end) continue;
    const plate = String(row.truckLicensePlate || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^CO(?=[A-Z]{3}\d{3}$)/, "");
    if (!plate || plate === "SINPLACA") group.missingPlate++;
    else group.vehicles.add(plate);
  }
  return [...groups.values()].map(group => ({ contractor: group.contractor,
    vehicleCount: group.vehicles.size, missingPlate: group.missingPlate,
  })).sort((a, b) => a.contractor.localeCompare(b.contractor, "es-CO"));
}
