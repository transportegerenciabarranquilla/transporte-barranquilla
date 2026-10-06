import { routePerformanceContractor } from "./routePerformanceContractors";

type RangeReport = {
  contractor?: string;
  operationalDate?: string;
  kind?: string;
  updatedAt?: string;
  summary?: { startedRows?: number; inRange?: number };
};

export function surtiRangeFromReports(reports: readonly RangeReport[]) {
  const byDate = new Map<string, RangeReport>();
  for (const report of reports) {
    if (routePerformanceContractor(report.contractor) !== "Surti Cervezas" || !/^\d{4}-\d{2}-\d{2}$/.test(report.operationalDate || "")) continue;
    const existing = byDate.get(report.operationalDate!);
    if (!existing || (report.kind === "closure" && existing.kind !== "closure") || (report.kind === existing.kind && (report.updatedAt || "") > (existing.updatedAt || ""))) {
      byDate.set(report.operationalDate!, report);
    }
  }
  let started = 0;
  let inRange = 0;
  let days = 0;
  for (const report of byDate.values()) {
    const total = Number(report.summary?.startedRows);
    const matched = Number(report.summary?.inRange);
    if (!Number.isSafeInteger(total) || total <= 0 || !Number.isSafeInteger(matched) || matched < 0 || matched > total) continue;
    started += total;
    inRange += matched;
    days++;
  }
  return days ? { started, inRange, days, value: inRange / started * 100 } : null;
}
