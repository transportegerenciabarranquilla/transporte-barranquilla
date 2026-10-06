const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

const { fetchCriticalRouteOptions } = require("./criticalRouteOptions.ts");
const origin = { longitude: -74.84523, latitude: 10.92614 };
const destination = { longitude: -74.82, latitude: 10.98 };
const start = [origin.longitude, origin.latitude];
const end = [destination.longitude, destination.latitude];
const route = (distance, middle) => ({ distance, duration: distance / 10, geometry: { coordinates: [start, middle, end] }, legs: [{ steps: [] }] });

test("conserva varias alternativas reales devueltas por el servicio", async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async url => { calls.push(String(url)); return Response.json({ code: "Ok", routes: [route(10_000, [-74.835, 10.95]), route(11_000, [-74.82, 10.95])] }); };
  try {
    const options = await fetchCriticalRouteOptions(origin, destination, "test");
    assert.equal(options.length, 2);
    assert.match(calls[0], /alternatives=3/);
    assert.equal(calls.length, 1);
  } finally { global.fetch = original; }
});

test("busca desvíos cuando el servicio solo ofrece la ruta principal y descarta duplicados", async () => {
  const original = global.fetch;
  global.fetch = async url => Response.json({ code: "Ok", routes: [String(url).includes("alternatives=3")
    ? route(10_000, [-74.835, 10.95])
    : route(12_000, [-74.82, 10.96])] });
  try {
    const options = await fetchCriticalRouteOptions(origin, destination, "test");
    assert.equal(options.length, 2);
    assert.equal(options[0].distance, 10_000);
  } finally { global.fetch = original; }
});
