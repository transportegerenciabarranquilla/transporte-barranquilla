import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { complaintChartExcelRows, importComplaintChartWorkbook } from "./complaintChartExcel.ts";
import { complaintClosureCategory, complaintClosureTotals, parseComplaintChartRows, suggestComplaintChartMapping } from "./complaintCharts.ts";

test("importa causal, DT y RR y el detalle coincide con Más de 48 h", () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Ticket", "TRANSPORTISTA", "FECHA DE INGRESO DE LA NOVEDAD", "FECHA DE CIERRE DE LA NOVEDAD", "ESTATUS", "NOVEDAD", "CAUSAL", "DT", "RR", "NOMBRE DE CLIENTE"],
    ["4638107", "LOGISTICOS", "4/09/2026", "7/09/2026", "CERRADO", "Saldo a favor", "Ausentismo del responsable", "8008916262", "SERGIO DE LA CRUZ", "Inversiones Devo"],
    ["4634053", "LOGISTICOS", "5/09/2026", "5/09/2026", "CERRADO", "Saldo", "", "8008926552", "Responsable", "La Gran Esquina"],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Quejas");
  const { rows } = importComplaintChartWorkbook(book);
  assert.equal(rows[0].causal, "Ausentismo del responsable");
  assert.equal(rows[0].dt, "8008916262");
  assert.equal(rows[0].rr, "SERGIO DE LA CRUZ");
  assert.equal(rows[0].client, "Inversiones Devo");
  assert.equal(complaintClosureCategory(rows[0]), "after48");
  assert.equal(complaintClosureCategory(rows[1]), "within48");
  assert.equal(rows.filter(row => complaintClosureCategory(row) === "after48").length, complaintClosureTotals(rows).after48);
});

test("conserva horas de Excel para distinguir un cierre que excede 48 horas", () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Estado", "Fecha creación", "Fecha de cierre"],
    ["Cerrada", 46266 + 10 / 24, 46268 + 10 / 24 + 1 / 1440],
  ]);
  sheet.B2.z = sheet.C2.z = "dd/mm/yyyy hh:mm";
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Quejas");
  const { rows } = importComplaintChartWorkbook(book);
  assert.equal(rows[0].openedAt, "2026-09-01T10:00:00-05:00");
  assert.equal(rows[0].closedAt, "2026-09-03T10:01:00-05:00");
});

test("genera datos automáticamente desde la primera hoja de quejas y omite portadas", () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Portada"], ["Reporte"]]), "Portada");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["TRANSPORTISTA", "ESTATUS", "FECHA DE INGRESO DE LA NOVEDAD", "NOVEDAD"],
    ["LOGISTICOS", "CERRADO", "9/14/2026", "Entrega"],
    ["LOGISTICOS", "ABIERTO", "15/09/2026", "Faltante"],
  ]), "Quejas");
  const result = importComplaintChartWorkbook(book);
  assert.equal(result.name, "Quejas");
  assert.deepEqual(result.rows.map(row => [row.status, row.date, row.count]), [["Cerrada", "2026-09-14", 1], ["Abierta", "2026-09-15", 1]]);
  assert.throws(() => importComplaintChartWorkbook(XLSX.utils.book_new()), /No se encontró/);
  book.Sheets.Quejas.C2 = { t: "s", v: "31/02/2026" };
  assert.throws(() => importComplaintChartWorkbook(book), /fecha inválida/);
});

test("importa fechas Excel con formato de año corto o personalizado, conservando identificadores", () => {
  for (const format of ["m/d/yy", "dd/mm/yyyy", "d-mmm-yy"]) {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Ticket", "FECHA DE INGRESO DE LA NOVEDAD", "TRANSPORTISTA"],
      [4626545, 46266, "LOGISTICOS"],
    ]);
    sheet.B2.z = format;
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Datos");
    const read = XLSX.read(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), { type: "buffer", cellNF: true });
    const original = { ...read.Sheets.Datos.B2 };
    const rows = complaintChartExcelRows(read, "Datos");
    assert.equal(rows[0].Ticket, "4626545");
    assert.equal(rows[0]["FECHA DE INGRESO DE LA NOVEDAD"], "2026-09-01");
    assert.equal(parseComplaintChartRows(rows, suggestComplaintChartMapping(Object.keys(rows[0])))[0].date, "2026-09-01");
    assert.deepEqual(read.Sheets.Datos.B2, original);
  }
});

test("respeta el calendario 1904 y conserva fechas de texto para validación", () => {
  const sheet = XLSX.utils.aoa_to_sheet([["fecha"], [44804], ["31/02/2026"], [""]]);
  sheet.A2.z = "m/d/yy";
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Datos");
  book.Workbook = { WBProps: { date1904: true } };
  const rows = complaintChartExcelRows(book, "Datos");
  assert.equal(rows[0].fecha, "2026-09-01");
  assert.equal(rows[1].fecha, "31/02/2026");
});
