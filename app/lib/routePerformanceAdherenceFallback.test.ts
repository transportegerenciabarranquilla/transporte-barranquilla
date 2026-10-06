import test from "node:test";
import assert from "node:assert/strict";
import { latestSurtiAdherence } from "./routePerformanceAdherenceFallback.ts";

test("usa solo el último día disponible de Surti y promedia sus viajes", () => {
  const rows = [
    { date: "2026-10-02", contractor: "Surti Cervezas", adherenceKmPercent: 76.3 },
    { date: "2026-10-02", contractor: "Surti Cervezas", adherenceKmPercent: 83.7 },
    { date: "2026-10-05", contractor: "Logisticos", adherenceKmPercent: 99 },
    { date: "2026-10-04", contractor: "Surti Cervezas", adherenceKmPercent: null },
    { date: "2026-10-06", contractor: "Surti Cervezas", adherenceKmPercent: 90 },
  ];
  assert.deepEqual(latestSurtiAdherence(rows, "2026-10-05"), { date: "2026-10-02", count: 2, value: 80 });
  assert.deepEqual(latestSurtiAdherence(rows), { date: "2026-10-06", count: 1, value: 90 });
  assert.equal(latestSurtiAdherence(rows, "2026-10-01"), null);
});
