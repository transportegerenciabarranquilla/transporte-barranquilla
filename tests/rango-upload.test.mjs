import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
import { gunzipSync, gzipSync } from "node:zlib";
const require = createRequire(import.meta.url);
function compile(path) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(require, loaded, loaded.exports);
  return loaded.exports;
}
const { encodeRangeUpload } = compile("../app/lib/rangeUpload.ts");
const { readRangeUpload, rangeUploadResponse } = compile("../app/lib/rangeUploadServer.ts");
test("reporte mayor de 5 MB viaja comprimido sin perder filas ni datos", async () => {
  const report = { records: [{ contractor: "Logisticos", rows: Array.from({ length: 25000 }, (_, id) => ({
    id: String(id), dt: String(800000 + id), pocExternalId: String(id), pocName: `Cliente ${id}`,
    status: "CONCLUDED", withinRadius: false, outOfRadiusReason: "Posición incorrecta", driverName: "Conductor de la ruta", truckLicensePlate: "ABC123",
  })) }] };
  const json = JSON.stringify(report);
  assert.ok(Buffer.byteLength(json) > 5_000_000);
  const encoded = await encodeRangeUpload(json);
  assert.equal(encoded.contentType, "application/gzip");
  assert.ok(encoded.body.size < 4_000_000);
  const request = new Request("https://example.test", { method: "PUT", headers: { "Content-Type": encoded.contentType }, body: encoded.body });
  assert.deepEqual(await readRangeUpload(request), report);
  const response = rangeUploadResponse(report, request);
  assert.equal(response.headers.get("Content-Encoding"), "gzip");
  assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString()), report);
});
test("cargas pequeñas conservan el formato JSON", async () => {
  const encoded = await encodeRangeUpload('{"records":[]}');
  assert.equal(encoded.contentType, "application/json");
  assert.deepEqual(await readRangeUpload(new Request("https://example.test", { method: "PUT", body: encoded.body, headers: { "Content-Type": encoded.contentType } })), { records: [] });
});
test("rechaza compresión dañada y contenido que excede el límite descomprimido", async () => {
  const request = body => new Request("https://example.test", { method: "PUT", headers: { "Content-Type": "application/gzip" }, body });
  await assert.rejects(readRangeUpload(request("invalid")), /no es válido/);
  await assert.rejects(readRangeUpload(request(gzipSync(Buffer.alloc(65 * 1024 * 1024, 32)))), /64 MB/);
});
