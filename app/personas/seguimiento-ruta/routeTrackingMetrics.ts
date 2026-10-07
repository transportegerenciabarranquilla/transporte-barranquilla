import { normalizeContractorName } from "../../lib/contractors";
import { normalizeDocument, parseClockSeconds } from "../../lib/effectiveRest";
import type { Vehiculo } from "../../seguimiento/types";
import { toDateKey, parseDurationToSeconds } from "../../seguimiento/utils";
import { calculateTdSeconds } from "../eliot/lib/time";

export type ManagementAttendanceSnapshot = {
  operationalDate: string;
  fileName?: string;
  uploadedAt?: string;
  rows: Array<{
    identificador?: string;
    nombreCompleto?: string;
    cargo?: string;
    contratista?: string;
    fechaKey?: string;
    entrada?: string;
    salida?: string;
  }>;
};

export type RouteTrackingEntry = {
  key: string;
  dt: string;
  trip: string;
  carrier: string;
  role: string;
  name: string;
  document: string;
  routeSeconds: number | null;
  tmlSeconds: number | null;
  awakeSeconds: number | null;
};

const DAY_SECONDS = 86_400;
const MAX_PERSON_INTERVAL = 12 * 3_600;

export function routeDate(route: Vehiculo) {
  for (const value of [route.fechaDespacho, route.fechaDt, route.date, route.createdAt]) {
    const date = toDateKey(value);
    if (date) return date;
  }
  return "";
}

function nextDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function elapsed(start: number | null, end: number | null, max = DAY_SECONDS) {
  if (start === null || end === null) return null;
  let seconds = end - start;
  if (seconds < 0 && -seconds >= 12 * 3_600) seconds += DAY_SECONDS;
  return seconds >= 0 && seconds <= max ? seconds : null;
}

function bogotaClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, seconds: Number(values.hour) * 3_600 + Number(values.minute) * 60 + Number(values.second) };
}

function routeSeconds(route: Vehiculo, date: string, clock: ReturnType<typeof bogotaClock>) {
  const actual = elapsed(parseClockSeconds(route.horaSalida), parseClockSeconds(route.horaLlegada));
  if (actual !== null) return actual;
  if (date === clock.date && ["En ruta", "Retornando", "Recargue"].includes(route.status)) {
    const departure = parseClockSeconds(route.horaSalida);
    if (departure !== null && clock.seconds >= departure) return clock.seconds - departure;
  }
  if (route.status !== "Finalizado") return null;
  const supplied = parseDurationToSeconds(route.tiempoRuta);
  return supplied !== null && supplied < DAY_SECONDS - 60 ? supplied : null;
}

function roleLabel(defaultRole: string, cargo: string | undefined) {
  const normalized = String(cargo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("conductor")) return "Conductor";
  if (defaultRole === "Conductor / Auxiliar 1" && normalized.includes("auxiliar")) return "Auxiliar 1";
  return defaultRole;
}

export function buildRouteTrackingEntries(routes: Vehiculo[], snapshots: ManagementAttendanceSnapshot[], date: string, now = new Date()): RouteTrackingEntry[] {
  if (!date) return [];
  const clock = bogotaClock(now);
  const next = nextDate(date);
  const attendance = snapshots.flatMap((snapshot) => snapshot.rows.map((row) => ({
    ...row,
    date: row.fechaKey || snapshot.operationalDate,
    document: normalizeDocument(row.identificador),
    carrier: normalizeContractorName(row.contratista),
  }))).filter((row) => row.document && (row.date === date || row.date === next));
  const byPerson = new Map<string, typeof attendance>();
  for (const row of attendance) {
    const key = `${row.carrier}:${row.document}`;
    byPerson.set(key, [...(byPerson.get(key) || []), row]);
  }

  const selected = routes.filter((route) => routeDate(route) === date);
  const details = selected.flatMap((route, routeIndex) => {
    const carrier = normalizeContractorName(route.transportista);
    const crew = [
      { role: "Responsable RR", document: route.cedulaResponsable, name: route.nombreResponsable || route.responsable },
      { role: "Conductor / Auxiliar 1", document: route.cedulaAuxiliar1, name: route.nombreAuxiliar1 },
      { role: "Auxiliar 2", document: route.cedulaAuxiliar2, name: route.nombreAuxiliar2 },
      { role: "Auxiliar 3", document: route.cedulaAuxiliar3, name: route.nombreAuxiliar3 },
    ];
    const seen = new Set<string>();
    const members = crew.flatMap((member) => {
      const document = normalizeDocument(member.document);
      if (!document || seen.has(document)) return [];
      seen.add(document);
      const marks = byPerson.get(`${carrier}:${document}`) || [];
      const currentMark = marks.find((mark) => mark.date === date) || marks[0];
      return [{ document, name: member.name?.trim() || currentMark?.nombreCompleto || `CC ${document}`, role: roleLabel(member.role, currentMark?.cargo), marks }];
    });
    const displayed = members.length ? members : [{ document: "", name: "Sin tripulación identificada", role: "—", marks: [] as typeof attendance }];
    const departure = parseClockSeconds(route.horaSalida);
    const arrival = parseClockSeconds(route.horaLlegada);
    const overnight = departure !== null && arrival !== null && arrival < departure && departure - arrival >= 12 * 3_600;
    return displayed.map((member, memberIndex) => ({
      key: `${route.recordId || `${route.transporte}:${route.fechaDespacho}:${routeIndex}`}:${member.document || memberIndex}`,
      dt: route.transporte || "",
      trip: route.viaje || "",
      carrier: route.transportista || "",
      role: member.role,
      name: member.name,
      document: member.document,
      routeSeconds: routeSeconds(route, date, clock),
      tmlSeconds: null as number | null,
      awakeSeconds: null as number | null,
      departure,
      arrivalAbsolute: arrival === null ? null : arrival + (overnight ? DAY_SECONDS : 0),
      marks: member.marks,
      personKey: member.document ? `${carrier}:${member.document}` : "",
    }));
  });

  const byCrew = new Map<string, typeof details>();
  for (const entry of details) {
    if (!entry.personKey) continue;
    byCrew.set(entry.personKey, [...(byCrew.get(entry.personKey) || []), entry]);
  }
  for (const entries of byCrew.values()) {
    const firstDeparture = [...entries].filter((entry) => entry.departure !== null).sort((a, b) => a.departure! - b.departure!)[0]?.departure ?? null;
    const sameDayMarks = entries[0].marks.filter((mark) => mark.date === date);
    const tml = sameDayMarks.map((mark) => calculateTdSeconds(firstDeparture, parseClockSeconds(mark.entrada))).filter((value): value is number => value !== null);
    const personTml = tml.length ? Math.min(...tml) : null;
    for (const entry of entries) entry.tmlSeconds = personTml;

    const awakeCandidates = entries.flatMap((entry) => entry.arrivalAbsolute === null ? [] : entry.marks.flatMap((mark) => {
      const exit = parseClockSeconds(mark.salida);
      if (exit === null) return [];
      const entryTime = parseClockSeconds(mark.entrada);
      const dayOffset = mark.date === next ? DAY_SECONDS : 0;
      const overnightExit = entryTime !== null && exit < entryTime ? DAY_SECONDS : 0;
      const duration = exit + dayOffset + overnightExit - entry.arrivalAbsolute!;
      return duration >= 0 && duration <= MAX_PERSON_INTERVAL ? [{ entry, duration }] : [];
    })).sort((a, b) => a.duration - b.duration);
    if (awakeCandidates.length) awakeCandidates[0].entry.awakeSeconds = awakeCandidates[0].duration;
  }

  return details.map((entry) => ({
    key: entry.key,
    dt: entry.dt,
    trip: entry.trip,
    carrier: entry.carrier,
    role: entry.role,
    name: entry.name,
    document: entry.document,
    routeSeconds: entry.routeSeconds,
    tmlSeconds: entry.tmlSeconds,
    awakeSeconds: entry.awakeSeconds,
  }));
}
