import { isRrRole } from "./rrRole";
import { PEOPLE_ROUTE_QUESTIONS } from "./peopleRouteQuestions";

export type EvaluationRole = keyof typeof PEOPLE_ROUTE_QUESTIONS;
export type EvaluationAnswer = "si" | "no" | "na";
export type EvaluationPerson = { key: string; cc: string; nombre: string; cargo: string; contratista: string; role: EvaluationRole | null };
export type EvaluationResult = { id: string; createdAt: string };

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
