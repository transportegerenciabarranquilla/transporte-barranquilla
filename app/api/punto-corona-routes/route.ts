import { NextResponse } from "next/server";
import { writeAuditLog } from "../../lib/auditLog";
import { getAuthenticatedSession } from "../../lib/authServer";
import { CONTRACTORS } from "../../lib/contractors";
import { normalizeDt } from "../../lib/modulacionStorage";
import { type PuntoCoronaRouteReport } from "../../lib/puntoCoronaRoutesStorage";
import { cachedJsonFetch, clearServerCache } from "../../lib/serverCache";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "punto_corona_route_reports";
const LIST_SELECT = "report_id,contractor,operational_date,kind,data,updated_at";
const LIST_CACHE_TTL_MS = 60_000;

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
    if (!canUseRangoModule(session)) return NextResponse.json({ error: "Modulo exclusivo para contratistas." }, { status: 403 });

    const params = new URLSearchParams({
      select: LIST_SELECT,
      contractor: `eq.${session.contractor}`,
      order: "operational_date.desc,updated_at.desc",
    });
    const url = supabaseRest(TABLE, `?${params.toString()}`);
    const rows = await cachedJsonFetch<ReportRow[]>(
      `supabase:${TABLE}:list:${session.contractor}:${url}`,
      LIST_CACHE_TTL_MS,
      url,
      { headers: supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken) },
    );
    return NextResponse.json({ records: rows.map((row) => normalizeReport(row.data, row)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando reportes de rango." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
    if (!canUseRangoModule(session)) return NextResponse.json({ error: "Modulo exclusivo para contratistas." }, { status: 403 });

    const { records: submittedRecords } = (await request.json()) as { records: PuntoCoronaRouteReport[] };
    if (!Array.isArray(submittedRecords)) return NextResponse.json({ error: "records debe ser una lista." }, { status: 400 });
    const seguimientoDts = submittedRecords.length ? await fetchSeguimientoDts(session.contractor, session.accessToken) : new Set<string>();
    const { records, ignoredDts, validationError } = sanitizeReportDts(submittedRecords, seguimientoDts, session.contractor);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const rows = records.map((record) => ({
      report_id: record.id,
      contractor: session.contractor,
      operational_date: record.operationalDate,
      kind: record.kind,
      data: { ...record, contractor: session.contractor },
      updated_at: new Date().toISOString(),
    }));

    if (rows.length) {
      const response = await fetch(supabaseRest(TABLE, "?on_conflict=report_id"), {
        method: "POST",
        headers: supabaseAdminHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }) ?? supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(rows),
        cache: "no-store",
      });
      if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
      clearServerCache(`supabase:${TABLE}:`);
      clearServerCache("supabase:admin-rango:");
      clearServerCache("supabase:people-summary:");
      clearServerCache("supabase:admin-seguimiento:");
    }

    for (const record of records) {
      await writeAuditLog({
        action: record.kind === "closure" ? "cierre_punto_corona" : "punto_corona_archivo_subido",
        contractor: session.contractor,
        details: {
          archivo: record.fileName,
          fecha: record.operationalDate,
          visitas: record.summary.startedRows,
          dts: record.summary.matchedDts,
        },
        module: "punto_corona",
        recordId: record.id,
        request,
        session,
      });
    }

    return NextResponse.json({ records: rows.map((row) => row.data), ignoredDts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando reportes de rango." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
    if (!canUseRangoModule(session)) return NextResponse.json({ error: "Modulo exclusivo para contratistas." }, { status: 403 });

    const reportId = new URL(request.url).searchParams.get("id") || "";
    if (!reportId) return NextResponse.json({ error: "id es requerido." }, { status: 400 });

    const params = new URLSearchParams({
      report_id: `eq.${reportId}`,
      contractor: `eq.${session.contractor}`,
    });
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      method: "DELETE",
      headers: supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    clearServerCache(`supabase:${TABLE}:`);
    clearServerCache("supabase:admin-rango:");
    clearServerCache("supabase:people-summary:");
    clearServerCache("supabase:admin-seguimiento:");

    await writeAuditLog({
      action: "cierre_punto_corona_quitado",
      contractor: session.contractor,
      details: { reportId },
      module: "punto_corona",
      recordId: reportId,
      request,
      session,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error eliminando cierre de rango." }, { status: 500 });
  }
}

function canUseRangoModule(session: { contractor?: string; isAdmin?: boolean }) {
  return !session.isAdmin && CONTRACTORS.includes(session.contractor as (typeof CONTRACTORS)[number]);
}

async function fetchSeguimientoDts(contractor: string, accessToken: string) {
  const params = new URLSearchParams({
    select: "data",
    contractor: `eq.${contractor}`,
  });
  const response = await fetch(supabaseRest("seguimiento_vehiculos", `?${params.toString()}`), {
    headers: supabaseAdminHeaders() ?? supabaseUserHeaders(accessToken),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await supabaseError(response));

  const rows = (await response.json()) as Array<{ data?: { transporte?: string | number } }>;
  return new Set(rows.map((row) => normalizeDt(row.data?.transporte)).filter(Boolean));
}

function sanitizeReportDts(records: PuntoCoronaRouteReport[], seguimientoDts: Set<string>, contractor: string) {
  if (!seguimientoDts.size) {
    return { records: [], ignoredDts: [], validationError: `No hay DT del seguimiento cargados para ${contractor}.` };
  }

  const reportDts = new Set(
    records.flatMap((record) => (record.rows || []).map((row) => normalizeDt(row.dt || row.tourDisplayId))).filter(Boolean),
  );
  if (!reportDts.size) return { records: [], ignoredDts: [], validationError: "El reporte de rango no tiene DT validos." };

  const ignoredDts = Array.from(reportDts).filter((dt) => !seguimientoDts.has(dt));
  const sanitizedRecords = records.map((record) => {
    const rows = (record.rows || []).filter((row) => seguimientoDts.has(normalizeDt(row.dt || row.tourDisplayId)));
    return { ...record, rows, summary: summarizeReportRows(record, rows, seguimientoDts.size) };
  });
  const validRows = sanitizedRecords.reduce((total, record) => total + record.rows.length, 0);
  if (!validRows) {
    return {
      records: [],
      ignoredDts,
      validationError: `El archivo no tiene DT que pertenezcan a ${contractor}.`,
    };
  }

  return { records: sanitizedRecords, ignoredDts, validationError: "" };
}

function summarizeReportRows(report: PuntoCoronaRouteReport, rows: PuntoCoronaRouteReport["rows"], seguimientoDts: number) {
  const notStarted = "NOT_STARTED";
  const returnedStatuses = new Set(["DEFINITELY_RETURNED", "WAITING_MODULATION", "PARTIAL_DELIVERY"]);
  const startedRows = rows.filter((row) => row.status !== notStarted);
  const concluded = rows.filter((row) => row.status === "CONCLUDED").length;
  const returned = rows.filter((row) => returnedStatuses.has(row.status)).length;
  const inRange = startedRows.filter((row) => row.withinRadius === true).length;
  const outOfRange = startedRows.filter((row) => row.withinRadius === false).length;
  const modulationOpenRows = startedRows.length - concluded - returned;
  const crews = new Map<string, typeof rows>();

  rows.forEach((row) => {
    const key = `${normalizeDt(row.dt)}:${row.driverName}:${row.truckLicensePlate}`;
    crews.set(key, [...(crews.get(key) || []), row]);
  });

  return {
    ...report.summary,
    seguimientoDts,
    csvDts: new Set(rows.map((row) => normalizeDt(row.dt || row.tourDisplayId)).filter(Boolean)).size,
    matchedDts: new Set(rows.map((row) => normalizeDt(row.dt || row.tourDisplayId)).filter(Boolean)).size,
    totalRows: rows.length,
    ignoredNotStarted: rows.length - startedRows.length,
    startedRows: startedRows.length,
    inRange,
    outOfRange,
    concluded,
    returned,
    openRows: modulationOpenRows,
    modulatedRows: concluded,
    modulationOpenRows,
    modulationPercent: percent(concluded, concluded + returned),
    deliveryRangePercent: percent(inRange, startedRows.length),
    crews: Array.from(crews.entries()).map(([key, crewRows]) => {
      const started = crewRows.filter((row) => row.status !== notStarted);
      const crewConcluded = crewRows.filter((row) => row.status === "CONCLUDED").length;
      const crewReturned = crewRows.filter((row) => returnedStatuses.has(row.status)).length;
      const crewInRange = started.filter((row) => row.withinRadius === true).length;
      const crewOutOfRange = started.filter((row) => row.withinRadius === false).length;
      return {
        key,
        dt: crewRows[0]?.dt || "",
        driverName: crewRows[0]?.driverName || "Sin tripulacion",
        truckLicensePlate: crewRows[0]?.truckLicensePlate || "Sin placa",
        totalStarted: started.length,
        inRange: crewInRange,
        outOfRange: crewOutOfRange,
        concluded: crewConcluded,
        returned: crewReturned,
        open: started.length - crewConcluded - crewReturned,
        modulatedRows: crewConcluded,
        modulationOpenRows: started.length - crewConcluded - crewReturned,
        modulationPercent: percent(crewConcluded, crewConcluded + crewReturned),
        deliveryRangePercent: percent(crewInRange, started.length),
        seguimientoClientes: Number(crewRows[0]?.seguimientoClientes || 0),
        seguimientoVisitados: Number(crewRows[0]?.seguimientoVisitados || 0),
        seguimientoProgress: Number(crewRows[0]?.seguimientoProgress || 0),
      };
    }),
  };
}

function percent(value: number, total: number) {
  return total ? Number(((value / total) * 100).toFixed(2)) : 0;
}

type ReportRow = {
  report_id: string;
  contractor: string;
  operational_date: string;
  kind: PuntoCoronaRouteReport["kind"];
  data: PuntoCoronaRouteReport;
  updated_at: string;
};

function normalizeReport(report: PuntoCoronaRouteReport, row: ReportRow): PuntoCoronaRouteReport {
  return {
    ...report,
    id: report.id || row.report_id,
    contractor: row.contractor,
    operationalDate: report.operationalDate || row.operational_date,
    kind: report.kind || row.kind,
  };
}
