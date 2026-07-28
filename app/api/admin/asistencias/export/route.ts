import { jsPDF } from "jspdf";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import type { AsistenciaRegistro } from "../../../../lib/asistenciaStorage";
import { getAuthenticatedSession } from "../../../../lib/authServer";
import { contractorLabel, normalizeContractorName } from "../../../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../../lib/supabaseServer";

type ExportFormat = "xlsx" | "pdf";
type ExportPeriod = "today" | "month" | "history";
type AttendanceRow = { contractor?: string; data?: AsistenciaRegistro; updated_at?: string };
type SeguimientoRow = {
  contractor?: string;
  transporte?: string;
  vehiculo?: string;
  viaje?: string;
  fechaDespacho?: string;
  fechaDt?: string;
};

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session?.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const searchParams = new URL(request.url).searchParams;
    const period = normalizePeriod(searchParams.get("period"));
    const format = normalizeFormat(searchParams.get("format"));
    const contractor = contractorLabel(searchParams.get("contractor"));
    if (!period || !format) return NextResponse.json({ error: "Formato o período no válido." }, { status: 400 });

    const records = (await readAllAttendances(session.accessToken))
      .map((row) => ({ ...row.data!, contratista: contractorLabel(row.contractor || row.data?.contratista) }))
      .filter((record) => !contractor || normalizeContractorName(record.contratista) === normalizeContractorName(contractor))
      .filter((record) => isInPeriod(record, period))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const routeRows = await readAllRoutes(session.accessToken);
    const routesByAttendance = new Map<string, SeguimientoRow>();
    routeRows.forEach((route) => {
      const key = attendanceRouteKey(route.contractor, route.transporte, route.fechaDespacho || route.fechaDt);
      if (key && !routesByAttendance.has(key)) routesByAttendance.set(key, route);
    });
    const enrichedRecords = records.map((record) => ({
      ...record,
      route: routesByAttendance.get(attendanceRouteKey(record.contratista, record.dt, attendanceDate(record))),
    }));
    const label = period === "today" ? "Lo que va del día" : period === "month" ? "Lo que va del mes" : "Histórico completo";
    const filename = `asistencia-${period}-${contractor || "todos"}.${format}`.replace(/\s+/g, "-").toLowerCase();

    if (format === "xlsx") {
      const values = enrichedRecords.map((record) => ({
        Fecha: attendanceDate(record),
        Contratista: record.contratista,
        DT: record.dt,
        "Placa VH": record.route?.vehiculo || "",
        Viaje: record.route?.viaje || "",
        "Responsable CC": record.cedulaResponsable,
        Responsable: record.nombreResponsable || "",
        "Auxiliar 1 CC": record.cedulaAuxiliar1,
        "Auxiliar 1": record.nombreAuxiliar1 || "",
        "Auxiliar 2 CC": record.cedulaAuxiliar2,
        "Auxiliar 2": record.nombreAuxiliar2 || "",
        Llave: record.llave,
      }));
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(values);
      XLSX.utils.book_append_sheet(workbook, sheet, "Asistencia");
      const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
      return new Response(bytes, { headers: downloadHeaders(filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") });
    }

    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    pdf.setFontSize(16);
    pdf.text(`Asistencia · ${label}`, 36, 36);
    pdf.setFontSize(8);
    let y = 58;
    enrichedRecords.forEach((record, index) => {
      if (y > 555) {
        pdf.addPage();
        y = 36;
      }
      pdf.text(`${index + 1}. ${attendanceDate(record)} | ${record.contratista} | DT ${record.dt} | VH ${record.route?.vehiculo || "Sin placa"} | ${formatTrip(record.route?.viaje)} | ${record.nombreResponsable || record.cedulaResponsable || "Sin responsable"} | ${record.nombreAuxiliar1 || record.cedulaAuxiliar1 || "Sin auxiliar 1"} | ${record.nombreAuxiliar2 || record.cedulaAuxiliar2 || "Sin auxiliar 2"}`, 36, y, { maxWidth: 760 });
      y += 14;
    });
    return new Response(pdf.output("arraybuffer"), { headers: downloadHeaders(filename, "application/pdf") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error generando el informe de asistencia." }, { status: 500 });
  }
}

async function readAllAttendances(accessToken: string) {
  const rows: AttendanceRow[] = [];
  for (let offset = 0; offset < 100_000; offset += 1_000) {
    const params = new URLSearchParams({ select: "contractor,data,updated_at", order: "updated_at.desc", limit: "1000", offset: String(offset) });
    const response = await fetch(supabaseRest("asistencias_ruta", `?${params.toString()}`), {
      cache: "no-store",
      headers: supabaseAdminHeaders() || supabaseUserHeaders(accessToken),
    });
    if (!response.ok) throw new Error(await supabaseError(response));
    const page = (await response.json()) as AttendanceRow[];
    rows.push(...page.filter((row) => row.data));
    if (page.length < 1_000) break;
  }
  return rows;
}

async function readAllRoutes(accessToken: string) {
  const rows: SeguimientoRow[] = [];
  for (let offset = 0; offset < 100_000; offset += 1_000) {
    const params = new URLSearchParams({
      select: "contractor,transporte:data->>transporte,vehiculo:data->>vehiculo,viaje:data->>viaje,fechaDespacho:data->>fechaDespacho,fechaDt:data->>fechaDt",
      order: "updated_at.desc",
      limit: "1000",
      offset: String(offset),
    });
    const response = await fetch(supabaseRest("seguimiento_vehiculos", `?${params.toString()}`), {
      cache: "no-store",
      headers: supabaseAdminHeaders() || supabaseUserHeaders(accessToken),
    });
    if (!response.ok) throw new Error(await supabaseError(response));
    const page = (await response.json()) as SeguimientoRow[];
    rows.push(...page);
    if (page.length < 1_000) break;
  }
  return rows;
}

function isInPeriod(record: AsistenciaRegistro, period: ExportPeriod) {
  if (period === "history") return true;
  const date = attendanceDate(record);
  const today = bogotaToday();
  return period === "today" ? date === today : date.slice(0, 7) === today.slice(0, 7);
}

function attendanceDate(record: Pick<AsistenciaRegistro, "createdAt" | "llave">) {
  return String(record.llave || "").match(/\d{4}-\d{2}-\d{2}/)?.[0] || record.createdAt.slice(0, 10);
}

function attendanceRouteKey(contractor: string | undefined, dt: string | undefined, date: string | undefined) {
  const normalizedContractor = normalizeContractorName(contractorLabel(contractor));
  const normalizedDt = String(dt || "").replace(/^DT-?/i, "").replace(/\D/g, "");
  const normalizedDate = String(date || "").slice(0, 10);
  return normalizedContractor && normalizedDt && normalizedDate ? `${normalizedContractor}:${normalizedDt}:${normalizedDate}` : "";
}

function formatTrip(value: string | undefined) {
  const trip = String(value || "").trim();
  return trip ? `Viaje ${trip.replace(/^viaje\s*/i, "")}` : "Viaje sin identificar";
}

function bogotaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function normalizePeriod(value: string | null): ExportPeriod | null {
  return value === "today" || value === "month" || value === "history" ? value : null;
}

function normalizeFormat(value: string | null): ExportFormat | null {
  return value === "xlsx" || value === "pdf" ? value : null;
}

function downloadHeaders(filename: string, contentType: string) {
  return { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="${filename}"`, "Content-Type": contentType };
}
