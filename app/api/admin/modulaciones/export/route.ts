import { jsPDF } from "jspdf";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthenticatedSession } from "../../../../lib/authServer";
import { contractorLabel, normalizeContractorName } from "../../../../lib/contractors";
import type { ModulacionRegistro } from "../../../../lib/modulacionStorage";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../../lib/supabaseServer";

const TABLE = "modulaciones_ruta";
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;
const SELECT =
  "contractor,id:data->>id,contratista:data->>contratista,dt:data->>dt,fechaDespacho:data->>fechaDespacho,fechaDt:data->>fechaDt,codigoCliente:data->>codigoCliente,nombreCliente:data->>nombreCliente,telefonoCliente:data->>telefonoCliente,com:data->>com,jefeComercial:data->>jefeComercial,telefonoJefeComercial:data->>telefonoJefeComercial,preventista:data->>preventista,preventistaNombre:data->>preventistaNombre,telefonoPreventista:data->>telefonoPreventista,totalCajas:data->>totalCajas,cajasGestionadas:data->>cajasGestionadas,persona:data->>persona,personaNombre:data->>personaNombre,causal:data->>causal,comentario:data->>comentario,comentarioModulador:data->>comentarioModulador,imagenNombre:data->>imagenNombre,createdAt:data->>createdAt,updated_at";

type ExportFormat = "xlsx" | "pdf";
type ExportPeriod = "today" | "month" | "history";
type ModulacionListRow = Partial<Record<keyof ModulacionRegistro, unknown>> & {
  contractor?: string;
  updated_at?: string;
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

    const records = (await readAllModulaciones(session.accessToken))
      .map(fromListRow)
      .filter((record) => !contractor || normalizeContractorName(record.contratista) === normalizeContractorName(contractor))
      .filter((record) => isInPeriod(record, period))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const rangeLabel = getPeriodLabel(period);
    const filename = buildFilename(period, contractor, format);
    if (format === "xlsx") {
      return new Response(buildWorkbook(records, rangeLabel), {
        headers: downloadHeaders(filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      });
    }

    return new Response(buildPdf(records, rangeLabel, contractor), {
      headers: downloadHeaders(filename, "application/pdf"),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error generando el informe de modulaciones." }, { status: 500 });
  }
}

async function readAllModulaciones(accessToken: string) {
  const rows: ModulacionListRow[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      select: SELECT,
      order: "updated_at.desc",
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      cache: "no-store",
      headers: supabaseAdminHeaders() || supabaseUserHeaders(accessToken),
    });
    if (!response.ok) throw new Error(await supabaseError(response));

    const pageRows = (await response.json()) as ModulacionListRow[];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
  }

  return rows;
}

function buildWorkbook(records: ModulacionRegistro[], rangeLabel: string) {
  const headers = [
    "Fecha de despacho", "Fecha de registro", "Contratista", "DT", "Código cliente", "Nombre cliente", "Teléfono cliente",
    "Cajas rechazadas", "Cajas gestionadas", "Causal", "Modulador", "Código modulador", "COM", "Jefe comercial",
    "Teléfono jefe comercial", "Preventista", "Nombre preventista", "Teléfono preventista", "Comentario",
    "Comentario modulador", "Evidencia",
  ];
  const values = records.map((record) => [
    toExcelDate(getRecordDate(record)),
    toExcelDateTime(record.createdAt),
    contractorLabel(record.contratista),
    record.dt,
    record.codigoCliente,
    record.nombreCliente || "",
    record.telefonoCliente || "",
    readNumber(record.totalCajas),
    readNumber(record.cajasGestionadas),
    record.causal,
    record.personaNombre || record.persona,
    record.persona,
    record.com || "",
    record.jefeComercial || "",
    record.telefonoJefeComercial || "",
    record.preventista || "",
    record.preventistaNombre || "",
    record.telefonoPreventista || "",
    record.comentario || "",
    record.comentarioModulador || "",
    record.imagenNombre || "",
  ]);
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...values], { cellDates: true });
  const lastRow = Math.max(records.length + 1, 1);
  worksheet["!autofilter"] = { ref: `A1:U${lastRow}` };
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  worksheet["!cols"] = [
    { wch: 16 }, { wch: 19 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 18 },
    { wch: 17 }, { wch: 17 }, { wch: 28 }, { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 25 },
    { wch: 22 }, { wch: 18 }, { wch: 25 }, { wch: 22 }, { wch: 42 }, { wch: 42 }, { wch: 25 },
  ];
  for (let row = 2; row <= lastRow; row += 1) {
    if (worksheet[`A${row}`]) worksheet[`A${row}`].z = "dd/mm/yyyy";
    if (worksheet[`B${row}`]) worksheet[`B${row}`].z = "dd/mm/yyyy hh:mm";
  }

  const summary = XLSX.utils.aoa_to_sheet([
    ["Informe", "Modulaciones"],
    ["Período", rangeLabel],
    ["Fecha de descarga", new Date()],
    ["Cantidad de registros", records.length],
    ["Cajas rechazadas", records.reduce((sum, record) => sum + readNumber(record.totalCajas), 0)],
    ["Cajas gestionadas", records.reduce((sum, record) => sum + readNumber(record.cajasGestionadas), 0)],
  ], { cellDates: true });
  summary["!cols"] = [{ wch: 24 }, { wch: 30 }];
  if (summary.B3) summary.B3.z = "dd/mm/yyyy hh:mm";

  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Author: "Módulo Admin",
    Company: "Transporte Barranquilla",
    CreatedDate: new Date(),
    Subject: rangeLabel,
    Title: "Informe de modulaciones",
  };
  XLSX.utils.book_append_sheet(workbook, summary, "Resumen");
  XLSX.utils.book_append_sheet(workbook, worksheet, "Modulaciones");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
}

function buildPdf(records: ModulacionRegistro[], rangeLabel: string, contractor: string) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const columns = [
    { label: "Fecha", width: 22 },
    { label: "Contratista", width: 31 },
    { label: "DT", width: 20 },
    { label: "Cliente", width: 45 },
    { label: "Rech.", width: 14 },
    { label: "Gest.", width: 14 },
    { label: "Causal", width: 43 },
    { label: "Modulador", width: 39 },
    { label: "Comentario", width: 49 },
  ];
  const rowHeight = 13;
  let y = 42;

  const drawHeader = () => {
    pdf.setFillColor(9, 21, 37);
    pdf.rect(0, 0, pageWidth, 29, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("Informe de modulaciones", margin, 12);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(`${rangeLabel}${contractor ? ` · ${contractor}` : " · Todos los transportistas"}`, margin, 20);
    pdf.text(`Generado: ${formatDateTime(new Date().toISOString())} · ${records.length} registros`, margin, 25);

    pdf.setFillColor(15, 124, 88);
    pdf.rect(margin, 33, pageWidth - margin * 2, 8, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    let x = margin + 1.5;
    columns.forEach((column) => {
      pdf.text(column.label, x, 38.2);
      x += column.width;
    });
    y = 42;
  };

  drawHeader();
  records.forEach((record, index) => {
    if (y + rowHeight > pageHeight - 12) {
      addPageFooter(pdf);
      pdf.addPage();
      drawHeader();
    }

    if (index % 2 === 0) {
      pdf.setFillColor(244, 247, 251);
      pdf.rect(margin, y - 1, pageWidth - margin * 2, rowHeight, "F");
    }
    const values = [
      formatDate(getRegistrationDate(record)),
      contractorLabel(record.contratista),
      record.dt,
      `${record.codigoCliente} ${record.nombreCliente || ""}`.trim(),
      String(readNumber(record.totalCajas)),
      String(readNumber(record.cajasGestionadas)),
      record.causal,
      record.personaNombre || record.persona,
      record.comentarioModulador || record.comentario || "",
    ];
    pdf.setTextColor(30, 41, 59);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    let x = margin + 1.5;
    values.forEach((value, columnIndex) => {
      const column = columns[columnIndex];
      const lines = pdf.splitTextToSize(String(value || "-"), column.width - 3).slice(0, 3);
      pdf.text(lines, x, y + 3);
      x += column.width;
    });
    y += rowHeight;
  });

  if (!records.length) {
    pdf.setTextColor(100, 116, 139);
    pdf.setFontSize(11);
    pdf.text("No hay modulaciones registradas para este período.", margin, 55);
  }
  addPageFooter(pdf);
  return pdf.output("arraybuffer");
}

function addPageFooter(pdf: jsPDF) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(7);
  pdf.text(`Página ${pdf.getNumberOfPages()}`, pageWidth - 10, pageHeight - 5, { align: "right" });
}

function fromListRow(row: ModulacionListRow): ModulacionRegistro {
  return {
    id: readString(row.id),
    contratista: contractorLabel(readString(row.contractor) || readString(row.contratista)),
    dt: readString(row.dt),
    fechaDespacho: readString(row.fechaDespacho),
    fechaDt: readString(row.fechaDt),
    codigoCliente: readString(row.codigoCliente),
    nombreCliente: readString(row.nombreCliente),
    telefonoCliente: readString(row.telefonoCliente),
    com: readString(row.com),
    jefeComercial: readString(row.jefeComercial),
    telefonoJefeComercial: readString(row.telefonoJefeComercial),
    preventista: readString(row.preventista),
    preventistaNombre: readString(row.preventistaNombre),
    telefonoPreventista: readString(row.telefonoPreventista),
    totalCajas: readString(row.totalCajas),
    cajasGestionadas: readString(row.cajasGestionadas),
    persona: readString(row.persona),
    personaNombre: readString(row.personaNombre),
    causal: readString(row.causal),
    comentario: readString(row.comentario),
    comentarioModulador: readString(row.comentarioModulador),
    imagenNombre: readString(row.imagenNombre),
    imagenVista: "",
    createdAt: readString(row.createdAt) || readString(row.updated_at),
  };
}

function isInPeriod(record: ModulacionRegistro, period: ExportPeriod) {
  if (period === "history") return true;
  const recordDate = getRegistrationDate(record);
  const today = getBogotaDateKey();
  if (period === "today") return recordDate === today;
  return recordDate >= `${today.slice(0, 7)}-01` && recordDate <= today;
}

function getRecordDate(record: ModulacionRegistro) {
  return toDateKey(record.fechaDespacho || record.fechaDt || record.createdAt);
}

function getRegistrationDate(record: ModulacionRegistro) {
  return toBogotaDateKey(record.createdAt) || getRecordDate(record);
}

function getBogotaDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Bogota",
    year: "numeric",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function toDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(value)) {
    const [day, month, year] = value.slice(0, 10).split("/");
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function toBogotaDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return toDateKey(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Bogota",
    year: "numeric",
  }).formatToParts(parsed);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function toExcelDate(value: string) {
  if (!value) return "";
  const dateKey = toDateKey(value);
  if (!dateKey) return value;
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toExcelDateTime(value: string) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed;
}

function formatDate(value: string) {
  const key = toDateKey(value);
  if (!key) return "-";
  const [year, month, day] = key.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" }).format(parsed);
}

function readNumber(value: unknown) {
  const clean = String(value ?? "").trim().replace(/\s/g, "");
  const normalized = clean.includes(",") && clean.includes(".")
    ? clean.replace(/\./g, "").replace(",", ".")
    : /^-?\d{1,3}(\.\d{3})+$/.test(clean)
      ? clean.replace(/\./g, "")
      : clean.replace(",", ".");
  const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function readString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePeriod(value: string | null): ExportPeriod | "" {
  return value === "today" || value === "month" || value === "history" ? value : "";
}

function normalizeFormat(value: string | null): ExportFormat | "" {
  return value === "xlsx" || value === "pdf" ? value : "";
}

function getPeriodLabel(period: ExportPeriod) {
  const today = getBogotaDateKey();
  if (period === "today") return `Día ${formatDate(today)}`;
  if (period === "month") return `Mes en curso: 01/${today.slice(5, 7)}/${today.slice(0, 4)} al ${formatDate(today)}`;
  return "Histórico completo";
}

function buildFilename(period: ExportPeriod, contractor: string, format: ExportFormat) {
  const periodSlug = period === "today" ? getBogotaDateKey() : period === "month" ? getBogotaDateKey().slice(0, 7) : "historico";
  const contractorSlug = contractor
    ? `-${contractor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
    : "";
  return `modulaciones-${periodSlug}${contractorSlug}.${format}`;
}

function downloadHeaders(filename: string, contentType: string) {
  return {
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Type": contentType,
  };
}
