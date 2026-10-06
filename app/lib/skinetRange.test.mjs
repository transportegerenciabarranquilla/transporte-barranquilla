import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
function compile(path, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(name => { if (name in mocks) return mocks[name]; throw new Error(name); }, loaded, loaded.exports);
  return loaded.exports;
}
const contractors = compile("./contractors.ts");
const understanding = compile("./skinetUnderstanding.ts");
const { understandSkinet } = understanding;
const range = compile("./skinetRange.ts", { "./contractors": contractors });
const { answerSkinet } = compile("./skinetAnswers.ts", { "./contractors": contractors, "./skinetUnderstanding": understanding, "./skinetRange": range, "./skinetRouteAnswer": compile("./skinetRouteAnswer.ts") });
const { isSkinetQuestion } = compile("./skinetVoice.ts", { "./skinetUnderstanding": understanding });
const day = "2026-10-05";
const row = { id: "a", dt: "123", truckLicensePlate: "ABC123", driverName: "Ana", status: "CONCLUDED", withinRadius: true, pocExternalId: "1", pocName: "Tienda Uno" };
const report = { contractor: "Logisticos", operationalDate: day, kind: "current", uploadedAt: `${day}T12:00:00Z`, rows: [row, { ...row, id: "b", pocExternalId: "2", withinRadius: false, manualOutOfRadiusReason: "Reubicación" }] };
const data = { summaries: [{ contractor: "Logisticos" }], rangeReports: [report], records: [{ transportista: "Logisticos", transporte: "123", vehiculo: "ABC123", nombreResponsable: "Ana", status: "En ruta", clientes: 10, visitados: 5, cajas: 20, horaSalida: "08:00" }] };
test("interpreta los temas solicitados y no confunde seguimiento de un DT con estado", () => {
  for (const spelling of ["seguimiento", "seguimineto", "segumiento", "segimiento", "seguimieto"]) {
    const question = `cómo va el ${spelling} del DT 123`;
    assert.deepEqual(understandSkinet(question, day).context.metrics, ["tracking"]);
    const answer = answerSkinet(question, data, day).answer;
    assert.match(answer, /Seguimiento de el DT 123/);
    assert.match(answer, /5 de 10 clientes, 50 por ciento/);
    assert.doesNotMatch(answer, /Entrega en rango|Estado:/);
  }
  const complete = { ...data, records: [{ ...data.records[0], cajasRefusalFinal: 2 }] };
  const combined = answerSkinet("dime seguimiento, entrega en rango y refusal de hoy", complete, day).answer;
  assert.match(combined, /Entrega en rango.*50 por ciento/);
  assert.match(combined, /refusal.*10 por ciento/);
  assert.match(combined, /Seguimiento.*5 de 10 clientes/);
  const prior = understandSkinet("refusal de HL", day).context;
  assert.match(understandSkinet("cuál es el clima de HL hoy", day, prior).prompt, /No capté/);
});

test("los datos ausentes no se anuncian como refusal cero ni avance completo", () => {
  assert.match(answerSkinet("refusal", data, day).answer, /Faltan datos de refusal/);
  assert.doesNotMatch(answerSkinet("refusal", data, day).answer, /0 por ciento/);
  assert.match(answerSkinet("seguimiento", { ...data, records: [] }, day).answer, /No hay rutas de Seguimiento/);
  const missingVisits = { ...data, records: [{ ...data.records[0], visitados: undefined }] };
  assert.match(answerSkinet("seguimiento", missingVisits, day).answer, /no puedo calcular el avance completo/);
  const knownZero = { ...data, records: [{ ...data.records[0], cajasRefusalFinal: 0 }] };
  assert.match(answerSkinet("refusal", knownZero, day).answer, /0 por ciento/);
});
test("busca personas en responsables y auxiliares y pide aclaración de nombres repetidos", () => {
  const crew = { ...data, records: [{ ...data.records[0], nombreAuxiliar1: "Juan Pérez", cedulaAuxiliar1: "123456" }] };
  for (const question of ["busca a Juan Pérez", "dónde va Juan Pérez", "busca la persona Juan Pérez", "persona cédula 123456"]) {
    const context = understandSkinet(question, day).context;
    assert.equal(context.person, true);
    assert.equal(understandSkinet(question, day).prompt, undefined);
    assert.match(answerSkinet(question, crew, day).answer, /DT 123/);
  }
  assert.match(answerSkinet("persona Juan Pérez", crew, day).answer, /Juan Pérez/);
  assert.match(answerSkinet("persona Pedro", crew, day).answer, /No encontré rutas de esa persona/);
  const repeated = { ...crew, records: [...crew.records, { ...crew.records[0], transporte: "999", nombreAuxiliar1: "Juan Gómez", cedulaAuxiliar1: "987654" }] };
  assert.equal(answerSkinet("busca a Juan", repeated, day).clarify, true);
  assert.match(answerSkinet("busca a Juan Pérez", repeated, day).answer, /DT 123/);
  assert.doesNotMatch(answerSkinet("busca a Juan Pérez", repeated, day).answer, /DT 999/);
  assert.match(answerSkinet("busca el DT-123", crew, day).answer, /DT 123/);
  assert.equal(isSkinetQuestion("busca el DT 123"), true);
});
test("preguntar por seguimiento reemplaza rango y lee el avance real", () => {
  const previous = understandSkinet("entrega en rango de Logisticos", day).context;
  for (const question of ["cómo va el seguimiento", "como el seguimiento", "pilla mijo dime el seguimiento"]) {
    const context = understandSkinet(question, day, previous).context;
    assert.deepEqual(context.metrics, ["tracking"]);
    assert.equal(isSkinetQuestion(question), true);
    // Incluso una métrica antigua enviada por el cliente debe ceder ante la pregunta.
    const answer = answerSkinet(question, data, day, previous).answer;
    assert.match(answer, /Seguimiento.*5 de 10 clientes, 50 por ciento/);
    assert.doesNotMatch(answer, /Entrega en rango/);
  }
  const next = understandSkinet("entrega en rango", day, understandSkinet("seguimiento", day).context);
  assert.deepEqual(next.context.metrics, ["range"]);
  assert.match(answerSkinet("entrega en rango", data, day, next.context).answer, /Entrega en rango/);
});
test("identifica el DT con más cajas, responsable, empates y alcance", () => {
  const ranked = { ...data, records: [...data.records, { ...data.records[0], transporte: "456", cajas: "1.200", nombreResponsable: "Luis" }, { ...data.records[0], transportista: "HL Logisticos", cajas: 9000 }] };
  assert.equal(answerSkinet("cual dt lleva mas cajas", ranked, day).answer, "DT 456 de Logisticos hoy: 1.200 cajas. Responsable: Luis.");
  const tied = { ...ranked, records: [...ranked.records, { ...ranked.records[1], transporte: "789" }] };
  assert.match(answerSkinet("cual dt lleva mas cajas", tied, day).answer, /Empate.*DT 456.*DT 789/);
  assert.match(answerSkinet("cual dt lleva mas cajas", { ...data, records: [] }, day).answer, /No hay rutas/);
  const prior = understandSkinet("RR Ana", day).context;
  const next = understandSkinet("cual dt lleva mas cajas", day, prior).context;
  assert.equal(next.rr, undefined);
  assert.deepEqual(next.metrics, ["maxBoxes"]);
});

test("cuenta placas únicas fuera de rango y distingue datos incompletos", () => {
  const question = "cuantos vehiculos estuvieron fuera de rango el dia de hoy";
  const outside = { ...row, withinRadius: false };
  const rangeData = { ...data, rangeReports: [{ ...report, rows: [outside, { ...outside, dt: "456" }, { ...outside, truckLicensePlate: "ABC-123" }, { ...outside, truckLicensePlate: "XYZ999" }, { ...outside, truckLicensePlate: "IGN123", status: "NOT_STARTED" }, { ...row, truckLicensePlate: "INR123" }] }] };
  assert.equal(answerSkinet(question, rangeData, day).answer, "la operación hoy: 2 vehículos distintos con al menos una visita fuera de rango.");
  assert.match(answerSkinet(question, { ...data, rangeReports: [] }, day).answer, /No hay reportes/);
  assert.match(answerSkinet(question, { ...rangeData, summaries: [...data.summaries, { contractor: "Surti Cervezas" }] }, day).answer, /Conteo parcial.*Surti Cervezas/);
  const missingPlate = { ...data, rangeReports: [{ ...report, rows: [{ ...outside, truckLicensePlate: "" }] }] };
  assert.match(answerSkinet(question, missingPlate, day).answer, /no puedo confirmar el total exacto/);
  const prior = understandSkinet("DT 123", day).context;
  assert.equal(understandSkinet(question, day, prior).context.dt, undefined);
  assert.equal(understandSkinet(question.replace("hoy", "ayer"), day).context.day, "2026-10-04");
});
test("respuestas concretas por RR, DT, placa y horario", () => {
  assert.equal(answerSkinet("quien es el RR del DT 123", data, day).answer, "DT 123 de Logisticos hoy. RR: Ana.");
  assert.equal(answerSkinet("que placa tiene el DT 123", data, day).answer, "DT 123 de Logisticos hoy. Placa: ABC123.");
  assert.equal(answerSkinet("a que hora salio el DT 123", data, day).answer, "DT 123 de Logisticos hoy. Salida: 08:00.");
  assert.match(answerSkinet("informacion del RR Ana", data, day).answer, /DT 123.*RR: Ana/);
  assert.match(answerSkinet("informacion del RR Pedro", data, day).answer, /No encontré rutas/);
  const withId = { ...data, records: [{ ...data.records[0], cedulaResponsable: "456" }] };
  assert.match(answerSkinet("RR cedula 456", withId, day).answer, /DT 123/);
  const ambiguous = { ...data, records: [...data.records, { ...data.records[0], nombreResponsable: "Ana Perez", transporte: "999" }] };
  assert.equal(answerSkinet("RR Ana", ambiguous, day).clarify, true);
  const context = understandSkinet("RR Ana", day).context;
  assert.equal(understandSkinet("DT 999", day, context).context.rr, undefined);
  const unrelated = { ...data, records: [...data.records, { ...data.records[0], transportista: "HL Logisticos", nombreResponsable: "Pedro" }] };
  assert.match(answerSkinet("RR Pedro", unrelated, day).answer, /No encontré rutas/);
});
test("entiende entrega en rango, motivos y conserva el contexto por contratista y fecha", () => {
  const context = understandSkinet("cómo va la entrega en rango de Logísticos ayer", day).context;
  assert.deepEqual(context.metrics, ["range"]);
  assert.equal(context.day, "2026-10-04");
  const next = understandSkinet("y HL", day, context).context;
  assert.equal(next.contractor, "hl");
  assert.deepEqual(next.metrics, ["range"]);
  for (const question of ["entrega en rango", "cuáles clientes están fuera de rango", "qué placa tiene el DT 123"]) assert.equal(isSkinetQuestion(question), true);
  assert.ok(understandSkinet("a qué hora salió el DT 123", day).context.metrics.includes("status"));
});
test("porcentaje ponderado, sin duplicar cierre, fechas anteriores ni cuentas ajenas", () => {
  const current = { ...report, rows: [row] };
  const closure = { ...report, kind: "closure", rows: [...report.rows, { ...row, id: "c", withinRadius: null }, { ...row, id: "d", status: "NOT_STARTED" }] };
  const answer = answerSkinet("entrega en rango de Logísticos", { ...data, rangeReports: [current, closure, { ...report, operationalDate: "2026-10-04" }, { ...report, contractor: "HL Logisticos" }] }, day).answer;
  assert.match(answer, /33,33 por ciento/);
  assert.match(answer, /Entrega en rango de Logisticos hoy: 33,33 por ciento\./);
  assert.match(answer, /1 visitas en rango, 1 fuera de rango y 1 sin dato de rango, de 3 visitas iniciadas/);
});
test("detalle fuera de rango incluye DT, placa, cliente y motivo manual", () => {
  const answer = answerSkinet("cuáles clientes están fuera de rango de Logísticos", data, day).answer;
  assert.match(answer, /Detalle de 1 de 1 visitas/);
  assert.match(answer, /DT 123, placa ABC123/);
  assert.match(answer, /Reubicación/);
});

test("general borra la contratista anterior y responde porcentajes separados", () => {
  const previous = understandSkinet("entrega en rango de logisticos del dia 3", day).context;
  assert.equal(previous.day, "2026-10-03");
  const context = understandSkinet("como va la entrega en rango general", day, previous).context;
  assert.equal(context.contractor, undefined);
  assert.equal(context.day, "2026-10-03");
  const allData = { summaries: ["Logisticos", "Surti Cervezas", "HL Logisticos"].map(contractor => ({ contractor })), rangeReports: [
    { ...report, operationalDate: context.day },
    { ...report, contractor: "Surti Cervezas", operationalDate: context.day, rows: [row] },
    { ...report, contractor: "HL Logisticos", operationalDate: context.day, rows: [{ ...row, withinRadius: false }] },
  ] };
  const answer = answerSkinet("entrega en rango general", allData, context.day, context).answer;
  assert.match(answer, /Entrega en rango de Logisticos el 2026-10-03: 50 por ciento\./);
  assert.match(answer, /Entrega en rango de Surti Cervezas el 2026-10-03: 100 por ciento\./);
  assert.match(answer, /Entrega en rango de HL Logisticos el 2026-10-03: 0 por ciento\./);
  assert.match(answer, /Entrega en rango de la operación el 2026-10-03: 50 por ciento\./);
  const restricted = answerSkinet("entrega en rango general", { ...allData, summaries: data.summaries }, context.day, context).answer;
  assert.doesNotMatch(restricted, /Surti|HL/);
  const missing = answerSkinet("entrega en rango general", { ...allData, rangeReports: allData.rangeReports.slice(0, 1) }, context.day, context).answer;
  assert.match(missing, /No hay un reporte.*Surti Cervezas/);
  assert.match(missing, /No hay un reporte.*HL Logisticos/);
  assert.match(missing, /Resultado parcial: faltan reportes/);
});

test("permite pedir las tres contratistas por nombre", () => {
  const result = understandSkinet("entrega en rango de surticervezas, logisticos y HL logisticos", day);
  assert.equal(result.prompt, undefined);
  assert.equal(result.context.contractor, undefined);
  assert.equal(result.context.contractors.length, 3);
});
test("consulta placa y detalles completos del DT con contexto de rango", () => {
  const first = understandSkinet("entrega en rango del DT 123", day).context;
  assert.equal(first.plate, undefined);
  const plate = understandSkinet("estado de la placa ABC 123", day, first).context;
  assert.equal(plate.dt, undefined);
  assert.equal(plate.plate, "ABC123");
  const answer = answerSkinet("estado de la placa ABC 123", data, day, plate).answer;
  for (const value of ["DT 123", "ABC123"]) assert.ok(answer.includes(value), value);
  assert.equal(understandSkinet("DT 999", day, plate).context.plate, undefined);
});
test("distingue ausencia de datos y pide sede o contratista para rutas ambiguas", () => {
  assert.match(answerSkinet("entrega en rango", { ...data, rangeReports: [] }, day).answer, /No hay un reporte/);
  assert.match(answerSkinet("entrega en rango DT 999", data, day).answer, /No encontré/);
  assert.equal(answerSkinet("entrega en rango de Logísticos", { ...data, summaries: [...data.summaries, { contractor: "Logisticos Arenosa" }] }, day).clarify, true);
  assert.equal(answerSkinet("entrega en rango DT 123", { ...data, summaries: [...data.summaries, { contractor: "HL Logisticos" }], rangeReports: [report, { ...report, contractor: "HL Logisticos" }] }, day).clarify, true);
});

test("una consulta nueva de rango no hereda la persona anterior", () => {
  const previous = understandSkinet("entrega en rango del RR Ana", day).context;
  assert.equal(previous.rr, "ana");
  const result = understandSkinet("como va el entrega en rango de logisticos galapa", day, previous);
  assert.equal(result.context.rr, undefined);
  assert.equal(result.context.person, undefined);
  assert.deepEqual(result.context.metrics, ["range"]);
  assert.match(answerSkinet("como va el entrega en rango de logisticos galapa", data, day, result.context).answer, /Entrega en rango de Logisticos hoy: 50 por ciento/);
});

test("consulta cliente por nombre o código y da el detalle de sus visitas", () => {
  const byName = understandSkinet("información del cliente Tienda Uno", day);
  assert.equal(byName.context.client, "tienda uno");
  assert.match(answerSkinet("información del cliente Tienda Uno", data, day, byName.context).answer, /varios clientes.*código 1.*código 2/);
  const answer = answerSkinet("cliente código 2", data, day).answer;
  assert.match(answer, /Cliente Tienda Uno \(código 2\)/);
  assert.match(answer, /DT 123, placa ABC123/);
  assert.match(answer, /fuera de rango.*Reubicación/);
  assert.match(answerSkinet("cliente código 1", data, day).answer, /Cliente Tienda Uno/);
  assert.match(answerSkinet("cliente código 99", data, day).answer, /No encontré al cliente/);
  const modulationOnly = { ...data, rangeReports: [], modulations: [{ contratista: "Logisticos", fechaDespacho: day, dt: "123", codigoCliente: "99", nombreCliente: "Tienda Nueva", totalCajas: "12", cajasGestionadas: "5" }] };
  assert.match(answerSkinet("cliente código 99", modulationOnly, day).answer, /Tienda Nueva.*12 cajas reportadas y 5 gestionadas.*No hay visitas de rango/);
});

test("información general de DT incluye avance, refusal y rango", () => {
  const complete = { ...data, records: [{ ...data.records[0], cajasRefusalFinal: 2 }] };
  const answer = answerSkinet("información del DT 123", complete, day).answer;
  assert.match(answer, /RR: Ana.*Placa: ABC123/);
  assert.match(answer, /Seguimiento: 5 de 10 clientes visitados/);
  assert.match(answer, /Refusal: 10 por ciento/);
  assert.match(answer, /Entrega en rango.*50 por ciento/);
});

test("compara refusal entre contratistas cuando preguntan cuál lleva más", () => {
  const comparison = { ...data, summaries: [{ contractor: "Logisticos" }, { contractor: "HL Logisticos" }, { contractor: "Surti Cervezas" }], records: [
    { ...data.records[0], transportista: "Logisticos", cajas: 100, cajasRefusalFinal: 4 },
    { ...data.records[0], transportista: "HL Logisticos", transporte: "456", cajas: 50, cajasRefusalFinal: 10 },
    { ...data.records[0], transportista: "Surti Cervezas", transporte: "789", cajas: 200, cajasRefusalFinal: 2 },
  ] };
  const answer = answerSkinet("logisticos es el que lleva mas refusal", comparison, day);
  assert.match(answer.answer, /Logisticos no es la contratista con mayor refusal/);
  assert.match(answer.answer, /HL Logisticos/);
  assert.match(answer.answer, /Logisticos: 4 por ciento/);
});

test("la API de rango acota la fecha sin quitar el alcance de sesión", async () => {
  let session = { contractor: "Logisticos", accessToken: "test", isAdmin: false };
  const queries = [];
  const scope = compile("./adminScope.ts", { "./contractors.ts": contractors });
  const route = compile("../api/admin/rango/route.ts", {
    "../../../lib/adminScope": scope,
    "../../../lib/adminDateFilter": compile("./adminDateFilter.ts"),
    "../../../lib/rangeRecordedTime": { addHistoricalRangeTimes: reports => reports },
    "../../../lib/authServer": { getAuthenticatedSession: async () => session },
    "../../../lib/contractors": contractors,
    "../../../lib/supabaseServer": { supabaseAdminHeaders: () => null, supabaseUserHeaders: () => ({ Authorization: "Bearer test" }), supabaseRest: (table, query) => `https://example.test/${table}${query}` },
    "../../../lib/serverCache": { cachedJsonFetch: async (_key, _ttl, url) => { queries.push(new URL(url).searchParams); return []; } },
    "next/server": { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } },
  });
  const request = new Request(`https://example.test?desde=${day}&hasta=${day}`);
  assert.equal((await route.GET(request)).status, 200);
  assert.equal(queries[0].get("contractor"), "eq.Logisticos");
  assert.deepEqual(queries[0].getAll("operational_date"), [`gte.${day}`, `lte.${day}`]);
  session = { ...session, contractor: "Admin Arenosa", email: "adminare@gmail.com", isAdmin: true, isSiteAdmin: true };
  assert.equal((await route.GET(request)).status, 200);
  assert.match(queries[1].get("and"), /Logisticos Arenosa/);
  assert.equal((await route.GET(new Request("https://example.test?desde=2026-02-30"))).status, 400);
  session = null;
  assert.equal((await route.GET(request)).status, 403);
  assert.equal(queries.length, 2);
});
