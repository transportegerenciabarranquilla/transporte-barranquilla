import assert from "node:assert/strict";
import test from "node:test";
import { createRoutePerformanceHistory } from "./routePerformanceHistory";
import { parseRoutePerformanceRows } from "./routePerformanceImport";

const [row] = parseRoutePerformanceRows([
  ["fecha_viaje2", "PLACA", "Viaje", "PLAN_KM", "EJE_KM", "DIFERENCIAKM", "ENTREGA RANGO"],
  ["1/10/2026", "ABC123", "1", 10, 12, 2, "92,31 %"],
]);

test("reemplaza archivos repetidos por la versión más reciente", () => {
  const history = createRoutePerformanceHistory();
  assert.equal(history.acceptFile("data (18).xlsx"), true);
  assert.equal(history.acceptFile("DATA (18).xlsx"), false);
  assert.equal(history.acceptFile("data (15).xlsx"), true);
});

test("archivos solapados no duplican viajes ni sustituyen el porcentaje nuevo", () => {
  const history = createRoutePerformanceHistory();
  const latest = history.addRows([row]);
  assert.equal(history.addRows([{ ...row, rangePercent: 50 }]).length, 0);
  assert.equal(latest[0].rangePercent, 92.31);
  assert.equal(history.addRows([{ ...row, trip: "2" }, { ...row, date: "2026-10-02" }]).length, 2);
});

test("deduplica DT y mantiene DT distintos y contratistas distintas", () => {
  const history = createRoutePerformanceHistory();
  assert.equal(history.addRows([{ ...row, excelDt: "DT-123" }, { ...row, excelDt: "123", trip: "2" }]).length, 1);
  assert.equal(history.addRows([{ ...row, excelDt: "456" }]).length, 1);
  assert.equal(history.addRows([{ ...row, excelDt: "123", excelContractor: "Surti Cervezas" }]).length, 1);
});
