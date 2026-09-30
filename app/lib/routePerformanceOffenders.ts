import { normalizePerformancePlate, type MatchedRoutePerformance } from "./routePerformanceImport";

type OffenderTrip = Pick<MatchedRoutePerformance, "driver" | "rr" | "contractor" | "adherenceKmPercent" | "differenceKm"> & Partial<Pick<MatchedRoutePerformance, "plate" | "matchedPlate" | "originalPlate">>;

export type DriverOffender = {
  driver: string;
  rr: string;
  contractor: string;
  plates: string[];
  trips: number;
  adherenceKmPercent: number;
  differenceKm: number;
};

const identity = (value: string) => value.trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
const identified = (value: string) => Boolean(identity(value) && !["sin identificar", "sin conductor", "pendiente", "-", "n/a"].includes(identity(value)));

export function buildDriverOffenders(rows: readonly OffenderTrip[], limit = 10): DriverOffender[] {
  const groups = new Map<string, DriverOffender & { adherenceSum: number }>();
  for (const row of rows) {
    if (!identified(row.driver) || row.adherenceKmPercent === null) continue;
    const key = JSON.stringify([row.driver, row.rr, row.contractor].map(identity));
    const group = groups.get(key) ?? {
      driver: row.driver.trim(),
      rr: row.rr.trim(),
      contractor: row.contractor.trim(),
      plates: [],
      trips: 0,
      adherenceKmPercent: 0,
      adherenceSum: 0,
      differenceKm: 0,
    };
    group.trips += 1;
    const plate = normalizePerformancePlate(row.matchedPlate?.trim() || row.plate?.trim() || row.originalPlate?.trim());
    if (plate && !group.plates.includes(plate)) group.plates.push(plate);
    group.adherenceSum += row.adherenceKmPercent;
    group.differenceKm += Math.abs(row.differenceKm);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ adherenceSum, ...group }) => ({ ...group, plates: group.plates.sort(), adherenceKmPercent: adherenceSum / group.trips }))
    .sort((a, b) => a.adherenceKmPercent - b.adherenceKmPercent || b.differenceKm - a.differenceKm || b.trips - a.trips || a.driver.localeCompare(b.driver, "es"))
    .slice(0, limit);
}
