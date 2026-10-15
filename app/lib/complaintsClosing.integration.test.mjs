import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
function compile(path, mocks = {}, extra = "") {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8") + extra, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(name => name in mocks ? mocks[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
}
const contractors = compile("./contractors.ts");
const complaints = compile("./complaints.ts");
const evidence = { path: "q1/evidence.jpg", name: "evidence.jpg", type: "image/jpeg" };

function route(session) {
  return compile("../api/complaints/route.ts", {
    "../../lib/adminScope": {},
    "../../lib/auditLog": { writeAuditLog: async () => {} },
    "../../lib/authServer": { getAuthenticatedSession: async () => session },
    "../../lib/complaints": complaints,
    "../../lib/contractors": contractors,
    "../../lib/supabaseServer": {
      supabaseAdminHeaders: () => null,
      supabaseUserHeaders: token => ({ Authorization: `Bearer ${token}` }),
      supabaseRest: (table, query) => `https://example.test/${table}${query}`,
      supabaseError: async response => (await response.json()).message,
    },
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } },
  });
}
for (const contractor of ["Logisticos", "Logisticos Arenosa"]) {
  test(`${contractor}: cierra con evidencia incluso fuera del plazo de 48 horas`, async t => {
    const writes = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
      assert.equal(options.headers.Authorization, "Bearer session-token");
      if (options.method === "PATCH") {
        const payload = JSON.parse(options.body);
        writes.push(payload);
        assert.equal(options.headers.Prefer, "return=representation");
        assert.equal(new URL(url).searchParams.get("data->>closedAt"), "is.null");
        return Response.json([{ data: payload.data }]);
      }
      return Response.json([{ contractor, data: { id: "q1", status: "Abierta", closingTime: "2020-01-01", evidence } }]);
    });
    const result = await route({ contractor, accessToken: "session-token", email: "test@example.test" }).PATCH(new Request("https://example.test", {
      method: "PATCH", body: JSON.stringify({ id: "q1", action: "close" }),
    }));
    assert.equal(result.status, 200);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].data.status, "Cerrada");
    assert.equal(writes[0].data.closedBy, "test@example.test");
    assert.ok(Number.isFinite(Date.parse(writes[0].data.closedAt)));
    assert.equal(result.body.record.closedAt, writes[0].data.closedAt);
    assert.deepEqual(writes[0].data.evidence, evidence);
  });
}
test("rechaza cierre sin evidencia o de otra sede, y propaga errores de guardado", async t => {
  let current = { contractor: "Logisticos", data: { id: "q1" } };
  let writes = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (options.method === "PATCH") { writes++; return Response.json({ message: "Error de guardado" }, { status: 403 }); }
    return Response.json([current]);
  });
  const handler = route({ contractor: "Logisticos", accessToken: "test" });
  const close = () => handler.PATCH(new Request("https://example.test", { method: "PATCH", body: JSON.stringify({ id: "q1", action: "close" }) }));
  assert.equal((await close()).status, 409);
  current = { contractor: "Logisticos Arenosa", data: { evidence } };
  assert.equal((await close()).status, 403);
  assert.equal(writes, 0);
  current.contractor = "Logisticos";
  assert.equal((await close()).body.error, "Error de guardado");
  assert.equal(writes, 1);
});
test("no confirma un cierre cuando otra sesión ya lo guardó", async t => {
  t.mock.method(globalThis, "fetch", async (url, options) => options.method === "PATCH"
    ? Response.json([])
    : Response.json([{ contractor: "Logisticos", data: { id: "q1", status: "Abierta", evidence } }]));
  const result = await route({ contractor: "Logisticos", accessToken: "session-token", email: "test@example.test" }).PATCH(new Request("https://example.test", {
    method: "PATCH", body: JSON.stringify({ id: "q1", action: "close" }),
  }));
  assert.equal(result.status, 409);
});
test("un cierre repetido conserva la fecha y hora originales", async t => {
  const closedAt = "2026-10-06T12:34:56.000Z";
  let writes = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (options.method === "PATCH") { writes++; return Response.json([]); }
    return Response.json([{ contractor: "Logisticos", data: { id: "q1", status: "Cerrada", closedAt, evidence } }]);
  });
  const result = await route({ contractor: "Logisticos", accessToken: "session-token", email: "test@example.test" }).PATCH(new Request("https://example.test", {
    method: "PATCH", body: JSON.stringify({ id: "q1", action: "close" }),
  }));
  assert.equal(result.status, 200);
  assert.equal(result.body.record.closedAt, closedAt);
  assert.equal(writes, 0);
});
test("Logisticos puede reabrir una queja cerrada y conserva el evento en el historial", async t => {
  const closedAt = "2026-10-06T12:34:56.000Z";
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (options.method === "PATCH") {
      assert.equal(new URL(url).searchParams.get("data->>closedAt"), "not.is.null");
      const payload = JSON.parse(options.body).data;
      assert.equal(payload.status, "Abierta");
      assert.equal("closedAt" in payload, false);
      assert.equal(payload.statusHistory.at(-2).status, "Cerrada");
      assert.equal(payload.statusHistory.at(-1).status, "Abierta");
      return Response.json([{ data: payload }]);
    }
    return Response.json([{ contractor: "Logisticos", data: { id: "q1", status: "Cerrada", closedAt, closedBy: "closer@example.test", evidence } }]);
  });
  const result = await route({ contractor: "Logisticos", accessToken: "session-token", email: "logisticos@example.test" }).PATCH(new Request("https://example.test", {
    method: "PATCH", body: JSON.stringify({ id: "q1", action: "reopen" }),
  }));
  assert.equal(result.status, 200);
  assert.equal(result.body.record.status, "Abierta");
  assert.ok(Number.isFinite(Date.parse(result.body.record.reopenedAt)));
});
test("una contratista distinta de Logisticos no puede reabrir quejas", async t => {
  let writes = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (options.method === "PATCH") writes++;
    return Response.json([{ contractor: "Surti Cervezas", data: { id: "q1", status: "Cerrada", closedAt: "2026-10-06T12:34:56.000Z", evidence } }]);
  });
  const result = await route({ contractor: "Surti Cervezas", accessToken: "session-token", email: "surti@example.test" }).PATCH(new Request("https://example.test", {
    method: "PATCH", body: JSON.stringify({ id: "q1", action: "reopen" }),
  }));
  assert.equal(result.status, 403);
  assert.equal(writes, 0);
});
test("muestra la hora de cierre en Bogotá en el detalle de la queja", () => {
  const react = { ...require("react"), useState: initial => [initial, () => {}] };
  const { ComplaintModal } = compile("../quejas/page.tsx", {
    react,
    "../lib/contractors": contractors,
    "../lib/complaints": complaints,
    "next/dynamic": { default: () => () => null },
  }, "\nexport { ComplaintModal };\n");
  const html = renderToStaticMarkup(ComplaintModal({ busy: false, error: "", message: "", complaint: { id: "q1", status: "Cerrada", closedAt: "2026-10-06T12:34:56.000Z" }, now: Date.now() }));
  assert.match(html, /Fecha y hora de cierre/);
  assert.match(html, /07:34:56/);
});
test("muestra Reabrir queja en el mismo modal para Logisticos", () => {
  const react = { ...require("react"), useState: initial => [initial, () => {}] };
  const { ComplaintModal } = compile("../quejas/page.tsx", {
    react,
    "../lib/contractors": contractors,
    "../lib/complaints": complaints,
    "next/dynamic": { default: () => () => null },
  }, "\nexport { ComplaintModal };\n");
  const html = renderToStaticMarkup(ComplaintModal({ busy: false, canReopen: true, error: "", message: "", complaint: { id: "q1", status: "Cerrada", closedAt: "2026-10-06T12:34:56.000Z" }, now: Date.now() }));
  assert.match(html, /Reabrir queja/);
});
test("la ventana muestra el error y permite seleccionar JPG y reintentar el mismo archivo", () => {
  const react = { ...require("react"), useState: initial => [initial, () => {}] };
  const { ComplaintModal } = compile("../quejas/page.tsx", {
    react,
    "../lib/contractors": contractors,
    "../lib/complaints": complaints,
    "next/dynamic": { default: () => () => null },
  }, "\nexport { ComplaintModal };\n");
  const uploads = [];
  const element = ComplaintModal({ busy: false, error: "No se pudo subir la evidencia.", message: "", complaint: { id: "q1", status: "Abierta" }, now: Date.now(), onUpload: file => uploads.push(file) });
  const html = renderToStaticMarkup(element);
  assert.match(html, /role="alert"/);
  assert.match(html, /No se pudo subir la evidencia/);
  const inputs = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "input") inputs.push(node);
    for (const child of [node.props?.children].flat(Infinity)) visit(child);
  }
  visit(element);
  const input = inputs.find(node => node.props.type === "file");
  assert.match(input.props.accept, /image\/jpeg/);
  const file = { name: "evidence.jpg" };
  const target = { files: [file], value: "evidence.jpg" };
  input.props.onChange({ target });
  assert.deepEqual(uploads, [file]);
  assert.equal(target.value, "");
});

 test("edición: limita permisos por sede y conserva identidad, evidencia y cierre", async t => {
  const original = { id: "q1", issue: "Anterior", status: "Cerrada", closedAt: "2026-10-06T12:00:00Z", evidence };
  let writes = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (options.method === "PATCH") {
      writes++;
      const payload = JSON.parse(options.body);
      assert.equal(payload.data.id, original.id);
      assert.equal(payload.data.status, original.status);
      assert.equal(payload.data.closedAt, original.closedAt);
      assert.deepEqual(payload.data.evidence, evidence);
      assert.equal(payload.data.issue, "Corregida");
      return Response.json([{ data: payload.data }]);
    }
    return Response.json([{ contractor: "Punto Corona", data: original }]);
  });
  const edit = (contractor, changes) => route({ contractor, accessToken: "test" }).PATCH(new Request("https://example.test", { method: "PATCH", body: JSON.stringify({ id: "q1", action: "edit", changes }) }));
  const changes = { issue: " Corregida ", code: "123", establishment: "Tienda", orderNumber: "456", comments: "Ajuste", id: "otra", status: "Abierta" };
  assert.equal((await edit("Logisticos", changes)).status, 200);
  assert.equal((await edit("Punto Corona", changes)).status, 403);
  assert.equal((await edit("Logisticos Arenosa", changes)).status, 403);
  assert.equal((await edit("Logisticos", { ...changes, issue: " " })).status, 400);
  assert.equal((await edit("Logisticos", { ...changes, comments: "x".repeat(2001) })).status, 400);
  assert.equal((await edit("Logisticos", null)).status, 400);
  assert.equal(writes, 1);
});

test("el detalle muestra Editar queja solamente cuando hay permiso", () => {
  const react = { ...require("react"), useState: initial => [initial, () => {}] };
  const { ComplaintModal } = compile("../quejas/page.tsx", {
    react, "../lib/contractors": contractors, "../lib/complaints": complaints,
    "next/dynamic": { default: () => () => null },
  }, "\nexport { ComplaintModal };\n");
  const props = { busy: false, error: "", message: "", complaint: { id: "q1", status: "Abierta" }, now: Date.now() };
  assert.doesNotMatch(renderToStaticMarkup(ComplaintModal(props)), /Editar queja/);
  assert.match(renderToStaticMarkup(ComplaintModal({ ...props, onEdit: () => {} })), /Editar queja/);
});

for (const [uploader, source, target] of [["Logisticos", "Punto Corona", "Surti Cervezas"], ["Logisticos Arenosa", "Logisticos Arenosa", "Punto Corona Arenosa"]]) {
  test(uploader + ": reasigna la transportista en la fila y los datos", async t => {
    let writes = 0;
    const original = { id: "q1", contractor: source, status: "Cerrada", closedAt: "2026-10-06T12:00:00Z", evidence, driver: "Anterior", matched: true };
    t.mock.method(globalThis, "fetch", async (url, options) => {
      if (options.method !== "PATCH") return Response.json([{ contractor: source, data: original }]);
      writes++;
      const payload = JSON.parse(options.body);
      assert.equal(payload.contractor, target);
      assert.equal(payload.data.contractor, target);
      assert.equal(payload.data.driver, "");
      assert.equal(payload.data.matched, false);
      assert.equal(payload.data.status, original.status);
      assert.equal(payload.data.closedAt, original.closedAt);
      assert.deepEqual(payload.data.evidence, evidence);
      return Response.json([{ data: payload.data }]);
    });
    const changes = { issue: "Novedad", code: "123", establishment: "Tienda", orderNumber: "", comments: "", contractor: target };
    const edit = contractor => route({ contractor: uploader, accessToken: "test" }).PATCH(new Request("https://example.test", { method: "PATCH", body: JSON.stringify({ id: "q1", action: "edit", changes: { ...changes, contractor } }) }));
    assert.equal((await edit(target)).status, 200);
    assert.equal((await edit(uploader === "Logisticos" ? "Punto Corona Arenosa" : "Punto Corona")).status, 403);
    for (const invalid of ["", "Inventada", {}, null]) assert.equal((await edit(invalid)).status, 400);
    assert.equal(writes, 1);
  });
}
