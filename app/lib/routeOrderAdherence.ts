import { normalizeContractorName } from "./contractors";
import type { PuntoCoronaRouteReport, PuntoCoronaRouteRow } from "./puntoCoronaRoutesStorage";

export const ADHERENCE_CONTRACTORS = ["Surti Cervezas", "Logisticos", "HL Logisticos"] as const;

type AdherenceReport = Pick<PuntoCoronaRouteReport, "contractor" | "operationalDate" | "kind" | "uploadedAt" | "closedAt" | "rows"> & { updatedAt?: string };

export type RrOrderAdherence = {
  contractor: string;
  rr: string;
  routes: number;
  evaluated: number;
  compliant: number;
  nonCompliant: number;
  withoutOrder: number;
  percentage: number | null;
};

export type MonthlyOrderAdherence = {
  month: string;
  contractor: string;
  evaluated: number;
  compliant: number;
  percentage: number | null;
};

export function filterAdherenceReportsByDate<T extends { operationalDate: string }>(reports: readonly T[], from: string, to: string) {
  return reports.filter((report) => {
    const date = String(report.operationalDate || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && (!from || date >= from) && (!to || date <= to);
  });
}

export function preferredAdherenceReports(reports: readonly AdherenceReport[]) {
  const preferred = new Map<string, AdherenceReport>();
  reports.forEach((report) => {
    const contractor = canonicalContractor(report.contractor);
    if (!contractor) return;
    const key = `${normalizeContractorName(contractor)}:${report.operationalDate}`;
    const current = preferred.get(key);
    if (!current || isPreferred(report, current)) preferred.set(key, report);
  });
  return [...preferred.values()];
}

export function buildRrOrderAdherence(reports: readonly AdherenceReport[]): RrOrderAdherence[] {
  const groups = new Map<string, { contractor: string; rr: string; routeKeys: Set<string>; evaluated: number; compliant: number; withoutOrder: number }>();
  preferredAdherenceReports(reports).forEach((report) => {
    const contractor = canonicalContractor(report.contractor);
    if (!contractor) return;
    resolveOrders(report.rows).forEach(({ row, planned, actual }) => {
      const rr = cleanRr(row.driverName);
      const key = `${normalizeContractorName(contractor)}:${normalizeText(rr)}`;
      const group = groups.get(key) || { contractor, rr, routeKeys: new Set<string>(), evaluated: 0, compliant: 0, withoutOrder: 0 };
      group.routeKeys.add(`${report.operationalDate}:${row.dt || row.tourDisplayId}`);
      if (planned !== null && actual !== null) {
        group.evaluated += 1;
        if (planned === actual) group.compliant += 1;
      } else {
        group.withoutOrder += 1;
      }
      groups.set(key, group);
    });
  });

  return [...groups.values()].map((group) => ({
    contractor: group.contractor,
    rr: group.rr,
    routes: group.routeKeys.size,
    evaluated: group.evaluated,
    compliant: group.compliant,
    nonCompliant: group.evaluated - group.compliant,
    withoutOrder: group.withoutOrder,
    percentage: percent(group.compliant, group.evaluated),
  })).sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1) || b.evaluated - a.evaluated || a.rr.localeCompare(b.rr, "es-CO"));
}

export function buildMonthlyOrderAdherence(reports: readonly AdherenceReport[]): MonthlyOrderAdherence[] {
  const groups = new Map<string, { month: string; contractor: string; evaluated: number; compliant: number }>();
  preferredAdherenceReports(reports).forEach((report) => {
    const contractor = canonicalContractor(report.contractor);
    const month = report.operationalDate.slice(0, 7);
    if (!contractor || !/^\d{4}-\d{2}$/.test(month)) return;
    const key = `${month}:${normalizeContractorName(contractor)}`;
    const group = groups.get(key) || { month, contractor, evaluated: 0, compliant: 0 };
    resolveOrders(report.rows).forEach(({ planned, actual }) => {
      if (planned === null || actual === null) return;
      group.evaluated += 1;
      if (planned === actual) group.compliant += 1;
    });
    groups.set(key, group);
  });

  return [...groups.values()].map((group) => ({ ...group, percentage: percent(group.compliant, group.evaluated) }))
    .sort((a, b) => a.month.localeCompare(b.month) || contractorIndex(a.contractor) - contractorIndex(b.contractor));
}

export function hasComparableOrders(row: Pick<PuntoCoronaRouteRow, "plannedVisitOrder" | "actualVisitOrder">) {
  return isPositiveInteger(row.plannedVisitOrder) && isPositiveInteger(row.actualVisitOrder);
}

/**
 * Los reportes guardados antes de octubre de 2026 conservaron visit_order al
 * final del ID, pero no como una propiedad independiente. En esos registros,
 * la posicion original de la fila dentro de cada DT representa el orden
 * establecido del archivo y permite recuperar la comparacion historica.
 */
function resolveOrders(rows: readonly PuntoCoronaRouteRow[]) {
  const positionByRoute = new Map<string, number>();
  return rows.map((row) => {
    const route = normalizeText(row.dt || row.tourDisplayId || "sin-dt");
    const position = (positionByRoute.get(route) || 0) + 1;
    positionByRoute.set(route, position);
    return {
      row,
      planned: isPositiveInteger(row.plannedVisitOrder) ? row.plannedVisitOrder : position,
      actual: isPositiveInteger(row.actualVisitOrder) ? row.actualVisitOrder : legacyActualOrder(row.id),
    };
  });
}

function legacyActualOrder(id: string) {
  const value = String(id || "").match(/-(\d+)$/)?.[1];
  const parsed = Number(value);
  return isPositiveInteger(parsed) ? parsed : null;
}

function isPreferred(candidate: AdherenceReport, current: AdherenceReport) {
  if (candidate.kind === "closure" && current.kind !== "closure") return true;
  if (candidate.kind !== current.kind) return false;
  return timestamp(candidate) > timestamp(current);
}

function timestamp(report: AdherenceReport) {
  return Date.parse(report.closedAt || report.updatedAt || report.uploadedAt || "") || 0;
}

function canonicalContractor(value: string) {
  const normalized = normalizeContractorName(value);
  return ADHERENCE_CONTRACTORS.find((contractor) => normalizeContractorName(contractor) === normalized) || "";
}

function contractorIndex(value: string) {
  return ADHERENCE_CONTRACTORS.findIndex((contractor) => contractor === value);
}

function cleanRr(value: string) {
  return String(value || "").trim() || "RR sin identificar";
}

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function isPositiveInteger(value: number | null | undefined): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function percent(numerator: number, denominator: number) {
  return denominator ? Number((numerator / denominator * 100).toFixed(2)) : null;
}
