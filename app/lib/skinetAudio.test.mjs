import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { Mp3Encoder } from "@breezystack/lamejs";
import ts from "typescript";

const require = createRequire(import.meta.url);
function compile(path, mocks) {
  const url = new URL(path, import.meta.url);
  const input = fs.readFileSync(url, "utf8").replaceAll("import.meta.url", JSON.stringify(url.href));
  const source = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(name => name in mocks ? mocks[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
}
const { skinetAudio } = compile("./skinetAudio.ts", { "@breezystack/lamejs": { Mp3Encoder } });

test("genera voz española como MP3 real sin servicios ni micrófono", () => {
  const audio = skinetAudio("Skainet. Logísticos ha modulado veinte cajas en el vehículo ABC ciento veintitrés.");
  assert.ok(audio.length > 1000);
  assert.equal(audio[0], 255);
  assert.equal(audio[1] & 224, 224); // Cabecera de trama MPEG.
  assert.notDeepEqual(audio, skinetAudio("Prueba de sonido."));
});

test("el audio requiere sesión de administrador y valida el texto antes de generar", async () => {
  let session = null;
  let generated = 0;
  const route = compile("../api/admin/skinet-audio/route.ts", {
    "../../../lib/authServer": { getAuthenticatedSession: async () => session },
    "../../../lib/skinetAudio": { skinetAudio: text => { generated++; return skinetAudio(text); } },
  });
  const request = text => new Request(`https://example.test/api/admin/skinet-audio?${new URLSearchParams({ text })}`);
  assert.equal((await route.GET(request("Prueba"))).status, 403);
  session = { isAdmin: false, isSiteAdmin: false };
  assert.equal((await route.GET(request("Prueba"))).status, 403);
  session = { isAdmin: true };
  assert.equal((await route.GET(request(""))).status, 400);
  assert.equal((await route.GET(request("a".repeat(701)))).status, 400);
  assert.equal(generated, 0);
  const response = await route.GET(request("Skainet. Prueba de sonido."));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.ok((await response.arrayBuffer()).byteLength > 1000);
  const partial = await route.GET(new Request(request("Prueba regional"), { headers: { Range: "bytes=0-127" } }));
  assert.equal(partial.status, 206);
  assert.equal((await partial.arrayBuffer()).byteLength, 128);
  assert.match(partial.headers.get("content-range"), /^bytes 0-127\//);
  assert.equal((await route.GET(new Request(request("Prueba"), { headers: { Range: "bytes=999999999-" } }))).status, 416);
  session = { isSiteAdmin: true };
  assert.equal((await route.GET(request("Prueba regional"))).status, 200);
});
