import test from "node:test";
import assert from "node:assert/strict";
import { chartDate, complaintAccumulation, complaintLastThreeDays, complaintToday, complaintWeekdays, groupComplaintChart, parseComplaintChartRows, suggestComplaintChartMapping, type ComplaintChartRow } from "./complaintCharts.ts";

const datedRow = (date: string, count: number): ComplaintChartRow => ({ date, count, contractor: "Logisticos", status: "Abierta", issue: "Entrega" });

test("acumula en orden de fecha, suma cantidades y excluye fechas inválidas del porcentaje", () => {
  const result = complaintAccumulation([datedRow("2026-10-01", 3), datedRow("2026-09-30", 1), datedRow("2026-09-30", 1), datedRow("", 20)]);
  assert.equal(result.total, 5);
  assert.equal(result.excluded, 20);
  assert.deepEqual(result.values.map(day => [day.accumulated, day.percentage]), [[2, 40], [5, 100]]);
  assert.deepEqual(complaintAccumulation([]), { values: [], total: 0, excluded: 0 });
  assert.equal(complaintAccumulation([datedRow("2026-10-01", 0)]).values[0].percentage, 0);
});

test("los últimos tres días incluyen hoy, ceros y cambio de mes, excluyendo fechas futuras", () => {
  const values = complaintLastThreeDays([datedRow("2026-09-28", 99), datedRow("2026-09-29", 20), datedRow("2026-10-01", 30), datedRow("2026-10-02", 99), datedRow("", 99)], "2026-10-01");
  assert.deepEqual(values, [{ date: "2026-09-29", count: 20 }, { date: "2026-09-30", count: 0 }, { date: "2026-10-01", count: 30 }]);
  assert.equal(complaintLastThreeDays([], "2026-01-01")[0].date, "2025-12-30");
});

test("la fecha actual usa Colombia incluso cerca de medianoche UTC", () => {
  assert.equal(complaintToday(new Date("2026-10-01T04:59:00Z")), "2026-09-30");
  assert.equal(complaintToday(new Date("2026-10-01T05:00:00Z")), "2026-10-01");
});

test("reconoce encabezados del Excel y cuenta una queja por fila", () => {
  const mapping = suggestComplaintChartMapping(["Transportista", "Fecha creación", "Estado", "Novedad"]);
  const rows = parseComplaintChartRows([
    { Transportista: "Logisticos", "Fecha creación": "01/10/2026", Estado: "Abierta", Novedad: "Entrega" },
    { Transportista: "Logisticos", "Fecha creación": "2026-10-08", Estado: "Cerrada", Novedad: "Entrega" },
  ], mapping);
  assert.deepEqual(groupComplaintChart(rows, "contractor"), [{ label: "Logisticos", count: 2 }]);
  assert.equal(complaintWeekdays(rows)[3].count, 2);
});

test("suma cantidades enteras sin promediar y omite filas vacías", () => {
  const mapping = suggestComplaintChartMapping(["contratista", "cantidad"]);
  const rows = parseComplaintChartRows([{ contratista: "A", cantidad: "20" }, { contratista: "A", cantidad: "30" }, { contratista: "", cantidad: "" }], mapping);
  assert.deepEqual(groupComplaintChart(rows, "contractor"), [{ label: "A", count: 50 }]);
  assert.equal(complaintWeekdays(rows).reduce((sum, day) => sum + day.count, 0), 0);
  for (const cantidad of ["", "1.5", "-1", "abc", "1,000"]) {
    assert.throws(() => parseComplaintChartRows([{ contratista: "A", cantidad }], mapping), /entero/);
  }
});

test("valida fechas y exige columnas útiles", () => {
  assert.equal(chartDate("2026-02-30"), "");
  assert.equal(chartDate("29/02/2024"), "2024-02-29");
  assert.throws(() => parseComplaintChartRows([{ fecha: "31/02/2026" }], suggestComplaintChartMapping(["fecha"])), /fecha inválida/);
  assert.throws(() => parseComplaintChartRows([{ otra: "A" }], suggestComplaintChartMapping(["otra"])), /Selecciona/);
});
