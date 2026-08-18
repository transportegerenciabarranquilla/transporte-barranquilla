import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/auditLog";
import { getAuthenticatedSession } from "../../../lib/authServer";
import type { ComplaintRecord } from "../../../lib/complaints";
import { isLogisticosContractor } from "../../../lib/contractors";
import { SUPABASE_URL, supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

const TABLE = "route_complaints";
const BUCKET = "complaint-evidence";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/png"]);

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
  if (!session.isAdmin && !isLogisticosContractor(session.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const form = await request.formData();
  const id = String(form.get("id") || "").trim();
  const file = form.get("file");
  if (!id || !(file instanceof File)) return NextResponse.json({ error: "Selecciona una evidencia." }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type) || !/\.(pdf|png)$/i.test(file.name)) return NextResponse.json({ error: "La evidencia debe ser PDF o PNG." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "La evidencia supera el limite de 5 MB." }, { status: 413 });

  const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
  const current = await readComplaint(id, headers);
  if (!current) return NextResponse.json({ error: "Queja no encontrada." }, { status: 404 });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${id.replace(/[^a-zA-Z0-9_-]/g, "_")}/${Date.now()}-${safeName}`;
  const storageResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": file.type, "x-upsert": "false" },
    body: await file.arrayBuffer(),
  });
  if (!storageResponse.ok) return NextResponse.json({ error: `Evidencia: ${await supabaseError(storageResponse)}` }, { status: storageResponse.status });
  const evidence = { path, name: file.name, type: file.type, uploadedAt: new Date().toISOString(), uploadedBy: session.email };
  const record: ComplaintRecord = { ...current.data, evidence };
  const updateResponse = await fetch(supabaseRest(TABLE, `?complaint_id=eq.${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ data: record }),
    cache: "no-store",
  });
  if (!updateResponse.ok) return NextResponse.json({ error: await supabaseError(updateResponse) }, { status: updateResponse.status });
  await writeAuditLog({ action: "queja_evidencia_subida", contractor: current.contractor, details: { fileName: file.name, fileType: file.type }, module: "quejas", recordId: id, request, session });
  return NextResponse.json({ record });
}

export async function GET(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
  if (!session.isAdmin && !isLogisticosContractor(session.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") || "";
  const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
  const current = await readComplaint(id, headers);
  const evidence = current?.data.evidence;
  if (!evidence?.path) return NextResponse.json({ error: "La queja no tiene evidencia." }, { status: 404 });
  const storageResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${BUCKET}/${evidence.path.split("/").map(encodeURIComponent).join("/")}`, { headers, cache: "no-store" });
  if (!storageResponse.ok) return NextResponse.json({ error: await supabaseError(storageResponse) }, { status: storageResponse.status });
  return new Response(await storageResponse.arrayBuffer(), { headers: { "Content-Type": evidence.type, "Content-Disposition": `inline; filename="${evidence.name.replaceAll('"', '')}"`, "Cache-Control": "private, max-age=60" } });
}

async function readComplaint(id: string, headers: Record<string, string>) {
  if (!id) return null;
  const params = new URLSearchParams({ select: "contractor,data", complaint_id: `eq.${id}`, limit: "1" });
  const response = await fetch(supabaseRest(TABLE, `?${params}`), { headers, cache: "no-store" });
  if (!response.ok) throw new Error(await supabaseError(response));
  return (await response.json() as Array<{ contractor: string; data: ComplaintRecord }>)[0] ?? null;
}
