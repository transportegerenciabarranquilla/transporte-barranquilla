import type { MatchedRoutePerformance } from "./routePerformanceImport";

type TrendTrip = Pick<MatchedRoutePerformance, "date" | "adherenceKmPercent" | "rangePercent">;

export type DailyPerformancePoint = {
  date: string;
  trips: number;
  adherenceKmPercent: number | null;
  rangePercent: number | null;
};

export function buildDailyPerformanceTrend(rows: readonly TrendTrip[]): DailyPerformancePoint[] {
  const days = new Map<string, { trips: number; adherenceSum: number; adherenceCount: number; rangeSum: number; rangeCount: number }>();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    const day = days.get(row.date) ?? { trips: 0, adherenceSum: 0, adherenceCount: 0, rangeSum: 0, rangeCount: 0 };
    day.trips += 1;
    if (row.adherenceKmPercent !== null) {
      day.adherenceSum += row.adherenceKmPercent;
      day.adherenceCount += 1;
    }
    if (row.rangePercent !== null) {
      day.rangeSum += row.rangePercent;
      day.rangeCount += 1;
    }
    days.set(row.date, day);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => ({
      date,
      trips: day.trips,
      adherenceKmPercent: day.adherenceCount ? day.adherenceSum / day.adherenceCount : null,
      rangePercent: day.rangeCount ? day.rangeSum / day.rangeCount : null,
    }));
}
