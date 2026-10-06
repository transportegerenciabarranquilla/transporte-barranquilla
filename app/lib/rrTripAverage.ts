import { normalizeContractorName } from "./contractors";
import { toDateKey } from "../seguimiento/utils";

// Fecha fija de inicio solicitada: no se desplaza al cambiar de día.
export const RR_TRIP_START_DATE = "2026-10-06";

export function rrTripDate(row: RrTripSourceRow) {
  return toDateKey(row.dispatch_date || row.dt_date || row.record_date || row.created_at_data || "");
}

export function rrTripsToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export const RR_TRIP_PEOPLE = [
  { name: "Cristo González", aliases: [["cristo", "gonzalez"]] },
  { name: "Andrés Elles", aliases: [["andres", "elles"]] },
  { name: "Darío Russo", aliases: [["dario", "russo"], ["dairo", "russo"]] },
  { name: "Eduardo Bermúdez", aliases: [["eduardo", "bermudez"]] },
  { name: "José Moron", aliases: [["jose", "moron"]] },
  { name: "Javier Peña", aliases: [["javier", "pena"]] },
  { name: "Andrés Herrera", aliases: [["andres", "herrera"]] },
  { name: "Álvaro Herrera", aliases: [["alvaro", "herrera"]] },
  { name: "Eulogio Cabarcaz", aliases: [["eulogio", "cabarcaz"], ["eulogio", "cabarcas"]] },
  { name: "Favio Escorcia", aliases: [["favio", "escorcia"]] },
  { name: "Andrés Duica", aliases: [["andres", "duica"]] },
  { name: "Álvaro García", aliases: [["alvaro", "garcia"]] },
  { name: "José Gutiérre", aliases: [["jose", "gutierre"], ["jose", "gutierrez"]] },
] as const;

export type RrTripSourceRow = {
  contractor?: string | null;
  rr?: string | null;
  alt?: string | null;
  aux1?: string | null;
  aux2?: string | null;
  aux3?: string | null;
  dt?: string | null;
  trip?: string | null;
  plate?: string | null;
  dispatch_date?: string | null;
  dt_date?: string | null;
  record_date?: string | null;
  created_at_data?: string | null;
  visited?: number | string | null;
};

export type RrTripPerson = {
  name: string;
  matchedNames: string[];
  days: Array<{ date: string; trips: number; visited: number | null }>;
};

function tokens(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

function matchingPeople(value: string) {
  const parts = new Set(tokens(value));
  return RR_TRIP_PEOPLE.filter(person => person.aliases.some(alias => alias.every(part => parts.has(part))));
}

export function buildRrTripAverages(rows: RrTripSourceRow[]): RrTripPerson[] {
  const people = RR_TRIP_PEOPLE.map(person => ({ name: person.name, matchedNames: new Set<string>(), trips: new Map<string, Map<string, number | null>>() }));
  const byName = new Map(people.map(person => [person.name, person]));
  for (const row of rows) {
    const date = rrTripDate(row);
    const route = String(row.dt || "").replace(/\D/g, "") || String(row.plate || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (!date || !route) continue;
    const contractor = normalizeContractorName(row.contractor);
    const trip = String(row.trip || "").trim().toLowerCase().replace(/^viaje\s*/, "");
    const routeKey = JSON.stringify([contractor, route, trip]);
    const value = row.visited == null || String(row.visited).trim() === "" ? NaN : Number(row.visited);
    const visited = Number.isSafeInteger(value) && value >= 0 ? value : null;
    const names = new Set([row.rr, row.alt, row.aux1, row.aux2, row.aux3].map(value => String(value || "").trim()).filter(Boolean));
    for (const fullName of names) {
      for (const match of matchingPeople(fullName)) {
        const person = byName.get(match.name)!;
        person.matchedNames.add(fullName);
        if (!person.trips.has(date)) person.trips.set(date, new Map());
        // La API entrega las versiones por updated_at ascendente: gana la última.
        person.trips.get(date)!.set(routeKey, visited);
      }
    }
  }
  return people.map(person => ({
    name: person.name,
    matchedNames: [...person.matchedNames].sort((a, b) => a.localeCompare(b, "es")),
    days: [...person.trips].map(([date, trips]) => ({
      date, trips: trips.size,
      visited: [...trips.values()].some(value => value === null) ? null : [...trips.values()].reduce<number>((sum, value) => sum + (value ?? 0), 0),
    })).sort((a, b) => a.date.localeCompare(b.date)),
  }));
}
