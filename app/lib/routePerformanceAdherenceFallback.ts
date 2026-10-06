import { routePerformanceContractor } from "./routePerformanceContractors";
import { averagePerformance } from "./routePerformanceMetrics";

type AdherenceRow = { date: string; contractor: string; adherenceKmPercent: number | null };

export function latestSurtiAdherence(rows: readonly AdherenceRow[], until = "") {
  const available = rows.filter((row) => routePerformanceContractor(row.contractor) === "Surti Cervezas"
    && row.date && (!until || row.date <= until)
    && typeof row.adherenceKmPercent === "number" && Number.isFinite(row.adherenceKmPercent));
  if (!available.length) return null;
  const date = available.reduce((latest, row) => row.date > latest ? row.date : latest, "");
  const average = averagePerformance(available.filter((row) => row.date === date), "adherenceKmPercent");
  return average.value === null ? null : { date, count: average.count, value: average.value };
}
