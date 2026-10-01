/* eslint-disable @typescript-eslint/no-require-imports -- El arnés CommonJS carga TypeScript y sustituye las dependencias de servidor sin acceder a Supabase. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (loaded, filename) => loaded._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
const session = { isPeople: true, isAdmin: false, userId: "people-user", accessToken: "test-token" };
const person = { CC: "12345678", NOMBRE: "Persona de prueba", CARGO: "Conductor", CONTRATISTA: "Logisticos" };
const id = "12345678-1234-4123-8123-123456789012";
const questions = require("../../../lib/peopleRouteQuestions.ts").PEOPLE_ROUTE_QUESTIONS.conductor.questions;
const answers = Object.fromEntries(questions.map(question => [question.id, "si"]));
const personKey = JSON.stringify([person.CC, person.NOMBRE, person.CARGO, person.CONTRATISTA]);
const request = (body) => new Request("http://localhost/api/people/evaluaciones-ruta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const payload = { id, cc: person.CC, personKey, answers };

function routeFor(auth, responses = []) {
  const calls = [];
  const mockedRequire = (name) => {
    if (name.endsWith("/authServer")) return { getAuthenticatedSession: async () => auth };
    if (name.endsWith("/supabaseServer")) return {
      supabaseReadHeaders: () => ({ Authorization: "test" }), supabaseAdminHeaders: () => null,
      supabaseUserHeaders: () => ({ Authorization: "test" }), supabaseRest: (table, query = "") => `${table}${query}`,
      supabaseError: async () => "Error de prueba",
    };
    return require(name.startsWith(".") ? `${name}.ts` : name);
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "route.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const evaluatedModule = { exports: {} };
  new Function("require", "module", "exports", "fetch", code)(mockedRequire, evaluatedModule, evaluatedModule.exports, async (url, options) => {
    calls.push({ url, options });
    assert.ok(responses.length, "La ruta hizo una consulta inesperada");
    const [body, status = 200] = responses.shift();
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  return { ...evaluatedModule.exports, calls };
}

test("rechaza consultas y escrituras sin sesión o sin rol People/admin", async () => {
  for (const [auth, status] of [[null, 401], [{ ...session, isPeople: false }, 403]]) {
    const route = routeFor(auth);
    assert.equal((await route.GET(new Request("http://localhost/?cc=12345678"))).status, status);
    assert.equal((await route.POST(request(payload))).status, status);
    assert.equal(route.calls.length, 0);
  }
});

test("devuelve todos los registros de una cédula para elegir contratista", async () => {
  const route = routeFor(session, [[[person, { ...person, CONTRATISTA: "Surti Cervezas" }]]]);
  const response = await route.GET(new Request("http://localhost/?cc=12345678"));
  const body = await response.json();
  assert.equal(body.people.length, 2);
  assert.notEqual(body.people[0].key, body.people[1].key);
});

test("no guarda respuestas incompletas ni una identidad alterada", async () => {
  for (const body of [{ ...payload, answers: {} }, { ...payload, personKey: "otra-persona" }]) {
    const route = routeFor(session, [[[person]]]);
    assert.ok([400, 409].includes((await route.POST(request(body))).status));
    assert.equal(route.calls.length, 1);
  }
});

test("guarda datos confirmados del padrón y las preguntas con sus respuestas", async () => {
  const route = routeFor(session, [[[person]], [[{ id, created_at: "2026-10-01T12:00:00Z" }], 201]]);
  assert.equal((await route.POST(request({ ...payload, nombre: "Nombre falso", contractor: "Otro" }))).status, 201);
  const saved = JSON.parse(route.calls[1].options.body);
  assert.equal(saved.nombre, person.NOMBRE);
  assert.equal(saved.contractor, person.CONTRATISTA);
  assert.equal(saved.answers.length, 24);
  assert.equal(saved.created_by, session.userId);
});

test("confirma un reintento ya guardado y comunica la tabla pendiente sin simular éxito", async () => {
  const saved = { id, created_at: "2026-10-01T12:00:00Z", created_by: session.userId, person_key: personKey, answers: questions.map(question => ({ id: question.id, answer: "si" })) };
  const retried = routeFor(session, [[[person]], [{}, 409], [[saved]]]);
  assert.equal((await retried.POST(request(payload))).status, 200);
  const missing = routeFor(session, [[[person]], [{ code: "PGRST205" }, 404]]);
  const response = await missing.POST(request(payload));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Falta habilitar/);
});
