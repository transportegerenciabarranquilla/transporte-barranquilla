import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import * as XLSX from "xlsx";

function compile(path, mocks) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)((name) => {
    if (name in mocks) return mocks[name];
    throw new Error(`Dependencia sin simular: ${name}`);
  }, loaded, loaded.exports);
  return loaded.exports;
}

const utils = compile("../utils.ts", {});
const records = compile("./vehicleRecords.ts", {
  xlsx: XLSX,
  "../../lib/seguimientoPersistence": { preserveSeguimientoFields: (next) => next },
  "../../lib/asistenciaStorage": { readAsistenciaRegistros: () => [] },
  "../../lib/checkinStorage": { readCheckinCajasRegistros: () => [], getCheckinByDt: () => undefined },
  "../../lib/modulacionStorage": {
    getLocalDateKey: (date = new Date()) => date.toLocaleDateString("en-CA", { timeZone: "America/Bogota" }),
    normalizeDt: String,
    readModulacionRegistros: () => [],
    getModulacionesByDt: () => [],
    summarizeModulaciones: () => ({}),
  },
  "../../lib/seguimientoStorage": {},
  "../utils": utils,
  "../../lib/structuralSharing": { shareRecordsByKey: (_current, next) => next },
});

function fileFromRows(rows, bookType = "xlsx") {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Logisticos");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType });
  return { arrayBuffer: async () => buffer };
}

const headers = ["centro\u00a0", "transporte", "placa", "cod transportista", "fecha dt", "salida\u00a0", "tiempo planeado", "cajas", "hl", "peso", "clientes", "transportista\u00a0", "viaje", "", ""];
const template = [
  headers,
  ["AV76", "8008996381", "COVEL589", "487575", "4/10/2026", "5/10/2026", "10:23:00", "541,000", "50,708", "9.300,097", 27, "logisticos", "1 LOG"],
  ["AV76", "8008996360", "COLCM498", "487575", "5/10/2026", "5/10/2026", "09:28:00", "556,325", "50,458", "9.114,825", 18, "logisticos", "1 LOG"],
  ...Array.from({ length: 10 }, () => ["AV76", "\u00a0", "", "", "", "", "\u00a0"]),
];

for (const format of ["xlsx", "csv"]) {
  test(`plantilla de Logisticos (${format}): fechas colombianas, decimales y filas vacias`, async () => {
    const imported = await records.parseSeguimientoFile(fileFromRows(template, format), []);
    assert.equal(imported.length, 2);
    assert.equal(imported[0].centro, "AV76");
    assert.equal(imported[0].transporte, "8008996381");
    assert.equal(imported[0].transportista, "logisticos");
    assert.equal(imported[0].fechaDt, "2026-10-04");
    assert.equal(imported[0].fechaDespacho, "2026-10-05");
    assert.equal(imported[0].clasificacionOnTime, "No On Time");
    assert.equal(imported[1].clasificacionOnTime, "On Time");
    assert.equal(imported[0].cajas, 541);
    assert.equal(imported[1].cajas, 556.325);
    assert.equal(imported[0].hl, 50.708);
    assert.equal(imported[0].peso, 9300.097);
    assert.equal(imported[0].clientes, 27);
    assert.equal(imported[0].tiempoPlaneado, "10:23:00");
  });
}

test("reimportar envia solo las rutas de la plantilla y conserva IDs y correcciones", async () => {
  const imported = await records.parseSeguimientoFile(fileFromRows(template), []);
  const previous = {
    ...imported[0], recordId: "seguimiento:logisticos:ruta-existente", clientes: 30,
    clientesUpdatedAt: "2026-10-05T12:00:00Z", visitados: 7, visitadosUpdatedAt: "2026-10-05T13:00:00Z",
    capacidad: 10000,
  };
  const history = Array.from({ length: 2000 }, (_, index) => ({ ...previous, transporte: `historico-${index}`, recordId: `historico-${index}`, fechaDespacho: "2026-10-03" }));
  const current = [...history, previous];
  const prepared = records.prepareSeguimientoImport(current, imported);
  assert.equal(prepared.length, 2);
  assert.equal(prepared[0].recordId, previous.recordId);
  assert.equal(prepared[0].clientes, 30);
  assert.equal(prepared[0].visitados, 7);
  assert.equal(prepared[0].capacidad, 10000);
  assert.equal(current.length, 2001);
});

test("fechas ISO conservan el dia y fecha despacho tiene prioridad sobre salida", async () => {
  const imported = await records.parseSeguimientoFile(fileFromRows([
    ["transporte", "placa", "fecha dt", "salida", "fecha despacho"],
    ["8008996381", "COVEL589", "2026-10-04", "2026-10-05", "2026-10-06"],
  ]), []);
  assert.equal(imported[0].fechaDt, "2026-10-04");
  assert.equal(imported[0].fechaDespacho, "2026-10-06");
});

test("guardado parcial conserva el historial en cache y explica errores sin JSON", async () => {
  const store = compile("../../lib/remoteStore.ts", {
    "./storageEvents": { notifyStorageChange: () => {} },
    "./seguimientoPersistence": {},
    "./structuralSharing": {},
    "./sessionCacheRevision": {},
  });
  const originalFetch = globalThis.fetch;
  const imported = await records.parseSeguimientoFile(fileFromRows(template), []);
  const history = { ...imported[0], recordId: "historial", fechaDespacho: "2026-10-03" };
  const getKey = (record) => record.recordId;
  try {
    globalThis.fetch = async () => Response.json({ records: [history] });
    await store.saveRemoteRecords("/api/seguimiento", [history], { mergeByKey: getKey });
    const prepared = records.prepareSeguimientoImport([history], imported);
    globalThis.fetch = async (_url, options) => {
      assert.equal(JSON.parse(options.body).records.length, 2);
      return Response.json({ records: prepared });
    };
    const saved = await store.saveRemoteRecords("/api/seguimiento", prepared, { mergeByKey: getKey });
    assert.equal(saved.length, 2);
    assert.equal(store.readCachedRemoteRecords("/api/seguimiento").length, 3);
    for (const [status, message] of [[413, /tamaño permitido/], [504, /agotó el tiempo/], [502, /HTTP 502/]]) {
      globalThis.fetch = async () => new Response("Error del servidor", { status });
      await assert.rejects(store.saveRemoteRecords("/api/seguimiento", prepared, { mergeByKey: getKey }), message);
      assert.equal(store.readCachedRemoteRecords("/api/seguimiento").length, 3);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
