import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function load(file, overrides = {}, extras = {}) {
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    module: loadedModule, exports: loadedModule.exports, URL, URLSearchParams, Response, ...extras,
    require(name) {
      if (name in overrides) return overrides[name];
      if (name.startsWith(".")) return load(path.resolve(path.dirname(file), `${name.replace(/\.ts$/, "")}.ts`), overrides, extras);
      return require(name);
    },
  });
  return loadedModule.exports;
}
const { buildRouteAnalytics } = load(path.join(root, "app/lib/peopleRouteAnalytics.ts"));
const filters = { from: "", to: "", contractor: "", role: "" };
const record = (overrides = {}) => ({
  id: "12345678-1234-4123-8123-123456789012", created_at: "2026-10-03T04:30:00Z", cc: "00123456",
  nombre: "Persona de prueba", cargo: "Conductor", survey_role: "conductor", contractor: "A", questionnaire_version: 1,
  answers: [{ id: "q1", question: "Texto original", answer: "si" }, { id: "q2", question: "Otra pregunta", answer: "na" }], ...overrides,
});

test("cumplimiento ponderado por respuestas; N/A y personas repetidas", () => {
  const rows = [record(), record({ id: "otro", answers: [{ id: "q1", question: "Texto original", answer: "no" }] })];
  const stats = buildRouteAnalytics(rows, filters);
  assert.equal(stats.score, 50);
  assert.equal(stats.evaluations, 2);
  assert.equal(stats.people, 1);
  assert.equal(stats.counts.na, 1);
  assert.equal(stats.questions[0].no, 1);
  assert.equal(stats.questions[0].rate, 50);
  assert.equal(buildRouteAnalytics([record({ answers: [{ id: "q1", question: "Texto", answer: "na" }] })], filters).score, null);
  assert.equal(buildRouteAnalytics([], filters).score, null);
});

test("filtros inclusivos en Colombia y versiones de preguntas separadas", () => {
  const rows = [record(), record({ id: "otro", created_at: "2026-10-03T05:00:00Z", contractor: "B", questionnaire_version: 2, answers: [{ id: "q1", question: "Texto original", answer: "no" }] })];
  assert.equal(buildRouteAnalytics(rows, { ...filters, from: "2026-10-02", to: "2026-10-02" }).evaluations, 1);
  assert.equal(buildRouteAnalytics(rows, { ...filters, contractor: "B", role: "conductor" }).score, 0);
  assert.equal(buildRouteAnalytics(rows, { ...filters, role: "auxiliar" }).evaluations, 0);
  const versions = rows.map((row, i) => ({ ...row, questionnaire_version: i + 1, answers: [{ id: "q1", question: "Texto original", answer: "no" }] }));
  assert.equal(buildRouteAnalytics(versions, filters).questions.length, 2);
});

function routeHarness() {
  const state = { session: { accessToken: "test", isPeople: true, isAdmin: false }, pages: [], calls: [] };
  const route = load(path.join(root, "app/api/people/evaluaciones-ruta/route.ts"), {
    "../../../lib/authServer": { getAuthenticatedSession: async () => state.session },
    "../../../lib/contractors": {}, "../../../lib/peopleRouteEvaluation": {},
    "../../../lib/supabaseServer": {
      supabaseRest: (table, query = "") => `https://example.test/${table}${query}`,
      supabaseReadHeaders: () => ({ Authorization: "Bearer test" }),
      supabaseAdminHeaders: () => null, supabaseUserHeaders: () => ({ Authorization: "Bearer test" }),
    },
  }, { fetch: async (url, options) => { state.calls.push({ url, options }); const page = state.pages.shift(); assert.ok(page, "Unexpected database request"); return Response.json(page.body, { status: page.status || 200 }); } });
  return { route, state };
}
const patchRequest = body => new Request("https://example.test/api/people/evaluaciones-ruta", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const editBody = () => ({ id: record().id, previousAnswers: record().answers, answers: { q1: "no", q2: "na" } });

test("lectura y edición requieren sesión y rol; valida fechas antes de consultar", async () => {
  const { route, state } = routeHarness();
  state.session = null;
  assert.equal((await route.PATCH(patchRequest(editBody()))).status, 401);
  assert.equal((await route.GET(new Request("https://example.test/?view=analytics"))).status, 401);
  state.session = { accessToken: "test", isPeople: false, isAdmin: false };
  assert.equal((await route.PATCH(patchRequest(editBody()))).status, 403);
  assert.equal((await route.GET(new Request("https://example.test/?view=history"))).status, 403);
  state.session.isPeople = true;
  assert.equal((await route.GET(new Request("https://example.test/?view=analytics&from=2026-02-30"))).status, 400);
  assert.equal(state.calls.length, 0);
});

test("edita solo respuestas, conserva texto histórico y evita sobrescribir cambios concurrentes", async () => {
  const { route, state } = routeHarness();
  state.pages = [{ body: [record()] }, { body: [{ id: record().id }] }];
  assert.equal((await route.PATCH(patchRequest(editBody()))).status, 200);
  const update = state.calls[1];
  assert.equal(update.options.method, "PATCH");
  assert.equal(new URL(update.url).searchParams.get("answers"), `eq.${JSON.stringify(record().answers)}`);
  const payload = JSON.parse(update.options.body);
  assert.deepEqual(Object.keys(payload), ["answers"]);
  assert.equal(payload.answers[0].question, "Texto original");
  assert.equal(payload.answers[0].answer, "no");
  state.pages = [{ body: [record({ answers: [] })] }];
  assert.equal((await route.PATCH(patchRequest(editBody()))).status, 409);
  state.pages = [{ body: [record()] }, { body: [] }];
  assert.equal((await route.PATCH(patchRequest(editBody()))).status, 409);
  state.pages = [{ body: [record()] }];
  assert.equal((await route.PATCH(patchRequest({ ...editBody(), answers: { q1: "tal vez", q2: "na" } }))).status, 400);
});

test("historial paginado y Excel preservan todas las evaluaciones y las cédulas como texto", async () => {
  const { route, state } = routeHarness();
  state.pages = [{ body: Array.from({ length: 26 }, () => record()) }];
  const history = await (await route.GET(new Request("https://example.test/?view=history&cc=00123456&offset=25"))).json();
  assert.equal(history.records.length, 25); assert.equal(history.hasMore, true);
  assert.equal(new URL(state.calls[0].url).searchParams.get("cc"), "eq.00123456");
  state.pages = [{ body: Array.from({ length: 500 }, () => record()) }, { body: [record()] }, { body: [] }];
  const response = await route.GET(new Request("https://example.test/?export=excel"));
  assert.equal(response.status, 200);
  const XLSX = require("xlsx");
  const book = XLSX.read(await response.arrayBuffer(), { type: "array" });
  const rows = XLSX.utils.sheet_to_json(book.Sheets.Evaluaciones);
  assert.equal(rows.length, 501);
  assert.equal(rows[0]["Cédula"], "00123456");
});
