import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import type { AsistenciaRegistro } from "../../../../lib/asistenciaStorage";
import { getAuthenticatedSession } from "../../../../lib/authServer";
import { contractorLabel, normalizeContractorName } from "../../../../lib/contractors";
import type { PuntoCoronaRouteReport, PuntoCoronaRouteRow } from "../../../../lib/puntoCoronaRoutesStorage";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../../lib/supabaseServer";

const TABLE = "punto_corona_route_reports";
const SELECT = "report_id,contractor,operational_date,kind,data,updated_at";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ReportRow = {
  report_id: string;
  contractor: string;
  operational_date: string;
  kind: PuntoCoronaRouteReport["kind"];
  data?: PuntoCoronaRouteReport;
  updated_at: string;
};

type ExportReport = {
  contractor: string;
  operationalDate: string;
  kind: PuntoCoronaRouteReport["kind"];
  rows: PuntoCoronaRouteRow[];
  timestamp: number;
};

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session?.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const searchParams = new URL(request.url).searchParams;
    const contractor = searchParams.get("contractor")?.trim() || "";
    const from = validDate(searchParams.get("from"));
    const to = validDate(searchParams.get("to"));
    const dt = normalizeDt(searchParams.get("dt"));
    const range = normalizeRange(from, to);
    const params = new URLSearchParams({
      select: SELECT,
      order: "operational_date.desc,updated_at.desc",
      limit: "5000",
    });

    if (contractor) params.set("contractor", `eq.${contractor}`);
    if (range.from) params.set("operational_date", `gte.${range.from}`);
    if (range.to) params.append("operational_date", `lte.${range.to}`);

    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      cache: "no-store",
      headers: supabaseAdminHeaders() || supabaseUserHeaders(session.accessToken),
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });

    const sourceRows = (await response.json()) as ReportRow[];
    const reports = getPreferredReports(sourceRows);
    const attendanceIndex = await getAttendanceIndex(
      Array.from(new Set(reports.map((report) => report.contractor))),
      session.accessToken,
    );
    const downloadedAt = new Date();
    const exportRows = reports.flatMap((report) =>
      report.rows
        .filter((row) => row.status !== "NOT_STARTED" && row.withinRadius === false)
        .filter((row) => !dt || normalizeDt(row.dt || row.tourDisplayId).includes(dt))
        .map((row) => {
          const attendance = findAttendance(attendanceIndex, report, row);
          return {
            operationalDate: toExcelDate(report.operationalDate),
            downloadedAt,
            contractor: report.contractor,
            customerCode: String(row.pocExternalId || ""),
            customerName: String(row.pocName || "Sin nombre"),
            plate: String(row.truckLicensePlate || "Sin placa"),
            dt: String(row.dt || row.tourDisplayId || ""),
            routeResponsible: String(attendance?.nombreResponsable || row.driverName || "Sin identificar"),
            driver: String(attendance?.nombreAuxiliar1 || row.driverName || "Sin identificar"),
            assistant: String(attendance?.nombreAuxiliar2 || "Sin identificar"),
            reason: String(row.outOfRadiusReason || row.skippedReason || "Sin motivo registrado"),
            status: String(row.status || "Sin estado"),
          };
        }),
    );

    const workbook = buildWorkbook(exportRows);
    const workbookBytes = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
    const filename = buildFilename(range, contractor);

    return new Response(workbookBytes, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error generando historial de rango." }, { status: 500 });
  }
}

function getPreferredReports(rows: ReportRow[]) {
  const preferred = new Map<string, ExportReport>();

  rows.forEach((row) => {
    if (!row.data?.rows) return;
    const report: ExportReport = {
      contractor: contractorLabel(row.data.contractor || row.contractor) || row.contractor,
      operationalDate: row.data.operationalDate || row.operational_date,
      kind: row.data.kind || row.kind || "current",
      rows: row.data.rows,
      timestamp: getTimestamp(row),
    };
    const key = `${report.contractor}:${report.operationalDate}`;
    const current = preferred.get(key);
    if (!current || isPreferred(report, current)) preferred.set(key, report);
  });

  return Array.from(preferred.values()).sort(
    (a, b) => b.operationalDate.localeCompare(a.operationalDate) || a.contractor.localeCompare(b.contractor),
  );
}

function isPreferred(candidate: ExportReport, current: ExportReport) {
  if (candidate.kind === "closure" && current.kind !== "closure") return true;
  if (candidate.kind !== "closure" && current.kind === "closure") return false;
  return candidate.timestamp > current.timestamp;
}

function getTimestamp(row: ReportRow) {
  const value = row.data?.closedAt || row.data?.uploadedAt || row.updated_at;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildWorkbook(
  rows: Array<{
    operationalDate: Date | string;
    downloadedAt: Date;
    contractor: string;
    customerCode: string;
    customerName: string;
    plate: string;
    dt: string;
    routeResponsible: string;
    driver: string;
    assistant: string;
    reason: string;
    status: string;
  }>,
) {
  const headers = [
    "Fecha operativa",
    "Fecha de descarga",
    "Contratista",
    "Código cliente",
    "Nombre del cliente",
    "Placa del vehículo",
    "DT",
    "Responsable de ruta",
    "Conductor",
    "Auxiliar",
    "Motivo fuera de rango",
    "Estado",
  ];
  const values = rows.map((row) => [
    row.operationalDate,
    row.downloadedAt,
    row.contractor,
    row.customerCode,
    row.customerName,
    row.plate,
    row.dt,
    row.routeResponsible,
    row.driver,
    row.assistant,
    row.reason,
    row.status,
  ]);
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...values], { cellDates: true });
  const lastRow = Math.max(rows.length + 1, 1);

  worksheet["!autofilter"] = { ref: `A1:L${lastRow}` };
  worksheet["!cols"] = [
    { wch: 13 },
    { wch: 18 },
    { wch: 24 },
    { wch: 18 },
    { wch: 34 },
    { wch: 19 },
    { wch: 16 },
    { wch: 28 },
    { wch: 28 },
    { wch: 28 },
    { wch: 42 },
    { wch: 24 },
  ];

  for (let rowIndex = 2; rowIndex <= lastRow; rowIndex += 1) {
    const operationalDateCell = worksheet[`A${rowIndex}`];
    const downloadDateCell = worksheet[`B${rowIndex}`];
    if (operationalDateCell) operationalDateCell.z = "dd/mm/yyyy";
    if (downloadDateCell) downloadDateCell.z = "dd/mm/yyyy";
  }

  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Author: "Módulo Admin",
    Company: "Transporte Barranquilla",
    CreatedDate: new Date(),
    Subject: "Visitas fuera de rango",
    Title: "Historial de visitas fuera de rango",
  };
  XLSX.utils.book_append_sheet(workbook, worksheet, "Fuera de rango");
  return workbook;
}

function validDate(value: string | null) {
  return value && DATE_PATTERN.test(value) ? value : "";
}

function normalizeRange(from: string, to: string) {
  if (!from || !to || from <= to) return { from, to };
  return { from: to, to: from };
}

function normalizeDt(value: unknown) {
  return String(value || "")
    .replace(/^DT-?/i, "")
    .replace(/\D/g, "");
}

function toExcelDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return year && month && day ? new Date(year, month - 1, day) : value;
}

function buildFilename(range: { from: string; to: string }, contractor: string) {
  const period = range.from && range.to ? `${range.from}-a-${range.to}` : range.from || range.to || "historial-completo";
  const contractorSlug = contractor
    ? `-${contractor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
    : "";
  return `fuera-de-rango-${period}${contractorSlug}.xlsx`;
}

async function getAttendanceIndex(contractors: string[], accessToken: string) {
  const rows = (
    await Promise.all(
      contractors.map(async (contractor) => {
        const params = new URLSearchParams({
          select: "contractor,data",
          contractor: `eq.${contractor}`,
          order: "updated_at.desc",
          limit: "5000",
        });
        const response = await fetch(supabaseRest("asistencias_ruta", `?${params.toString()}`), {
          cache: "no-store",
          headers: supabaseAdminHeaders() || supabaseUserHeaders(accessToken),
        });
        if (!response.ok) throw new Error(await supabaseError(response));
        return (await response.json()) as Array<{ contractor?: string; data?: AsistenciaRegistro }>;
      }),
    )
  ).flat();
  const byDate = new Map<string, AsistenciaRegistro>();
  const latestByDt = new Map<string, AsistenciaRegistro>();

  rows.forEach((row) => {
    if (!row.data) return;
    const attendance = { ...row.data, contratista: contractorLabel(row.contractor || row.data.contratista) };
    const contractorKey = normalizeContractorName(attendance.contratista);
    const dtKey = normalizeDt(attendance.dt);
    if (!contractorKey || !dtKey) return;

    const date = toDateKey(attendance.createdAt);
    const datedKey = date ? `${contractorKey}:${dtKey}:${date}` : "";
    const currentForDate = datedKey ? byDate.get(datedKey) : undefined;
    if (datedKey && (!currentForDate || isNewerAttendance(attendance, currentForDate))) byDate.set(datedKey, attendance);

    const routeKey = `${contractorKey}:${dtKey}`;
    const current = latestByDt.get(routeKey);
    if (!current || isNewerAttendance(attendance, current)) latestByDt.set(routeKey, attendance);
  });

  return { byDate, latestByDt };
}

function findAttendance(
  index: Awaited<ReturnType<typeof getAttendanceIndex>>,
  report: ExportReport,
  row: PuntoCoronaRouteRow,
) {
  const contractorKey = normalizeContractorName(report.contractor);
  const dtKey = normalizeDt(row.dt || row.tourDisplayId);
  return (
    index.byDate.get(`${contractorKey}:${dtKey}:${report.operationalDate}`) ||
    index.latestByDt.get(`${contractorKey}:${dtKey}`)
  );
}

function isNewerAttendance(candidate: AsistenciaRegistro, current: AsistenciaRegistro) {
  return new Date(candidate.createdAt).getTime() > new Date(current.createdAt).getTime();
}

function toDateKey(value: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}
