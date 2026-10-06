/* eslint-disable @typescript-eslint/no-require-imports -- Arnés CommonJS para la ruta TypeScript. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (loaded, filename) => loaded._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

function routeFor(session, pages = []) {
  const calls = [];
  const filename = path.join(__dirname, "route.ts");
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const evaluatedModule = { exports: {} };
  const mockedRequire = name => {
    if (name.endsWith("/authServer")) return { getAuthenticatedSession: async () => session };
    if (name.endsWith("/supabaseServer")) return { supabaseReadHeaders: () => ({ Authorization: "test" }), supabaseRest: (table, query = "") => `https://example.test/${table}${query}` };
    return require(name.startsWith(".") ? path.resolve(__dirname, `${name}.ts`) : name);
  };
  new Function("require", "module", "exports", "fetch", code)(mockedRequire, evaluatedModule, evaluatedModule.exports, async (url, options) => {
    calls.push({ url, options });
    assert.ok(pages.length, "Consulta inesperada");
    return Response.json(pages.shift());
  });
  return { GET: evaluatedModule.exports.GET, calls };
}

test("solo administración puede consultar el promedio", async () => {
  assert.equal((await routeFor(null).GET()).status, 401);
  assert.equal((await routeFor({ isAdmin: false }).GET()).status, 403);
});

test("cuenta viajes reales y restringe el resultado al alcance administrativo", async () => {
  const session = { isAdmin: true, email: "adminare@gmail.com", contractor: "Admin Arenosa", accessToken: "test" };
  const route = routeFor(session, [[
    { contractor: "Logisticos Arenosa", dispatch_date: "2026-10-06", dt: "8001", trip: "1", aux1: "Gonzalez Medina Cristo Jose" },
    { contractor: "Logisticos", dispatch_date: "2026-10-01", dt: "8002", trip: "1", aux1: "Gonzalez Medina Cristo Jose" },
  ]]);
  const response = await route.GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.sourceRows, 1);
  assert.deepEqual(body.people[0].days, [{ date: "2026-10-06", trips: 1, visited: null }]);
  assert.equal(route.calls[0].options.cache, "no-store");
});

test("excluye definitivamente fechas anteriores al 6 de octubre sin perder días posteriores", async () => {
  const session = { isAdmin: true, email: "admin@bavaria-seguimiento.com", contractor: "Admin", accessToken: "test" };
  const base = { contractor: "Logisticos", aux1: "Gonzalez Medina Cristo Jose", trip: "1", visited: 20 };
  const route = routeFor(session, [[
    { ...base, dispatch_date: "2026-10-05", dt: "1" },
    { ...base, dispatch_date: "2026-10-06", dt: "2" },
    { ...base, dt_date: "2026-10-07", dt: "3" },
    { ...base, dispatch_date: "2026-10-05", created_at_data: "2026-10-08", dt: "4" },
  ]]);
  const body = await (await route.GET()).json();
  assert.equal(body.sourceRows, 2);
  assert.deepEqual(body.people[0].days, [
    { date: "2026-10-06", trips: 1, visited: 20 },
    { date: "2026-10-07", trips: 1, visited: 20 },
  ]);
});
