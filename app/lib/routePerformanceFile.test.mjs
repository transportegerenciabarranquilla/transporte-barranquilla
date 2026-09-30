import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
function compile(relative, overrides) {
  const path = new URL(relative, import.meta.url);
  const source = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)((name) => {
    if (name in overrides) return overrides[name];
    if (name.startsWith(".")) return compile(new URL(`${name}.ts`, path).href, overrides);
    return require(name);
  }, loaded, loaded.exports);
  return loaded.exports;
}

function excel(day) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["fecha_viaje2", "PLACA", "Viaje", "PLAN_KM", "EJE_KM", "DIFERENCIAKM", "ENTREGA RANGO"],
    [`${day}/07/2026`, "ABC123", 1, 30, 40, 10, "90 %"],
  ]), "Viajes");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}

test("two uploads preserve both files and trips after reloading, including paginated history", async () => {
  const stored = [];
  let authorized = true;
  let failReads = false;
  const server = {
    supabaseAdminHeaders: () => ({}),
    supabaseRest: (_table, query) => `https://storage.test/${query}`,
    supabaseError: async () => "Error de lectura",
  };
  const overrides = {
    "server-only": {},
    "./supabaseServer": server,
    "../../../../lib/supabaseServer": server,
    "../../../../lib/authServer": { getAuthenticatedSession: async () => authorized ? { isAdmin: true, userId: "admin" } : null },
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
  };
  const route = compile("../api/admin/graficas/route-performance/route.ts", overrides);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.cache, "no-store");
    if (options.method === "POST") {
      const row = { ...JSON.parse(options.body), id: String(stored.length + 1), created_at: new Date().toISOString() };
      stored.unshift(row);
      return Response.json([row]);
    }
    if (failReads) return Response.json({}, { status: 500 });
    const offset = Number(new URL(url).searchParams.get("offset"));
    // Emulate a server page cap smaller than the requested limit.
    return Response.json(stored.slice(offset, offset + 1));
  };
  async function upload(day) {
    const form = new FormData();
    form.set("file", new File([excel(day)], "rutas.xlsx"));
    return route.POST(new Request("https://app.test/upload", { method: "POST", body: form }));
  }
  try {
    assert.deepEqual((await route.GET()).body.rows, []);
    assert.equal((await upload(1)).body.rows.length, 1);
    const second = await upload(2);
    assert.equal(second.status, 200);
    assert.deepEqual(second.body.rows.map((row) => row.date), ["2026-07-02", "2026-07-01"]);
    assert.equal(second.body.files.length, 2);
    assert.equal((await route.GET()).body.rows.length, 2);
    assert.equal(stored.length, 2); // Same filename must not replace the original.
    authorized = false;
    assert.equal((await route.GET()).status, 403);
    assert.equal((await upload(3)).status, 403);
    assert.equal(stored.length, 2);
    authorized = true;
    failReads = true;
    const savedButUnread = await upload(3);
    assert.equal(savedButUnread.status, 500);
    assert.match(savedButUnread.body.error, /no necesitas subirlo otra vez/);
    failReads = false;
    assert.equal((await route.GET()).body.rows.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
