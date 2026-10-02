import type { RoutePerformanceRow } from "./routePerformanceImport";

type MetricsRow = Pick<RoutePerformanceRow, "adherenceKmPercent"> & Partial<RoutePerformanceRow>;

export function latestPerformanceDate(rows: readonly Pick<RoutePerformanceRow, "date">[]) {
  return rows.reduce((latest, row) => row.date > latest ? row.date : latest, "");
}

export function averagePerformance(rows: readonly MetricsRow[], field: "adherenceKmPercent" | "adherenceHoursPercent") {
  const values = rows.flatMap(row => typeof row[field] === "number" && Number.isFinite(row[field]) ? [row[field] as number] : []);
  return { count: values.length, value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null };
}

export function deliveryPerformance(rows: readonly Partial<RoutePerformanceRow>[]) {
  let planned = 0;
  let visited = 0;
  let count = 0;
  for (const row of rows) {
    if (typeof row.plannedClients !== "number" || !Number.isFinite(row.plannedClients) || typeof row.visitedClients !== "number" || !Number.isFinite(row.visitedClients)) continue;
    planned += row.plannedClients;
    visited += row.visitedClients;
    count++;
  }
  const missing = rows.length - count;
  // A partial population must not be shown as the result for all selected trips.
  return { planned, visited, count, missing, value: missing === 0 && planned > 0 ? visited / planned * 100 : null };
}

export function totalPerformanceMinutes(rows: readonly Partial<RoutePerformanceRow>[], field: "plannedMinutes" | "executedMinutes") {
  if (!rows.length || rows.some(row => typeof row[field] !== "number" || !Number.isFinite(row[field]))) return null;
  return rows.reduce((sum, row) => sum + (row[field] as number), 0);
}

export function formatPerformanceDuration(minutes: number | null | undefined) {
  if (minutes == null) return "";
  return `${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, "0")}`;
}
