export type RtiRecord = {
  day: number;
  month: string;
  year: number;
  responsible: string;
  reference: string;
  material: string;
  carrier: string;
  percentage: number;
  outbound?: number;
  returned?: number;
  dt?: string;
};

export type { RtiSummary } from "./rtiCalculation";
