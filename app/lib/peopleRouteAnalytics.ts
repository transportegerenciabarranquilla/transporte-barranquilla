import type { EvaluationAnswer, EvaluationRole } from "./peopleRouteEvaluation";
import { PEOPLE_ROUTE_QUESTIONS } from "./peopleRouteQuestions";

export type RouteEvaluationRecord = {
  id: string; created_at: string; cc: string; nombre: string; cargo: string;
  contractor: string; survey_role: EvaluationRole; questionnaire_version: number;
  answers: Array<{ id: string; question: string; answer: EvaluationAnswer }>;
};
export type RouteAnalyticsFilters = { from: string; to: string; contractor: string; role: string };
export type AnswerCounts = { si: number; no: number; na: number };
export type RouteAnalyticsGroup = AnswerCounts & { label: string; evaluations: number; score: number | null };
export type RouteAnalytics = {
  evaluations: number; people: number; contractors: string[]; counts: AnswerCounts; score: number | null;
  byContractor: RouteAnalyticsGroup[]; byRole: RouteAnalyticsGroup[];
  trend: Array<AnswerCounts & { month: string; evaluations: number; score: number | null }>;
  questions: Array<AnswerCounts & { key: string; text: string; role: string; rate: number }>;
};

export function complianceScore(counts: AnswerCounts): number | null {
  const applicable = counts.si + counts.no;
  return applicable ? Math.round(counts.si / applicable * 1000) / 10 : null;
}

const emptyCounts = (): AnswerCounts => ({ si: 0, no: 0, na: 0 });
const bogotaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
});
const bogotaDate = (date: string) => bogotaDateFormatter.format(new Date(date));

export function buildRouteAnalytics(records: RouteEvaluationRecord[], filters: RouteAnalyticsFilters): RouteAnalytics {
  const contractors = [...new Set(records.map(row => row.contractor))].sort((a, b) => a.localeCompare(b, "es"));
  const selected = records.filter(row => {
    const day = bogotaDate(row.created_at);
    return (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to)
      && (!filters.contractor || row.contractor === filters.contractor)
      && (!filters.role || row.survey_role === filters.role);
  });
  const counts = emptyCounts();
  const byContractor = new Map<string, RouteAnalyticsGroup>();
  const byRole = new Map<string, RouteAnalyticsGroup>();
  const trend = new Map<string, RouteAnalytics["trend"][number]>();
  const questions = new Map<string, RouteAnalytics["questions"][number]>();
  for (const row of selected) {
    const role = PEOPLE_ROUTE_QUESTIONS[row.survey_role]?.label || row.cargo;
    const month = bogotaDate(row.created_at).slice(0, 7);
    if (!byContractor.has(row.contractor)) byContractor.set(row.contractor, { label: row.contractor, evaluations: 0, score: null, ...emptyCounts() });
    if (!byRole.has(role)) byRole.set(role, { label: role, evaluations: 0, score: null, ...emptyCounts() });
    if (!trend.has(month)) trend.set(month, { month, evaluations: 0, score: null, ...emptyCounts() });
    const groups = [byContractor.get(row.contractor)!, byRole.get(role)!, trend.get(month)!];
    for (const group of groups) group.evaluations++;
    for (const answer of row.answers) {
      if (!(answer.answer === "si" || answer.answer === "no" || answer.answer === "na")) continue;
      counts[answer.answer]++;
      for (const group of groups) group[answer.answer]++;
      // Keep historical questionnaire versions and changed wording separate.
      const key = JSON.stringify([row.survey_role, row.questionnaire_version, answer.id, answer.question]);
      if (!questions.has(key)) questions.set(key, { key, text: answer.question, role, rate: 0, ...emptyCounts() });
      questions.get(key)![answer.answer]++;
    }
  }
  for (const group of [...byContractor.values(), ...byRole.values(), ...trend.values()]) group.score = complianceScore(group);
  for (const question of questions.values()) question.rate = question.si + question.no ? question.no / (question.si + question.no) * 100 : 0;
  return {
    evaluations: selected.length, people: new Set(selected.map(row => row.cc)).size,
    contractors, counts, score: complianceScore(counts),
    byContractor: [...byContractor.values()].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.evaluations - a.evaluations),
    byRole: [...byRole.values()].sort((a, b) => b.evaluations - a.evaluations),
    trend: [...trend.values()].sort((a, b) => a.month.localeCompare(b.month)),
    questions: [...questions.values()].filter(q => q.no > 0).sort((a, b) => b.no - a.no || b.rate - a.rate).slice(0, 5),
  };
}
