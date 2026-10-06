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

test("permite editar y quitar preguntas solo en la evaluación guardada", async () => {
  const selected = [{ ...questions[0], text: "  Pregunta personalizada para esta ruta  " }, questions[2]];
  const selectedAnswers = { [questions[0].id]: "no", [questions[2].id]: "na" };
  const route = routeFor(session, [[[person]], [[{ id, created_at: "2026-10-01T12:00:00Z" }], 201]]);
  assert.equal((await route.POST(request({ ...payload, questions: selected, answers: selectedAnswers }))).status, 201);
  const saved = JSON.parse(route.calls[1].options.body);
  assert.deepEqual(saved.answers, [
    { id: questions[0].id, question: "Pregunta personalizada para esta ruta", answer: "no" },
    { id: questions[2].id, question: questions[2].text, answer: "na" },
  ]);
  assert.equal(questions[0].text === "Pregunta personalizada para esta ruta", false);
});

test("guarda preguntas adicionales junto con sus respuestas", async () => {
  const added = { id: `adicional-${id}`, text: "  ¿Se verificó la entrega con el cliente?  " };
  const route = routeFor(session, [[[person]], [[{ id, created_at: "2026-10-01T12:00:00Z" }], 201]]);
  assert.equal((await route.POST(request({ ...payload, questions: [...questions, added], answers: { ...answers, [added.id]: "no" } }))).status, 201);
  const saved = JSON.parse(route.calls[1].options.body);
  assert.equal(saved.answers.length, questions.length + 1);
  assert.deepEqual(saved.answers.at(-1), { id: added.id, question: "¿Se verificó la entrega con el cliente?", answer: "no" });
});

test("rechaza formularios sin preguntas, IDs ajenos, duplicados o respuestas sobrantes", async () => {
  const added = { id: `adicional-${id}`, text: "Pregunta adicional" };
  const invalid = [
    { questions: [], answers: {} },
    { questions: [{ ...questions[0], text: "  " }], answers: { [questions[0].id]: "si" } },
    { questions: [questions[0], questions[0]], answers: { [questions[0].id]: "si" } },
    { questions: [{ id: "otra-01", text: "Pregunta" }], answers: { "otra-01": "si" } },
    { questions: [questions[0]], answers: { [questions[0].id]: "si", [questions[1].id]: "no" } },
    { questions: [questions[0], added], answers: { [questions[0].id]: "si" } },
    { questions: [added, added], answers: { [added.id]: "si" } },
    { questions: [questions[0], { id: "adicional-no-es-un-uuid", text: "Pregunta" }], answers: { [questions[0].id]: "si", "adicional-no-es-un-uuid": "si" } },
    { questions: Array.from({ length: 51 }, (_, index) => ({ id: `adicional-${String(index).padStart(8, "0")}-1234-4123-8123-123456789012`, text: "Pregunta" })), answers: {} },
  ];
  for (const form of invalid) {
    const route = routeFor(session, [[[person]]]);
    assert.equal((await route.POST(request({ ...payload, ...form }))).status, 400);
    assert.equal(route.calls.length, 1);
  }
});

test("confirma un reintento ya guardado y comunica la tabla pendiente sin simular éxito", async () => {
  const saved = { id, created_at: "2026-10-01T12:00:00Z", created_by: session.userId, person_key: personKey, answers: questions.map(question => ({ id: question.id, answer: "si", question: question.text })) };
  const retried = routeFor(session, [[[person]], [{}, 409], [[saved]]]);
  assert.equal((await retried.POST(request(payload))).status, 200);
  const missing = routeFor(session, [[[person]], [{ code: "PGRST205" }, 404]]);
  const response = await missing.POST(request(payload));
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Falta habilitar/);
});

test("actualiza, añade y elimina preguntas de una evaluación guardada", async () => {
  const previousAnswers = questions.slice(0, 2).map(question => ({ id: question.id, question: question.text, answer: "si" }));
  const added = { id: `adicional-${id}`, text: "Pregunta nueva en el historial" };
  const route = routeFor(session, [[[ { id, survey_role: "conductor", answers: previousAnswers } ]], [[{ id }]]]);
  const response = await route.PATCH(new Request("http://localhost/api/people/evaluaciones-ruta", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, previousAnswers, questions: [{ ...questions[0], text: "Pregunta corregida" }, added], answers: { [questions[0].id]: "no", [added.id]: "na" } }),
  }));
  assert.equal(response.status, 200);
  assert.equal(route.calls[1].options.method, "PATCH");
  assert.deepEqual(JSON.parse(route.calls[1].options.body).answers, [
    { id: questions[0].id, question: "Pregunta corregida", answer: "no" },
    { id: added.id, question: added.text, answer: "na" },
  ]);
});

test("no permite actualizar un registro con preguntas ajenas o incompletas", async () => {
  const previousAnswers = [{ id: questions[0].id, question: questions[0].text, answer: "si" }];
  for (const questionsValue of [[{ id: "ajena", text: "Otra" }], [{ id: `adicional-${id}`, text: "Nueva" }]]) {
    const route = routeFor(session, [[[ { id, survey_role: "conductor", answers: previousAnswers } ]]]);
    const response = await route.PATCH(new Request("http://localhost/api/people/evaluaciones-ruta", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, previousAnswers, questions: questionsValue, answers: {} }),
    }));
    assert.equal(response.status, 400);
    assert.equal(route.calls.length, 1);
  }
});

test("eliminar exige sesión y confirma que el registro no cambió", async () => {
  const deleteRequest = (previousAnswers) => new Request("http://localhost/api/people/evaluaciones-ruta", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, previousAnswers }) });
  const savedAnswers = questions.map(question => ({ id: question.id, question: question.text, answer: "si" }));
  assert.equal((await routeFor(null).DELETE(deleteRequest(savedAnswers))).status, 401);
  assert.equal((await routeFor({ ...session, isPeople: false }).DELETE(deleteRequest(savedAnswers))).status, 403);
  const stale = routeFor(session, [[[ { id, answers: savedAnswers } ]]]);
  assert.equal((await stale.DELETE(deleteRequest([]))).status, 409);
  assert.equal(stale.calls.length, 1);
  const route = routeFor(session, [[[ { id, answers: savedAnswers } ]], [[{ id }]]]);
  assert.equal((await route.DELETE(deleteRequest(savedAnswers))).status, 200);
  assert.equal(route.calls[1].options.method, "DELETE");
  assert.match(route.calls[1].url, /people_route_evaluations/);
  assert.match(route.calls[1].url, /id=eq/);
});
