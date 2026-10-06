import { isRrRole } from "./rrRole";
import { PEOPLE_ROUTE_QUESTIONS } from "./peopleRouteQuestions";

export type EvaluationRole = keyof typeof PEOPLE_ROUTE_QUESTIONS;
export type EvaluationAnswer = "si" | "no" | "na";
export type EvaluationPerson = { key: string; cc: string; nombre: string; cargo: string; contratista: string; role: EvaluationRole | null };
export type EvaluationResult = { id: string; createdAt: string };
export type EvaluationQuestion = { id: string; text: string };
export const MAX_ROUTE_EVALUATION_QUESTIONS = 50;
const customQuestionId = /^adicional-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function evaluationRole(cargo: string): EvaluationRole | null {
  if (isRrRole(cargo)) return "responsable";
  const value = cargo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  if (/^(conductor|conductor de reparto|conductor de distribucion|conductor repartidor)$/.test(value)) return "conductor";
  if (/^(auxiliar|auxiliar de reparto|auxiliar reparto|auxiliar de distribucion|auxiliar distribucion)$/.test(value)) return "auxiliar";
  return null;
}

export function validateEvaluationAnswers(role: EvaluationRole, value: unknown): Record<string, EvaluationAnswer> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Responde todas las preguntas con Sí, No o N/A.");
  const answers = value as Record<string, unknown>;
  const questions = PEOPLE_ROUTE_QUESTIONS[role].questions;
  if (Object.keys(answers).length !== questions.length) throw new Error("Responde todas las preguntas del cargo seleccionado.");
  const result: Record<string, EvaluationAnswer> = {};
  for (const question of questions) {
    const answer = answers[question.id];
    if (answer !== "si" && answer !== "no" && answer !== "na") throw new Error("Responde todas las preguntas con Sí, No o N/A.");
    result[question.id] = answer;
  }
  return result;
}

export function validateEvaluationForm(role: EvaluationRole, questionsValue: unknown, answersValue: unknown, allowedExistingIds?: Iterable<string>) {
  const originals = PEOPLE_ROUTE_QUESTIONS[role].questions;
  const questions = questionsValue === undefined ? originals : questionsValue;
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > MAX_ROUTE_EVALUATION_QUESTIONS) throw new Error("La evaluación debe tener entre 1 y 50 preguntas.");
  const allowed = new Set(allowedExistingIds ?? originals.map(question => question.id));
  const ids = new Set<string>();
  const validated: EvaluationQuestion[] = [];
  for (const question of questions) {
    if (!question || typeof question !== "object" || typeof question.id !== "string" || (!allowed.has(question.id) && !customQuestionId.test(question.id)) || ids.has(question.id) || typeof question.text !== "string") throw new Error("Revisa las preguntas de la evaluación.");
    const text = question.text.trim();
    if (!text || text.length > 1000) throw new Error("Cada pregunta debe tener entre 1 y 1000 caracteres.");
    ids.add(question.id);
    validated.push({ id: question.id, text });
  }
  if (!answersValue || typeof answersValue !== "object" || Array.isArray(answersValue)) throw new Error("Responde todas las preguntas con Sí, No o N/A.");
  const answers = answersValue as Record<string, unknown>;
  if (Object.keys(answers).length !== validated.length || Object.keys(answers).some(id => !ids.has(id))) throw new Error("Responde todas las preguntas visibles antes de guardar.");
  const result: Record<string, EvaluationAnswer> = {};
  for (const question of validated) {
    const answer = answers[question.id];
    if (answer !== "si" && answer !== "no" && answer !== "na") throw new Error("Responde todas las preguntas con Sí, No o N/A.");
    result[question.id] = answer;
  }
  return { questions: validated, answers: result };
}
