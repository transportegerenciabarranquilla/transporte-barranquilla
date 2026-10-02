import type { MatchedRoutePerformance } from "./routePerformanceImport";
import { averagePerformance, deliveryPerformance } from "./routePerformanceMetrics";

type TrendTrip = Pick<MatchedRoutePerformance, "date" | "adherenceKmPercent" | "rangePercent"> & Partial<Pick<MatchedRoutePerformance, "plannedClients" | "visitedClients">>;

export type DailyPerformancePoint = {
  date: string;
  trips: number;
  adherenceKmPercent: number | null;
  rangePercent: number | null;
};

export function buildDailyPerformanceTrend(rows: readonly TrendTrip[]): DailyPerformancePoint[] {
  const days = new Map<string, TrendTrip[]>();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    const day = days.get(row.date) ?? [];
    day.push(row);
    days.set(row.date, day);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => ({
      date,
      trips: day.length,
      adherenceKmPercent: averagePerformance(day, "adherenceKmPercent").value,
      rangePercent: deliveryPerformance(day).value,
    }));
}
