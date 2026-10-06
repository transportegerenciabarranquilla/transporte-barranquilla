import test from "node:test";
import assert from "node:assert/strict";
import { complaintClosureTotals, complaintStatusTotals } from "./complaintCharts.ts";
import { chartDate, complaintAccumulation, complaintLastThreeDays, complaintToday, complaintWeekdays, groupComplaintChart, parseComplaintChartRows, suggestComplaintChartMapping, type ComplaintChartRow } from "./complaintCharts.ts";

const datedRow = (date: string, count: number): ComplaintChartRow => ({ date, count, contractor: "Logisticos", status: "Abierta", issue: "Entrega" });

test("cierre en 48 horas incluye el límite, pondera cantidades y excluye datos inválidos", () => {
  const closed = (closedAt: string, count: number): ComplaintChartRow => ({ ...datedRow("2026-09-01", count), status: "Cerrada", openedAt: "2026-09-01T08:00:00-05:00", closedAt });
  const rows = [closed("2026-09-03T13:00:00Z", 3), closed("2026-09-03T13:00:01Z", 1), closed("", 4), closed("2026-08-31T08:00:00-05:00", 2), { ...closed("2026-09-02T08:00:00-05:00", 99), status: "Abierta" }];
  assert.deepEqual(complaintClosureTotals(rows), { within48: 3, after48: 1, missing: 6, estimated: 0, evaluated: 4, percentage: 75 });
  assert.equal(complaintClosureTotals([]).percentage, 0);
});

test("importa fecha de cierre y declara estimación si no hay horas", () => {
  const mapping = suggestComplaintChartMapping(["Estado", "Fecha creación", "Fecha de cierre"]);
  const rows = parseComplaintChartRows([
    { Estado: "Cerrada", "Fecha creación": "01/09/2026", "Fecha de cierre": "03/09/2026" },
    { Estado: "Cerrada", "Fecha creación": "01/09/2026", "Fecha de cierre": "04/09/2026" },
    { Estado: "Cerrada", "Fecha creación": "01/09/2026", "Fecha de cierre": "31/02/2026" },
  ], mapping);
  assert.deepEqual(complaintClosureTotals(rows), { within48: 1, after48: 1, missing: 1, estimated: 2, evaluated: 2, percentage: 50 });
  const exact = parseComplaintChartRows([{ Estado: "Cerrada", "Fecha creación": "01/09/2026 10:30", "Fecha de cierre": "03/09/2026 10:31" }], mapping);
  assert.equal(complaintClosureTotals(exact).after48, 1);
  assert.equal(complaintClosureTotals(exact).estimated, 0);
});

test("el resumen reconcilia cerradas, abiertas y estados desconocidos por cantidad", () => {
  const rows = [
    { ...datedRow("2026-09-01", 3), status: "CERRADDO" },
    { ...datedRow("2026-09-02", 2), status: "ABIERTO" },
    { ...datedRow("2026-09-02", 7), status: "" },
    { ...datedRow("2026-09-02", 1), status: "En revisión" },
  ];
  assert.deepEqual(complaintStatusTotals(rows), { total: 13, closed: 3, open: 2, unknown: 8 });
  assert.deepEqual(complaintStatusTotals(rows.filter(row => row.date === "2026-09-01")), { total: 3, closed: 3, open: 0, unknown: 0 });
  assert.deepEqual(complaintStatusTotals([]), { total: 0, closed: 0, open: 0, unknown: 0 });
});

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

test("reconoce el reporte de novedades y usa ingreso, sin contar ticket ni código como cantidad", () => {
  const headers = ["Ticket", "CODIGO", "NOMBRE DE CLIENTE", "FECHA DE CIERRE DE LA NOVEDAD", "FECHA DE INGRESO DE LA NOVEDAD", "NOVEDAD", "DT", "PLACA", "RR", "TRANSPORTISTA", "ADJUDICABLE / NO ADJUDICABLE", "ESTATUS", "OBSERVACIÓN"];
  const mapping = suggestComplaintChartMapping(headers);
  assert.deepEqual(mapping, { contractor: "TRANSPORTISTA", date: "FECHA DE INGRESO DE LA NOVEDAD", status: "ESTATUS", issue: "NOVEDAD", count: "", closedDate: "FECHA DE CIERRE DE LA NOVEDAD", dt: "DT", client: "NOMBRE DE CLIENTE", clientCode: "CODIGO", complaintId: "Ticket", rr: "RR", plate: "PLACA", adjudicable: "ADJUDICABLE / NO ADJUDICABLE", observation: "OBSERVACIÓN" });
  const rows = parseComplaintChartRows(["CERRADO", "CERRDADO", "CERRDAO", "CERRADDO", ""].map(ESTATUS => ({
    Ticket: "4626545", CODIGO: "13992746", "FECHA DE INGRESO DE LA NOVEDAD": "1/09/2026",
    "FECHA DE CIERRE DE LA NOVEDAD": "2/09/2026", NOVEDAD: "Producto faltante", TRANSPORTISTA: "LOGISTICOS", ESTATUS,
  })), mapping);
  assert.equal(rows.reduce((sum, row) => sum + row.count, 0), 5);
  assert.ok(rows.every(row => row.date === "2026-09-01"));
  assert.deepEqual(groupComplaintChart(rows, "status"), [{ label: "Cerrada", count: 4 }, { label: "Sin estado", count: 1 }]);
  assert.equal(parseComplaintChartRows([{
    TRANSPORTISTA: "LOGISTICOS", "FECHA DE INGRESO DE LA NOVEDAD": "9/14/2026",
  }], mapping)[0].date, "2026-09-14");
});

test("acepta fechas mixtas inequívocas y permite elegir el orden de las ambiguas", () => {
  assert.equal(chartDate("9/14/2026"), "2026-09-14");
  assert.equal(chartDate("14/9/2026", "mdy"), "2026-09-14");
  assert.equal(chartDate("9/10/2026"), "2026-10-09");
  assert.equal(chartDate("9/10/2026", "mdy"), "2026-09-10");
  assert.equal(chartDate("2026-09-01", "mdy"), "2026-09-01");
  for (const date of ["2/30/2026", "30/2/2026", "14/14/2026", "0/9/2026"]) assert.equal(chartDate(date), "");
  const mapping = suggestComplaintChartMapping(["fecha"]);
  assert.deepEqual(parseComplaintChartRows([{ fecha: "1/09/2026" }, { fecha: "9/14/2026" }, { fecha: "9/10/2026" }], mapping).map(row => row.date), ["2026-09-01", "2026-09-14", "2026-10-09"]);
  assert.equal(parseComplaintChartRows([{ fecha: "9/10/2026" }], mapping, "mdy")[0].date, "2026-09-10");
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
