export type DailyAbsenteeismRecord = {
  id: string;
  date: string;
  scheduled: number;
  absent: number;
  observations: string;
  contractor?: string;
  updatedAt: string;
};
