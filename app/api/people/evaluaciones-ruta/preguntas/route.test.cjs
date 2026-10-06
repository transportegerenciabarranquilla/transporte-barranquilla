/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
require.extensions[".ts"] = (loaded, filename) => loaded._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
function harness(session = { isPeople: true, userId: "test" }) {
  let saved = null;
  let fail = false;
  const filename = path.join(__dirname, "route.ts");
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  const localRequire = name => {
    if (name.endsWith("/authServer")) return { getAuthenticatedSession: async () => session };
    if (name.endsWith("/supabaseServer")) return { supabaseAdminHeaders: () => ({ apikey: "test" }), supabaseRest: (table, query = "") => "https://test/" + table + query };
    return require(name.startsWith(".") ? path.resolve(__dirname, name + ".ts") : name);
  };
  new Function("require", "module", "exports", "fetch", code)(localRequire, mod, mod.exports, async (url, options) => {
    if (fail) return Response.json({}, { status: 503 });
    if (!options.method) return Response.json(saved ? [saved] : []);
    const body = JSON.parse(options.body);
    if (options.method === "POST" && saved) return Response.json({}, { status: 409 });
    if (options.method === "PATCH" && new URL(url).searchParams.get("revision") !== "eq." + saved?.revision) return Response.json([]);
    saved = body;
    return Response.json([saved]);
  });
  return { ...mod.exports, fail: () => { fail = true; } };
}
const get = () => new Request("https://test?role=auxiliar");
const put = body => new Request("https://test", { method: "PUT", body: JSON.stringify({ role: "auxiliar", ...body }) });
test("guarda altas, cambios y bajas y los recupera al consultar nuevamente", async () => {
  const route = harness();
  const defaults = await (await route.GET(get())).json();
  const added = { id: "adicional-11111111-1111-4111-8111-111111111111", text: "Pregunta nueva" };
  const created = await route.PUT(put({ questions: [...defaults.questions, added], revision: null }));
  assert.equal(created.status, 200);
  const first = await created.json();
  const edited = [...first.questions.slice(1).map(q => q.id === added.id ? { ...q, text: "Pregunta modificada" } : q)];
  const result = await route.PUT(put({ questions: edited, revision: first.revision }));
  assert.equal(result.status, 200);
  const reloaded = await (await route.GET(get())).json();
  assert.deepEqual(reloaded.questions, edited);
  assert.equal((await route.PUT(put({ questions: edited, revision: first.revision }))).status, 409);
});
test("rechaza usuarios no autorizados y no simula éxito si falla la base", async () => {
  assert.equal((await harness(null).GET(get())).status, 401);
  assert.equal((await harness({ isAdmin: false }).PUT(put({}))).status, 403);
  const route = harness();
  route.fail();
  assert.equal((await route.GET(get())).status, 503);
});
test("rechaza plantillas vacías y textos inválidos", async () => {
  const route = harness();
  assert.equal((await route.PUT(put({ questions: [], revision: null }))).status, 400);
  assert.equal((await route.PUT(put({ questions: [{ id: "auxiliar-01", text: "" }], revision: null }))).status, 400);
});
