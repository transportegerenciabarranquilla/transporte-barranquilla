import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
import JsBarcode from "jsbarcode";
import { MultiFormatReader, RGBLuminanceSource, BinaryBitmap, HybridBinarizer, BarcodeFormat, DecodeHintType } from "@zxing/library";

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

test("la sesión verificada de honor requiere permiso explícito en el servidor", async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: "test-user", email: "honor-gl@gmail.com" }) });
  try {
    const auth = compile("./authServer.ts", {
      "next/headers": { cookies: async () => ({ get: (key) => key === "bavaria_access_token" ? { value: "test" } : undefined }) },
      "./supabaseServer": { requireSupabaseKey: () => "test", SUPABASE_URL: "https://example.test", supabaseUserHeaders: () => ({}) },
      "./securityState": { readSecurityState: async () => ({ state: { active: false } }) },
    });
    assert.equal(await auth.getAuthenticatedSession(), null);
    assert.equal(await auth.getAuthenticatedSession({ allowSiteAdmin: true }), null);
    const session = await auth.getAuthenticatedSession({ allowEffectiveRest: true });
    assert.equal(session.email, "honor-gl@gmail.com");
    assert.equal(session.isPeople, false);
    assert.equal(session.isAdmin, false);
  } finally { globalThis.fetch = oldFetch; }
});

test("el endpoint rechaza People y Admin y consulta solo una persona para honor", async () => {
  let session = null;
  const route = compile("../api/effective-rest/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } },
    "../../lib/authServer": { getAuthenticatedSession: async (options) => { assert.equal(options.allowEffectiveRest, true); return session; } },
    "../../lib/supabaseServer": { supabaseAdminHeaders: () => ({}), supabaseRest: () => "https://example.test/snapshots", supabaseError: async () => "error" },
  });
  const request = new Request("https://example.test/api/effective-rest?document=123");
  assert.equal((await route.GET(request)).status, 401);
  for (const email of ["people@transporte.com", "admin@bavaria-seguimiento.com", "desconocido@gmail.com"]) {
    session = { email, isAdmin: true, isPeople: true };
    assert.equal((await route.GET(request)).status, 403);
  }
  session = { email: "honor-gl@gmail.com" };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => [{ operational_date: "2020-01-01", rows: [{ identificador: "123", nombreCompleto: "Persona prueba", salida: "18:00" }, { identificador: "456", nombreCompleto: "No mostrar", salida: "18:00" }] }] });
  try {
    const result = await route.GET(request);
    assert.equal(result.status, 200);
    assert.equal(result.body.person.document, "123");
    assert.equal(result.body.allowed, true);
    assert.equal(result.body.allowedAt, "2020-01-02T09:10:00.000Z");
    assert.equal(JSON.stringify(result.body).includes("No mostrar"), false);
    assert.equal((await route.GET(new Request("https://example.test/api/effective-rest?document=999"))).status, 404);
  } finally { globalThis.fetch = oldFetch; }
});

test("ZXing lee exactamente los códigos CODE128 generados, incluidos ceros iniciales", () => {
  for (const document of ["1", "00123456", "72123456", "123456789012345"]) {
    const encoded = {};
    JsBarcode(encoded, document, { format: "CODE128" });
    const bars = "0".repeat(20) + encoded.encodings.map((part) => part.data).join("") + "0".repeat(20);
    const width = bars.length * 3;
    const height = 100;
    const pixels = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels[y * width + x] = bars[Math.floor(x / 3)] === "1" ? 0 : 255;
    const result = new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, width, height))), new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]]]));
    assert.equal(result.getText(), document);
  }
});
