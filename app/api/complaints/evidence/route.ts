import { canAccessContractor } from "../../../lib/adminScope";
import { NextResponse } from "next/server";
import { writeAuditLog } from "../../../lib/auditLog";
import { getAuthenticatedSession } from "../../../lib/authServer";
import type { ComplaintRecord } from "../../../lib/complaints";
import { canManageComplaint, isComplaintsContractor } from "../../../lib/contractors";
import { SUPABASE_URL, supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

const TABLE = "route_complaints";
const BUCKET = "complaint-evidence";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
  if (session.isAdmin || !isComplaintsContractor(session.contractor)) return NextResponse.json({ error: "Solo las contratistas pueden subir evidencia." }, { status: 403 });
  const form = await request.formData();
  const id = String(form.get("id") || "").trim();
  const file = form.get("file");
  if (!id || !(file instanceof File)) return NextResponse.json({ error: "Selecciona una evidencia." }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type) || !/\.(pdf|png|jpe?g)$/i.test(file.name)) return NextResponse.json({ error: "La evidencia debe ser PDF, PNG, JPG o JPEG." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "La evidencia supera el limite de 5 MB." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validSignature = file.type === "application/pdf"
    ? Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-"
    : file.type === "image/png"
      ? [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!validSignature) return NextResponse.json({ error: "El contenido no coincide con el tipo de archivo." }, { status: 400 });

  const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
  const current = await readComplaint(id, headers);
  if (!current) return NextResponse.json({ error: "Queja no encontrada." }, { status: 404 });
  if (!session.isAdmin && !canManageComplaint(session.contractor, current.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${id.replace(/[^a-zA-Z0-9_-]/g, "_")}/${Date.now()}-${safeName}`;
  const storageResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": file.type, "x-upsert": "false" },
    body: bytes,
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
  const session = await getAuthenticatedSession({ allowSiteAdmin: true });
  if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
  if (!session.isAdmin && !isComplaintsContractor(session.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") || "";
  const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
  const current = await readComplaint(id, headers);
  if (current && !session.isAdmin && !canManageComplaint(session.contractor, current.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  if (current && session.isSiteAdmin && !canAccessContractor(session, current.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const evidence = current?.data.evidence;
  if (!evidence?.path) return NextResponse.json({ error: "La queja no tiene evidencia." }, { status: 404 });
  if (evidence.path.split("/").some((part) => !part || part === "." || part === "..") || !ALLOWED_TYPES.has(evidence.type)) return NextResponse.json({ error: "Evidencia inválida." }, { status: 400 });
  const storageResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${BUCKET}/${evidence.path.split("/").map(encodeURIComponent).join("/")}`, { headers, cache: "no-store" });
  if (!storageResponse.ok) return NextResponse.json({ error: await supabaseError(storageResponse) }, { status: storageResponse.status });
  return new Response(await storageResponse.arrayBuffer(), { headers: { "Content-Type": evidence.type, "Content-Disposition": `inline; filename="${evidence.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`, "Cache-Control": "private, no-store", "Content-Security-Policy": "sandbox; default-src 'none'", "X-Content-Type-Options": "nosniff" } });
}

async function readComplaint(id: string, headers: Record<string, string>) {
  if (!id) return null;
  const params = new URLSearchParams({ select: "contractor,data", complaint_id: `eq.${id}`, limit: "1" });
  const response = await fetch(supabaseRest(TABLE, `?${params}`), { headers, cache: "no-store" });
  if (!response.ok) throw new Error(await supabaseError(response));
  return (await response.json() as Array<{ contractor: string; data: ComplaintRecord }>)[0] ?? null;
}
