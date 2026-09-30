import { contractorLabel } from "./contractors";
import { RANGE_REASONS } from "./rangeReasons";
import { RANGE_HOUR_WINDOWS, rangeHour, recordedRangeTime } from "./rangeHours";
import type { PuntoCoronaRouteRow } from "./puntoCoronaRoutesStorage";

type ReasonRow = Pick<PuntoCoronaRouteRow, "status" | "withinRadius" | "manualOutOfRadiusReason" | "outOfRadiusReason" | "skippedReason" | "outOfRadiusTime" | "outOfRadiusRecordedAt" | "outOfRadiusRecordedSource"> & { contractor: string };

export function filterRangeHours(rows: ReasonRow[], hour: string) {
  const window = RANGE_HOUR_WINDOWS.find(item => item.value === hour);
  return rows.filter(row => {
    if (hour === "all") return true;
    const recorded = rangeHour(recordedRangeTime(row));
    if (hour === "unknown") return recorded === null;
    if (recorded === null) return false;
    if (hour === "other") return recorded < 6 || recorded >= 16;
    return window ? recorded >= window.start && recorded < window.end : recorded === Number(hour);
  });
}

function normalize(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

export function summarizeRangeReasons(rows: ReasonRow[]) {
  const groups = new Map<string, { contractor: string; counts: number[]; total: number; unclassified: number; hours: number[]; unknownHour: number; reasonTimes: string[][]; reasonUnknownHours: number[] }>();
  for (const row of rows) {
    if (row.status === "NOT_STARTED" || row.withinRadius !== false) continue;
    const contractor = contractorLabel(row.contractor) || "Sin contratista";
    const group = groups.get(contractor) || { contractor, counts: RANGE_REASONS.map(() => 0), total: 0, unclassified: 0, hours: Array<number>(24).fill(0), unknownHour: 0, reasonTimes: RANGE_REASONS.map(() => [] as string[]), reasonUnknownHours: RANGE_REASONS.map(() => 0) };
    const hour = rangeHour(recordedRangeTime(row));
    if (hour === null) group.unknownHour += 1;
    else group.hours[hour] += 1;
    const raw = normalize(row.manualOutOfRadiusReason || row.outOfRadiusReason || row.skippedReason || "");
    const reason = raw === "apoyo ingreso" ? "apoyo de ingreso" : raw;
    const index = RANGE_REASONS.findIndex((value) => normalize(value) === reason);
    group.total += 1;
    if (index >= 0) {
      group.counts[index] += 1;
      const time = recordedRangeTime(row);
      if (time) group.reasonTimes[index].push(time);
      else group.reasonUnknownHours[index] += 1;
    }
    else group.unclassified += 1;
    groups.set(contractor, group);
  }
  return [...groups.values()].map(group => ({ ...group, reasonTimes: group.reasonTimes.map(times => [...new Set(times)].sort()) }))
    .sort((a, b) => a.contractor.localeCompare(b.contractor, "es-CO"));
}
