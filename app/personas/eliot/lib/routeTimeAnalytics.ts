import { parseTimeSeconds } from "./time";
import type { CrewRole, TdRow } from "./types";

export type RouteTimeEntry = {
  key: string;
  name: string;
  document: string;
  averageSeconds: number | null;
  routes: number;
  pending: number;
  plates: string[];
};

export type RouteTimeRoleSummary = {
  averageSeconds: number | null;
  measured: number;
  pending: number;
  entries: RouteTimeEntry[];
};

export function parseRouteDurationSeconds(value: string): number | null {
  const text = value.trim();
  if (!text || /pendiente|sin\s*marcaci[oó]n|#valor/i.test(text)) return null;
  const clock = text.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    const seconds = Number(clock[3] || 0);
    return minutes < 60 && seconds < 60 ? hours * 3600 + minutes * 60 + seconds : null;
  }
  const numeric = Number(text.replace(",", "."));
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 7) return Math.round(numeric * 86400);
  const excelDate = text.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})/);
  if (excelDate) return Number(excelDate[1]) * 3600 + Number(excelDate[2]) * 60 + Number(excelDate[3]);
  return null;
}

export function routeDurationSeconds(row: TdRow): number | null {
  const supplied = parseRouteDurationSeconds(row.routeTime);
  if (supplied !== null) return supplied;
  if (row.routeTime.trim() || row.departureSeconds === null) return null;
  const arrival = parseTimeSeconds(row.routeArrival);
  if (arrival === null) return null;
  return (arrival - row.departureSeconds + 86400) % 86400;
}

export function summarizeRouteTime(rows: TdRow[]): Record<CrewRole, RouteTimeRoleSummary> {
  const roles: CrewRole[] = ["rr", "aux", "conductor"];
  return Object.fromEntries(roles.map((role) => {
    const people = new Map<string, { name: string; document: string; total: number; measured: number; routes: number; pending: number; plates: Set<string> }>();
    let total = 0;
    let measured = 0;
    let pending = 0;
    for (const row of rows) {
      const member = row.crew[role];
      if (!member.validPerson) continue;
      const duration = routeDurationSeconds(row);
      const key = member.document || member.name.trim().toLocaleLowerCase("es");
      const person = people.get(key) ?? { name: member.name, document: member.document, total: 0, measured: 0, routes: 0, pending: 0, plates: new Set<string>() };
      person.routes++;
      if (row.plate) person.plates.add(row.plate);
      if (duration === null) {
        person.pending++;
        pending++;
      } else {
        person.total += duration;
        person.measured++;
        total += duration;
        measured++;
      }
      people.set(key, person);
    }
    const entries = Array.from(people, ([key, person]) => ({
      key: `${role}:${key}`,
      name: person.name,
      document: person.document,
      averageSeconds: person.measured ? Math.round(person.total / person.measured) : null,
      routes: person.routes,
      pending: person.pending,
      plates: [...person.plates].sort(),
    }));
    return [role, { averageSeconds: measured ? Math.round(total / measured) : null, measured, pending, entries }];
  })) as Record<CrewRole, RouteTimeRoleSummary>;
}
