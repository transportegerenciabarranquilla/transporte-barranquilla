import { jsPDF } from "jspdf";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthenticatedSession } from "../../../../lib/authServer";
import { CONTRACTORS, contractorLabel, normalizeContractorName } from "../../../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../../lib/supabaseServer";
import type { Vehiculo } from "../../../../seguimiento/types";

type ExportFormat = "xlsx" | "pdf";
type ExportPeriod = "today" | "month" | "history";
type RouteRow = { contractor?: string; data?: Vehiculo };

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session?.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const params = new URL(request.url).searchParams;
    const period = normalizePeriod(params.get("period"));
    const format = normalizeFormat(params.get("format"));
    const contractor = contractorLabel(params.get("contractor"));
    if (!period || !format) return NextResponse.json({ error: "Formato o período no válido." }, { status: 400 });

    const records = (await readAllRoutes(session.accessToken))
      .filter((row): row is RouteRow & { data: Vehiculo } => Boolean(row.data))
      .map((row) => ({ ...row.data, transportista: contractorLabel(row.contractor || row.data.transportista) || row.data.transportista }))
      .filter((record) => !contractor || normalizeContractorName(record.transportista) === normalizeContractorName(contractor))
      .filter((record) => isInPeriod(record, period))
      .sort((a, b) => vehicleDate(b).localeCompare(vehicleDate(a)) || String(b.transporte).localeCompare(String(a.transporte)));

    const label = period === "today" ? "Lo que va del día" : period === "month" ? "Lo que va del mes" : "Histórico completo";
    const filename = buildFilename(period, contractor, format);
    if (format === "xlsx") {
      const bytes = buildWorkbook(records, label, contractor);
      return new Response(bytes, { headers: downloadHeaders(filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") });
    }
    return new Response(buildPdf(records, label, contractor), { headers: downloadHeaders(filename, "application/pdf") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error generando el informe de seguimiento." }, { status: 500 });
  }
}

async function readAllRoutes(accessToken: string) {
  const headers = supabaseAdminHeaders() || supabaseUserHeaders(accessToken);
  const groups = await Promise.all(CONTRACTORS.map(async (contractor) => {
    const records: RouteRow[] = [];
    for (let offset = 0; offset < 100_000; offset += 1_000) {
      const params = new URLSearchParams({ select: "contractor,data", contractor: `eq.${contractor}`, order: "updated_at.desc", limit: "1000", offset: String(offset) });
      const response = await fetch(supabaseRest("seguimiento_vehiculos", `?${params.toString()}`), { cache: "no-store", headers });
      if (!response.ok) throw new Error(await supabaseError(response));
      const page = (await response.json()) as RouteRow[];
      records.push(...page);
      if (page.length < 1_000) break;
    }
    return records;
  }));
  return groups.flat();
}

function buildWorkbook(records: Vehiculo[], label: string, contractor: string) {
  const values = records.map((record) => ({
    Fecha: vehicleDate(record), Contratista: record.transportista, DT: record.transporte, Vehículo: record.vehiculo, Viaje: record.viaje,
    Responsable: record.nombreResponsable || record.responsable, "Responsable CC": record.cedulaResponsable || "",
    "Auxiliar 1": record.nombreAuxiliar1 || "", "Auxiliar 1 CC": record.cedulaAuxiliar1 || "",
    "Auxiliar 2": record.nombreAuxiliar2 || "", "Auxiliar 2 CC": record.cedulaAuxiliar2 || "",
    Cajas: numberValue(record.cajas), HL: numberValue(record.hl), Clientes: numberValue(record.clientes), Visitados: numberValue(record.visitados),
    "Avance ruta": record.avanceRuta, Estado: record.status, "Hora salida": record.horaSalida, "Hora llegada": record.horaLlegada,
    "Tiempo ruta": record.tiempoRuta, "Tiempo planeado": record.tiempoPlaneado || "", "Causal salida tardía": record.causalSalidaTardia || "",
    "Comentario salida tardía": record.comentarioSalidaTardia || "", "Cajas rechazadas": numberValue(record.cajasRechazadas),
    "Cajas gestionadas": numberValue(record.cajasGestionadas), "Refusal final": numberValue(record.cajasRefusalFinal), "Refusal %": numberValue(record.refusal),
    Centro: record.centro, Territorio: record.territorio, Bloque: record.bloque,
  }));
  const workbook = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([
    ["Informe", "Seguimiento"], ["Período", label], ["Transportista", contractor || "Todos"], ["Registros", records.length], ["Fecha de descarga", new Date()],
  ], { cellDates: true });
  const sheet = XLSX.utils.json_to_sheet(values);
  sheet["!autofilter"] = { ref: sheet["!ref"] || "A1:AD1" };
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  sheet["!cols"] = Object.keys(values[0] || { Fecha: "" }).map((key) => ({ wch: Math.min(Math.max(key.length + 3, 13), 32) }));
  XLSX.utils.book_append_sheet(workbook, summary, "Resumen");
  XLSX.utils.book_append_sheet(workbook, sheet, "Seguimiento");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
}

const COLUMN_X = [30, 78, 159, 202, 253, 291, 405, 445, 492, 538, 581, 680, 732];

function buildPdf(records: Vehiculo[], label: string, contractor: string) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const drawHeader = () => {
    pdf.setFillColor(9, 21, 37); pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), 58, "F");
    pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.text("Informe de seguimiento", 36, 25);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.text(`${label} · ${contractor || "Todos los transportistas"} · ${records.length} registros`, 36, 43);
    pdf.setFillColor(15, 124, 88); pdf.rect(28, 68, pdf.internal.pageSize.getWidth() - 56, 20, "F"); pdf.setFont("helvetica", "bold"); pdf.setFontSize(7);
    ["Fecha", "Contratista", "DT", "Vehículo", "Viaje", "Responsable", "Cajas", "Clientes", "Visitados", "Avance", "Estado", "Salida", "Llegada"]
      .forEach((value, index) => pdf.text(value, COLUMN_X[index], 81));
  };
  drawHeader();
  let y = 102;
  records.forEach((record, index) => {
    if (y > 555) { pdf.addPage(); drawHeader(); y = 102; }
    if (index % 2 === 0) { pdf.setFillColor(244, 247, 251); pdf.rect(28, y - 10, pdf.internal.pageSize.getWidth() - 56, 18, "F"); }
    pdf.setTextColor(30, 41, 59); pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.5);
    const values = [vehicleDate(record), record.transportista, record.transporte, record.vehiculo, record.viaje, record.nombreResponsable || record.responsable,
      record.cajas, record.clientes, record.visitados, record.avanceRuta, record.status, record.horaSalida, record.horaLlegada];
    values.forEach((value, column) => pdf.text(String(value ?? "-").slice(0, column === 1 || column === 5 ? 24 : 15), COLUMN_X[column], y));
    y += 18;
  });
  if (!records.length) { pdf.setTextColor(100, 116, 139); pdf.setFontSize(11); pdf.text("No hay registros de seguimiento para este período.", 36, 115); }
  return pdf.output("arraybuffer");
}

function isInPeriod(record: Vehiculo, period: ExportPeriod) {
  if (period === "history") return true;
  const date = vehicleDate(record); const today = bogotaToday();
  return period === "today" ? date === today : date.slice(0, 7) === today.slice(0, 7);
}

function vehicleDate(record: Vehiculo) { return toDateKey(record.fechaDespacho || record.fechaDt || record.date || record.createdAt); }
function toDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (match) return `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}
function bogotaToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function numberValue(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function normalizePeriod(value: string | null): ExportPeriod | null { return value === "today" || value === "month" || value === "history" ? value : null; }
function normalizeFormat(value: string | null): ExportFormat | null { return value === "xlsx" || value === "pdf" ? value : null; }
function buildFilename(period: ExportPeriod, contractor: string, format: ExportFormat) {
  const periodSlug = period === "today" ? bogotaToday() : period === "month" ? bogotaToday().slice(0, 7) : "historico";
  const contractorSlug = contractor ? `-${normalizeContractorName(contractor).replace(/[^a-z0-9]+/g, "-")}` : "";
  return `seguimiento-${periodSlug}${contractorSlug}.${format}`;
}
function downloadHeaders(filename: string, contentType: string) {
  return { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="${filename}"`, "Content-Type": contentType };
}
