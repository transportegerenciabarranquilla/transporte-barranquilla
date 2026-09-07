import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
function compile(relative, overrides = {}) {
  const path = new URL(relative, import.meta.url);
  const source = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)((name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith(".")) return compile(new URL(`${name.replace(/\.ts$/, "")}.ts`, path).href, overrides);
    return require(name);
  }, module, module.exports);
  return module.exports;
}
const site = { email: "adminare@gmail.com", contractor: "Admin Arenosa", isAdmin: true, isSiteAdmin: true, accessToken: "test", userId: "site-user" };
const responseStub = { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } };

test("endpoints no adaptados rechazan admin Arenosa por defecto", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: "site-user", email: site.email }) });
  try {
    const auth = compile("./authServer.ts", {
      "next/headers": { cookies: async () => ({ get: (key) => key === "bavaria_access_token" ? { value: "test" } : undefined }) },
      "./supabaseServer": { requireSupabaseKey: () => "test", SUPABASE_URL: "https://example.test", supabaseUserHeaders: () => ({}) },
      "./securityState": { readSecurityState: async () => ({ state: { active: false } }) },
    });
    assert.equal(await auth.getAuthenticatedSession(), null);
    const session = await auth.getAuthenticatedSession({ allowSiteAdmin: true });
    assert.equal(session.contractor, "Admin Arenosa");
    assert.equal(session.isSiteAdmin, true);
  } finally { globalThis.fetch = oldFetch; }
});

test("seguimiento admin consulta únicamente las dos contratistas del CD", async () => {
  const calls = [];
  const route = compile("../api/admin/seguimiento/route.ts", {
    "next/server": responseStub,
    "../../../lib/authServer": { getAuthenticatedSession: async (options) => { assert.equal(options.allowSiteAdmin, true); return site; } },
    "../../../lib/serverCache": { cachedJsonFetch: async (_key, _ttl, url) => { calls.push(new URL(url)); return []; } },
    "../../../lib/supabaseServer": { supabaseAdminHeaders: () => ({}), supabaseRest: (table, query) => `https://example.test/${table}${query}`, supabaseHeaders: () => ({}), supabaseUserHeaders: () => ({}) },
    "../../../seguimiento/utils": { normalizeCajasTotal: Number, normalizeCajasValue: Number },
  });
  const result = await route.GET();
  assert.equal(result.status, 200);
  assert.equal(calls.length, 7);
  for (const url of calls) assert.ok(["eq.Logisticos Arenosa", "eq.Punto Corona Arenosa"].includes(url.searchParams.get("contractor")));
  assert.deepEqual(result.body.summaries.map((row) => row.contractor), ["Logisticos Arenosa", "Punto Corona Arenosa"]);
});

test("auditoría conserva el límite regional incluso al pedir Galapa por URL", async () => {
  const calls = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { calls.push(new URL(url)); return { ok: true, json: async () => [] }; };
  try {
    const route = compile("../api/admin/audit-logs/route.ts", {
      "next/server": responseStub,
      "../../../lib/authServer": { getAuthenticatedSession: async () => site },
      "../../../lib/auditLog": { fromAuditRow: (row) => row },
      "../../../lib/supabaseServer": { supabaseAdminHeaders: () => ({}), supabaseRest: (table, query) => `https://example.test/${table}${query}` },
    });
    const result = await route.GET(new Request("https://example.test/api/admin/audit-logs?contractor=Logisticos"));
    assert.equal(result.status, 200);
    assert.equal(calls[0].searchParams.get("contractor"), "eq.Logisticos");
    assert.equal(calls[0].searchParams.get("and"), '(contractor.in.("Logisticos Arenosa","Punto Corona Arenosa"))');
  } finally { globalThis.fetch = oldFetch; }
});
