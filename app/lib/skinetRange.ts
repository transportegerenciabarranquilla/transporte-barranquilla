import { normalizeContractorName } from "./contractors";
import type { PuntoCoronaRouteReport } from "./puntoCoronaRoutesStorage";
import type { SkinetContext } from "./skinetUnderstanding";

export type SkinetRangeReport = Pick<PuntoCoronaRouteReport, "contractor" | "operationalDate" | "kind" | "uploadedAt" | "rows" | "closedAt"> & { updatedAt?: string };
export const skinetDt = (value: unknown) => String(value ?? "").replace(/^(?:DT[-\s]*|R\d+S|S)/i, "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
export const skinetPlate = (value: unknown) => String(value ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();

export function skinetRangeRows(reports: SkinetRangeReport[], permitted: Set<string>, day: string, context: SkinetContext) {
  const preferred = new Map<string, SkinetRangeReport>();
  for (const report of reports) {
    const contractor = normalizeContractorName(report.contractor);
    if (!permitted.has(contractor) || report.operationalDate !== day) continue;
    const old = preferred.get(contractor);
    const timestamp = (value: SkinetRangeReport) => Date.parse(value.closedAt || value.uploadedAt || value.updatedAt || "") || 0;
    if (!old || (report.kind === "closure" && old.kind !== "closure") || (report.kind === old.kind && timestamp(report) > timestamp(old))) preferred.set(contractor, report);
  }
  return {
    reports: [...preferred.values()],
    rows: [...preferred.values()].flatMap(report => report.rows
      .filter(row => (!context.dt || skinetDt(row.dt) === skinetDt(context.dt)) && (!context.plate || skinetPlate(row.truckLicensePlate) === context.plate))
      .map(row => ({ ...row, contractor: report.contractor }))),
  };
}

export function skinetRangeAnswer(selection: ReturnType<typeof skinetRangeRows>, context: SkinetContext, label: string) {
  if (!selection.reports.length) return `No hay un reporte de entrega en rango disponible para ${label} ${context.period} dentro del alcance consultado.`;
  const started = selection.rows.filter(row => row.status !== "NOT_STARTED");
  if (!selection.rows.length && (context.dt || context.plate)) return `No encontré ese DT o placa en los reportes de entrega en rango de ${context.day}.`;
  const inside = started.filter(row => row.withinRadius === true).length;
  const outside = started.filter(row => row.withinRadius === false).length;
  const percentage = started.length ? `${(inside / started.length * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })} por ciento` : "sin visitas iniciadas para calcular el porcentaje";
  let answer = `Entrega en rango de ${label} ${context.period}: ${percentage}.`;
  answer += ` ${inside} visitas en rango, ${outside} fuera de rango y ${started.length - inside - outside} sin dato de rango, de ${started.length} visitas iniciadas. ${selection.rows.length - started.length} sin iniciar.`;
  if (context.metrics.includes("rangeDetails")) {
    const details = started.filter(row => context.outsideRange === undefined || row.withinRadius === !context.outsideRange);
    answer += details.length ? ` Detalle de ${Math.min(12, details.length)} de ${details.length} visitas: ` + details.slice(0, 12).map(row =>
      `${row.contractor}, DT ${row.dt}, placa ${row.truckLicensePlate || "no registrada"}, cliente ${row.pocName || row.pocExternalId || "no registrado"}: ${row.withinRadius === true ? "en rango" : row.withinRadius === false ? "fuera de rango" : "sin dato de rango"}${row.withinRadius === false ? `; motivo: ${row.manualOutOfRadiusReason || row.outOfRadiusReason || "no registrado"}` : ""}.`).join(" ")
      : " No hay visitas con ese criterio.";
    if (details.length > 12) answer += " Puedes consultar un DT o placa para acotar el detalle.";
  }
  return answer;
}

export function skinetRangeVehicleAnswer(selection: ReturnType<typeof skinetRangeRows>, context: SkinetContext, label: string) {
  if (!selection.reports.length) return `No hay reportes de entrega en rango de ${label} ${context.period}.`;
  const visits = selection.rows.filter(row => row.status !== "NOT_STARTED" && row.withinRadius === (context.outsideRange === false));
  const plates = new Set(visits.map(row => skinetPlate(row.truckLicensePlate)).filter(Boolean));
  const missing = visits.filter(row => !skinetPlate(row.truckLicensePlate)).length;
  const criterion = context.outsideRange === false ? "en rango" : "fuera de rango";
  return `${label} ${context.period}: ${plates.size} vehículos distintos con al menos una visita ${criterion}.`
    + (missing ? ` Hay ${missing} visitas ${criterion} sin placa; no puedo confirmar el total exacto de vehículos.` : "");
}
