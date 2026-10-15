import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function compile(path, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(name => { if (name in mocks) return mocks[name]; throw new Error(name); }, loaded, loaded.exports);
  return loaded.exports;
}

const contractors = compile("./contractors.ts");
const { buildModulationAdherence, isRejectedForModulation, preferredModulationAdherenceReports, summarizeModulationAdherence } = compile("./modulationAdherence.ts", { "./contractors": contractors });

const row = (client, status = "DEFINITELY_RETURNED", dt = "S8001") => ({ id: `${dt}-${client}`, dt, tourDisplayId: dt, driverName: "Ana", pocExternalId: client, pocName: `Cliente ${client}`, status });
const report = (contractor, date, rows, kind = "closure") => ({ contractor, operationalDate: date, rows, kind, uploadedAt: `${date}T12:00:00Z` });
const modulation = (contractor, date, client, dt = "8001") => ({ contratista: contractor, fechaDespacho: date, dt, codigoCliente: client, createdAt: `${date}T15:00:00Z` });

test("un rechazado modulado cumple y uno sin modulacion queda pendiente", () => {
  const result = buildModulationAdherence(
    [report("Logisticos", "2026-10-13", [row("00123"), row("456")])],
    [modulation("Logisticos", "2026-10-13", "123")],
  );
  assert.deepEqual(result.daily[0], { contractor: "Logisticos", date: "2026-10-13", rejected: 2, modulated: 1, pending: 1, percentage: 50 });
  assert.equal(result.details.filter(item => item.modulated).length, 1);
});

test("solo evalua estados rechazados de BEES y evita duplicados por DT y cliente", () => {
  const rows = [row("1", "CONCLUDED"), row("2", "WAITING_MODULATION"), row("2", "WAITING_MODULATION"), row("3", "PARTIAL_DELIVERY")];
  const result = buildModulationAdherence([report("Surti Cervezas", "2026-10-13", rows)], []);
  assert.equal(result.daily[0].rejected, 2);
  assert.equal(result.daily[0].pending, 2);
  assert.equal(isRejectedForModulation("Rechazado"), true);
});

test("el cierre reemplaza el archivo actual del mismo dia", () => {
  const current = report("HL Logistica", "2026-10-13", [row("1")], "current");
  const closure = report("HL Logisticos", "2026-10-13", [row("1"), row("2")], "closure");
  assert.equal(preferredModulationAdherenceReports([current, closure]).length, 1);
  assert.equal(buildModulationAdherence([current, closure], []).daily[0].rejected, 2);
});

test("calcula el promedio de los porcentajes diarios por contratista", () => {
  const reports = [
    report("Logisticos", "2026-10-12", [row("1"), row("2")]),
    report("Logisticos", "2026-10-13", [row("3"), row("4")]),
  ];
  const modulations = [modulation("Logisticos", "2026-10-12", "1"), modulation("Logisticos", "2026-10-13", "3"), modulation("Logisticos", "2026-10-13", "4")];
  const summary = summarizeModulationAdherence(buildModulationAdherence(reports, modulations).daily).find(item => item.contractor === "Logisticos");
  assert.equal(summary.dailyAverage, 75);
  assert.equal(summary.modulated, 3);
  assert.equal(summary.pending, 1);
});
