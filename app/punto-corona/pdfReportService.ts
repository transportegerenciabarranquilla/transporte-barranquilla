import type { PuntoCoronaCrewSummary, PuntoCoronaRouteReport } from "../lib/puntoCoronaRoutesStorage";

type PdfTone = [number, number, number];

const NAVY: PdfTone = [16, 34, 61];
const SLATE: PdfTone = [71, 85, 105];
const BORDER: PdfTone = [203, 213, 225];
const LIGHT: PdfTone = [241, 245, 249];
const GREEN: PdfTone = [4, 120, 87];
const RED: PdfTone = [185, 28, 28];
const AMBER: PdfTone = [180, 83, 9];

export async function downloadPuntoCoronaPdf(report: PuntoCoronaRouteReport) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 14;
  const contentWidth = 182;
  const pageBottom = 282;
  let y = 12;

  const addPage = () => {
    pdf.addPage();
    pdf.setFillColor(...GREEN);
    pdf.rect(0, 0, 210, 3, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...SLATE);
    pdf.text("Punto Corona - Entrega en rango y modulacion", margin, 11);
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
  pdf.rect(0, 0, 210, 4, "F");
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
  drawMetricCards(pdf, margin, y, contentWidth, [
    ["Entrega en rango", `${report.summary.deliveryRangePercent.toFixed(2)}%`, GREEN],
    ["Modulacion", `${report.summary.modulationPercent.toFixed(2)}%`, NAVY],
    ["Fuera de rango", String(report.summary.outOfRange), RED],
    ["Visitas abiertas", String(report.summary.openRows), AMBER],
  ]);
  y += 24;

  sectionTitle("Cruce y avance");
  drawMetricCards(pdf, margin, y, contentWidth, [
    ["DT seguimiento", String(report.summary.seguimientoDts), NAVY],
    ["DT archivo", String(report.summary.csvDts), NAVY],
    ["DT tomados", String(report.summary.matchedDts), GREEN],
    ["No iniciados", String(report.summary.ignoredNotStarted), SLATE],
  ]);
  y += 24;

  drawProgress(pdf, margin, y, contentWidth, "Entrega en rango", report.summary.deliveryRangePercent, GREEN);
  y += 12;
  drawProgress(pdf, margin, y, contentWidth, "Modulacion", report.summary.modulationPercent, NAVY);
  y += 16;

  sectionTitle("Detalle por tripulacion");
  drawCrewTable(pdf, report.summary.crews, {
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
    pdf.line(margin, 287, 196, 287);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...SLATE);
    pdf.text(`Punto Corona - ${getReportStatusLabel(report)}`, margin, 292);
    pdf.text(`Pagina ${page} de ${totalPages}`, 196, 292, { align: "right" });
  }

  pdf.save(`punto-corona-${report.operationalDate}-${report.kind}.pdf`);
}

function drawMetricCards(
  pdf: InstanceType<typeof import("jspdf").jsPDF>,
  margin: number,
  y: number,
  contentWidth: number,
  items: Array<[string, string, PdfTone]>,
) {
  const gap = 3;
  const cardWidth = (contentWidth - gap * 3) / 4;

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
  crews: PuntoCoronaCrewSummary[],
  layout: {
    addPage: () => void;
    contentWidth: number;
    getY: () => number;
    margin: number;
    pageBottom: number;
    setY: (value: number) => void;
  },
) {
  const headers = ["DT", "Tripulacion", "Placa", "Visit.", "Rango", "Fuera", "% rango", "% mod."];
  const widths = [20, 48, 22, 16, 17, 15, 22, 22];

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
    const row = [
      crew.dt,
      crew.driverName,
      crew.truckLicensePlate,
      crew.totalStarted,
      crew.inRange,
      crew.outOfRange,
      `${crew.deliveryRangePercent.toFixed(2)}%`,
      `${crew.modulationPercent.toFixed(2)}%`,
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
