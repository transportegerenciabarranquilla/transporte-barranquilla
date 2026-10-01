import test from "node:test";
import assert from "node:assert/strict";
import { evaluationRole, validateEvaluationAnswers, type EvaluationRole } from "./peopleRouteEvaluation.ts";
import { PEOPLE_ROUTE_QUESTIONS } from "./peopleRouteQuestions.ts";
import { getVisiblePortalModules } from "../components/portalModules.ts";

test("elige el cuestionario por cargo sin asignar cargos desconocidos", () => {
  assert.equal(evaluationRole("CONDUCTOR"), "conductor");
  assert.equal(evaluationRole("Responsable de ruta"), "responsable");
  assert.equal(evaluationRole("RR"), "responsable");
  assert.equal(evaluationRole("Auxiliar de distribución"), "auxiliar");
  assert.equal(evaluationRole("Auxiliar administrativo"), null);
  assert.equal(evaluationRole(""), null);
});

test("conserva las 51 preguntas y acepta únicamente respuestas completas del cargo", () => {
  assert.deepEqual(Object.values(PEOPLE_ROUTE_QUESTIONS).map(group => group.questions.length), [24, 22, 5]);
  for (const role of Object.keys(PEOPLE_ROUTE_QUESTIONS) as EvaluationRole[]) {
    const questions = PEOPLE_ROUTE_QUESTIONS[role].questions;
    assert.equal(new Set(questions.map(question => question.id)).size, questions.length);
    const answers = Object.fromEntries(questions.map((question, index) => [question.id, ["si", "no", "na"][index % 3]]));
    assert.deepEqual(validateEvaluationAnswers(role, answers), answers);
    assert.throws(() => validateEvaluationAnswers(role, { ...answers, extra: "si" }));
    assert.throws(() => validateEvaluationAnswers(role, { ...answers, [questions[0].id]: "tal vez" }));
    assert.throws(() => validateEvaluationAnswers(role, { ...answers, [questions[0].id]: true }));
    delete answers[questions[0].id];
    assert.throws(() => validateEvaluationAnswers(role, answers));
  }
  assert.throws(() => validateEvaluationAnswers("conductor", null));
  assert.throws(() => validateEvaluationAnswers("conductor", []));
});

test("el módulo nuevo se muestra en People y no en el portal de contratistas", () => {
  const href = "/personas/evaluaciones-ruta";
  assert.ok(getVisiblePortalModules({ isPeople: true }).some(module => module.href === href));
  assert.ok(!getVisiblePortalModules({ contractor: "Logisticos" }).some(module => module.href === href));
});
