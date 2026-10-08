import { normalizePerformancePlate, type MatchedRoutePerformance } from "./routePerformanceImport";

type OffenderTrip = Pick<MatchedRoutePerformance, "driver" | "rr" | "contractor" | "adherenceKmPercent" | "differenceKm"> & Partial<Pick<MatchedRoutePerformance, "plate" | "matchedPlate" | "originalPlate" | "rangePercent">>;

export type DriverOffender = {
  driver: string;
  rr: string;
  contractor: string;
  plates: string[];
  trips: number;
  adherenceKmPercent: number;
  rangePercent: number | null;
  differenceKm: number;
};

const identity = (value: string) => value.trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
const identified = (value: string) => Boolean(identity(value) && !["sin identificar", "sin conductor", "pendiente", "-", "n/a"].includes(identity(value)));

export function buildDriverOffenders(rows: readonly OffenderTrip[], limit = 10): DriverOffender[] {
  const groups = new Map<string, DriverOffender & { adherenceSum: number; rangeSum: number; rangeCount: number }>();
  for (const row of rows) {
    const plate = normalizePerformancePlate(row.matchedPlate?.trim() || row.plate?.trim() || row.originalPlate?.trim());
    const hasDriver = identified(row.driver);
    if ((!hasDriver && !plate) || row.adherenceKmPercent === null) continue;
    const driver = hasDriver ? row.driver.trim() : "Sin registrar";
    const key = JSON.stringify([driver, row.rr, row.contractor, hasDriver ? "" : plate].map(identity));
    const group = groups.get(key) ?? {
      driver,
      rr: row.rr.trim(),
      contractor: row.contractor.trim(),
      plates: [],
      trips: 0,
      adherenceKmPercent: 0,
      rangePercent: null,
      adherenceSum: 0,
      rangeSum: 0,
      rangeCount: 0,
      differenceKm: 0,
    };
    group.trips += 1;
    if (plate && !group.plates.includes(plate)) group.plates.push(plate);
    group.adherenceSum += row.adherenceKmPercent;
    if (row.rangePercent !== null && row.rangePercent !== undefined) {
      group.rangeSum += row.rangePercent;
      group.rangeCount += 1;
    }
    group.differenceKm += Math.abs(row.differenceKm);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ adherenceSum, rangeSum, rangeCount, ...group }) => ({ ...group, plates: group.plates.sort(), adherenceKmPercent: adherenceSum / group.trips, rangePercent: rangeCount ? rangeSum / rangeCount : null }))
    .sort((a, b) => a.adherenceKmPercent - b.adherenceKmPercent || b.differenceKm - a.differenceKm || b.trips - a.trips || a.driver.localeCompare(b.driver, "es"))
    .slice(0, limit);
}
