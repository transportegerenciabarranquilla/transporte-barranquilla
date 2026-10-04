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
const understanding = compile("./skinetUnderstanding.ts");
const { understandSkinet, isSkinetIdentityQuestion, SKINET_IDENTITY_REPLY } = understanding;
const { SkinetVoice, skinetWake, isSkinetQuestion } = compile("./skinetVoice.ts", { "./skinetUnderstanding": understanding });
const { answerSkinet, skinetQuestionDate, skinetOperationReport } = compile("./skinetAnswers.ts", { "./contractors": compile("./contractors.ts"), "./skinetUnderstanding": understanding });
const { startSkinetReports, SKINET_REPORT_INTERVAL } = compile("./skinetReports.ts");
const day = "2026-10-04";
const data = {
  summaries: [{ contractor: "Logisticos" }, { contractor: "Logisticos Arenosa" }],
  records: [
    { transporte: "123", transportista: "Logisticos", cajas: 1000, cajasRefusalFinal: 12, clientes: 10, visitados: 5 },
    { transporte: "456", transportista: "Logisticos Arenosa", cajas: 100, cajasRefusalFinal: 20 },
    { transporte: "789", transportista: "HL Logisticos", cajas: 100, cajasRefusalFinal: 90 },
  ],
  modulations: [{ contratista: "Logisticos", createdAt: `${day}T13:00:00Z` }],
};

test("reconoce el nombre y no palabras parecidas ni conversaciones ajenas", () => {
  assert.deepEqual(skinetWake("hola Skinet, cuánto va el refusal"), { question: "cuánto va el refusal" });
  assert.deepEqual(skinetWake("Sky net"), { question: "" });
  assert.deepEqual(skinetWake("oe Skainet, quién eres"), { question: "quién eres" });
  assert.deepEqual(skinetWake("hola skai net"), { question: "" });
  assert.equal(skinetWake("hola, cuánto va el refusal"), null);
  assert.equal(skinetWake("skinetico"), null);
});
test("pide la sede sin mezclar contratistas y calcula refusal ponderado", () => {
  assert.equal(answerSkinet("cuánto va el refusal de Logísticos", data, day).clarify, true);
  const answer = answerSkinet("cuánto va el refusal de Logísticos Galapa", data, day).answer;
  assert.match(answer, /1,2 por ciento/);
  assert.match(answer, /12 cajas pendientes/);
  assert.doesNotMatch(answer, /20 cajas pendientes|90 cajas pendientes/);
});
test("respeta el alcance regional y no inventa porcentajes sin rutas", () => {
  const regional = { ...data, summaries: [{ contractor: "Logisticos Arenosa" }] };
  assert.match(answerSkinet("refusal de Logísticos", regional, day).answer, /20 por ciento/);
  assert.match(answerSkinet("refusal de Logísticos Galapa", regional, day).answer, /alcance de tu sesión/);
  assert.match(answerSkinet("refusal de Logísticos Arenosa", { ...regional, records: [] }, day).answer, /no puedo calcular/);
});
test("responde modulaciones, avance y fechas sin una consulta histórica completa", () => {
  assert.match(answerSkinet("cuántas modulaciones de Logísticos Galapa", data, day).answer, /lleva 1 modulación/);
  assert.match(answerSkinet("avance de Logísticos Galapa", data, day).answer, /50 por ciento/);
  assert.equal(skinetQuestionDate("refusal de ayer", day), "2026-10-03");
  assert.equal(skinetQuestionDate("refusal del 2026-09-01", day), "2026-09-01");
  assert.throws(() => skinetQuestionDate("refusal 2026-02-30", day));
});

test("la pregunta sobre cajas moduladas a HL consulta modulación y separa las reubicadas", () => {
  const hlData = {
    summaries: [{ contractor: "HL Logisticos" }],
    records: [{ transportista: "HL Logisticos", cajas: 5000, cajasRefusalFinal: 198 }],
    modulations: [
      { contratista: "HL Logistica", totalCajas: "120", cajasGestionadas: "2", fechaDespacho: day },
      { contratista: "HL Logisticos", totalCajas: "80", cajasGestionadas: "0", fechaDespacho: "04/10/2026" },
      { contratista: "Logisticos", totalCajas: "999", cajasGestionadas: "999", fechaDespacho: day },
      { contratista: "HL Logisticos", totalCajas: "999", cajasGestionadas: "999", fechaDespacho: "2026-10-03" },
    ],
  };
  assert.equal(answerSkinet("oe skinet cuántas cajas le han modulado a hl", hlData, day).answer,
    "HL hoy lleva 200 cajas moduladas y 2 reubicadas, mijo.");
  assert.match(answerSkinet("cuántas cajas han reubicado a h l", hlData, day).answer, /2 cajas reubicadas de 200 moduladas/);
});

function fixture(answer = async () => "Refusal: 1,2 por ciento.", options = { questionDelayMs: 0 }) {
  const calls = { speeches: [], replies: [], questions: [], states: [], errors: [], started: 0, aborted: 0 };
  const recognition = { start: () => calls.started++, abort: () => calls.aborted++ };
  const voice = new SkinetVoice(recognition, {
    answer, speak: (text, done) => calls.speeches.push({ text, done }), cancelSpeech: () => {},
    reply: text => calls.replies.push(text), question: text => calls.questions.push(text),
    status: state => calls.states.push(state), error: text => calls.errors.push(text),
  }, options);
  const say = (text, isFinal = true) => recognition.onresult({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text } }] });
  return { calls, voice, recognition, say };
}
test("saluda al llamarlo, escucha la pregunta y pausa reconocimiento durante su respuesta", async () => {
  const { calls, voice, say } = fixture();
  voice.start();
  say("ruido de fondo");
  say("Skinet", false);
  assert.equal(calls.speeches.length, 0);
  say("hola Skinet");
  assert.equal(calls.speeches[0].text, "Oe, ¿en qué te ayudo?");
  say("Skinet"); // No escucha su propia voz.
  assert.equal(calls.speeches.length, 1);
  calls.speeches[0].done();
  say("cuánto va el refusal");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.questions, ["cuánto va el refusal"]);
  assert.equal(calls.speeches[1].text, "Refusal: 1,2 por ciento.");
  calls.speeches[1].done();
  assert.equal(calls.states.at(-1), "question");
  voice.stop();
});
test("si se apaga mientras consulta, descarta la respuesta pendiente", async () => {
  let finish;
  const { voice, calls } = fixture(() => new Promise(resolve => { finish = resolve; }));
  voice.start();
  const pending = voice.ask("refusal");
  voice.stop();
  finish("Respuesta vieja");
  await pending;
  assert.equal(calls.replies.length, 0);
  assert.equal(calls.states.at(-1), "off");
});
test("denegar el micrófono detiene la escucha y presenta un mensaje claro", () => {
  const { voice, recognition, calls } = fixture();
  voice.start();
  recognition.onerror({ error: "not-allowed" });
  assert.equal(calls.states.at(-1), "off");
  assert.match(calls.errors[0], /Permite el micrófono/);
});
test("un error de consulta apaga el micrófono sin reiniciar escucha en segundo plano", async () => {
  const { voice, calls } = fixture(async () => { throw new Error("Sin conexión"); });
  voice.start();
  await voice.ask("cuántas cajas");
  assert.equal(calls.states.at(-1), "off");
  assert.match(calls.errors[0], /No pude consultar los datos/);
});
test("responde preguntas operativas directas sin botón ni palabra de llamada", async () => {
  const { voice, calls, say } = fixture();
  voice.start();
  say("cuántas cajas le han modulado a HL");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.questions, ["cuántas cajas le han modulado a HL"]);
  assert.equal(calls.speeches[0].text, "Refusal: 1,2 por ciento.");
  voice.stop();
});

test("la conversación conserva el dato y la fecha al cambiar contratista, sin arrastrar la sede", () => {
  const first = understandSkinet("cómo va el refusal de Logísticos Galapa ayer", day).context;
  const next = understandSkinet("¿y HL?", day, first).context;
  assert.deepEqual(next.metrics, ["refusal"]);
  assert.equal(next.contractor, "hl");
  assert.equal(next.site, undefined);
  assert.equal(next.day, "2026-10-03");
  const today = understandSkinet("y hoy", day, next).context;
  assert.equal(today.day, day);
  assert.equal(today.contractor, "hl");
});

test("una respuesta de sede completa la pregunta ambigua, y todas elimina el alcance anterior", () => {
  const first = understandSkinet("cuánto va el refusal de Logísticos", day).context;
  const next = understandSkinet("Galapa", day, first);
  assert.equal(next.prompt, undefined);
  assert.equal(next.context.contractor, "logisticos");
  assert.match(answerSkinet("Galapa", data, day, next.context).answer, /1,2 por ciento/);
  const all = understandSkinet("y de todas", day, next.context).context;
  assert.equal(all.contractor, undefined);
  assert.equal(all.site, undefined);
  assert.deepEqual(all.metrics, ["refusal"]);
});

test("reubicadas y cajas de salida no se confunden con total modulado o número de rutas", () => {
  const first = understandSkinet("cuántas cajas han modulado a HL", day).context;
  const next = understandSkinet("¿y cuántas reubicadas?", day, first).context;
  assert.deepEqual(next.metrics, ["relocated"]);
  assert.equal(next.contractor, "hl");
  assert.deepEqual(understandSkinet("cuántas cajas de salida lleva HL", day).context.metrics, ["boxes"]);
  assert.equal(understandSkinet("dime todas las cajas moduladas de HL", day).context.contractor, "hl");
  assert.deepEqual(understandSkinet("cuántos vehículos salieron de HL", day).context.metrics, ["departures"]);
});

test("entiende variantes de transcripción y fechas escritas o habladas", () => {
  for (const name of ["HL", "h l", "hache ele", "HL Logística"]) {
    assert.equal(understandSkinet(`dime el refiusal de ${name}`, day).context.contractor, "hl");
    assert.deepEqual(understandSkinet(`dime el refiusal de ${name}`, day).context.metrics, ["refusal"]);
  }
  assert.equal(understandSkinet("porcentaje de rechazo de PuntoCorona", day).context.contractor, "corona");
  assert.equal(skinetQuestionDate("el 3 de octubre", day), "2026-10-03");
  assert.equal(skinetQuestionDate("el 03/10/2026", day), "2026-10-03");
  assert.equal(skinetQuestionDate("antes de ayer", day), "2026-10-02");
  assert.throws(() => skinetQuestionDate("el 31 de febrero", day));
});

test("conserva el DT para nuevas métricas y lo elimina al cambiar de contratista", () => {
  const first = understandSkinet("placa del de te 1 2 3 de HL", day).context;
  assert.equal(first.dt, "123");
  assert.equal(understandSkinet("estado del DT uno dos tres de HL", day).context.dt, "123");
  const next = understandSkinet("cuántas cajas moduladas", day, first).context;
  assert.equal(next.dt, "123");
  assert.equal(next.contractor, "hl");
  assert.equal(understandSkinet("y Surti Cervezas", day, next).context.dt, undefined);
  const status = understandSkinet("quién es el conductor", day).context;
  assert.equal(understandSkinet("123", day, status).context.dt, "123");
});

test("no transforma preguntas ajenas ni contratistas múltiples en cifras supuestas", () => {
  const previous = understandSkinet("refusal de HL", day).context;
  assert.match(understandSkinet("cuál es el clima", day, previous).prompt, /no capté/);
  assert.match(understandSkinet("refusal de HL y Logísticos", day).prompt, /una contratista a la vez/);
  assert.match(understandSkinet("otra pregunta", day, previous).prompt, /no capté/);
  assert.equal(isSkinetQuestion("dime el refiusal de hache ele"), true);
  assert.equal(isSkinetQuestion("y HL"), true);
  assert.equal(isSkinetQuestion("y HL de ayer"), true);
  assert.equal(isSkinetQuestion("están moviendo cajas en el patio"), false);
});

test("el resumen de operación usa cifras actuales y solo contratistas autorizadas", () => {
  const report = skinetOperationReport(data, day);
  assert.match(report, /Tenemos 2 rutas/);
  assert.match(report, /5 de 10 clientes/);
  assert.match(report, /2,91 por ciento/);
  assert.doesNotMatch(report, /90 cajas/);
  assert.match(skinetOperationReport({ summaries: data.summaries, records: [], modulations: [] }, day), /no hay cajas de salida/);
});

function reportFixture(load = async () => "Reporte actual") {
  let now = 0;
  let visible = true;
  let busy = false;
  let delivered = [];
  let loads = 0;
  let errors = 0;
  let id = 0;
  const timers = new Map();
  const reports = startSkinetReports({
    now: () => now, visible: () => visible, busy: () => busy,
    load: () => { loads++; return load(); }, deliver: report => { delivered.push(report); return true; },
    error: () => errors++, setTimer: (task, delay) => { timers.set(++id, { task, at: now + delay }); return id; },
    clearTimer: value => timers.delete(value),
  });
  return {
    reports, timers, delivered, loads: () => loads, errors: () => errors,
    visible: value => { visible = value; }, busy: value => { busy = value; },
    advance: async value => {
      now += value;
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= now);
      due.forEach(([key, timer]) => { timers.delete(key); timer.task(); });
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}
test("el primer reporte llega a los 20 minutos y se repite cada 20, sin lecturas anticipadas", async () => {
  const f = reportFixture();
  assert.equal(SKINET_REPORT_INTERVAL, 1_200_000);
  await f.advance(SKINET_REPORT_INTERVAL - 1);
  assert.equal(f.loads(), 0);
  await f.advance(1);
  assert.deepEqual(f.delivered, ["Reporte actual"]);
  await f.advance(SKINET_REPORT_INTERVAL);
  assert.equal(f.delivered.length, 2);
  f.reports.stop();
  assert.equal(f.timers.size, 0);
});
test("el reporte espera si hay conversación y al volver no acumula reportes antiguos", async () => {
  const f = reportFixture();
  f.busy(true);
  await f.advance(SKINET_REPORT_INTERVAL);
  assert.equal(f.loads(), 0);
  f.busy(false);
  f.visible(false);
  await f.advance(SKINET_REPORT_INTERVAL * 3);
  assert.equal(f.loads(), 0);
  f.visible(true);
  f.reports.check();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.delivered.length, 1);
  f.reports.stop();
});
test("si se cierra la sesión durante la consulta, no lee el reporte pendiente", async () => {
  let finish;
  const f = reportFixture(() => new Promise(resolve => { finish = resolve; }));
  await f.advance(SKINET_REPORT_INTERVAL);
  f.reports.stop();
  finish("Reporte viejo");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.delivered.length, 0);
});
test("el informe hablado pausa reconocimiento y después restaura la escucha", () => {
  const { voice, calls, say } = fixture();
  voice.start();
  assert.equal(voice.announce("Así va la operación"), true);
  say("cuántas cajas");
  assert.equal(calls.questions.length, 0);
  calls.speeches[0].done();
  assert.equal(calls.states.at(-1), "wake");
  say("Skinet");
  assert.equal(voice.announce("Otro informe"), false);
  voice.stop();
});

test("la frase exacta del usuario consulta el refusal de ayer sin pedirle escoger un dato", () => {
  const question = "cómo quedó el refusal el día de ayer";
  const result = understandSkinet(question, day);
  assert.equal(result.prompt, undefined);
  assert.deepEqual(result.context.metrics, ["refusal"]);
  assert.equal(result.context.day, "2026-10-03");
  assert.equal(isSkinetQuestion(question), true);
  const answer = answerSkinet(question, data, result.context.day, result.context).answer;
  assert.match(answer, /refusal de la operación ayer/);
  assert.doesNotMatch(answer, /quieres saber/);
  for (const spelling of ["re fusal", "refuzal", "re fu sal", "refiusal"]) {
    assert.deepEqual(understandSkinet(`cómo quedó el ${spelling} el día de ayer`, day).context.metrics, ["refusal"]);
  }
});
test("junta fragmentos finales y espera a que terminen los parciales antes de responder", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { voice, calls, say } = fixture(undefined, { questionDelayMs: 1_000 });
  voice.start();
  say("cómo quedó el");
  t.mock.timers.tick(500);
  say("refusal el día de", false);
  t.mock.timers.tick(600);
  assert.equal(calls.questions.length, 0);
  say("refusal el día de ayer");
  t.mock.timers.tick(999);
  assert.equal(calls.questions.length, 0);
  t.mock.timers.tick(1);
  await Promise.resolve();
  assert.deepEqual(calls.questions, ["cómo quedó el refusal el día de ayer"]);
  voice.stop();
});
test("la llamada y una pregunta partida en la misma frase tampoco dispara una aclaración prematura", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { voice, calls, say } = fixture(undefined, { questionDelayMs: 1_000 });
  voice.start();
  say("oe Skinet cómo quedó el");
  t.mock.timers.tick(500);
  say("refusal el día de ayer");
  assert.equal(calls.questions.length, 0);
  assert.equal(calls.speeches.length, 0);
  t.mock.timers.tick(1_000);
  await Promise.resolve();
  assert.deepEqual(calls.questions, ["cómo quedó el refusal el día de ayer"]);
  voice.stop();
});
test("reconoce la pregunta de identidad sin confundirla con el responsable de una ruta", async () => {
  for (const question of ["quién eres", "oe Skainet quién eres tú", "quién es Skainet", "cómo te llamas", "preséntate"]) {
    assert.equal(isSkinetIdentityQuestion(question), true);
    assert.equal(isSkinetQuestion(question), true);
  }
  assert.equal(isSkinetIdentityQuestion("quién es el responsable del DT 123"), false);
  const { voice, calls, say } = fixture(async question => isSkinetIdentityQuestion(question) ? SKINET_IDENTITY_REPLY : "Datos");
  voice.start();
  say("quién eres");
  await Promise.resolve();
  assert.equal(calls.speeches[0].text, "¡Yo soy Skainet! ¡Y tú no eres nadie delante mío!");
  voice.stop();
});
