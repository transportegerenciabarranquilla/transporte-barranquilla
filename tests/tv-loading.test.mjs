import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const nativeRequire = createRequire(import.meta.url);

// Ejecutar las funciones del servidor con respuestas controladas, sin credenciales
// ni escrituras en Supabase. Compatible con el Node local sin strip-types.
function loader(fetch, session = null) {
  const modules = new Map();
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const compiledModule = { exports: {} };
    modules.set(file, compiledModule);
    const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const requireLocal = (name) => {
      if (name === "next/server") return { NextResponse: Response };
      if (name.endsWith("/authServer")) return { getAuthenticatedSession: async () => session };
      if (name.endsWith("/supabaseServer")) return {
        supabaseRest: (table, query) => `https://example.test/${table}${query}`,
        supabaseAdminHeaders: () => ({ apikey: "test" }),
        supabaseUserHeaders: () => ({ apikey: "user" }),
        supabaseError: async () => "Error de prueba",
      };
      if (!name.startsWith(".")) return nativeRequire(name);
      return load(path.resolve(path.dirname(file), name.endsWith(".ts") ? name : `${name}.ts`));
    };
    vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: requireLocal, fetch, URL, URLSearchParams, Response, console, setTimeout, clearTimeout });
    return compiledModule.exports;
  }
  return load;
}

test("paginación paralela respeta el límite real, orden y caché por credencial", async () => {
  let calls = 0, active = 0, maxActive = 0;
  const fetch = async (url) => {
    calls++; active++; maxActive = Math.max(maxActive, active);
    const offset = Number(new URL(url).searchParams.get("offset"));
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return Response.json(Array.from({ length: Math.min(2, 11 - offset) }, (_, i) => offset + i), { headers: { "content-range": `${offset}-${Math.min(offset + 1, 10)}/11` } });
  };
  const { readAdminTvRows } = loader(fetch)("app/lib/adminTvRows.ts");
  const params = new URLSearchParams({ limit: "1000" });
  const result = await readAdminTvRows("routes", params, { apikey: "a" });
  assert.equal(JSON.stringify(result), JSON.stringify(Array.from({ length: 11 }, (_, i) => i)));
  assert.equal(calls, 6);
  assert.equal(maxActive, 4);
  await readAdminTvRows("routes", params, { apikey: "a" });
  assert.equal(calls, 6);
  await readAdminTvRows("routes", params, { apikey: "b" });
  assert.equal(calls, 12);
});

test("sin Content-Range no omite páginas y propaga fallos", async () => {
  const offsets = [];
  const { readAdminTvRows } = loader(async (url) => {
    const offset = Number(new URL(url).searchParams.get("offset"));
    offsets.push(offset);
    return Response.json(offset < 3 ? [offset] : []);
  })("app/lib/adminTvRows.ts");
  assert.equal(JSON.stringify(await readAdminTvRows("routes", new URLSearchParams(), {})), "[0,1,2]");
  assert.deepEqual(offsets, [0, 1, 2, 3]);
  const failing = loader(async () => new Response("", { status: 500 }))("app/lib/adminTvRows.ts");
  await assert.rejects(() => failing.readAdminTvRows("routes", new URLSearchParams(), {}), /Error de prueba/);
});

test("sin sesión los endpoints TV rechazan antes de consultar datos", async () => {
  const load = loader(async () => { throw new Error("No debe consultar"); });
  for (const file of ["app/api/admin/seguimiento/route.ts", "app/api/admin/rango/route.ts"]) {
    const result = await load(file).GET(new Request("https://example.test/api?tv=1"));
    assert.equal(result.status, 403);
  }
});

test("seguimiento agrupa tablas y conserva el alcance de Arenosa y las filas históricas", async () => {
  const urls = [];
  const load = loader(async (url) => {
    urls.push(new URL(url));
    return Response.json([], { headers: { "content-range": "*/0" } });
  }, { isAdmin: true, isSiteAdmin: true, contractor: "Admin Arenosa", email: "adminare@gmail.com", accessToken: "test" });
  const result = await load("app/api/admin/seguimiento/route.ts").GET(new Request("https://example.test/api?tv=1"));
  assert.equal(result.status, 200);
  assert.equal(urls.length, 4);
  const seguimiento = urls.find((url) => url.pathname.endsWith("seguimiento_vehiculos")).searchParams.get("or");
  assert.match(seguimiento, /contractor\.is\.null,data->>transportista\.in/);
  assert.match(seguimiento, /Logisticos Arenosa/);
  assert.doesNotMatch(seguimiento, /"Logisticos"|HL Logisticos/);
  const checkins = urls.find((url) => url.pathname.endsWith("checkins_cajas")).searchParams.get("or");
  assert.match(checkins, /contractor\.is\.null,data->>contratista\.in/);
  assert.match(checkins, /Logisticos Arenosa/);
  assert.doesNotMatch(checkins, /"Logisticos"|HL Logisticos/);
  assert.match(urls.find((url) => url.pathname.endsWith("punto_corona_route_reports")).searchParams.get("operational_date"), /^eq\.\d{4}-\d{2}-\d{2}$/);
});

test("Rango TV conserva los resúmenes y no solicita ni devuelve las filas detalladas", async () => {
  const summary = { visits: 10, inRange: 8 };
  const base = { report_id: "1", contractor: "Logisticos", operational_date: "2026-09-23", kind: "current", updated_at: "2026-09-23T10:00:00Z" };
  const data = { id: "1", contractor: "Logisticos", operationalDate: "2026-09-23", kind: "current", uploadedAt: base.updated_at, summary, rows: [{ detail: "pesado" }] };
  const selects = [];
  const load = loader(async (url) => {
    const select = new URL(url).searchParams.get("select"); selects.push(select);
    return Response.json([select.includes("summary:data->summary")
      ? { ...base, ...data, dataContractor: data.contractor, dataKind: data.kind }
      : { ...base, data }]);
  }, { isAdmin: true, contractor: "Admin", email: "admin@bavaria-seguimiento.com", accessToken: "test" });
  const { GET } = load("app/api/admin/rango/route.ts");
  const full = await (await GET(new Request("https://example.test/api"))).json();
  const tv = await (await GET(new Request("https://example.test/api?tv=1"))).json();
  assert.deepEqual(tv.reports[0].summary, full.reports[0].summary);
  assert.equal(tv.reports[0].operationalDate, full.reports[0].operationalDate);
  assert.equal("rows" in tv.reports[0], false);
  assert.match(selects[1], /summary:data->summary/);
  assert.equal(selects[1].split(",").includes("data"), false);
});
