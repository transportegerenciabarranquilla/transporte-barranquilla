import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
function compile(relative, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(new URL(relative, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(name => name in mocks ? mocks[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
}
const dates = compile("./adminDateFilter.ts");
function adminRoute(session, calls, records = []) {
  return compile("../api/admin/seguimiento/route.ts", {
    "../../../lib/adminDateFilter": dates,
    "../../../lib/adminScope": { allowedContractors: () => ["Logisticos Arenosa"] },
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } },
    "../../../lib/authServer": { getAuthenticatedSession: async () => session },
    "../../../lib/contractors": { contractorLabel: value => value, normalizeContractorName: value => value, isPuntoCoronaContractor: () => false },
    "../../../lib/adminTvRows": { readAdminTvRows: async (table, params) => { calls.push({ table, params }); return table === "seguimiento_vehiculos" ? records : []; } },
    "../../../lib/supabaseServer": { supabaseAdminHeaders: () => ({}), supabaseUserHeaders: () => ({}) },
    "../../../seguimiento/utils": { normalizeCajasTotal: Number, normalizeCajasValue: Number },
  });
}

test("la lectura diaria filtra Supabase y conserva el alcance de contratista y las rutas pernoctadas", async () => {
  const calls = [];
  const route = adminRoute({ isAdmin: true, accessToken: "test" }, calls, [
    { contractor: "Logisticos Arenosa", data: { transporte: "123", fechaDespacho: "2026-10-04", cajas: 100 } },
    { contractor: "Logisticos Arenosa", data: { transporte: "456", fechaDespacho: "2026-10-03", cajas: 100 } },
  ]);
  const result = await route.GET(new Request("https://example.test/api/admin/seguimiento?desde=2026-10-04&hasta=2026-10-04&details=1"));
  assert.equal(result.status, 200);
  assert.equal(result.body.records.length, 1);
  assert.deepEqual(result.body.modulations, []);
  assert.deepEqual(result.body.checkins, []);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.match(call.params.get("or"), /Logisticos Arenosa/);
    assert.match(call.params.get("and"), /2026-10-04/);
    assert.match(call.params.get("and"), /2026-10-05/);
  }
  assert.match(calls[0].params.get("and"), /or\(data->>fechaDespacho.is.null,data->>fechaDespacho.eq.""\)/);
  assert.match(calls[0].params.get("and"), /04\/10\/2026/);
  assert.match(calls[1].params.get("and"), /data->>dt.in.\(123\)/);
  assert.doesNotMatch(calls[1].params.get("and"), /456/);
});

test("rechaza fechas inválidas y sesiones ausentes antes de leer tablas", async () => {
  const calls = [];
  const route = adminRoute({ isAdmin: true }, calls);
  assert.equal((await route.GET(new Request("https://example.test?desde=2026-02-30"))).status, 400);
  assert.equal((await route.GET(new Request("https://example.test?desde=2026-10-05&hasta=2026-10-04"))).status, 400);
  assert.equal((await adminRoute(null, calls).GET(new Request("https://example.test"))).status, 403);
  assert.equal(calls.length, 0);
});

test("los consumidores sin rango siguen consultando su alcance completo", async () => {
  const calls = [];
  const result = await adminRoute({ isAdmin: true }, calls).GET(new Request("https://example.test"));
  assert.equal(result.status, 200);
  assert.equal(result.body.modulations, undefined);
  assert.ok(calls.every(call => !call.params.has("and")));
});

test("Skinet permite activar el micrófono y escribir preguntas", () => {
  const { renderToStaticMarkup } = require("react-dom/server");
  const { createElement } = require("react");
  const { SkinetAssistant } = compile("../components/SkinetAssistant.tsx", { "../lib/skinetMicrophone": compile("./skinetMicrophone.ts"), "../lib/skinetReports": compile("./skinetReports.ts"), "../lib/skinetVoice": compile("./skinetVoice.ts", { "./skinetUnderstanding": compile("./skinetUnderstanding.ts") }) });
  const html = renderToStaticMarkup(createElement(SkinetAssistant, {
    onAsk: async () => "Respuesta", onListeningChange: () => {},
  }));
  const activation = html.match(/<button[^>]*>[\s\S]*?Reanudar escucha<\/button>/)?.[0];
  assert.ok(activation);
  assert.doesNotMatch(activation.match(/^<button[^>]*>/)[0], /\sdisabled(?:=|\s|>)/);
  assert.match(html, /Pregunta para Skainet/);
  assert.match(html, /Probar voz/);
  assert.match(html, /Puedes escribir y escuchar respuestas sin activar el micrófono/);
  assert.doesNotMatch(html, /Activar Skinet/);
});

test("la política permite micrófono en admin y conserva el bloqueo del resto del portal", async () => {
  const config = compile("../../next.config.ts").default;
  const headers = await config.headers();
  const global = headers.find(rule => rule.source === "/(.*)");
  const admin = headers.find(rule => rule.source === "/admin/:path*");
  assert.ok(admin);
  assert.ok(headers.indexOf(admin) > headers.indexOf(global));
  assert.match(global.headers.find(header => header.key === "Permissions-Policy").value, /microphone=\(\)/);
  assert.match(admin.headers.find(header => header.key === "Permissions-Policy").value, /microphone=\(self\)/);
  assert.match(admin.headers.find(header => header.key === "Permissions-Policy").value, /camera=\(\)/);
});

test("Skainet reproduce al máximo y respeta la voz elegida", () => {
  const realWindow = globalThis.window;
  const realUtterance = globalThis.SpeechSynthesisUtterance;
  const voices = [{ voiceURI: "local", lang: "es-ES", localService: true }, { voiceURI: "online", lang: "es-MX", localService: false }];
  const spoken = [];
  const react = { useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }), useCallback: fn => fn, useEffect() {} };
  const { SkinetAssistant } = compile("../components/SkinetAssistant.tsx", {
    "../lib/skinetMicrophone": compile("./skinetMicrophone.ts"),
    react, "../lib/skinetReports": compile("./skinetReports.ts"), "../lib/skinetVoice": compile("./skinetVoice.ts", { "./skinetUnderstanding": compile("./skinetUnderstanding.ts") }),
  });
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  globalThis.window = { SpeechSynthesisUtterance, speechSynthesis: { getVoices: () => voices, resume() {}, speak: value => spoken.push(value) } };
  try {
    const nodes = [];
    const visit = node => { if (!node || typeof node !== "object") return; if (Array.isArray(node)) { node.forEach(visit); return; } nodes.push(node); visit(node.props?.children); };
    visit(SkinetAssistant({ onAsk: async () => "Respuesta", onListeningChange() {} }));
    const testVoice = nodes.find(node => node.type === "button" && node.props.children === "Probar voz");
    testVoice.props.onClick();
    assert.equal(spoken[0].volume, 1);
    assert.equal(spoken[0].voice.voiceURI, "local");
    spoken[0].onstart();
    spoken[0].onend();
    assert.match(spoken[0].text, /Soy Skainet/);
    nodes.find(node => node.type === "select").props.onChange({ target: { value: "local" } });
    testVoice.props.onClick();
    assert.equal(spoken[1].voice.voiceURI, "local");
    spoken[1].onstart();
    spoken[1].onend();
  } finally { globalThis.window = realWindow; globalThis.SpeechSynthesisUtterance = realUtterance; }
});

test("el asistente reproduce la respuesta como MP3 cuando no hay motor de voz", () => {
  const originalWindow = globalThis.window;
  const nodes = [];
  let plays = 0;
  const player = { play: () => { plays++; return Promise.resolve(); }, pause() {} };
  const react = { useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }), useCallback: fn => fn, useEffect() {} };
  const { SkinetAssistant } = compile("../components/SkinetAssistant.tsx", {
    react, "../lib/skinetMicrophone": compile("./skinetMicrophone.ts"), "../lib/skinetReports": compile("./skinetReports.ts"), "../lib/skinetVoice": compile("./skinetVoice.ts", { "./skinetUnderstanding": compile("./skinetUnderstanding.ts") }),
  });
  globalThis.window = {};
  try {
    const visit = node => { if (!node || typeof node !== "object") return; if (Array.isArray(node)) { node.forEach(visit); return; } nodes.push(node); visit(node.props?.children); };
    visit(SkinetAssistant({ onAsk: async () => "Respuesta", onListeningChange() {} }));
    nodes.find(node => node.type === "audio").props.ref.current = player;
    nodes.find(node => node.type === "button" && node.props.children === "Probar voz").props.onClick();
    assert.equal(plays, 1);
    assert.match(player.src, /^\/api\/admin\/skinet-audio\?/);
    assert.match(new URL(player.src, "https://example.test").searchParams.get("text"), /Soy Skainet/);
    player.onended();
  } finally { globalThis.window = originalWindow; }
});

test("Skinet no solicita micrófono al montar ni al regresar a la pestaña", () => {
  const effects = [];
  const listeners = new Map();
  const tasks = [];
  let starts = 0;
  const enabled = [];
  const realWindow = globalThis.window;
  const realDocument = globalThis.document;
  const react = {
    useState: initial => [initial, () => {}], useRef: initial => ({ current: initial }),
    useCallback: fn => fn, useEffect: fn => effects.push(fn),
  };
  const { SkinetAssistant } = compile("../components/SkinetAssistant.tsx", {
    "../lib/skinetMicrophone": compile("./skinetMicrophone.ts"),
    react, "../lib/skinetReports": compile("./skinetReports.ts"), "../lib/skinetVoice": compile("./skinetVoice.ts", { "./skinetUnderstanding": compile("./skinetUnderstanding.ts") }),
  });
  globalThis.window = {
    isSecureContext: true,
    SpeechRecognition: class { start() { starts++; } abort() {} },
    speechSynthesis: { cancel() {}, getVoices: () => [], addEventListener() {}, removeEventListener() {} },
    setTimeout: fn => { tasks.push(fn); return tasks.length; }, clearTimeout() {},
    addEventListener() {}, removeEventListener() {},
  };
  globalThis.document = {
    visibilityState: "visible", permissionsPolicy: { allowsFeature: () => true },
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener() {},
  };
  let cleanup;
  try {
    SkinetAssistant({ onAsk: async () => "Respuesta", onListeningChange: value => enabled.push(value) });
    effects.forEach(fn => { const result = fn(); if (result) cleanup = result; });
    assert.equal(starts, 0);
    tasks[0]();
    assert.equal(starts, 0);
    assert.equal(enabled.includes(true), false);
    document.visibilityState = "hidden";
    listeners.get("visibilitychange")();
    assert.equal(enabled.at(-1), false);
    document.visibilityState = "visible";
    listeners.get("visibilitychange")();
    assert.equal(starts, 0);
    assert.equal(enabled.includes(true), false);
  } finally {
    cleanup?.();
    globalThis.window = realWindow;
    globalThis.document = realDocument;
  }
});
