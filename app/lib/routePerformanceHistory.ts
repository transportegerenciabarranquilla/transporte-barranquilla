import { normalizePerformancePlate, type RoutePerformanceRow } from "./routePerformanceImport";
import { normalizeDt } from "./modulacionStorage";
import { normalizeContractorName } from "./contractors";

// Consume files newest first. The latest upload replaces a file with the same
// name; overlapping routes in differently named files also count only once.
export function createRoutePerformanceHistory() {
  const names = new Set<string>();
  const dts = new Set<string>();
  const trips = new Map<string, Set<string>>();
  return {
    acceptFile(name: string) {
      const key = name.trim().toLowerCase();
      if (names.has(key)) return false;
      names.add(key);
      return true;
    },
    addRows(rows: RoutePerformanceRow[]) {
      return rows.filter(row => {
        const contractor = normalizeContractorName(row.excelContractor);
        const dt = normalizeDt(row.excelDt);
        const dtKey = dt ? JSON.stringify([contractor, dt]) : "";
        const tripKey = JSON.stringify([contractor, row.date, normalizePerformancePlate(row.originalPlate || row.plate), row.trip.trim()]);
        const seenDts = trips.get(tripKey);
        if ((dtKey && dts.has(dtKey)) || (seenDts && (!dt || seenDts.has("") || seenDts.has(dt)))) return false;
        if (dtKey) dts.add(dtKey);
        const tripDts = seenDts || new Set<string>();
        tripDts.add(dt);
        trips.set(tripKey, tripDts);
        return true;
      });
    },
  };
}
