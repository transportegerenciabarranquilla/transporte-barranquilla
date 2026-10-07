import { normalizeContractorName } from "../../../lib/contractors";
import { normalizeDocument, parseClockSeconds } from "../../../lib/effectiveRest";
import type { CrewRole, TdRow } from "./types";

export type GeoAttendanceSnapshot = {
  operationalDate: string;
  rows: Array<{ identificador?: string; nombreCompleto?: string; contratista?: string; fechaKey?: string; salida?: string }>;
};

export type PostArrivalEntry = {
  key: string;
  dt: string;
  trip: string;
  plate: string;
  carrier: string;
  role: CrewRole;
  name: string;
  document: string;
  arrival: string;
  geoDeparture: string;
  durationSeconds: number | null;
};

const DAY_SECONDS = 86400;

function nextDate(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

export function buildPostArrivalEntries(rows: TdRow[], snapshots: GeoAttendanceSnapshot[]): PostArrivalEntry[] {
  return rows.flatMap((row) => {
    const arrivalSeconds = parseClockSeconds(row.routeArrival);
    const date = row.dispatchDate;
    const followingDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? nextDate(date) : "";
    return (["rr", "aux", "conductor"] as CrewRole[]).flatMap((role) => {
      const member = row.crew[role];
      if (!member.validPerson) return [];
      const document = normalizeDocument(member.document);
      const candidates = document && arrivalSeconds !== null ? snapshots.flatMap((snapshot) =>
        snapshot.rows.filter((person) =>
          normalizeDocument(person.identificador) === document
          && [date, followingDate].includes(person.fechaKey || snapshot.operationalDate)
          && person.salida,
        ).map((person) => ({ person, date: person.fechaKey || snapshot.operationalDate })),
      ) : [];
      const sameContractor = candidates.filter(({ person }) => normalizeContractorName(person.contratista) === normalizeContractorName(row.carrier));
      const matching = sameContractor.length ? sameContractor : candidates;
      const departures = matching.flatMap(({ person, date: departureDate }) => {
        const seconds = parseClockSeconds(person.salida);
        if (seconds === null) return [];
        const duration = seconds - arrivalSeconds! + (departureDate === followingDate ? DAY_SECONDS : 0);
        return duration >= 0 && duration <= DAY_SECONDS ? [{ time: person.salida || "", duration }] : [];
      }).sort((a, b) => a.duration - b.duration);
      const departure = departures[0];
      return [{
        key: `${row.id}:${role}`,
        dt: row.dt,
        trip: row.trip,
        plate: row.plate,
        carrier: row.carrier,
        role,
        name: member.name,
        document: member.document,
        arrival: row.routeArrival,
        geoDeparture: departure?.time || "",
        durationSeconds: departure?.duration ?? null,
      }];
    });
  });
}
