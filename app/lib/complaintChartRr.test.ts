import test from "node:test";
import assert from "node:assert/strict";
import { complaintRrGroups } from "./complaintChartRr.ts";
import { parseComplaintChartRows, suggestComplaintChartMapping } from "./complaintCharts.ts";

test("cruza el DT del archivo con RR, contratista y fecha, conservando quejas sin cruce", () => {
  const rows = parseComplaintChartRows([
    { Transportista: "LOGISTICOS", Fecha: "01/09/2026", DT: "DT-008008991476", Cantidad: "3" },
    { Transportista: "LOGISTICOS", Fecha: "02/09/2026", DT: "8008991476", Cantidad: "2" },
    { Transportista: "LOGISTICOS", Fecha: "01/09/2026", DT: "999", Cantidad: "1" },
  ], suggestComplaintChartMapping(["Transportista", "Fecha", "DT", "Cantidad"]));
  const result = complaintRrGroups(rows, [
    { transporte: "8008991476", transportista: "Logisticos", fechaDespacho: "2026-09-01", nombreResponsable: "Ana", cedulaResponsable: "123" },
    { transporte: "8008991476", transportista: "Logisticos", fechaDespacho: "2026-09-02", nombreResponsable: "Luis", cedulaResponsable: "456" },
    { transporte: "8008991476", transportista: "Logisticos Arenosa", fechaDespacho: "2026-09-01", nombreResponsable: "Otro RR", cedulaResponsable: "789" },
  ]);
  assert.deepEqual(result.values.map(({ label, count, dts }) => ({ label, count, dts })), [{ label: "Ana", count: 3, dts: ["8008991476"] }, { label: "Luis", count: 2, dts: ["8008991476"] }, { label: "Sin RR identificado", count: 1, dts: ["999"] }]);
  assert.equal(result.unmatched, 1);
  assert.deepEqual(result.values[0].complaints, [rows[0]]);
});

test("no asigna RR arbitrario si un DT tiene dos responsables para la misma fecha", () => {
  const row = { contractor: "Logisticos", date: "2026-09-01", dt: "123", status: "Abierta", issue: "Entrega", count: 1 };
  const vehicles = ["Ana", "Luis"].map(nombreResponsable => ({ transporte: "123", transportista: "Logisticos", fechaDespacho: "2026-09-01", nombreResponsable }));
  assert.equal(complaintRrGroups([row], vehicles).unmatched, 1);
  assert.equal(complaintRrGroups([{ ...row, rr: "RR guardado", rrId: "12" }], []).values[0].label, "RR guardado");
});

test("conserva clientes y quejas de todos los DT del RR sin mostrar la cédula", () => {
  const source = [
    { DT: "123", Cliente: "Tienda Uno", Codigo: "001", Ticket: "Q1", Novedad: "Faltante", Transportista: "Logisticos" },
    { DT: "456", Cliente: "Tienda Dos", Codigo: "002", Ticket: "Q2", Novedad: "No entregado", Transportista: "Logisticos" },
  ];
  const rows = parseComplaintChartRows(source, suggestComplaintChartMapping(Object.keys(source[0])));
  const result = complaintRrGroups(rows, ["123", "456"].map(transporte => ({ transporte, transportista: "Logisticos", nombreResponsable: "Ana", cedulaResponsable: "9999" })));
  assert.equal(result.values.length, 1);
  assert.equal(result.values[0].label, "Ana");
  assert.deepEqual(result.values[0].dts, ["123", "456"]);
  assert.deepEqual(result.values[0].complaints.map(row => [row.client, row.clientCode, row.complaintId, row.issue]), [["Tienda Uno", "001", "Q1", "Faltante"], ["Tienda Dos", "002", "Q2", "No entregado"]]);
});
