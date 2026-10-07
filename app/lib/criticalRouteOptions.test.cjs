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

test("entrega recomendada y tres alternativas de sectores distintos", async () => {
  const original = global.fetch;
  const calls = [];
  global.fetch = async url => {
    const text = String(url);
    calls.push(text);
    const points = decodeURIComponent(text.split("/driving/")[1].split("?")[0]).split(";");
    const middle = points[1]?.split(",").map(Number);
    return Response.json({ code: "Ok", routes: [points.length === 2
      ? route(10_000, [-74.835, 10.95])
      : route(12_000, middle)] });
  };
  try {
    const options = await fetchCriticalRouteOptions(origin, destination, "test");
    assert.equal(options.length, 4);
    assert.equal(options[0].direction, undefined);
    assert.equal(new Set(options.slice(1).map(option => option.direction)).size, 3);
    assert.match(calls[0], /alternatives=3/);
    assert.equal(calls.length, 5);
  } finally { global.fetch = original; }
});

test("descarta caminos duplicados y muestra solo rutas reales", async () => {
  const original = global.fetch;
  global.fetch = async () => Response.json({ code: "Ok", routes: [route(10_000, [-74.835, 10.95])] });
  try {
    const options = await fetchCriticalRouteOptions(origin, destination, "test");
    assert.equal(options.length, 1);
    assert.equal(options[0].distance, 10_000);
  } finally { global.fetch = original; }
});
