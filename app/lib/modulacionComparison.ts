import { normalizeContractorName } from "./contractors";
import type { CheckinCajasRegistro } from "./checkinStorage";
import { normalizeDt, summarizeModulaciones, type ModulacionRegistro } from "./modulacionStorage";

export type ComparisonCheckin = CheckinCajasRegistro & { contratista?: string };
export type ComparisonAssignment = {
  transporte?: string;
  transportista?: string;
  nombreResponsable?: string;
  responsable?: string;
  fechaDespacho?: string;
  fechaDt?: string;
  date?: string;
};

function assignedPerson(assignments: ComparisonAssignment[], date: string) {
  const dated = assignments.filter(record => (record.fechaDespacho || record.fechaDt || record.date || "").slice(0, 10) === date);
  const names = new Map<string, string>();
  for (const record of dated.length ? dated : assignments) {
    const name = (record.nombreResponsable || record.responsable || "").replace(/^RR\s+/i, "").trim();
    if (!name || /^(sin\b|pendiente\b|no asignado\b|por asignar\b)/i.test(name)) continue;
    names.set(name.toLocaleLowerCase("es").replace(/\s+/g, " "), name);
  }
  // El check-in puede ocurrir al día siguiente. Sin coincidencia de fecha,
  // solo usamos la asignación si los registros identifican al mismo RR.
  return names.size === 1 ? [...names.values()][0] : "";
}

export function checkinDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function compareModulaciones(checkins: ComparisonCheckin[], modulations: ModulacionRegistro[], assignments: ComparisonAssignment[] = []) {
  const key = (dt: string, contractor?: string) => JSON.stringify([normalizeContractorName(contractor), normalizeDt(dt)]);
  const assigned = new Map<string, ComparisonAssignment[]>();
  for (const record of assignments) {
    if (!record.transporte || !record.transportista) continue;
    const id = key(record.transporte, record.transportista);
    const group = assigned.get(id) || [];
    group.push(record);
    assigned.set(id, group);
  }
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
    const date = checkinDate(checkin.createdAt);
    const modulators = summary.moduladores.join(", ");
    const responsible = modulators ? "" : assignedPerson(assigned.get(id) || [], date);
    return {
      id, dt: normalizeDt(checkin.dt), contractor: checkin.contratista!,
      date, checkin: checkin.totalCajas,
      modulated: summary.cajasRechazadas, managed: summary.cajasGestionadas,
      people: modulators || responsible, assignedPerson: Boolean(responsible), count: records.length,
      missing: checkin.totalCajas > 0 && records.length === 0,
    };
  }).sort((a, b) => Number(b.missing) - Number(a.missing) || b.date.localeCompare(a.date) || a.dt.localeCompare(b.dt));
}
