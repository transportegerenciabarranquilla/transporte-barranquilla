import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { sendAdminPush } from "../../../lib/pushNotifications";
import { contractorLabel } from "../../../lib/contractors";
import { supabaseAdminHeaders, supabaseRest } from "../../../lib/supabaseServer";

type DataRow = { contractor?: string; data?: Record<string, unknown> };
type HazardRow = { activo?: boolean };

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const cronSecret = process.env.ADMIN_PUSH_CRON_SECRET || "";
  const validCron = Boolean(cronSecret && bearer.length === cronSecret.length
    && timingSafeEqual(Buffer.from(bearer), Buffer.from(cronSecret)));
  if (!session?.isAdmin && !validCron) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const headers = supabaseAdminHeaders();
  if (!headers) return NextResponse.json({ error: "Las notificaciones requieren la clave secreta de Supabase." }, { status: 503 });
  const today = bogotaToday();
  const [vehicles, attendances, modulations, hazards] = await Promise.all([
    readRows<DataRow>("seguimiento_vehiculos", new URLSearchParams({ select: "contractor,data", limit: "3000" }), headers),
    readRows<DataRow>("asistencias_ruta", new URLSearchParams({ select: "contractor,data", limit: "3000" }), headers),
    readRows<DataRow>("modulaciones_ruta", new URLSearchParams({ select: "contractor,data", limit: "3000" }), headers),
    readRows<HazardRow>("ruta_criticas_riesgos", new URLSearchParams({ select: "activo", activo: "eq.true", limit: "1000" }), headers).catch(() => []),
  ]);

  const todayVehicles = vehicles.filter((row) => dateKey(row.data?.fechaDespacho ?? row.data?.date ?? row.data?.createdAt) === today);
  const attendanceKeys = new Set(attendances.map((row) => {
    const dt = normalizeDt(row.data?.dt);
    const date = dateKey(row.data?.createdAt);
    const contractor = normalizeText(row.contractor ?? row.data?.contratista);
    return dt && date ? `${contractor}:${dt}:${date}` : "";
  }).filter(Boolean));

  const withoutAttendance = new Map<string, number>();
  let withoutResponsible = 0;
  let lateDepartures = 0;
  let lowProgress = 0;
  todayVehicles.forEach((row) => {
    const data = row.data || {};
    const contractor = contractorLabel(String(row.contractor ?? data.transportista ?? "")) || "Sin transportista";
    const dt = normalizeDt(data.transporte);
    const date = dateKey(data.fechaDespacho ?? data.date ?? data.createdAt);
    if (dt && date && !attendanceKeys.has(`${normalizeText(contractor)}:${dt}:${date}`)) {
      withoutAttendance.set(contractor, (withoutAttendance.get(contractor) || 0) + 1);
    }
    if (![data.cedulaResponsable, data.nombreResponsable, data.responsable].some((value) => String(value || "").trim())) withoutResponsible += 1;
    if (Boolean(data.causalSalidaTardia) || isLateTime(data.horaSalida)) lateDepartures += 1;
    const clients = numeric(data.clientes);
    const visited = numeric(data.visitados);
    const status = String(data.status || "");
    if (clients > 0 && (visited / clients) * 100 < 50 && !["Finalizado", "Pernoctado", "Cambio de fecha"].includes(status)) lowProgress += 1;
  });

  const pendingModulation = modulations.filter((row) => {
    const data = row.data || {};
    return dateKey(data.fechaDespacho ?? data.fechaDt ?? data.createdAt) === today
      && numeric(data.totalCajas) > numeric(data.cajasGestionadas);
  }).length;
  const attendanceText = Array.from(withoutAttendance)
    .filter(([, count]) => count > 0)
    .map(([contractor, count]) => `${shortContractor(contractor)} ${count}`)
    .join(" · ");
  const issues = [
    attendanceText ? `Sin asistencia: ${attendanceText}` : "",
    withoutResponsible ? `Sin responsable: ${withoutResponsible}` : "",
    lateDepartures ? `Salidas tardías: ${lateDepartures}` : "",
    lowProgress ? `Bajo avance: ${lowProgress}` : "",
    pendingModulation ? `Modulación pendiente: ${pendingModulation}` : "",
    hazards.length ? `Riesgos activos: ${hazards.length}` : "",
  ].filter(Boolean);
  if (!issues.length) return NextResponse.json({ sent: 0, reason: "no-relevant-issues" });

  const fingerprint = createHash("sha256").update(`${today}:${issues.join("|")}`).digest("hex");
  const stateParams = new URLSearchParams({ select: "fingerprint", notification_key: "eq.admin-operational-summary", limit: "1" });
  const state = await readRows<{ fingerprint: string }>("push_notification_state", stateParams, headers).catch(() => []);
  if (state[0]?.fingerprint === fingerprint) return NextResponse.json({ sent: 0, reason: "unchanged" });

  const result = await sendAdminPush({
    title: "Resumen operativo pendiente",
    body: issues.join(" | "),
    url: "/admin?tab=errores",
    tag: "admin-operational-summary",
  });
  if (!result.skipped) {
    await fetch(supabaseRest("push_notification_state", "?on_conflict=notification_key"), {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ notification_key: "admin-operational-summary", fingerprint, sent_at: new Date().toISOString() }),
      cache: "no-store",
    });
  }
  return NextResponse.json({ ...result, issues });
}

async function readRows<T>(table: string, params: URLSearchParams, headers: Record<string, string>) {
  const response = await fetch(supabaseRest(table, `?${params}`), { headers, cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo consultar ${table}.`);
  return await response.json() as T[];
}

function bogotaToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date()); }
function normalizeDt(value: unknown) { return String(value ?? "").replace(/^DT-?/i, "").replace(/\D/g, ""); }
function normalizeText(value: unknown) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase(); }
function numeric(value: unknown) { const result = Number(String(value ?? 0).replace(",", ".")); return Number.isFinite(result) ? result : 0; }
function shortContractor(value: string) { return value === "Surti Cervezas" ? "Surti" : value.replace(" Arenosa", " A."); }
function isLateTime(value: unknown) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return false;
  return Number(match[1]) * 60 + Number(match[2]) > 8 * 60;
}
function dateKey(value: unknown) {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
}
