const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

const { answerSkinet } = require("./skinetAnswers.ts");

test("más cajas de refusal compara el campo de refusal por DT, no las cajas totales", () => {
  const answer = answerSkinet("qué DT tienes más cajas de refusal", {
    summaries: [{ contractor: "Logisticos" }, { contractor: "Surti Cervezas" }],
    records: [
      { transporte: "8001", transportista: "Logisticos", cajas: 2000, cajasRefusalFinal: 981, nombreResponsable: "Sin responsable" },
      { transporte: "8002", transportista: "Surti Cervezas", cajas: 1000, cajasRefusalFinal: 1200, nombreResponsable: "RR Surti" },
    ],
  }, "2026-10-06").answer;
  assert.match(answer, /DT 8002/);
  assert.match(answer, /Surti Cervezas/);
  assert.match(answer, /1\.200 cajas de refusal/);
  assert.doesNotMatch(answer, /DT 8001/);
});
