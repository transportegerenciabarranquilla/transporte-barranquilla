import test from "node:test";
import assert from "node:assert/strict";
import { surtiRangeFromReports } from "./routePerformanceRangeFallback.ts";

test("usa el reporte de Rango de Surti sin duplicar current y closure", () => {
  assert.deepEqual(surtiRangeFromReports([
    { contractor: "Surti Cervezas", operationalDate: "2026-10-05", kind: "current", summary: { startedRows: 502, inRange: 450 } },
    { contractor: "Surti Cervezas", operationalDate: "2026-10-05", kind: "closure", summary: { startedRows: 500, inRange: 460 } },
    { contractor: "Surti Cervezas", operationalDate: "2026-10-03", kind: "current", summary: { startedRows: 100, inRange: 80 } },
    { contractor: "Logisticos", operationalDate: "2026-10-05", kind: "current", summary: { startedRows: 100, inRange: 100 } },
  ]), { started: 600, inRange: 540, days: 2, value: 90 });
  assert.equal(surtiRangeFromReports([]), null);
});
