import { NextResponse } from "next/server";
import { canAccessContractor } from "../../../lib/adminScope";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { chartDate, complaintChartStatus, complaintClosureDate, type ComplaintChartRow } from "../../../lib/complaintCharts";
import { canManageComplaint, complaintUploadContractor, isComplaintsContractor } from "../../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseReadHeaders, supabaseRest } from "../../../lib/supabaseServer";

const TABLE = "complaint_chart_rows";

export async function GET() {
  const session = await getAuthenticatedSession({ allowSiteAdmin: true });
  if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  if (!session.isAdmin && !isComplaintsContractor(session.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const records: Array<{ contractor: string; data: ComplaintChartRow; source_name: string }> = [];
  for (let offset = 0; ; offset += 1000) {
    const params = new URLSearchParams({ select: "contractor,data,source_name", order: "updated_at.desc", limit: "1000", offset: String(offset) });
    const response = await fetch(supabaseRest(TABLE, `?${params}`), { headers: supabaseReadHeaders(session.accessToken), cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: response.status === 404 ? "Falta crear la tabla de gráficas. Ejecuta supabase/complaint_chart_rows.sql en Supabase." : await supabaseError(response) }, { status: response.status });
    const page = await response.json() as typeof records;
    records.push(...page);
    if (page.length < 1000) break;
  }
  const visible = records.filter(row => session.isAdmin
    ? !session.isSiteAdmin || canAccessContractor(session, row.contractor)
    : canManageComplaint(session.contractor, row.contractor));
  return NextResponse.json({ rows: visible.map(row => row.data), sourceName: visible[0]?.source_name || "" });
}

export async function POST(request: Request) {
  const session = await getAuthenticatedSession({ allowSiteAdmin: true });
  if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  if (!session.isAdmin && !isComplaintsContractor(session.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const body = await request.json().catch(() => null) as { rows?: ComplaintChartRow[]; sourceName?: string } | null;
  if (!Array.isArray(body?.rows) || !body.rows.length || body.rows.length > 5000) return NextResponse.json({ error: "Carga entre 1 y 5.000 quejas por archivo." }, { status: 400 });
  const sourceName = String(body.sourceName || "Excel de quejas").slice(0, 200);
  const seen = new Set<string>();
  const records = [];
  for (const [index, row] of body.rows.entries()) {
    if (!row || typeof row !== "object") return NextResponse.json({ error: `Fila ${index + 2} inválida.` }, { status: 400 });
    const contractor = complaintUploadContractor(String(row.contractor || ""), session.contractor);
    const ticket = String(row.complaintId || "").trim();
    if (!isComplaintsContractor(contractor) || (session.isAdmin
      ? session.isSiteAdmin && !canAccessContractor(session, contractor)
      : !canManageComplaint(session.contractor, contractor))) return NextResponse.json({ error: `Fila ${index + 2}: transportista no autorizado.` }, { status: 403 });
    if (!ticket || ticket.length > 100 || seen.has(`${contractor}\u0000${ticket}`)) return NextResponse.json({ error: `Fila ${index + 2}: Ticket ausente o repetido.` }, { status: 400 });
    if (row.count !== 1 || !chartDate(String(row.date || "")) || !complaintClosureDate(String(row.openedAt || ""))) return NextResponse.json({ error: `Fila ${index + 2}: fecha de ingreso o cantidad inválida.` }, { status: 400 });
    if (row.closedAt && !complaintClosureDate(String(row.closedAt))) return NextResponse.json({ error: `Fila ${index + 2}: fecha de cierre inválida.` }, { status: 400 });
    seen.add(`${contractor}\u0000${ticket}`);
    const clean = (value: unknown, max = 2000) => String(value ?? "").trim().slice(0, max);
    const data: ComplaintChartRow = {
      contractor, complaintId: ticket, date: chartDate(row.date), status: complaintChartStatus(clean(row.status, 100)),
      issue: clean(row.issue), count: 1, openedAt: complaintClosureDate(row.openedAt || ""),
      closedAt: complaintClosureDate(row.closedAt || ""), dt: clean(row.dt, 100), rr: clean(row.rr, 200),
      client: clean(row.client, 200), clientCode: clean(row.clientCode, 100), causal: clean(row.causal),
      plate: clean(row.plate, 100), adjudicable: clean(row.adjudicable, 100), observation: clean(row.observation),
    };
    records.push({ contractor, ticket, data, source_name: sourceName, imported_by: session.email, updated_at: new Date().toISOString() });
  }
  const headers = supabaseAdminHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" });
  if (!headers) return NextResponse.json({ error: "Falta configurar la clave de servicio para guardar las gráficas." }, { status: 503 });
  const response = await fetch(supabaseRest(TABLE, "?on_conflict=contractor,ticket"), { method: "POST", headers, body: JSON.stringify(records), cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: response.status === 404 ? "Falta crear la tabla de gráficas. Ejecuta supabase/complaint_chart_rows.sql en Supabase." : await supabaseError(response) }, { status: response.status });
  return NextResponse.json({ saved: records.length });
}
