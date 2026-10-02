import assert from "node:assert/strict";
import test from "node:test";
import { parseRoutePerformanceRows, parsePerformanceMinutes } from "./routePerformanceImport.ts";
import { averagePerformance, deliveryPerformance, formatPerformanceDuration, totalPerformanceMinutes } from "./routePerformanceMetrics.ts";

const headers = ["fecha_viaje2", "PLACA", "PLAN_KM", "EJE_KM", "DIFERENCIAKM", "ADH_KM", "CLIPLAN", "CLIVISITADOS", "ENTREGA RANGO", "PLAN_HR", "EJECUTADO_HR", "ADH_HRS"];
const trip = ["30/09/2026", "ABC123", 30, 40, 10, 0.75, 23, 22, 0.95, "10:07", "12:03", 0.84];

test("Power BI footer is ignored without ignoring invalid trips", () => {
  const rows = parseRoutePerformanceRows([headers, trip, ["Filtros aplicados: \nRegion es Norte", "", ""]]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].plannedClients, 23);
  assert.equal(rows[0].visitedClients, 22);
  assert.equal(rows[0].rangePercent, 22 / 23 * 100);
  assert.equal(rows[0].plannedMinutes, 607);
  assert.equal(rows[0].executedMinutes, 723);
  assert.equal(rows[0].adherenceHoursPercent, 84);
  assert.throws(() => parseRoutePerformanceRows([headers, trip, ["texto desconocido"]]), /fecha/);
  assert.throws(() => parseRoutePerformanceRows([headers, ["Filtros aplicados:", "ABC123"]]), /fecha/);
});

test("delivery divides matching client totals, never averages trip percentages", () => {
  const rows = [{plannedClients: 10, visitedClients: 5}, {plannedClients: 90, visitedClients: 90}];
  assert.equal(deliveryPerformance(rows).value, 95);
  assert.equal(deliveryPerformance([{plannedClients: 600, visitedClients: 566}]).value?.toFixed(2), "94.33");
  assert.equal(deliveryPerformance([...rows, {rangePercent: 80}]).value, null);
  assert.equal(deliveryPerformance([...rows, {rangePercent: 80}]).missing, 1);
  assert.equal(deliveryPerformance([]).value, null);
  assert.equal(deliveryPerformance([{plannedClients: 0, visitedClients: 0}]).value, null);
  assert.equal(deliveryPerformance([{plannedClients: 10, visitedClients: 0}]).value, 0);
});

test("hours are durations beyond 24 hours and adherence retains source percentages", () => {
  assert.equal(parsePerformanceMinutes(0.5, 2, "PLAN_HR"), 720);
  assert.equal(parsePerformanceMinutes("303:03", 2, "PLAN_HR"), 18183);
  assert.equal(formatPerformanceDuration(19790), "329:50");
  assert.throws(() => parsePerformanceMinutes("10:99", 2, "PLAN_HR"), /formato/);
  const rows = parseRoutePerformanceRows([headers, trip]);
  assert.equal(averagePerformance(rows, "adherenceKmPercent").value, 75);
  assert.equal(totalPerformanceMinutes(rows, "plannedMinutes"), 607);
  assert.equal(totalPerformanceMinutes([...rows, {}], "plannedMinutes"), null);
});

test("exported client and duration columns can be loaded again", () => {
  const [row] = parseRoutePerformanceRows([[
    "Fecha", "Placa", "Plan km", "Ejecutado km", "Diferencia km", "Entrega en rango MyGeotab %", "Clientes planeados", "Clientes visitados", "Horas planeadas", "Horas ejecutadas", "Adherencia horas %",
  ], ["2026-09-30", "ABC123", 30, 40, 10, 50, 10, 5, "10:07", "12:03", 84]]);
  assert.equal(deliveryPerformance([row]).value, 50);
  assert.equal(row.plannedMinutes, 607);
  assert.equal(row.adherenceHoursPercent, 84);
});

test("native percentage fractions retain values below one percent", () => {
  const [row] = parseRoutePerformanceRows([headers,
    ["30/09/2026", "ABC123", 30, 40, 10, 0.005, 200, 1, 0.005, "10:07", "12:03", 0.01],
  ]);
  assert.equal(row.adherenceKmPercent, 0.5);
  assert.equal(row.rangePercent, 0.5);
  assert.equal(row.adherenceHoursPercent, 1);
});
