import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { CONTRACTORS, normalizeContractorName } from "../../../lib/contractors";
import { readServerCache } from "../../../lib/serverCache";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

type PersonRow = {
  CC?: string;
  NOMBRE?: string;
  CARGO?: string;
  CONTRATISTA?: string;
};

type VehicleRow = {
  contractor?: string;
  transporte?: string;
  vehiculo?: string;
  fechaDespacho?: string;
  fechaDt?: string;
  hl?: string;
  clientes?: string;
  visitados?: string;
  responsable?: string;
  tiempoRuta?: string;
  status?: string;
  cedulaResponsable?: string;
  cedulaAuxiliar1?: string;
  cedulaAuxiliar2?: string;
  nombreResponsable?: string;
  nombreAuxiliar1?: string;
  nombreAuxiliar2?: string;
};

type ModulationRow = {
  contractor?: string;
  dt?: string;
  fechaDespacho?: string;
  persona?: string;
  personaNombre?: string;
  cajasGestionadas?: string;
  causal?: string;
  comentario?: string;
  comentarioModulador?: string;
  createdAt?: string;
};

type PuntoCoronaCrewSummary = {
  dt?: string;
  totalStarted?: number;
  inRange?: number;
  outOfRange?: number;
};

type PuntoCoronaRouteRow = {
  dt?: string;
  tourDisplayId?: string;
  status?: string;
  withinRadius?: boolean | string | number | null;
  within_radius?: boolean | string | number | null;
};

type PuntoCoronaRouteReport = {
  contractor?: string;
  operationalDate?: string;
  kind?: "current" | "closure";
  rows?: PuntoCoronaRouteRow[];
  summary?: {
    crews?: PuntoCoronaCrewSummary[];
  };
};

type PuntoCoronaReportRow = {
  contractor?: string;
  operational_date?: string;
  kind?: "current" | "closure";
  data?: PuntoCoronaRouteReport;
};

const PEOPLE_SELECT = "CC,NOMBRE,CARGO,CONTRATISTA";
const VEHICLE_SELECT =
  "contractor,transporte:data->>transporte,vehiculo:data->>vehiculo,fechaDespacho:data->>fechaDespacho,fechaDt:data->>fechaDt,hl:data->>hl,clientes:data->>clientes,visitados:data->>visitados,responsable:data->>responsable,tiempoRuta:data->>tiempoRuta,status:data->>status,cedulaResponsable:data->>cedulaResponsable,cedulaAuxiliar1:data->>cedulaAuxiliar1,cedulaAuxiliar2:data->>cedulaAuxiliar2,nombreResponsable:data->>nombreResponsable,nombreAuxiliar1:data->>nombreAuxiliar1,nombreAuxiliar2:data->>nombreAuxiliar2";
const MODULATION_SELECT =
  "contractor,dt:data->>dt,fechaDespacho:data->>fechaDespacho,persona:data->>persona,personaNombre:data->>personaNombre,cajasGestionadas:data->>cajasGestionadas,causal:data->>causal,comentario:data->>comentario,comentarioModulador:data->>comentarioModulador,createdAt:data->>createdAt";
const NOT_STARTED = "NOT_STARTED";
const SUMMARY_CACHE_TTL_MS = 2 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) {
      return NextResponse.json({ error: "No tienes permiso para consultar personas." }, { status: 403 });
    }

    const rangeDate = dateKey(new URL(request.url).searchParams.get("date"));
    const cacheKey = `supabase:people-summary:${session.isAdmin ? "admin" : session.contractor}:${rangeDate || "all"}`;
    const body = await readServerCache(cacheKey, SUMMARY_CACHE_TTL_MS, async () => {
      const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
      const [peopleByContractor, vehicles, modulations, puntoCoronaReports] = await Promise.all([
        readPeople(headers),
        readVehicles(headers),
        readModulations(headers),
        readPuntoCoronaRouteReports(headers),
      ]);

      const contractors = CONTRACTORS.map((contractor) => {
        const people = peopleByContractor.get(contractor) || [];
        return {
          name: contractor,
          total: people.length,
          people: people.map((person) => buildPersonSummary(person, vehicles, modulations, puntoCoronaReports, rangeDate)),
        };
      });

      return { contractors, generatedAt: new Date().toISOString() };
    });

    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando personas." }, { status: 500 });
  }
}

async function readPeople(headers: Record<string, string>) {
  const entries = await Promise.all(
    CONTRACTORS.map(async (contractor) => {
      const params = new URLSearchParams({
        select: PEOPLE_SELECT,
        CONTRATISTA: `eq.${contractor}`,
        order: "NOMBRE.asc",
        limit: "350",
      });
      const response = await fetch(supabaseRest("transporte_barranquilla", `?${params.toString()}`), {
        headers,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await supabaseError(response));

      const rows = (await response.json().catch(() => [])) as PersonRow[];
      return [contractor, dedupePeople(rows.map(normalizePerson))] as const;
    }),
  );

  return new Map(entries);
}

async function readVehicles(headers: Record<string, string>) {
  const params = new URLSearchParams({
    select: VEHICLE_SELECT,
    order: "updated_at.desc",
    limit: "1200",
  });
  const response = await fetch(supabaseRest("seguimiento_vehiculos", `?${params.toString()}`), {
    headers,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await supabaseError(response));

  return ((await response.json().catch(() => [])) as VehicleRow[]).map(normalizeVehicle);
}

async function readModulations(headers: Record<string, string>) {
  const params = new URLSearchParams({
    select: MODULATION_SELECT,
    order: "updated_at.desc",
    limit: "1200",
  });
  const response = await fetch(supabaseRest("modulaciones_ruta", `?${params.toString()}`), {
    headers,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await supabaseError(response));

  return ((await response.json().catch(() => [])) as ModulationRow[]).map(normalizeModulation);
}

async function readPuntoCoronaRouteReports(headers: Record<string, string>) {
  const params = new URLSearchParams({
    select: "contractor,operational_date,kind,data",
    order: "operational_date.desc,updated_at.desc",
    limit: "1200",
  });
  const response = await fetch(supabaseRest("punto_corona_route_reports", `?${params.toString()}`), {
    headers,
    cache: "no-store",
  });
  if (!response.ok) return [];

  const rows = (await response.json().catch(() => [])) as PuntoCoronaReportRow[];
  return rows.map(normalizePuntoCoronaReport).filter(Boolean) as PuntoCoronaRouteReport[];
}

function buildPersonSummary(
  person: Required<PersonRow>,
  vehicles: Required<VehicleRow>[],
  modulations: Required<ModulationRow>[],
  puntoCoronaReports: PuntoCoronaRouteReport[],
  rangeDate: string,
) {
  const personCc = normalizeId(person.CC);
  const personName = normalizeText(person.NOMBRE);
  const contractorKey = normalizeContractorName(person.CONTRATISTA);

  const matchedVehicles = vehicles.filter((vehicle) => {
    if (normalizeContractorName(vehicle.contractor) !== contractorKey) return false;
    const ids = [vehicle.cedulaResponsable, vehicle.cedulaAuxiliar1, vehicle.cedulaAuxiliar2].map(normalizeId);
    if (personCc && ids.includes(personCc)) return true;
    if (personCc) return false;

    const names = [vehicle.nombreResponsable, vehicle.nombreAuxiliar1, vehicle.nombreAuxiliar2, vehicle.responsable].map(normalizeText);
    return Boolean(personName && names.some((name) => name === personName));
  });
  const personVehicles = uniqueVehiclesByDt(matchedVehicles);

  const personModulations = modulations.filter((modulation) => {
    if (normalizeContractorName(modulation.contractor) !== contractorKey) return false;
    return normalizeId(modulation.persona) === personCc || normalizeText(modulation.personaNombre) === personName;
  });

  const routeMinutes = personVehicles.map((vehicle) => parseRouteMinutes(vehicle.tiempoRuta)).filter((value) => Number.isFinite(value));
  const hectolitros = personVehicles.reduce((total, vehicle) => total + numberValue(vehicle.hl), 0);
  const seguimientoVisitados = personVehicles.reduce((total, vehicle) => total + numberValue(vehicle.visitados), 0);
  const rangeStats = getPuntoCoronaRangeStats(personVehicles, puntoCoronaReports, rangeDate);
  const managedBoxes = personModulations.reduce((total, modulation) => total + numberValue(modulation.cajasGestionadas), 0);
  const history = [
    ...personVehicles.slice(0, 5).map((vehicle) => ({
      type: "Ruta",
      date: vehicle.fechaDespacho || vehicle.fechaDt,
      title: `DT ${vehicle.transporte || "-"}`,
      detail: `${vehicle.vehiculo || "Sin vehiculo"} · ${vehicle.status || "Sin estado"} · ${vehicle.tiempoRuta || "Sin tiempo"}`,
    })),
    ...personModulations.slice(0, 5).map((modulation) => ({
      type: "Modulacion",
      date: modulation.fechaDespacho || modulation.createdAt,
      title: `DT ${modulation.dt || "-"}`,
      detail: [modulation.causal, modulation.comentarioModulador || modulation.comentario].filter(Boolean).join(" · ") || "Sin comentario",
    })),
  ]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 8);

  return {
    cc: person.CC,
    nombre: person.NOMBRE,
    cargo: person.CARGO,
    contratista: person.CONTRATISTA,
    stats: {
      rutas: personVehicles.length,
      modulaciones: personModulations.length,
      gestionadas: managedBoxes,
      hectolitros: Number(hectolitros.toFixed(1)),
      visitasRango: rangeDate ? rangeStats.totalStarted : seguimientoVisitados || rangeStats.totalStarted,
      enRango: rangeStats.inRange,
      fueraRango: rangeStats.outOfRange,
      porcentajeRango: percentage(rangeStats.inRange, rangeStats.totalStarted),
      reubicaciones: managedBoxes,
      tiempoPromedioRuta: formatMinutes(average(routeMinutes)),
      ultimoDt: personVehicles[0]?.transporte || personModulations[0]?.dt || "",
    },
    history,
  };
}

function normalizePerson(row: PersonRow): Required<PersonRow> {
  return {
    CC: readString(row.CC),
    NOMBRE: readString(row.NOMBRE),
    CARGO: readString(row.CARGO),
    CONTRATISTA: readString(row.CONTRATISTA),
  };
}

function dedupePeople(rows: Required<PersonRow>[]) {
  const byKey = new Map<string, Required<PersonRow>>();

  rows.forEach((row) => {
    const key = `${normalizeContractorName(row.CONTRATISTA)}:${normalizeId(row.CC)}`;
    if (!normalizeId(row.CC)) {
      byKey.set(`${key}:${normalizeText(row.NOMBRE)}:${byKey.size}`, row);
      return;
    }

    const current = byKey.get(key);
    byKey.set(key, {
      CC: row.CC || current?.CC || "",
      NOMBRE: row.NOMBRE || current?.NOMBRE || "",
      CARGO: row.CARGO || current?.CARGO || "",
      CONTRATISTA: row.CONTRATISTA || current?.CONTRATISTA || "",
    });
  });

  return Array.from(byKey.values());
}

function normalizeVehicle(row: VehicleRow): Required<VehicleRow> {
  return {
    contractor: readString(row.contractor),
    transporte: readString(row.transporte),
    vehiculo: readString(row.vehiculo),
    fechaDespacho: readString(row.fechaDespacho),
    fechaDt: readString(row.fechaDt),
    hl: readString(row.hl),
    clientes: readString(row.clientes),
    visitados: readString(row.visitados),
    responsable: readString(row.responsable),
    tiempoRuta: readString(row.tiempoRuta),
    status: readString(row.status),
    cedulaResponsable: readString(row.cedulaResponsable),
    cedulaAuxiliar1: readString(row.cedulaAuxiliar1),
    cedulaAuxiliar2: readString(row.cedulaAuxiliar2),
    nombreResponsable: readString(row.nombreResponsable),
    nombreAuxiliar1: readString(row.nombreAuxiliar1),
    nombreAuxiliar2: readString(row.nombreAuxiliar2),
  };
}

function uniqueVehiclesByDt(vehicles: Required<VehicleRow>[]) {
  const byDt = new Map<string, Required<VehicleRow>>();

  vehicles.forEach((vehicle) => {
    const key = `${normalizeId(vehicle.transporte)}:${vehicle.fechaDespacho || vehicle.fechaDt}`;
    if (!key || key === ":") return;

    const current = byDt.get(key);
    if (!current || String(vehicle.fechaDespacho || vehicle.fechaDt).localeCompare(String(current.fechaDespacho || current.fechaDt)) > 0) {
      byDt.set(key, vehicle);
    }
  });

  return Array.from(byDt.values());
}

function getPuntoCoronaRangeStats(vehicles: Required<VehicleRow>[], reports: PuntoCoronaRouteReport[], rangeDate = "") {
  const reportByDate = new Map<string, PuntoCoronaRouteReport>();

  reports.forEach((report) => {
    const date = dateKey(report.operationalDate);
    if (rangeDate && date !== rangeDate) return;
    const contractor = normalizeContractorName(report.contractor);
    const key = `${contractor}:${date}`;
    if (!date && !contractor) {
      reportByDate.set(`report:${reportByDate.size}`, report);
      return;
    }

    const current = reportByDate.get(key);
    if (!current || report.kind === "closure") reportByDate.set(key, report);
  });

  const crewByDateDt = new Map<string, PuntoCoronaCrewSummary>();
  const crewByContractorDt = new Map<string, PuntoCoronaCrewSummary>();
  const crewByDt = new Map<string, PuntoCoronaCrewSummary>();
  const rowStatsByDateDt = new Map<string, PuntoCoronaCrewSummary>();
  const rowStatsByContractorDt = new Map<string, PuntoCoronaCrewSummary>();
  const rowStatsByDt = new Map<string, PuntoCoronaCrewSummary>();
  reportByDate.forEach((report) => {
    const date = dateKey(report.operationalDate);
    const contractor = normalizeContractorName(report.contractor);
    const rowStats = summarizeRangeRowsByDt(report.rows || []);

    rowStats.forEach((stats, dt) => {
      if (contractor && date) rowStatsByDateDt.set(`${contractor}:${date}:${dt}`, stats);
      if (contractor && !rowStatsByContractorDt.has(`${contractor}:${dt}`)) {
        rowStatsByContractorDt.set(`${contractor}:${dt}`, stats);
      }
      if (!rowStatsByDateDt.has(`:${date}:${dt}`)) rowStatsByDateDt.set(`:${date}:${dt}`, stats);
      if (!rowStatsByDt.has(dt)) rowStatsByDt.set(dt, stats);
    });

    report.summary?.crews?.forEach((crew) => {
      const dt = normalizeId(crew.dt);
      if (!dt) return;
      if (contractor && date) crewByDateDt.set(`${contractor}:${date}:${dt}`, crew);
      if (contractor && !crewByContractorDt.has(`${contractor}:${dt}`)) {
        crewByContractorDt.set(`${contractor}:${dt}`, crew);
      }
      if (!crewByDateDt.has(`:${date}:${dt}`)) crewByDateDt.set(`:${date}:${dt}`, crew);
      if (!crewByDt.has(dt)) crewByDt.set(dt, crew);
    });
  });

  return vehicles.reduce(
    (totals, vehicle) => {
      const date = dateKey(vehicle.fechaDespacho || vehicle.fechaDt);
      if (rangeDate && date !== rangeDate) return totals;
      const dt = normalizeId(vehicle.transporte);
      const contractor = normalizeContractorName(vehicle.contractor);
      const crew = rangeDate
        ? rowStatsByDateDt.get(`${contractor}:${date}:${dt}`) ||
          rowStatsByDateDt.get(`:${date}:${dt}`) ||
          crewByDateDt.get(`${contractor}:${date}:${dt}`) ||
          crewByDateDt.get(`:${date}:${dt}`)
        : rowStatsByDateDt.get(`${contractor}:${date}:${dt}`) ||
          rowStatsByDateDt.get(`:${date}:${dt}`) ||
          rowStatsByContractorDt.get(`${contractor}:${dt}`) ||
          rowStatsByDt.get(dt) ||
          crewByDateDt.get(`${contractor}:${date}:${dt}`) ||
          crewByDateDt.get(`:${date}:${dt}`) ||
          crewByContractorDt.get(`${contractor}:${dt}`) ||
          crewByDt.get(dt);
      if (!crew) return totals;

      return {
        totalStarted: totals.totalStarted + Number(crew.totalStarted || 0),
        inRange: totals.inRange + Number(crew.inRange || 0),
        outOfRange: totals.outOfRange + Number(crew.outOfRange || 0),
      };
    },
    { totalStarted: 0, inRange: 0, outOfRange: 0 },
  );
}

function summarizeRangeRowsByDt(rows: PuntoCoronaRouteRow[]) {
  const byDt = new Map<string, PuntoCoronaCrewSummary>();

  rows.forEach((row) => {
    const dt = normalizeId(row.dt || row.tourDisplayId);
    const status = readString(row.status).toUpperCase();
    if (!dt || status === NOT_STARTED) return;

    const current = byDt.get(dt) || { dt, inRange: 0, outOfRange: 0, totalStarted: 0 };
    const withinRadius = readRangeBoolean(row.withinRadius ?? row.within_radius);
    current.totalStarted = Number(current.totalStarted || 0) + 1;
    if (withinRadius === true) current.inRange = Number(current.inRange || 0) + 1;
    if (withinRadius === false) current.outOfRange = Number(current.outOfRange || 0) + 1;
    byDt.set(dt, current);
  });

  return byDt;
}

function normalizePuntoCoronaReport(row: PuntoCoronaReportRow) {
  if (!row.data) return null;

  return {
    ...row.data,
    contractor: readString(row.data.contractor || row.contractor),
    operationalDate: readString(row.data.operationalDate || row.operational_date),
    kind: row.data.kind || row.kind,
  } satisfies PuntoCoronaRouteReport;
}

function normalizeModulation(row: ModulationRow): Required<ModulationRow> {
  return {
    contractor: readString(row.contractor),
    dt: readString(row.dt),
    fechaDespacho: readString(row.fechaDespacho),
    persona: readString(row.persona),
    personaNombre: readString(row.personaNombre),
    cajasGestionadas: readString(row.cajasGestionadas),
    causal: readString(row.causal),
    comentario: readString(row.comentario),
    comentarioModulador: readString(row.comentarioModulador),
    createdAt: readString(row.createdAt),
  };
}

function readString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeId(value: unknown) {
  return readString(value).replace(/\D/g, "");
}

function numberValue(value: unknown) {
  const parsed = Number(readString(value).replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function readRangeBoolean(value: unknown) {
  if (value === true || value === false) return value;

  const normalized = readString(value).toLowerCase();
  if (["true", "si", "sí", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  return null;
}

function dateKey(value: unknown) {
  const text = readString(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  if (text.includes("/")) {
    const [day, month, year] = text.split("/").map(Number);
    if (day && month && year) return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function normalizeText(value: unknown) {
  return readString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function parseRouteMinutes(value: string) {
  const text = value.toLowerCase();
  const hhmm = text.match(/(\d{1,2}):(\d{2})/);
  if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2]);

  const hours = text.match(/(\d+(?:[.,]\d+)?)\s*h/);
  const minutes = text.match(/(\d+(?:[.,]\d+)?)\s*m/);
  const total = (hours ? Number(hours[1].replace(",", ".")) * 60 : 0) + (minutes ? Number(minutes[1].replace(",", ".")) : 0);
  return total || Number.NaN;
}

function average(values: number[]) {
  if (!values.length) return Number.NaN;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentage(value: number, total: number) {
  return total ? Number(((value / total) * 100).toFixed(2)) : 0;
}

function formatMinutes(value: number) {
  if (!Number.isFinite(value)) return "Sin dato";
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
