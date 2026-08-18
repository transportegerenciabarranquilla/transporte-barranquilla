import { NextResponse } from "next/server";
import { writeAuditLog } from "../../lib/auditLog";
import { getAuthenticatedSession } from "../../lib/authServer";
import { complaintClosingDeadline, complaintDateKey, normalizeComplaintDt, type ComplaintRecord } from "../../lib/complaints";
import { isLogisticosContractor } from "../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseReadHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";
import type { Vehiculo } from "../../seguimiento/types";

const TABLE = "route_complaints";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
  if (!session.isAdmin && !isLogisticosContractor(session.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const params = new URLSearchParams({ select: "complaint_id,contractor,data,created_date,uploaded_at", order: "uploaded_at.desc", limit: "5000" });
  if (!session.isAdmin) params.set("contractor", `eq.${session.contractor}`);
  const response = await fetch(supabaseRest(TABLE, `?${params}`), { headers: supabaseReadHeaders(session.accessToken), cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
  const rows = await response.json() as Array<{ complaint_id: string; contractor: string; uploaded_at: string; data: ComplaintRecord }>;
  const seguimiento = rows.some((row) => !row.data.matched && row.data.dt)
    ? await readSeguimiento(session.accessToken)
    : [];
  return NextResponse.json({ records: rows.map((row) => {
    const match = row.data.matched ? undefined : findSeguimientoMatch(row.data.dt, row.data.createdDate, seguimiento);
    const vehicle = match?.data;
    return {
      ...row.data,
      ...(vehicle ? crewFromVehicle(vehicle) : {}),
      id: row.complaint_id,
      contractor: match?.contractor || row.contractor,
      matched: row.data.matched || Boolean(match),
      closingTime: complaintClosingDeadline(row.data.uploadedAt || row.uploaded_at),
    };
  }) });
}

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
  if (!session.isAdmin && !isLogisticosContractor(session.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { records?: Array<Record<string, unknown>> };
  if (!Array.isArray(body.records) || !body.records.length) return NextResponse.json({ error: "El archivo no contiene quejas." }, { status: 400 });
  if (body.records.length > 5000) return NextResponse.json({ error: "El archivo supera el limite de 5.000 quejas." }, { status: 413 });

  const seguimiento = await readSeguimiento(session.accessToken);
  const uploadedAt = new Date().toISOString();
  const records = body.records.map((input, index) => enrichComplaint(input, index, seguimiento, session.email, uploadedAt, session.contractor));
  const invalid = records.filter((record) => !record.id || !record.createdDate);
  if (invalid.length) return NextResponse.json({ error: `${invalid.length} filas no tienen id o fecha creacion validos.` }, { status: 400 });
  const rows = records.map((record) => ({ complaint_id: record.id, contractor: record.contractor, created_date: record.createdDate, dt: record.dt, uploaded_by: session.email, uploaded_at: uploadedAt, data: record }));
  const headers = supabaseAdminHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }) ?? supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" });
  const response = await fetch(supabaseRest(TABLE, "?on_conflict=complaint_id"), { method: "POST", headers, body: JSON.stringify(rows), cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
  await writeAuditLog({ action: "quejas_cargadas", contractor: session.contractor, details: { total: records.length, cruzadas: records.filter((record) => record.matched).length }, module: "quejas", request, session });
  return NextResponse.json({ records, inserted: records.length, matched: records.filter((record) => record.matched).length });
}

export async function PATCH(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
  if (!session.isAdmin && !isLogisticosContractor(session.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { id?: string; action?: string };
  const id = text(body.id);
  if (!id || body.action !== "close") return NextResponse.json({ error: "Solicitud invalida." }, { status: 400 });
  const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
  const params = new URLSearchParams({ select: "contractor,data", complaint_id: `eq.${id}`, limit: "1" });
  const currentResponse = await fetch(supabaseRest(TABLE, `?${params}`), { headers, cache: "no-store" });
  if (!currentResponse.ok) return NextResponse.json({ error: await supabaseError(currentResponse) }, { status: currentResponse.status });
  const current = (await currentResponse.json() as Array<{ contractor: string; data: ComplaintRecord }>)[0];
  if (!current) return NextResponse.json({ error: "Queja no encontrada." }, { status: 404 });
  if (!current.data.evidence?.path) return NextResponse.json({ error: "Debes subir una evidencia PDF o PNG antes de cerrar la queja." }, { status: 409 });
  const closedAt = new Date().toISOString();
  const record = { ...current.data, status: "Cerrada", closedAt, closedBy: session.email };
  const updateResponse = await fetch(supabaseRest(TABLE, `?complaint_id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ data: record }),
    cache: "no-store",
  });
  if (!updateResponse.ok) return NextResponse.json({ error: await supabaseError(updateResponse) }, { status: updateResponse.status });
  await writeAuditLog({ action: "queja_cerrada", contractor: current.contractor, details: { evidence: current.data.evidence.name }, module: "quejas", recordId: id, request, session });
  return NextResponse.json({ record });
}

async function readSeguimiento(accessToken: string) {
  const records: Array<{ contractor: string; data: Vehiculo }> = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({ select: "contractor,data", order: "updated_at.desc", limit: String(pageSize), offset: String(offset) });
    const response = await fetch(supabaseRest("seguimiento_vehiculos", `?${params}`), { headers: supabaseAdminHeaders() ?? supabaseUserHeaders(accessToken), cache: "no-store" });
    if (!response.ok) throw new Error(`Seguimiento: ${await supabaseError(response)}`);
    const page = await response.json() as Array<{ contractor: string; data: Vehiculo }>;
    records.push(...page);
    if (page.length < pageSize) break;
  }
  return records;
}

function enrichComplaint(input: Record<string, unknown>, index: number, seguimiento: Array<{ contractor: string; data: Vehiculo }>, email: string, uploadedAt: string, uploaderContractor: string): ComplaintRecord {
  const id = text(input.id) || `QUEJA-${Date.now()}-${index + 1}`;
  const createdDate = complaintDateKey(input.createdDate ?? input["fecha creacion"]);
  const dt = normalizeComplaintDt(input.dt);
  const match = findSeguimientoMatch(dt, createdDate, seguimiento);
  const vehicle = match?.data;
  const contractor = match?.contractor || vehicle?.transportista || (isLogisticosContractor(uploaderContractor) ? uploaderContractor : "Logisticos");
  return {
    id,
    closingTime: complaintClosingDeadline(uploadedAt),
    createdDate,
    code: text(input.code ?? input.Codigo ?? input.codigo),
    establishment: text(input.establishment ?? input.establecimiento),
    orderNumber: text(input.orderNumber ?? input["numero de pedido"]),
    comments: text(input.comments ?? input.comentarios),
    issue: text(input.issue ?? input.novedad),
    dt,
    contractor: text(input.contractor ?? input.transportista) || contractor,
    ...crewFromVehicle(vehicle),
    uploadedBy: email,
    uploadedAt,
    matched: Boolean(match),
    status: "Abierta",
  };
}

function findSeguimientoMatch(dt: unknown, createdDate: unknown, seguimiento: Array<{ contractor: string; data: Vehiculo }>) {
  const normalizedDt = normalizeComplaintDt(dt);
  const normalizedDate = complaintDateKey(createdDate);
  if (!normalizedDt) return undefined;
  const candidates = seguimiento.filter((row) => normalizeComplaintDt(row.data?.transporte) === normalizedDt);
  const exact = candidates.find((row) => [row.data.fechaDespacho, row.data.fechaDt, row.data.date, row.data.createdAt]
    .some((value) => complaintDateKey(value) === normalizedDate));
  // Si el DT solo existe una vez, puede cruzarse aunque la fuente haya omitido
  // o formateado de otra manera la fecha operativa.
  return exact ?? (candidates.length === 1 ? candidates[0] : undefined);
}

function crewFromVehicle(vehicle?: Vehiculo) {
  return {
    plate: text(vehicle?.vehiculo),
    responsible: text(vehicle?.nombreResponsable || vehicle?.responsable),
    responsibleId: text(vehicle?.cedulaResponsable),
    driver: text(vehicle?.nombreAuxiliar1),
    driverId: text(vehicle?.cedulaAuxiliar1),
    auxiliary: text(vehicle?.nombreAuxiliar2),
    auxiliaryId: text(vehicle?.cedulaAuxiliar2),
  };
}

function text(value: unknown) { return String(value ?? "").trim(); }
