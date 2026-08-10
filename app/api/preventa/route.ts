import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../lib/authServer";
import { normalizeContractorName } from "../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "preventa_clientes";
const MODULATIONS_TABLE = "modulaciones_ruta";
const ALLOWED = ["logisticos"];

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
    if (session.isAdmin || !ALLOWED.includes(normalizeContractorName(session.contractor))) return NextResponse.json({ error: "Preventa esta disponible solo para Logisticos." }, { status: 403 });
    const params = new URLSearchParams({ select: "*", order: "created_at.desc,previous_refusals.desc" });
    if (!session.isAdmin) params.set("contractor", `eq.${session.contractor}`);
    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const response = await fetch(supabaseRest(TABLE, `?${params}`), { headers, cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    const records = await response.json() as Array<Record<string, unknown>>;
    const offenders = await readModulationOffenders(headers, session.isAdmin ? undefined : session.contractor);
    const refusalByClient = new Map(offenders.map((row) => [`${normalizeContractorName(row.contractor)}:${row.client_code.toLowerCase()}`, row.refusals]));
    const enrichedRecords = records.map((row) => ({
      ...row,
      previous_refusals: refusalByClient.get(`${normalizeContractorName(String(row.contractor || ""))}:${String(row.client_code || "").trim().toLowerCase()}`) || 0,
    }));
    return NextResponse.json({ records: enrichedRecords, offenders, isAdmin: session.isAdmin });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar preventa." }, { status: 500 });
  }
}

type ModulationClient = { contractor?: string; client_code?: string; client_name?: string; phone?: string; total_boxes?: string | number };

async function readModulationOffenders(headers: Record<string, string>, contractor?: string) {
  const totals = new Map<string, { contractor: string; client_code: string; client_name: string; phone: string; refusals: number; rejected_boxes: number }>();
  const pageSize = 1_000;
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({ select: "contractor,client_code:data->>codigoCliente,client_name:data->>nombreCliente,phone:data->>telefonoCliente,total_boxes:data->>totalCajas", limit: String(pageSize), offset: String(offset) });
    if (contractor) params.set("contractor", `eq.${contractor}`);
    const response = await fetch(supabaseRest(MODULATIONS_TABLE, `?${params}`), { headers, cache: "no-store" });
    if (!response.ok) throw new Error(await supabaseError(response));
    const page = await response.json() as ModulationClient[];
    page.forEach((row) => {
      const code = String(row.client_code || "").trim();
      const rowContractor = String(row.contractor || contractor || "").trim();
      if (!code || !rowContractor) return;
      const key = `${normalizeContractorName(rowContractor)}:${code.toLowerCase()}`;
      const current = totals.get(key);
      totals.set(key, { contractor: rowContractor, client_code: code, client_name: String(row.client_name || current?.client_name || "").trim(), phone: String(row.phone || current?.phone || "").trim(), refusals: (current?.refusals || 0) + 1, rejected_boxes: (current?.rejected_boxes || 0) + readNumber(row.total_boxes) });
    });
    if (page.length < pageSize) break;
  }
  return Array.from(totals.values()).sort((a, b) => b.refusals - a.refusals);
}

function readNumber(value: unknown) {
  const text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return 0;
  const normalized = text.includes(",") && text.includes(".") ? text.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(text) ? text.replace(/\./g, "") : text.replace(",", ".");
  const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function PATCH(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
    const body = await request.json() as { id?: string; contractor?: string; callResult?: string; reason?: string; notes?: string; callerName?: string };
    const owns = !session.isAdmin && normalizeContractorName(session.contractor) === normalizeContractorName(body.contractor);
    if (!body.id || !body.contractor || !owns || !ALLOWED.includes(normalizeContractorName(body.contractor))) return NextResponse.json({ error: "Registro no autorizado." }, { status: 403 });
    if (!["pendiente", "si", "no"].includes(body.callResult || "")) return NextResponse.json({ error: "Selecciona si, no o pendiente." }, { status: 400 });
    if (body.callResult === "no" && !String(body.reason || "").trim()) return NextResponse.json({ error: "Selecciona la causa del no contacto." }, { status: 400 });
    const callerName = String(body.callerName || "").trim().replace(/\s+/g, " ");
    if (callerName.length < 3) return NextResponse.json({ error: "Identifica a la persona que realiza la llamada." }, { status: 400 });
    const readParams = new URLSearchParams({ select: "call_result,no_contact_reason,caller_name,last_edited_by,edit_history,client_code,client_name", id: `eq.${body.id}`, contractor: `eq.${body.contractor}`, limit: "1" });
    const readHeaders = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const currentResponse = await fetch(supabaseRest(TABLE, `?${readParams}`), { headers: readHeaders, cache: "no-store" });
    if (!currentResponse.ok) return NextResponse.json({ error: await supabaseError(currentResponse) }, { status: currentResponse.status });
    const current = (await currentResponse.json() as Array<{ call_result?: string; no_contact_reason?: string; caller_name?: string; last_edited_by?: string; edit_history?: unknown; client_code?: string; client_name?: string }>)[0];
    if (!current) return NextResponse.json({ error: "No se encontró el cliente de preventa." }, { status: 404 });
    const isEdit = current.call_result !== "pendiente";
    const editHistory = Array.isArray(current.edit_history) ? current.edit_history : [];
    const nextHistory = isEdit ? [...editHistory, { editor: callerName, at: new Date().toISOString(), from: callOutcomeLabel(current.call_result, current.no_contact_reason), to: callOutcomeLabel(body.callResult, body.reason), client_code: current.client_code || "", client_name: current.client_name || "" }] : editHistory;
    const params = new URLSearchParams({ id: `eq.${body.id}`, contractor: `eq.${body.contractor}` });
    const extra = { Prefer: "return=representation" };
    const response = await fetch(supabaseRest(TABLE, `?${params}`), {
      method: "PATCH", headers: supabaseAdminHeaders(extra) ?? supabaseUserHeaders(session.accessToken, extra),
      body: JSON.stringify({ call_result: body.callResult, no_contact_reason: body.callResult === "no" ? String(body.reason).trim() : "", notes: body.callResult === "pendiente" ? "" : String(body.notes || "").trim(), caller_name: !isEdit && body.callResult !== "pendiente" ? callerName : current.caller_name || callerName, last_edited_by: isEdit ? callerName : current.last_edited_by || "", edit_history: nextHistory, called_at: body.callResult === "pendiente" ? null : new Date().toISOString(), updated_at: new Date().toISOString() }), cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    const records = await response.json();
    return NextResponse.json({ record: records[0] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar la llamada." }, { status: 500 });
  }
}

function callOutcomeLabel(result?: string, reason?: string) {
  if (result === "pendiente") return "Pendiente";
  if (result === "si") return "Sí recibe";
  if (result === "no" && reason === "Cliente confirma que no recibe") return "No recibe";
  if (result === "no") return `No contactado${reason ? `: ${reason}` : ""}`;
  return "Sin respuesta";
}
