import assert from "node:assert/strict";
import test from "node:test";
import { compareRangeClients, detectComparisonSheet, parseComparisonClients, suggestComparisonMapping } from "./clientRangeComparison.ts";
import type { ClientRangeSummary } from "./clientRangeSummary";

const appRow = (code: string, contractor: string) => ({ code, contractor, name: "Tienda", attentions: 3, outside: 1, inside: 2, refusal: 5 }) as ClientRangeSummary;

test("detecta automáticamente hoja y encabezados después de un título", () => {
  const result = detectComparisonSheet([
    { name: "Instrucciones", rows: [["Cómo usar este archivo"], ["Información"]] },
    { name: "Clientes", rows: [["Lista comercial"], [], ["Código SAP", "Nombre cliente", "Contratista"], ["00123", "Tienda", "A"], ["00123", "Tienda", "A"], ["", "Sin código", "A"]] },
  ]);
  assert.equal(result.sheetName, "Clientes");
  assert.equal(result.clients[0].code, "00123");
  assert.deepEqual(result.clients[0].sourceRows, [4, 5]);
  assert.equal(result.duplicates, 1);
  assert.equal(result.skipped, 1);
});

test("salta hojas vacías y da instrucciones claras para códigos ausentes o ambiguos", () => {
  assert.equal(detectComparisonSheet([{name:"Vacia",rows:[["Código cliente"]]}, {name:"Datos",rows:[["ID cliente"],["42"]]}]).sheetName, "Datos");
  assert.throws(() => detectComparisonSheet([{name:"Datos",rows:[["Nombre"],["Tienda"]]}]), /encabezado/);
  assert.throws(() => detectComparisonSheet([{name:"Datos",rows:[["Código cliente", "Código SAP"],["42","99"]]}]), /varias columnas/);
});

test("sugiere columnas, preserva ceros, agrupa duplicados y cuenta códigos vacíos", () => {
  const matrix = [["Código cliente", "Nombre", "Contratista"], ["00123", "Tienda", "A"], [" 00123 ", "Tienda", "A"], ["", "Sin código", "A"], ["", "", ""], ["123", "Otra", "A"]];
  const mapping = suggestComparisonMapping(matrix[0]);
  assert.deepEqual(mapping, { code: 0, name: 1, contractor: 2 });
  const result = parseComparisonClients(matrix, mapping);
  assert.equal(result.skipped, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.clients.length, 2);
  assert.equal(result.clients[0].code, "00123");
  assert.deepEqual(result.clients[0].sourceRows, [2, 3]);
  const compared = compareRangeClients(result.clients, [appRow("00123", "A")]);
  assert.equal(compared[0].status, "found");
  assert.equal(compared[1].status, "missing");
});

test("el mismo código en varias contratistas conserva indicadores independientes", () => {
  const data = parseComparisonClients([["codigo"], ["42"], ["99"]], { code: 0, name: -1, contractor: -1 });
  const app = [appRow("42", "A"), appRow("42", "B")];
  const compared = compareRangeClients(data.clients, app);
  assert.equal(compared[0].status, "multiple");
  assert.deepEqual(compared[0].matches, app);
  assert.equal(compared[1].status, "missing");
  assert.deepEqual(compared[1].matches, []);
  assert.equal(compareRangeClients(data.clients, [app[0]])[0].status, "found");
});

test("contratista opcional restringe coincidencias y admite normalización central", () => {
  const data = parseComparisonClients([["codigo", "contratista"], ["42", "Logísticos"], ["42", "Sin coincidencia"]], { code: 0, contractor: 1, name: -1 });
  const compared = compareRangeClients(data.clients, [appRow("42", "Logisticos"), appRow("42", "B")]);
  assert.equal(compared[0].matches.length, 1);
  assert.equal(compared[1].status, "missing");
  const alias = compareRangeClients([{ ...data.clients[0], contractor: "alias" }], [appRow("42", "A")], value => value === "alias" ? "A" : value);
  assert.equal(alias[0].status, "found");
});

test("rechaza mapeos incompletos o repetidos y listas sin códigos", () => {
  assert.throws(() => parseComparisonClients([["codigo"], ["42"]], { code: -1, name: -1, contractor: -1 }), /código/);
  assert.throws(() => parseComparisonClients([["codigo"], ["42"]], { code: 0, name: 0, contractor: -1 }), /diferente/);
  assert.throws(() => parseComparisonClients([["codigo"], [""]], { code: 0, name: -1, contractor: -1 }), /válidos/);
});
