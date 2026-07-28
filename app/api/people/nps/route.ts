import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { readServerCache } from "../../../lib/serverCache";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

type Session = { accessToken: string; email?: string; isPeople?: boolean; isAdmin?: boolean };
type NpsRow = {
  "Vendor Account ID": string | null;
  "Sales Sub Region": string | null;
  "Survey Completed Date": string | null;
  DDC: string | null;
  DDC_NAME: string | null;
  Score: number | string | null;
  "Primer driver": string | null;
  "driver secundary": string | null;
};
type Survey = {
  accountId: string;
  date: string;
  timestamp: number;
  year: number;
  month: number;
  day: number;
  week: number;
  ddc: string;
  cd: string;
  management: string;
  score: number;
  duplicateRows: number;
  primaryDrivers: Set<string>;
  secondaryDrivers: Set<string>;
};
type Filters = {
  cd: string;
  year: number | null;
  month: number | null;
  day: number | null;
  week: number | null;
  management: string;
};
type OperationalRow = {
  codigoCliente?: string;
  createdAt?: string;
  dt?: string;
  fechaDespacho?: string;
  persona?: string;
  personaNombre?: string;
};
type FollowUpRow = {
  fechaDespacho?: string;
  nombreResponsable?: string;
  responsable?: string;
  transporte?: string;
};
type CustomerSegment = { commercialActivity: string; commercialManager: string; com: string; population: string; stratum: string };

const TABLE = "NPS";
const PAGE_SIZE = 1_000;
const CACHE_TTL_MS = 10 * 60 * 1_000;
const SELECT_COLUMNS = [
  "Vendor Account ID",
  "Sales Sub Region",
  "Survey Completed Date",
  "DDC",
  "DDC_NAME",
  "Score",
  "Primer driver",
  "driver secundary",
].join(",");

export async function GET(request: Request) {
  try {
    const session = await requirePeople();
    if (session instanceof NextResponse) return session;

    const dataset = await readServerCache(`supabase:nps-dataset:${session.email || "people"}`, CACHE_TTL_MS, async () => {
      const { rows, total } = await fetchAllNpsRows(session);
      if (!total) throw new Error("La tabla NPS no devolvió filas para este usuario. Ejecuta supabase/nps_access.sql en el SQL Editor de Supabase.");
      return buildDataset(rows, total);
    });
    const filters = readFilters(new URL(request.url).searchParams);
    const filtered = dataset.surveys.filter((survey) => matchesFilters(survey, filters));
    const customerCodes = Array.from(new Set(dataset.surveys.map((survey) => normalizeDigits(survey.accountId)).filter(Boolean)));
    const customerSegments = await readServerCache(
      `supabase:nps-customer-segments:v4:${dataset.rawRowCount}`,
      CACHE_TTL_MS,
      () => loadCustomerSegments(session, customerCodes),
    );
    const detractorRows = filtered
      .filter((survey) => survey.score <= 6)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 100)
      .map((survey) => ({
        accountId: survey.accountId,
        date: survey.date,
        score: survey.score,
        cd: survey.cd || survey.ddc || "Sin CD",
        com: customerSegments.get(normalizeDigits(survey.accountId))?.com || "Sin COM",
        stratum: customerSegments.get(normalizeDigits(survey.accountId))?.stratum || "Sin estrato",
        management: survey.management || "Sin subregión",
        primaryDriver: Array.from(survey.primaryDrivers)[0] || "Sin dato",
        secondaryDriver: Array.from(survey.secondaryDrivers)[0] || "Sin dato",
      }));
    const detractorCacheKey = detractorRows.map((row) => `${normalizeDigits(row.accountId)}:${row.date}`).join("|");
    const enrichedDetractors = await readServerCache(
      `supabase:nps-detractors:v2:${session.email || "people"}:${detractorCacheKey}`,
      5 * 60 * 1_000,
      () => enrichDetractorsWithLastRr(detractorRows, session),
    );
    const detractorCoordinates = await loadCustomerCoordinates(session, detractorRows.map((row) => row.accountId));
    const detractors = enrichedDetractors.map((row) => ({
      ...row,
      ...detractorCoordinates.get(normalizeDigits(row.accountId)),
    }));

    return NextResponse.json({
      summary: summarize(filtered, filtered.reduce((total, survey) => total + survey.duplicateRows, 0)),
      options: dataset.options,
      trends: {
        annual: groupAnnualMonths(dataset.surveys.filter((survey) => matchesFilters(survey, filters, ["year", "month", "day", "week"]))),
        years: groupSurveys(dataset.surveys.filter((survey) => matchesFilters(survey, filters, ["year", "month", "day", "week"])), (survey) => String(survey.year)),
        currentMonths: currentYearMonths(dataset.surveys.filter((survey) => matchesFilters(survey, filters, ["year", "month", "day", "week"])), filters.year),
        months: groupSurveys(dataset.surveys.filter((survey) => matchesFilters(survey, filters, ["month", "day", "week"])), (survey) => monthLabel(survey.month), monthOrder),
        weeks: groupSurveys(dataset.surveys.filter((survey) => matchesFilters(survey, filters, ["week", "day"])), (survey) => `S${survey.week}`, weekOrder),
        currentDays: currentMonthDays(dataset.surveys.filter((survey) => matchesFilters(survey, filters, ["year", "month", "day", "week"])), filters),
        days: groupSurveys(filtered, (survey) => String(survey.day), numericOrder),
      },
      scoreDistribution: groupScores(filtered),
      segments: {
        cds: groupSurveys(filtered, (survey) => survey.cd || survey.ddc || "Sin CD"),
        managements: groupSurveys(filtered, (survey) => survey.management || "Sin subregión"),
        coms: groupSurveys(
          filtered.filter((survey) => customerSegments.get(normalizeDigits(survey.accountId))?.com),
          (survey) => customerSegments.get(normalizeDigits(survey.accountId))?.com || "Sin COM",
        ),
        populations: groupSurveys(
          filtered.filter((survey) => customerSegments.get(normalizeDigits(survey.accountId))?.population),
          (survey) => customerSegments.get(normalizeDigits(survey.accountId))?.population || "Sin población",
        ),
        commercialManagers: groupSurveys(
          filtered.filter((survey) => customerSegments.get(normalizeDigits(survey.accountId))?.commercialManager),
          (survey) => customerSegments.get(normalizeDigits(survey.accountId))?.commercialManager || "Sin jefe comercial",
        ),
        commercialActivities: groupSurveys(
          filtered.filter((survey) => customerSegments.get(normalizeDigits(survey.accountId))?.commercialActivity),
          (survey) => customerSegments.get(normalizeDigits(survey.accountId))?.commercialActivity || "Sin actividad comercial",
        ),
        strata: groupSurveys(
          filtered.filter((survey) => customerSegments.get(normalizeDigits(survey.accountId))?.stratum),
          (survey) => customerSegments.get(normalizeDigits(survey.accountId))?.stratum || "Sin estrato",
          numericOrder,
        ),
      },
      drivers: {
        primary: groupDrivers(filtered, "primaryDrivers"),
        secondary: groupDrivers(filtered, "secondaryDrivers"),
      },
      detractors,
      source: {
        table: TABLE,
        columns: 11,
        rawRowCount: dataset.rawRowCount,
        respondentCount: dataset.surveys.length,
        minDate: dataset.minDate,
        maxDate: dataset.maxDate,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo consultar la tabla NPS." },
      { status: 500 },
    );
  }
}

async function loadCustomerSegments(session: Session, codes: string[]) {
  const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
  const chunks = Array.from({ length: Math.ceil(codes.length / 400) }, (_, index) => codes.slice(index * 400, index * 400 + 400));
  const pages = await Promise.all(chunks.map(async (chunk) => {
    const baseColumns = "CodigoCliente,CodigoZona_Principal,Poblacion,Jefe comercial,SubCanal";
    const params = new URLSearchParams({ select: `${baseColumns},Estrato`, CodigoCliente: `in.(${chunk.join(",")})` });
    let response = await fetch(supabaseRest("clientes", `?${params.toString()}`), { headers, cache: "no-store" });
    if (!response.ok) {
      params.set("select", baseColumns);
      response = await fetch(supabaseRest("clientes", `?${params.toString()}`), { headers, cache: "no-store" });
    }
    return response.ok ? (await response.json()) as Record<string, unknown>[] : [];
  }));
  const rows = pages.flat();

  const result = new Map<string, CustomerSegment>();
  rows.forEach((row) => {
    const code = normalizeDigits(row.CodigoCliente);
    if (!code) return;
    const com = String(row.CodigoZona_Principal ?? "").trim();
    const population = String(row.Poblacion ?? "").trim();
    const commercialManager = String(row["Jefe comercial"] ?? "").trim();
    const commercialActivity = String(row.SubCanal ?? "").trim();
    const stratum = String(row.Estrato ?? "").trim();
    result.set(code, { commercialActivity, commercialManager, com, population, stratum });
  });
  return result;
}

async function loadCustomerCoordinates(session: Session, accountIds: string[]) {
  const codes = Array.from(new Set(accountIds.map(normalizeDigits).filter(Boolean)));
  if (!codes.length) return new Map<string, { latitude: number; longitude: number }>();

  const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
  const chunks = Array.from({ length: Math.ceil(codes.length / 400) }, (_, index) => codes.slice(index * 400, index * 400 + 400));
  const pages = await Promise.all(chunks.map(async (chunk) => {
    const params = new URLSearchParams({
      select: "CodigoCliente,Longitud_fix,Latitud_fix",
      CodigoCliente: `in.(${chunk.join(",")})`,
    });
    const response = await fetch(supabaseRest("Cordenadas", `?${params.toString()}`), { headers, cache: "no-store" });
    return response.ok ? (await response.json()) as Record<string, unknown>[] : [];
  }));

  const coordinates = new Map<string, { latitude: number; longitude: number }>();
  pages.flat().forEach((row) => {
    const code = normalizeDigits(row.CodigoCliente);
    const latitude = normalizeLatitude(Number(row.Latitud_fix));
    const longitude = normalizeLongitude(Number(row.Longitud_fix));
    if (code && Number.isFinite(latitude) && Number.isFinite(longitude)) coordinates.set(code, { latitude, longitude });
  });
  return coordinates;
}

async function enrichDetractorsWithLastRr<T extends { accountId: string }>(detractors: T[], session: Session) {
  const codes = Array.from(new Set(detractors.map((row) => normalizeDigits(row.accountId)).filter(Boolean)));
  if (!codes.length) return detractors;

  try {
    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const modulationParams = new URLSearchParams({
      select: "codigoCliente:data->>codigoCliente,dt:data->>dt,fechaDespacho:data->>fechaDespacho,createdAt:data->>createdAt,persona:data->>persona,personaNombre:data->>personaNombre",
      "data->>codigoCliente": `in.(${codes.join(",")})`,
      order: "updated_at.desc",
      limit: "5000",
    });
    const modulationResponse = await fetch(supabaseRest("modulaciones_ruta", `?${modulationParams.toString()}`), { headers, cache: "no-store" });
    if (!modulationResponse.ok) return detractors;
    const operations = (await modulationResponse.json()) as OperationalRow[];
    const latestByClient = new Map<string, OperationalRow>();
    operations.forEach((operation) => {
      const code = normalizeDigits(operation.codigoCliente);
      if (code && !latestByClient.has(code)) latestByClient.set(code, operation);
    });

    const dts = Array.from(new Set(Array.from(latestByClient.values()).map((row) => normalizeDigits(row.dt)).filter(Boolean)));
    const routesByKey = new Map<string, FollowUpRow>();
    if (dts.length) {
      const followUpParams = new URLSearchParams({
        select: "transporte:data->>transporte,fechaDespacho:data->>fechaDespacho,responsable:data->>responsable,nombreResponsable:data->>nombreResponsable",
        "data->>transporte": `in.(${dts.join(",")})`,
        order: "updated_at.desc",
        limit: "5000",
      });
      const followUpResponse = await fetch(supabaseRest("seguimiento_vehiculos", `?${followUpParams.toString()}`), { headers, cache: "no-store" });
      if (followUpResponse.ok) {
        const routes = (await followUpResponse.json()) as FollowUpRow[];
        routes.forEach((route) => {
          const dt = normalizeDigits(route.transporte);
          const date = String(route.fechaDespacho || "").slice(0, 10);
          if (dt && !routesByKey.has(`${dt}:${date}`)) routesByKey.set(`${dt}:${date}`, route);
          if (dt && !routesByKey.has(dt)) routesByKey.set(dt, route);
        });
      }
    }

    return detractors.map((row) => {
      const operation = latestByClient.get(normalizeDigits(row.accountId));
      if (!operation) return { ...row, lastAttention: "", lastRr: "" };
      const dt = normalizeDigits(operation.dt);
      const date = String(operation.fechaDespacho || "").slice(0, 10);
      const route = routesByKey.get(`${dt}:${date}`) || routesByKey.get(dt);
      return {
        ...row,
        lastAttention: operation.createdAt || operation.fechaDespacho || route?.fechaDespacho || "",
        lastRr: route?.nombreResponsable || route?.responsable || operation.personaNombre || operation.persona || "",
      };
    });
  } catch {
    return detractors;
  }
}

async function requirePeople(): Promise<Session | NextResponse> {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  return session;
}

async function fetchAllNpsRows(session: Session) {
  const first = await fetchNpsPage(session, 0, true);
  const rows = [...first.rows];
  const offsets = Array.from(
    { length: Math.max(0, Math.ceil(first.total / PAGE_SIZE) - 1) },
    (_, index) => (index + 1) * PAGE_SIZE,
  );

  for (let index = 0; index < offsets.length; index += 8) {
    const pages = await Promise.all(offsets.slice(index, index + 8).map((offset) => fetchNpsPage(session, offset)));
    pages.forEach((page) => rows.push(...page.rows));
  }
  return { rows, total: first.total };
}

async function fetchNpsPage(session: Session, offset: number, includeCount = false) {
  const params = new URLSearchParams({
    select: SELECT_COLUMNS,
    order: "Survey Completed Date.asc,Vendor Account ID.asc",
  });
  const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
    headers: {
      ...(supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken)),
      Range: `${offset}-${offset + PAGE_SIZE - 1}`,
      "Range-Unit": "items",
      ...(includeCount ? { Prefer: "count=exact" } : {}),
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await supabaseError(response));
  const rows = (await response.json().catch(() => [])) as NpsRow[];
  const total = includeCount ? Number((response.headers.get("content-range") || "").split("/")[1]) : 0;
  return { rows, total: Number.isFinite(total) ? total : rows.length };
}

function buildDataset(rows: NpsRow[], rawRowCount: number) {
  const bySurvey = new Map<string, Survey>();

  rows.forEach((row, index) => {
    const accountId = clean(row["Vendor Account ID"]);
    const date = clean(row["Survey Completed Date"]);
    const score = Number(row.Score);
    const timestamp = Date.parse(date);
    if (!date || !Number.isFinite(score) || !Number.isFinite(timestamp)) return;
    const parsed = new Date(timestamp);
    const key = `${accountId || `sin-id-${index}`}|${date}`;
    const current = bySurvey.get(key) || {
      accountId: accountId || "Sin ID",
      date,
      timestamp,
      year: parsed.getUTCFullYear(),
      month: parsed.getUTCMonth() + 1,
      day: parsed.getUTCDate(),
      week: isoWeek(parsed),
      ddc: clean(row.DDC),
      cd: clean(row.DDC_NAME),
      management: clean(row["Sales Sub Region"]),
      score,
      duplicateRows: 0,
      primaryDrivers: new Set<string>(),
      secondaryDrivers: new Set<string>(),
    };
    current.duplicateRows += 1;
    const primary = cleanDriver(row["Primer driver"]);
    const secondary = cleanDriver(row["driver secundary"]);
    if (primary) current.primaryDrivers.add(primary);
    if (secondary) current.secondaryDrivers.add(secondary);
    bySurvey.set(key, current);
  });

  const surveys = Array.from(bySurvey.values());
  const dates = surveys.map((survey) => survey.date).sort();
  return {
    surveys,
    rawRowCount,
    minDate: dates[0] || null,
    maxDate: dates.at(-1) || null,
    options: {
      cds: unique(surveys.map((survey) => survey.cd || survey.ddc)),
      years: unique(surveys.map((survey) => String(survey.year))).sort((a, b) => Number(b) - Number(a)),
      managements: unique(surveys.map((survey) => survey.management)),
      weeks: unique(surveys.map((survey) => String(survey.week))).sort((a, b) => Number(a) - Number(b)),
    },
  };
}

function readFilters(params: URLSearchParams): Filters {
  return {
    cd: params.get("cd") || "",
    year: optionalNumber(params.get("year")),
    month: optionalNumber(params.get("month")),
    day: optionalNumber(params.get("day")),
    week: optionalNumber(params.get("week")),
    management: params.get("management") || "",
  };
}

function matchesFilters(survey: Survey, filters: Filters, omit: Array<keyof Filters> = []) {
  return (
    (omit.includes("cd") || !filters.cd || survey.cd === filters.cd || survey.ddc === filters.cd) &&
    (omit.includes("year") || !filters.year || survey.year === filters.year) &&
    (omit.includes("month") || !filters.month || survey.month === filters.month) &&
    (omit.includes("day") || !filters.day || survey.day === filters.day) &&
    (omit.includes("week") || !filters.week || survey.week === filters.week) &&
    (omit.includes("management") || !filters.management || survey.management === filters.management)
  );
}

function summarize(surveys: Survey[], rawRowCount: number) {
  const promoters = surveys.filter((survey) => survey.score >= 9).length;
  const passives = surveys.filter((survey) => survey.score >= 7 && survey.score < 9).length;
  const detractors = surveys.length - promoters - passives;
  const scoreTotal = surveys.reduce((total, survey) => total + survey.score, 0);
  return {
    respondentCount: surveys.length,
    rawRowCount,
    promoters,
    passives,
    detractors,
    nps: surveys.length ? round(((promoters - detractors) / surveys.length) * 100) : 0,
    averageScore: surveys.length ? round(scoreTotal / surveys.length) : 0,
  };
}

function groupSurveys(surveys: Survey[], labelFor: (survey: Survey) => string, order = alphabeticalOrder) {
  const groups = new Map<string, Survey[]>();
  surveys.forEach((survey) => {
    const label = labelFor(survey);
    const current = groups.get(label);
    if (current) current.push(survey);
    else groups.set(label, [survey]);
  });
  return Array.from(groups, ([label, rows]) => ({ label, ...summarize(rows, rows.reduce((total, row) => total + row.duplicateRows, 0)) }))
    .sort((a, b) => order(a.label, b.label));
}

function groupAnnualMonths(surveys: Survey[]) {
  const years = Array.from(new Set(surveys.map((survey) => survey.year))).sort((a, b) => b - a).slice(0, 2);
  return years.map((year) => ({
    label: String(year),
    rows: groupSurveys(surveys.filter((survey) => survey.year === year), (survey) => monthLabel(survey.month), monthOrder),
  }));
}

function currentYearMonths(surveys: Survey[], selectedYear: number | null) {
  const latestYear = Math.max(0, ...surveys.map((survey) => survey.year));
  const year = selectedYear || latestYear;
  const currentDate = new Date();
  const lastMonth = year === currentDate.getUTCFullYear() ? currentDate.getUTCMonth() + 1 : 12;
  return groupSurveys(
    surveys.filter((survey) => survey.year === year && survey.month <= lastMonth),
    (survey) => monthLabel(survey.month),
    monthOrder,
  );
}

function currentMonthDays(surveys: Survey[], filters: Filters) {
  const latestYear = Math.max(0, ...surveys.map((survey) => survey.year));
  const year = filters.year || latestYear;
  const surveysInYear = surveys.filter((survey) => survey.year === year);
  const latestMonth = Math.max(0, ...surveysInYear.map((survey) => survey.month));
  const month = filters.month || latestMonth;
  const currentDate = new Date();
  const lastDay = year === currentDate.getUTCFullYear() && month === currentDate.getUTCMonth() + 1
    ? currentDate.getUTCDate()
    : 31;
  return groupSurveys(
    surveysInYear.filter((survey) => survey.month === month && survey.day <= lastDay),
    (survey) => String(survey.day),
    numericOrder,
  );
}

function groupScores(surveys: Survey[]) {
  return Array.from({ length: 11 }, (_, score) => {
    const count = surveys.filter((survey) => survey.score === score).length;
    return { score, count, percentage: surveys.length ? round((count / surveys.length) * 100) : 0 };
  });
}

function groupDrivers(surveys: Survey[], field: "primaryDrivers" | "secondaryDrivers") {
  const groups = new Map<string, { promoters: number; respondents: number }>();
  surveys.forEach((survey) => survey[field].forEach((driver) => {
    const group = groups.get(driver) || { promoters: 0, respondents: 0 };
    group.respondents += 1;
    if (survey.score >= 9) group.promoters += 1;
    groups.set(driver, group);
  }));
  return Array.from(groups, ([label, group]) => ({
    label,
    count: group.respondents,
    promoters: group.promoters,
    percentage: group.respondents ? round((group.promoters / group.respondents) * 100) : 0,
  }))
    .sort((a, b) => b.percentage - a.percentage || b.count - a.count || a.label.localeCompare(b.label, "es"))
    .slice(0, 15);
}

function isoWeek(date: Date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

function normalizeLongitude(value: number) {
  let result = value;
  while (Math.abs(result) > 180) result /= 10;
  return result;
}

function normalizeLatitude(value: number) {
  let result = value;
  while (Math.abs(result) > 15) result /= 10;
  if (Math.abs(result) >= 0.5 && Math.abs(result) < 2) result *= 10;
  return result;
}

function cleanDriver(value: unknown) {
  const result = clean(value);
  return result && !["-", "pendiente", "sin dato", "n/a"].includes(result.toLowerCase()) ? result : "";
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"));
}

function optionalNumber(value: string | null) {
  const number = Number(value);
  return value && Number.isFinite(number) ? number : null;
}

function round(value: number) {
  return Number(value.toFixed(1));
}

function monthLabel(month: number) {
  return ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][month - 1] || String(month);
}

const monthOrder = (a: string, b: string) =>
  ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"].indexOf(a) -
  ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"].indexOf(b);
const weekOrder = (a: string, b: string) => Number(a.slice(1)) - Number(b.slice(1));
const numericOrder = (a: string, b: string) => Number(a) - Number(b);
const alphabeticalOrder = (a: string, b: string) => a.localeCompare(b, "es");
