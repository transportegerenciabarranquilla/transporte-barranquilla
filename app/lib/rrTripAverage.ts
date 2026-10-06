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
  { name: "Cristo González", cc: "1042971540" },
  { name: "Andrés Elles", cc: "7959524" },
  { name: "Darío Russo", cc: "72225725" },
  { name: "Eduardo Bermúdez", cc: "5799530" },
  { name: "Luis Eduardo Orozco Moron", cc: "8769783" },
  { name: "Javier Peña", cc: "72241146" },
  { name: "Andrés Herrera", cc: "8768517" },
  { name: "Álvaro Herrera", cc: "72256959" },
  { name: "Eulogio Cabarcas", cc: "7592397" },
  { name: "Favio Escorcia", cc: "1063134418" },
  { name: "Andrés Duica", cc: "1148434809" },
  { name: "Álvaro Garcia", cc: "72052193" },
  { name: "José Gutiérrez", cc: "72050002" },
] as const;

export type RrTripSourceRow = {
  contractor?: string | null;
  rr?: string | null;
  alt?: string | null;
  aux1?: string | null;
  aux2?: string | null;
  aux3?: string | null;
  rr_cc?: string | null;
  aux1_cc?: string | null;
  aux2_cc?: string | null;
  aux3_cc?: string | null;
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
  cc: string;
  cargo: string;
  days: Array<{ date: string; trips: number; visited: number | null }>;
};

export function buildRrTripAverages(rows: RrTripSourceRow[]): RrTripPerson[] {
  const people = RR_TRIP_PEOPLE.map(person => ({ ...person, trips: new Map<string, Map<string, number | null>>() }));
  const byCc = new Map(people.map(person => [person.cc, person]));
  for (const row of rows) {
    const date = rrTripDate(row);
    const route = String(row.dt || "").replace(/\D/g, "") || String(row.plate || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (!date || !route) continue;
    const contractor = normalizeContractorName(row.contractor);
    const trip = String(row.trip || "").trim().toLowerCase().replace(/^viaje\s*/, "");
    const routeKey = JSON.stringify([contractor, route, trip]);
    const value = row.visited == null || String(row.visited).trim() === "" ? NaN : Number(row.visited);
    const visited = Number.isSafeInteger(value) && value >= 0 ? value : null;
    const ids = new Set([row.rr_cc, row.aux1_cc, row.aux2_cc, row.aux3_cc].map(value => String(value || "").replace(/\D/g, "")).filter(Boolean));
    for (const cc of ids) {
      const person = byCc.get(cc as typeof RR_TRIP_PEOPLE[number]["cc"]);
      if (!person) continue;
      if (!person.trips.has(date)) person.trips.set(date, new Map());
      // La API entrega las versiones por updated_at ascendente: gana la última.
      person.trips.get(date)!.set(routeKey, visited);
    }
  }
  return people.map(person => ({
    name: person.name,
    cc: person.cc,
    cargo: "",
    days: [...person.trips].map(([date, trips]) => ({
      date, trips: trips.size,
      visited: [...trips.values()].some(value => value === null) ? null : [...trips.values()].reduce<number>((sum, value) => sum + (value ?? 0), 0),
    })).sort((a, b) => a.date.localeCompare(b.date)),
  }));
}
