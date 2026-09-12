import { scopeQuery } from "../../../lib/adminScope";
import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { contractorLabel, isAdminRangoExcludedContractor, normalizeContractorName } from "../../../lib/contractors";
import type { PuntoCoronaRouteReport } from "../../../lib/puntoCoronaRoutesStorage";
import { cachedJsonFetch } from "../../../lib/serverCache";
import { supabaseAdminHeaders, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

const TABLE = "punto_corona_route_reports";
const LIST_SELECT = "report_id,contractor,operational_date,kind,data,updated_at";
const LIST_CACHE_TTL_MS = 30_000;

type AdminRangoReport = {
  id: string;
  contractor: string;
  operationalDate: string;
  kind: PuntoCoronaRouteReport["kind"];
  fileName: string;
  uploadedAt: string;
  closedAt?: string;
  updatedAt: string;
  summary: PuntoCoronaRouteReport["summary"];
  rows: PuntoCoronaRouteReport["rows"];
};

export async function GET() {
  try {
    const session = await getAuthenticatedSession({ allowSiteAdmin: true });
    if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const headers = supabaseAdminHeaders() || supabaseUserHeaders(session.accessToken);
    const params = new URLSearchParams({
      select: LIST_SELECT,
      order: "operational_date.desc,updated_at.desc",
      limit: "5000",
    });
    if (!session.isAdmin) params.set("contractor", `eq.${session.contractor}`);
    scopeQuery(params, session);
    const url = supabaseRest(TABLE, `?${params.toString()}`);
    const rows = await cachedJsonFetch<ReportRow[]>(`supabase:admin-rango:${session.contractor}:${url}`, LIST_CACHE_TTL_MS, url, { headers });

    const reports = rows
      .map(normalizeReport)
      .filter((report): report is AdminRangoReport => report !== null)
      .filter((report) => session.isAdmin || normalizeContractorName(report.contractor) === normalizeContractorName(session.contractor))
      .filter((report) => (session.isSiteAdmin || !isAdminRangoExcludedContractor(report.contractor)));
    return NextResponse.json({ reports });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando historial de rango." }, { status: 500 });
  }
}

type ReportRow = {
  report_id: string;
  contractor: string;
  operational_date: string;
  kind: PuntoCoronaRouteReport["kind"];
  data?: PuntoCoronaRouteReport;
  updated_at: string;
};

function normalizeReport(row: ReportRow): AdminRangoReport | null {
  if (!row.data?.summary) return null;
  const contractor = contractorLabel(row.data.contractor || row.contractor) || row.contractor;

  return {
    id: row.data.id || row.report_id,
    contractor,
    operationalDate: row.data.operationalDate || row.operational_date,
    kind: row.data.kind || row.kind || "current",
    fileName: row.data.fileName || "Sin archivo",
    uploadedAt: row.data.uploadedAt || row.updated_at,
    closedAt: row.data.closedAt,
    updatedAt: row.updated_at,
    summary: row.data.summary,
    rows: row.data.rows || [],
  };
}
