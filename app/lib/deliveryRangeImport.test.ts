import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseDeliveryRangeRows, suggestDeliveryRangeMapping, summarizeDeliveryRange } from "./deliveryRangeImport.ts";

test("reads XLSX and XLS deliveries and keeps separate drivers for the same RR", () => {
  const source = [["Responsable", "Nombre del conductor", "Entrega en rango"], ["RR01", "Ana", "Sí"], ["rr01", " ANA ", "Fuera de rango"], ["RR01", "Ana", ""], ["RR01", "Luis", 1], ["RR02", "Luz", false]];
  for (const bookType of ["xlsx", "xls"] as const) {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(source), "Entregas");
    const loaded = XLSX.read(XLSX.write(book, { type: "buffer", bookType }), { type: "buffer" });
    const data = XLSX.utils.sheet_to_json<unknown[]>(loaded.Sheets.Entregas, { header: 1, raw: true, defval: "", blankrows: true });
    const rows = parseDeliveryRangeRows(data, suggestDeliveryRangeMapping(data[0]));
    const summaries = summarizeDeliveryRange(rows);
    assert.equal(summaries.length, 3);
    assert.deepEqual(summaries.map(({ total, inRange, outOfRange, unvalidated, percentage }) => ({ total, inRange, outOfRange, unvalidated, percentage })), [
      { total: 3, inRange: 1, outOfRange: 1, unvalidated: 1, percentage: 50 },
      { total: 1, inRange: 1, outOfRange: 0, unvalidated: 0, percentage: 100 },
      { total: 1, inRange: 0, outOfRange: 1, unvalidated: 0, percentage: 0 },
    ]);
  }
});

test("uses manually selected columns and preserves Excel row numbers around blank rows", () => {
  const data = [["Estado", "Persona", "Ruta"], ["Pendiente", "Ana", "RR01"], [], [0, "Luis", "RR02"]];
  const rows = parseDeliveryRangeRows(data, { range: 0, conductor: 1, rr: 2 });
  assert.equal(rows[1].fila, 4);
  assert.equal(rows[1].inRange, false);
  assert.equal(summarizeDeliveryRange(rows)[0].percentage, null);
});

test("rejects missing or duplicate mappings and incomplete identities", () => {
  const data = [["RR", "Conductor", "En rango"], ["RR01", "Ana", "Sí"]];
  assert.throws(() => parseDeliveryRangeRows(data, { rr: -1, conductor: 1, range: 2 }), /Selecciona/);
  assert.throws(() => parseDeliveryRangeRows(data, { rr: 0, conductor: 0, range: 2 }), /distintas/);
  assert.throws(() => parseDeliveryRangeRows([data[0], ["RR01", "", "Sí"]], { rr: 0, conductor: 1, range: 2 }), /Fila 2/);
});

test("does not interpret percentages, distances or unknown statuses as range flags", () => {
  for (const value of [0.5, 50, "1%", "0%", "50 metros", "otro", "-1"]) {
    assert.throws(() => parseDeliveryRangeRows([["RR", "Conductor", "En rango"], ["RR01", "Ana", value]], { rr: 0, conductor: 1, range: 2 }), /Fila 2/);
  }
});
