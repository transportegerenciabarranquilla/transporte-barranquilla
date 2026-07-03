import type { PuntoCoronaCrewSummary, PuntoCoronaRouteReport, PuntoCoronaRouteRow } from "../lib/puntoCoronaRoutesStorage";
import { getDispatchDateKey, normalizeDt, type ModulacionRegistro } from "../lib/modulacionStorage";

type PdfTone = [number, number, number];

const NAVY: PdfTone = [16, 34, 61];
const SLATE: PdfTone = [71, 85, 105];
const BORDER: PdfTone = [203, 213, 225];
const LIGHT: PdfTone = [241, 245, 249];
const GREEN: PdfTone = [4, 120, 87];
const RED: PdfTone = [185, 28, 28];
const NOT_STARTED = "NOT_STARTED";
const RETURNED = "DEFINITELY_RETURNED";
const WAITING_MODULATION = "WAITING_MODULATION";
const PARTIAL_DELIVERY = "PARTIAL_DELIVERY";

export async function downloadPuntoCoronaPdf(report: PuntoCoronaRouteReport, modulaciones: ModulacionRegistro[] = []) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const margin = 14;
  const contentWidth = 269;
  const pageBottom = 195;
  let y = 12;

  const addPage = () => {
    pdf.addPage();
    pdf.setFillColor(...GREEN);
    pdf.rect(0, 0, 297, 3, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...SLATE);
    pdf.text(`${report.contractor || "Rango"} - Entrega en rango`, margin, 11);
    y = 17;
  };
  const ensureSpace = (height: number) => {
    if (y + height > pageBottom) addPage();
  };
  const sectionTitle = (title: string) => {
    ensureSpace(14);
    pdf.setFillColor(...NAVY);
    pdf.roundedRect(margin, y, contentWidth, 9, 2, 2, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(255, 255, 255);
    pdf.text(title.toUpperCase(), margin + 4, y + 6);
    y += 13;
  };

  pdf.setFillColor(...GREEN);
  pdf.rect(0, 0, 297, 4, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...GREEN);
  pdf.setFontSize(9);
  pdf.text("PUNTO CORONA", margin, 16);
  pdf.setTextColor(...NAVY);
  pdf.setFontSize(20);
  pdf.text("Reporte de entrega en rango", margin, 25);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...SLATE);
  pdf.text(`Fecha operativa: ${formatDate(report.operationalDate)}  -  Archivo: ${report.fileName}`, margin, 31);
  pdf.text(`Estado: ${getReportStatusLabel(report)}  -  Generado: ${formatDateTime(new Date().toISOString())}`, margin, 36);
  y = 46;

  sectionTitle("Indicadores principales");
  const modulationStats = getReportModulationStats(report, modulaciones);
  drawMetricCards(pdf, margin, y, contentWidth, [
    ["Entrega en rango", `${report.summary.deliveryRangePercent.toFixed(2)}%`, GREEN],
    ["Modulacion real", `${modulationStats.percent.toFixed(2)}%`, NAVY],
    ["Moduladas", String(modulationStats.modulated), NAVY],
    ["Pendientes", String(modulationStats.rejected), RED],
  ]);
  y += 24;

  sectionTitle("Cruce y avance");
  drawMetricCards(pdf, margin, y, contentWidth, [
    ["DT seguimiento", String(report.summary.seguimientoDts), NAVY],
    ["DT archivo", String(report.summary.csvDts), NAVY],
    ["Sin validacion", String(Math.max(report.summary.startedRows - report.summary.inRange - report.summary.outOfRange, 0)), SLATE],
  ]);
  y += 24;

  drawProgress(pdf, margin, y, contentWidth, "Entrega en rango", report.summary.deliveryRangePercent, GREEN);
  y += 12;
  drawProgress(pdf, margin, y, contentWidth, "Modulacion real", modulationStats.percent, NAVY);
  y += 16;

  sectionTitle("Detalle por tripulacion");
  drawCrewTable(pdf, report, modulaciones, {
    addPage,
    contentWidth,
    getY: () => y,
    margin,
    pageBottom,
    setY: (nextY) => {
      y = nextY;
    },
  });

  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(...BORDER);
    pdf.line(margin, 200, 283, 200);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...SLATE);
    pdf.text(`${report.contractor || "Rango"} - ${getReportStatusLabel(report)}`, margin, 205);
    pdf.text(`Pagina ${page} de ${totalPages}`, 283, 205, { align: "right" });
  }

  pdf.save(`rango-${normalizeFileName(report.contractor || "contratista")}-${report.operationalDate}-${report.kind}.pdf`);
}

function normalizeFileName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function drawMetricCards(
  pdf: InstanceType<typeof import("jspdf").jsPDF>,
  margin: number,
  y: number,
  contentWidth: number,
  items: Array<[string, string, PdfTone]>,
) {
  const gap = 3;
  const cardWidth = (contentWidth - gap * (items.length - 1)) / items.length;

  items.forEach(([label, value, tone], index) => {
    const x = margin + index * (cardWidth + gap);
    pdf.setFillColor(...LIGHT);
    pdf.setDrawColor(...BORDER);
    pdf.roundedRect(x, y, cardWidth, 18, 2, 2, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.5);
    pdf.setTextColor(...SLATE);
    pdf.text(label.toUpperCase(), x + 3, y + 6, { maxWidth: cardWidth - 6 });
    pdf.setFontSize(13);
    pdf.setTextColor(...tone);
    pdf.text(value, x + 3, y + 14);
  });
}

function drawProgress(
  pdf: InstanceType<typeof import("jspdf").jsPDF>,
  x: number,
  y: number,
  width: number,
  label: string,
  value: number,
  color: PdfTone,
) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(...NAVY);
  pdf.text(label, x, y);
  pdf.text(`${value.toFixed(2)}%`, x + width, y, { align: "right" });
  pdf.setFillColor(226, 232, 240);
  pdf.roundedRect(x, y + 3, width, 4, 1.5, 1.5, "F");
  pdf.setFillColor(...color);
  pdf.roundedRect(x, y + 3, Math.min(width, (width * value) / 100), 4, 1.5, 1.5, "F");
}

function drawCrewTable(
  pdf: InstanceType<typeof import("jspdf").jsPDF>,
  report: PuntoCoronaRouteReport,
  modulaciones: ModulacionRegistro[],
  layout: {
    addPage: () => void;
    contentWidth: number;
    getY: () => number;
    margin: number;
    pageBottom: number;
    setY: (value: number) => void;
  },
) {
  const crews = report.summary.crews;
  const headers = ["Placa", "Tripulacion", "Inic. arch.", "En rango", "Fuera rango", "% entrega", "Mod.", "Causales", "% mod.", "Avance seg."];
  const widths = [26, 50, 20, 20, 20, 24, 18, 45, 22, 44];

  const drawHeader = () => {
    let x = layout.margin;
    let y = layout.getY();
    pdf.setFillColor(226, 232, 240);
    pdf.setDrawColor(...BORDER);
    headers.forEach((header, index) => {
      pdf.rect(x, y, widths[index], 8, "FD");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6.3);
      pdf.setTextColor(...NAVY);
      pdf.text(header.toUpperCase(), x + 2, y + 5.2, { maxWidth: widths[index] - 4 });
      x += widths[index];
    });
    layout.setY(y + 8);
  };

  drawHeader();

  if (!crews.length) {
    const y = layout.getY();
    pdf.setDrawColor(...BORDER);
    pdf.rect(layout.margin, y, layout.contentWidth, 12);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...SLATE);
    pdf.text("Sin tripulaciones para mostrar.", layout.margin + 3, y + 7.5);
    layout.setY(y + 16);
    return;
  }

  crews.forEach((crew, rowIndex) => {
    const modulationStats = getCrewModulationStats(report, crew, modulaciones);
    const row = [
      crew.truckLicensePlate,
      crew.driverName,
      crew.totalStarted,
      crew.inRange,
      crew.outOfRange,
      `${crew.deliveryRangePercent.toFixed(2)}%`,
      modulationStats.modulated,
      formatCauseCounts(modulationStats.causes),
      `${modulationStats.percent.toFixed(2)}%`,
      formatCrewSeguimientoProgress(crew),
    ];
    const y = layout.getY();
    const rowHeight = 9;

    if (y + rowHeight > layout.pageBottom) {
      layout.addPage();
      drawHeader();
    }

    const nextY = layout.getY();
    if (rowIndex % 2) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(layout.margin, nextY, layout.contentWidth, rowHeight, "F");
    }

    let x = layout.margin;
    row.forEach((cell, index) => {
      pdf.setDrawColor(226, 232, 240);
      pdf.rect(x, nextY, widths[index], rowHeight);
      pdf.setFont("helvetica", index === 0 ? "bold" : "normal");
      pdf.setFontSize(6.8);
      pdf.setTextColor(index === 5 ? RED[0] : index === 4 ? GREEN[0] : NAVY[0], index === 5 ? RED[1] : index === 4 ? GREEN[1] : NAVY[1], index === 5 ? RED[2] : index === 4 ? GREEN[2] : NAVY[2]);
      pdf.text(String(cell), x + 2, nextY + 5.5, { maxWidth: widths[index] - 4 });
      x += widths[index];
    });
    layout.setY(nextY + rowHeight);
  });
}

function formatCrewSeguimientoProgress(crew: PuntoCoronaCrewSummary) {
  const visitados = Number(crew.seguimientoVisitados || 0);
  const clientes = Number(crew.seguimientoClientes || 0);
  const progress = Number(crew.seguimientoProgress || 0);

  if (!clientes) return "Sin dato";
  return `${visitados}/${clientes} ${progress.toFixed(1)}%`;
}

function getReportModulationStats(report: PuntoCoronaRouteReport, modulaciones: ModulacionRegistro[]) {
  return getModulationStats(report.rows, getReportModulationKeys(report, modulaciones));
}

function getCrewModulationStats(report: PuntoCoronaRouteReport, crew: PuntoCoronaCrewSummary, modulaciones: ModulacionRegistro[]) {
  return getModulationStats(
    report.rows.filter(
      (row) =>
        row.dt === crew.dt &&
        row.driverName === crew.driverName &&
        row.truckLicensePlate === crew.truckLicensePlate,
    ),
    getReportModulationKeys(report, modulaciones),
  );
}

function getModulationStats(rows: PuntoCoronaRouteRow[], modulationKeys: Set<string>) {
  const startedRows = rows.filter((row) => row.status !== NOT_STARTED);
  const rejectedCandidateRows = startedRows.filter((row) => isRejectedForModulation(row.status));
  const modulated = new Set(rejectedCandidateRows.map(getRouteModulationKey).filter((key) => key && modulationKeys.has(key))).size;
  const rejectedRows = rejectedCandidateRows.filter((row) => !modulationKeys.has(getRouteModulationKey(row)));
  const rejected = rejectedRows.length;
  const open = startedRows.length - modulated - rejected;

  return {
    modulated,
    rejected,
    causes: getCauseCounts(rejectedRows),
    open,
    percent: getRealModulationPercent(modulated, rejected),
  };
}

function isRejectedForModulation(status: string) {
  return status === RETURNED || status === WAITING_MODULATION || status === PARTIAL_DELIVERY;
}

function getCauseCounts(rows: PuntoCoronaRouteRow[]) {
  const counts = new Map<string, number>();

  rows.forEach((row) => {
    const label = getPendingCauseLabel(row);
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function getPendingCauseLabel(row: PuntoCoronaRouteRow) {
  if (row.status === WAITING_MODULATION) return "Esperando mod.";
  if (row.status === PARTIAL_DELIVERY) return "Visita parcial";

  const causal = (row.skippedReason || row.outOfRadiusReason || "").trim();
  return causal || "Devuelta";
}

function formatCauseCounts(causes: Array<{ label: string; value: number }>) {
  return causes.length ? causes.map((cause) => `${cause.label}: ${cause.value}`).join(" / ") : "-";
}

function getReportModulationKeys(report: PuntoCoronaRouteReport, modulaciones: ModulacionRegistro[]) {
  const routeKeys = new Set(report.rows.map(getRouteModulationKey).filter(Boolean));
  const keys = new Set<string>();

  modulaciones.forEach((record) => {
    if (record.contratista && report.contractor && record.contratista !== report.contractor) return;
    if (getDispatchDateKey(record) !== report.operationalDate) return;

    const key = getRecordModulationKey(record);
    if (key && routeKeys.has(key)) keys.add(key);
  });

  return keys;
}

function getRouteModulationKey(row: Pick<PuntoCoronaRouteRow, "dt" | "pocExternalId">) {
  const dt = normalizeDt(row.dt);
  const cliente = normalizeClienteCode(row.pocExternalId);
  return dt && cliente ? `${dt}:${cliente}` : "";
}

function getRecordModulationKey(record: Pick<ModulacionRegistro, "dt" | "codigoCliente">) {
  const dt = normalizeDt(record.dt);
  const cliente = normalizeClienteCode(record.codigoCliente);
  return dt && cliente ? `${dt}:${cliente}` : "";
}

function normalizeClienteCode(value: string | number | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function getRealModulationPercent(modulated: number, rejected: number) {
  const totalWithResult = modulated + rejected;
  return totalWithResult ? Number(((modulated / totalWithResult) * 100).toFixed(2)) : 0;
}

function getReportStatusLabel(report: PuntoCoronaRouteReport) {
  return report.kind === "closure" ? "CIERRE GUARDADO" : "ARCHIVO ACTUAL - SIN CIERRE";
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("es-CO", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
