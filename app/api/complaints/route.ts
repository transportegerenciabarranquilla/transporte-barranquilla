import { NextResponse } from "next/server";
import { writeAuditLog } from "../../lib/auditLog";
import { getAuthenticatedSession } from "../../lib/authServer";
import { complaintClosingDeadline, complaintDateKey, complaintIdentityKey, normalizeComplaintDt, type ComplaintRecord } from "../../lib/complaints";
import { contractorLabel, isComplaintsContractor, normalizeContractorName } from "../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseReadHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";
import type { Vehiculo } from "../../seguimiento/types";
import type { AsistenciaRegistro } from "../../lib/asistenciaStorage";
import type { ModulacionRegistro } from "../../lib/modulacionStorage";

const TABLE = "route_complaints";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
  if (!session.isAdmin && !isComplaintsContractor(session.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const rows = await readComplaintRows(session.accessToken);
  const [seguimiento, crossContractorTracking, attendances, modulations] = await Promise.all([
    readSeguimiento(session.accessToken),
    readCrossContractorSeguimiento(rows.map((row) => row.data.dt), session.accessToken),
    readComplaintSource<AsistenciaRegistro>("asistencias_ruta", session.accessToken),
    readComplaintSource<ModulacionRegistro>("modulaciones_ruta", session.accessToken),
  ]);
  const tracking = [...seguimiento, ...crossContractorTracking];
  const uniqueRows = Array.from(new Map(rows.map((row) => [complaintIdentityKey(row.complaint_id), row])).values());
  const resolved = uniqueRows.map((row) => {
    const match = findSeguimientoMatch(row.data.dt, row.data.createdDate, tracking, row.contractor);
    const vehicle = match?.data;
    const attendance = vehicle ? undefined : findFallbackMatch(row.data.dt, row.data.createdDate, attendances, row.contractor);
    const modulation = vehicle || attendance ? undefined : findFallbackMatch(row.data.dt, row.data.createdDate, modulations, row.contractor);
    const fallback = attendance || modulation;
    const resolvedContractor = contractorLabel(match?.contractor || vehicle?.transportista || fallback?.contractor || row.contractor) || row.contractor;
    return {
      ...row.data,
      ...(vehicle ? crewFromVehicle(vehicle) : attendance ? crewFromAttendance(attendance.data) : {}),
      id: row.complaint_id,
      contractor: resolvedContractor,
      matched: Boolean(match || attendance),
      closingTime: complaintClosingDisplay(row.data.createdDate, row.data.uploadedAt || row.uploaded_at),
    };
  });
  const records = session.isAdmin || isComplaintsUploader(session.contractor)
    ? resolved
    : resolved.filter((record) => normalizeContractorName(record.contractor) === normalizeContractorName(session.contractor));
  return NextResponse.json({ records });
}

async function readComplaintSource<T>(table: string, accessToken: string) {
  const records: Array<{ contractor: string; data: T }> = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({ select: "contractor,data", order: "updated_at.desc", limit: String(pageSize), offset: String(offset) });
    const response = await fetch(supabaseRest(table, `?${params}`), { headers: supabaseReadHeaders(accessToken), cache: "no-store" });
    if (!response.ok) break;
    const page = await response.json() as typeof records;
    records.push(...page);
    if (page.length < pageSize) break;
  }
  return records;
}

async function readComplaintRows(accessToken: string) {
  const records: Array<{ complaint_id: string; contractor: string; uploaded_at: string; data: ComplaintRecord }> = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({
      select: "complaint_id,contractor,data,created_date,uploaded_at",
      order: "uploaded_at.desc",
      limit: String(pageSize),
      offset: String(offset),
    });
    const response = await fetch(supabaseRest(TABLE, `?${params}`), { headers: supabaseReadHeaders(accessToken), cache: "no-store" });
    if (!response.ok) throw new Error(await supabaseError(response));
    const page = await response.json() as typeof records;
    records.push(...page);
    if (page.length < pageSize) break;
  }
  return records;
}

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
  if (!session.isAdmin && !isComplaintsContractor(session.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (!session.isAdmin && !isComplaintsUploader(session.contractor)) return NextResponse.json({ error: "Solo Logisticos puede cargar quejas." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { records?: Array<Record<string, unknown>> };
  if (!Array.isArray(body.records) || !body.records.length) return NextResponse.json({ error: "El archivo no contiene quejas." }, { status: 400 });
  if (body.records.length > 5000) return NextResponse.json({ error: "El archivo supera el limite de 5.000 quejas." }, { status: 413 });

  const missingIds = body.records.filter((input) => !text(input.id));
  if (missingIds.length) return NextResponse.json({ error: `${missingIds.length} filas no tienen ID. El ID es obligatorio para evitar quejas duplicadas.` }, { status: 400 });

  const [seguimiento, crossContractorTracking, existingRows] = await Promise.all([
    readSeguimiento(session.accessToken),
    readCrossContractorSeguimiento(body.records.map((record) => record.dt), session.accessToken),
    readComplaintRows(session.accessToken),
  ]);
  const tracking = [...seguimiento, ...crossContractorTracking];
  const existingByIdentity = new Map(existingRows.map((row) => [complaintIdentityKey(row.complaint_id), row]));
  const uploadedAt = new Date().toISOString();
  const enrichedRecords = body.records.map((input, index) => {
    const requestedContractor = contractorLabel(text(input.contractor ?? input.transportista));
    const targetContractor = isComplaintsContractor(requestedContractor) ? requestedContractor : "";
    const record = enrichComplaint(input, index, tracking, session.email, uploadedAt, targetContractor);
    return { ...record, contractor: record.contractor || targetContractor || "Por identificar" };
  });
  const recordsById = new Map<string, ComplaintRecord>();
  for (const incoming of enrichedRecords) {
    const identity = complaintIdentityKey(incoming.id);
    const existing = existingByIdentity.get(identity);
    const record = existing ? {
      ...incoming,
      id: existing.complaint_id,
      ...(existing.data.evidence ? { evidence: existing.data.evidence } : {}),
      ...(existing.data.closedAt ? { closedAt: existing.data.closedAt } : {}),
      ...(existing.data.closedBy ? { closedBy: existing.data.closedBy } : {}),
      status: normalizeClosedStatus(existing.data.status) ? existing.data.status : incoming.status,
    } : incoming;
    recordsById.set(identity, record);
  }
  const records = Array.from(recordsById.values());
  const duplicates = enrichedRecords.length - records.length;
  const invalid = records.filter((record) => !record.id || !record.createdDate);
  if (invalid.length) return NextResponse.json({ error: `${invalid.length} filas no tienen id o fecha creacion validos.` }, { status: 400 });
  const rows = records.map((record) => ({ complaint_id: record.id, contractor: record.contractor, created_date: record.createdDate, dt: record.dt, uploaded_by: session.email, uploaded_at: uploadedAt, data: record }));
  const headers = supabaseAdminHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }) ?? supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" });
  const response = await fetch(supabaseRest(TABLE, "?on_conflict=complaint_id"), { method: "POST", headers, body: JSON.stringify(rows), cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
  await writeAuditLog({ action: "quejas_cargadas", contractor: session.contractor, details: { total: records.length, duplicadasOmitidas: duplicates, cruzadas: records.filter((record) => record.matched).length }, module: "quejas", request, session });
  return NextResponse.json({ records, inserted: records.length, duplicates, matched: records.filter((record) => record.matched).length });
}

export async function PATCH(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
  if (!session.isAdmin && !isComplaintsContractor(session.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { id?: string; action?: string; comments?: string };
  const id = text(body.id);
  if (!id || !["close", "comment"].includes(body.action || "")) return NextResponse.json({ error: "Solicitud invalida." }, { status: 400 });
  const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
  const params = new URLSearchParams({ select: "contractor,data", complaint_id: `eq.${id}`, limit: "1" });
  const currentResponse = await fetch(supabaseRest(TABLE, `?${params}`), { headers, cache: "no-store" });
  if (!currentResponse.ok) return NextResponse.json({ error: await supabaseError(currentResponse) }, { status: currentResponse.status });
  const current = (await currentResponse.json() as Array<{ contractor: string; data: ComplaintRecord }>)[0];
  if (!current) return NextResponse.json({ error: "Queja no encontrada." }, { status: 404 });
  if (!session.isAdmin && !isComplaintsUploader(session.contractor) && current.contractor !== session.contractor) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (body.action === "comment") {
    const comments = text(body.comments);
    if (comments.length > 2000) return NextResponse.json({ error: "El comentario no puede superar 2.000 caracteres." }, { status: 400 });
    const record = { ...current.data, comments };
    const updateResponse = await fetch(supabaseRest(TABLE, `?complaint_id=eq.${encodeURIComponent(id)}`), {
      method: "PATCH", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify({ data: record }), cache: "no-store",
    });
    if (!updateResponse.ok) return NextResponse.json({ error: await supabaseError(updateResponse) }, { status: updateResponse.status });
    await writeAuditLog({ action: "queja_comentada", contractor: current.contractor, details: { characters: comments.length }, module: "quejas", recordId: id, request, session });
    return NextResponse.json({ record });
  }
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

async function readCrossContractorSeguimiento(dts: unknown[], accessToken: string) {
  const complaintDts = Array.from(new Set(dts.map(normalizeComplaintDt).filter(Boolean)));
  if (!complaintDts.length) return [] as Array<{ contractor: string; data: Vehiculo }>;
  const response = await fetch(supabaseRest("rpc/find_complaint_tracking"), {
    method: "POST",
    headers: { ...supabaseUserHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ complaint_dts: complaintDts }),
    cache: "no-store",
  });
  if (!response.ok) return [] as Array<{ contractor: string; data: Vehiculo }>;
  return await response.json() as Array<{ contractor: string; data: Vehiculo }>;
}

function enrichComplaint(input: Record<string, unknown>, _index: number, seguimiento: Array<{ contractor: string; data: Vehiculo }>, email: string, uploadedAt: string, uploaderContractor: string): ComplaintRecord {
  const id = text(input.id);
  const createdDate = complaintDateKey(input.createdDate ?? input["fecha creacion"]);
  const dt = normalizeComplaintDt(input.dt);
  const match = findSeguimientoMatch(dt, createdDate, seguimiento, uploaderContractor);
  const vehicle = match?.data;
  const contractor = match?.contractor || vehicle?.transportista || (isComplaintsContractor(uploaderContractor) ? uploaderContractor : "Por identificar");
  return {
    id,
    closingTime: complaintClosingDisplay(createdDate, uploadedAt),
    createdDate,
    code: text(input.code ?? input.Codigo ?? input.codigo),
    establishment: text(input.establishment ?? input.establecimiento),
    orderNumber: text(input.orderNumber ?? input["numero de pedido"]),
    comments: text(input.comments ?? input.comentarios),
    issue: text(input.issue ?? input.novedad),
    dt,
    contractor,
    ...crewFromVehicle(vehicle),
    uploadedBy: email,
    uploadedAt,
    matched: Boolean(match),
    status: "Abierta",
  };
}

function findSeguimientoMatch(dt: unknown, createdDate: unknown, seguimiento: Array<{ contractor: string; data: Vehiculo }>, contractor?: string) {
  const normalizedDt = normalizeComplaintDt(dt);
  const normalizedDate = complaintDateKey(createdDate);
  if (!normalizedDt) return undefined;
  const contractorKey = normalizeContractorName(contractor);
  const candidates = seguimiento.filter((row) => normalizeComplaintDt(row.data?.transporte) === normalizedDt);
  const exactCandidates = candidates.filter((row) => vehicleDateKeys(row.data).includes(normalizedDate));
  const preferredExact = exactCandidates.find((row) => normalizeContractorName(row.contractor || row.data?.transportista) === contractorKey);
  if (preferredExact || exactCandidates.length) return preferredExact || exactCandidates[0];

  const preferredCandidates = candidates.filter((row) => normalizeContractorName(row.contractor || row.data?.transportista) === contractorKey);
  if (preferredCandidates.length === 1) return preferredCandidates[0];
  if (candidates.length === 1) return candidates[0];

  // Si el DT fue reutilizado, elegir la fecha operativa mas cercana evita que
  // una queja quede sin cruce solo por una diferencia de formato o de un dia.
  const targetTime = dateKeyTime(normalizedDate);
  if (!Number.isFinite(targetTime)) return undefined;
  return candidates
    .map((row) => ({ row, distance: Math.min(...vehicleDateKeys(row.data).map((date) => Math.abs(dateKeyTime(date) - targetTime))) }))
    .filter(({ distance }) => Number.isFinite(distance))
    .sort((left, right) => left.distance - right.distance)[0]?.row;
}

function vehicleDateKeys(vehicle: Vehiculo) {
  return [vehicle.fechaDespacho, vehicle.fechaDt, vehicle.date, vehicle.createdAt].map(complaintDateKey).filter(Boolean);
}

function findFallbackMatch<T extends { dt?: string; createdAt?: string; fechaDespacho?: string; fechaDt?: string }>(
  dt: unknown,
  createdDate: unknown,
  records: Array<{ contractor: string; data: T }>,
  contractor?: string,
) {
  const normalizedDt = normalizeComplaintDt(dt);
  if (!normalizedDt) return undefined;
  const candidates = records.filter((row) => normalizeComplaintDt(row.data?.dt) === normalizedDt);
  if (!candidates.length) return undefined;
  const targetTime = dateKeyTime(complaintDateKey(createdDate));
  const contractorKey = normalizeContractorName(contractor);
  return candidates
    .map((row) => {
      const dates = [row.data.fechaDespacho, row.data.fechaDt, row.data.createdAt].map(complaintDateKey).filter(Boolean);
      const distance = Number.isFinite(targetTime) && dates.length ? Math.min(...dates.map((date) => Math.abs(dateKeyTime(date) - targetTime))) : Number.MAX_SAFE_INTEGER;
      const contractorPenalty = normalizeContractorName(row.contractor) === contractorKey ? 0 : 1;
      return { row, distance, contractorPenalty };
    })
    .sort((left, right) => left.distance - right.distance || left.contractorPenalty - right.contractorPenalty)[0]?.row;
}

function dateKeyTime(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T12:00:00Z`) : Number.NaN;
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

function crewFromAttendance(attendance: AsistenciaRegistro) {
  return {
    plate: "",
    responsible: text(attendance.nombreResponsable),
    responsibleId: text(attendance.cedulaResponsable),
    driver: text(attendance.nombreAuxiliar1),
    driverId: text(attendance.cedulaAuxiliar1),
    auxiliary: text(attendance.nombreAuxiliar2),
    auxiliaryId: text(attendance.cedulaAuxiliar2),
  };
}

function text(value: unknown) { return String(value ?? "").trim(); }

function normalizeClosedStatus(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("cerrad");
}

function complaintClosingDisplay(createdDate: string, uploadedAt: string) {
  if (!createdDate) return "invalid";
  const today = bogotaDateKey();
  if (createdDate < today) return "expired";
  if (createdDate > today) return "future";
  return complaintClosingDeadline(uploadedAt);
}

function bogotaDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "America/Bogota", year: "numeric" }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function isComplaintsUploader(contractor: string | null | undefined) {
  return normalizeContractorName(contractor) === "logisticos";
}
