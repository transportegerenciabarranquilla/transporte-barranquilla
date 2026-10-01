import { normalizeContractorName } from "./contractors";
import type { CheckinCajasRegistro } from "./checkinStorage";
import { normalizeDt, summarizeModulaciones, type ModulacionRegistro } from "./modulacionStorage";

export type ComparisonCheckin = CheckinCajasRegistro & { contratista?: string };

export function checkinDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function compareModulaciones(checkins: ComparisonCheckin[], modulations: ModulacionRegistro[]) {
  const key = (dt: string, contractor?: string) => JSON.stringify([normalizeContractorName(contractor), normalizeDt(dt)]);
  const latest = new Map<string, ComparisonCheckin>();
  for (const record of checkins) {
    if (!normalizeDt(record.dt) || !record.contratista) continue;
    const id = key(record.dt, record.contratista);
    const previous = latest.get(id);
    if (!previous || new Date(record.updatedAt || record.createdAt).getTime() > new Date(previous.updatedAt || previous.createdAt).getTime()) latest.set(id, record);
  }
  const groups = new Map<string, ModulacionRegistro[]>();
  for (const record of modulations) {
    const id = key(record.dt, record.contratista);
    const group = groups.get(id) || [];
    group.push(record);
    groups.set(id, group);
  }
  return [...latest.entries()].map(([id, checkin]) => {
    const records = groups.get(id) || [];
    const summary = summarizeModulaciones(records);
    return {
      id, dt: normalizeDt(checkin.dt), contractor: checkin.contratista!,
      date: checkinDate(checkin.createdAt), checkin: checkin.totalCajas,
      modulated: summary.cajasRechazadas, managed: summary.cajasGestionadas,
      people: summary.moduladores.join(", "), count: records.length,
      missing: checkin.totalCajas > 0 && records.length === 0,
    };
  }).sort((a, b) => Number(b.missing) - Number(a.missing) || b.date.localeCompare(a.date) || a.dt.localeCompare(b.dt));
}
