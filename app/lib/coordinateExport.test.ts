import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { coordinateExportSheet } from "./coordinateExport.ts";
import type { CoordinateRecord } from "./coordinateRecords.ts";

const row: CoordinateRecord = {
  id: 84, ruta: "Hogar Emma Celeste", tipo: "001234", descripcion: "", activo: true,
  codigoCliente: "0014487449", contratista: "Surti Cervezas", nombreRr: "Responsable",
  latitud: 10.4900236, longitud: -75.1305434, createdAt: "2026-10-02T18:57:00Z",
};

test("Excel exports coordinates as text with decimal points and keeps original precision in the map link", () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, coordinateExportSheet([row], XLSX), "Ubicaciones");
  const result = XLSX.read(XLSX.write(book, {type: "buffer", bookType: "xlsx"}), {type: "buffer", cellNF: true}).Sheets.Ubicaciones;
  assert.equal(result.H2.t, "s");
  assert.equal(result.I2.t, "s");
  assert.equal(result.H2.z, "@");
  assert.equal(result.I2.z, "@");
  assert.equal(result.H2.v, "10.490024");
  assert.equal(result.I2.v, "-75.130543");
  assert.equal(result.H2.w, "10.490024");
  assert.equal(result.I2.w, "-75.130543");
  assert.equal(result.E2.v, "001234");
  assert.equal(result.F2.v, "0014487449");
  assert.equal(result.B2.t, "n");
  assert.equal(result.B2.w, "02/10/2026");
  assert.equal(result.J2.v, "13:57:00");
  assert.equal(result.K2.v, "10.490024, -75.130543");
  assert.equal(new URL(result.L2.l!.Target!).searchParams.get("query"), "10.4900236,-75.1305434");
});

test("export keeps the selected rows and order, handles missing dates and Bogota midnight", () => {
  const sheet = coordinateExportSheet([{...row, id: 8, createdAt: "2026-10-02T03:00:00Z"}, {...row, id: 7, createdAt: ""}], XLSX);
  assert.equal(sheet["!ref"], "A1:L3");
  assert.equal(sheet.A2.v, 8);
  assert.equal(sheet.A3.v, 7);
  assert.equal(XLSX.utils.format_cell(sheet.B2), "01/10/2026");
  assert.equal(sheet.J2.v, "22:00:00");
  assert.equal(sheet.B3.v, "");
  assert.equal(sheet.J3.v, "");
});
