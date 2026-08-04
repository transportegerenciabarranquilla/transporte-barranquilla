export type DailyChecklistType = "departure" | "return";

export type DailyChecklistRecord = {
  id: string;
  type: DailyChecklistType;
  date: string;
  percentage: number;
  observations: string;
  contractor?: string;
  updatedAt: string;
};

export function checklistPercentage(records: DailyChecklistRecord[], type: DailyChecklistType) {
  const selected = records.filter((record) => record.type === type);
  const totalPercentage = selected.reduce((sum, record) => sum + Math.max(0, Math.min(Number(record.percentage) || 0, 100)), 0);
  return { percentage: selected.length ? Math.round((totalPercentage / selected.length) * 10) / 10 : 0, records: selected.length };
}
