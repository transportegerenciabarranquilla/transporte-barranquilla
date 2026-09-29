import assert from "node:assert/strict";
import test from "node:test";

import { buildDailyPerformanceTrend } from "./routePerformanceTrend.ts";

test("calcula promedios por día y conserva días sin ADH_KM", () => {
  const points = buildDailyPerformanceTrend([
    { date: "2026-08-02", adherenceKmPercent: 50, rangePercent: 80 },
    { date: "2026-08-01", adherenceKmPercent: null, rangePercent: 90 },
    { date: "2026-08-02", adherenceKmPercent: 70, rangePercent: null },
  ]);
  assert.deepEqual(points, [
    { date: "2026-08-01", trips: 1, adherenceKmPercent: null, rangePercent: 90 },
    { date: "2026-08-02", trips: 2, adherenceKmPercent: 60, rangePercent: 80 },
  ]);
});
