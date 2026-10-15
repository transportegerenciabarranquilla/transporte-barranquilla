import { normalizeContractorName } from "./contractors";
import type { ModulacionRegistro } from "./modulacionStorage";
import type { PuntoCoronaRouteReport, PuntoCoronaRouteRow } from "./puntoCoronaRoutesStorage";

export const MODULATION_ADHERENCE_CONTRACTORS = ["Surti Cervezas", "Logisticos", "HL Logisticos"] as const;

type AdherenceReport = Pick<PuntoCoronaRouteReport, "contractor" | "operationalDate" | "kind" | "uploadedAt" | "closedAt" | "rows"> & { updatedAt?: string };

export type DailyModulationAdherence = {
  contractor: string;
  date: string;
  rejected: number;
  modulated: number;
  pending: number;
  percentage: number | null;
};

export type ContractorModulationAdherence = {
  contractor: string;
  rejected: number;
  modulated: number;
  pending: number;
  dailyAverage: number | null;
  daysWithCases: number;
};

export type ModulationAdherenceDetail = {
  contractor: string;
  date: string;
  dt: string;
  clientCode: string;
  clientName: string;
  rr: string;
  status: string;
  modulated: boolean;
};

export function buildModulationAdherence(reports: readonly AdherenceReport[], modulations: readonly ModulacionRegistro[]) {
  const preferred = preferredModulationAdherenceReports(reports);
  const modulationKeys = new Set(
    modulations.map((record) => modulationKey(record.contratista, recordDate(record), record.dt, record.codigoCliente)).filter(Boolean),
  );
  const daily = new Map<string, DailyModulationAdherence>();
  const details: ModulationAdherenceDetail[] = [];

  preferred.forEach((report) => {
    const contractor = canonicalContractor(report.contractor);
    const date = dateKey(report.operationalDate);
    if (!contractor || !date) return;
    const dailyKey = `${normalizeContractorName(contractor)}:${date}`;
    const current = daily.get(dailyKey) || { contractor, date, rejected: 0, modulated: 0, pending: 0, percentage: null };
    const seenClients = new Set<string>();

    report.rows.forEach((row) => {
      if (!isRejectedForModulation(row.status)) return;
      const clientKey = routeClientKey(row);
      if (!clientKey || seenClients.has(clientKey)) return;
      seenClients.add(clientKey);
      const wasModulated = modulationKeys.has(modulationKey(contractor, date, row.dt || row.tourDisplayId, row.pocExternalId));
      current.rejected += 1;
      if (wasModulated) current.modulated += 1;
      else current.pending += 1;
      details.push({
        contractor,
        date,
        dt: normalizeDt(row.dt || row.tourDisplayId),
        clientCode: String(row.pocExternalId || "").trim(),
        clientName: String(row.pocName || "Cliente sin nombre").trim(),
        rr: String(row.driverName || "Sin responsable").trim(),
        status: String(row.status || "Rechazado"),
        modulated: wasModulated,
      });
    });

    current.percentage = percentage(current.modulated, current.rejected);
    daily.set(dailyKey, current);
  });

  return {
    daily: [...daily.values()].sort((left, right) => left.date.localeCompare(right.date) || contractorOrder(left.contractor) - contractorOrder(right.contractor)),
    details: details.sort((left, right) => right.date.localeCompare(left.date) || contractorOrder(left.contractor) - contractorOrder(right.contractor) || left.dt.localeCompare(right.dt, "es-CO", { numeric: true })),
  };
}

export function summarizeModulationAdherence(rows: readonly DailyModulationAdherence[]): ContractorModulationAdherence[] {
  return MODULATION_ADHERENCE_CONTRACTORS.map((contractor) => {
    const contractorRows = rows.filter((row) => normalizeContractorName(row.contractor) === normalizeContractorName(contractor));
    const measuredDays = contractorRows.filter((row) => row.percentage !== null);
    return {
      contractor,
      rejected: contractorRows.reduce((sum, row) => sum + row.rejected, 0),
      modulated: contractorRows.reduce((sum, row) => sum + row.modulated, 0),
      pending: contractorRows.reduce((sum, row) => sum + row.pending, 0),
      dailyAverage: measuredDays.length ? round(measuredDays.reduce((sum, row) => sum + Number(row.percentage), 0) / measuredDays.length) : null,
      daysWithCases: measuredDays.length,
    };
  });
}

export function preferredModulationAdherenceReports(reports: readonly AdherenceReport[]) {
  const preferred = new Map<string, AdherenceReport>();
  reports.forEach((report) => {
    const contractor = canonicalContractor(report.contractor);
    const date = dateKey(report.operationalDate);
    if (!contractor || !date) return;
    const key = `${normalizeContractorName(contractor)}:${date}`;
    const current = preferred.get(key);
    if (!current || isPreferred(report, current)) preferred.set(key, report);
  });
  return [...preferred.values()];
}

export function isRejectedForModulation(status: unknown) {
  const value = normalizeText(status).replace(/\s+/g, "_").toUpperCase();
  return ["DEFINITELY_RETURNED", "WAITING_MODULATION", "PARTIAL_DELIVERY", "REJECTED", "RECHAZADO", "DEVUELTO", "DEVUELTA", "ENTREGA_PARCIAL"].includes(value);
}

function isPreferred(candidate: AdherenceReport, current: AdherenceReport) {
  if (candidate.kind === "closure" && current.kind !== "closure") return true;
  if (candidate.kind !== "closure" && current.kind === "closure") return false;
  return timestamp(candidate) > timestamp(current);
}

function timestamp(report: AdherenceReport) {
  const parsed = new Date(report.updatedAt || report.closedAt || report.uploadedAt || "").getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function routeClientKey(row: Pick<PuntoCoronaRouteRow, "dt" | "tourDisplayId" | "pocExternalId">) {
  const dt = normalizeDt(row.dt || row.tourDisplayId);
  const client = normalizeClient(row.pocExternalId);
  return dt && client ? `${dt}:${client}` : "";
}

function modulationKey(contractor: unknown, date: unknown, dt: unknown, client: unknown) {
  const contractorKey = normalizeContractorName(String(contractor || ""));
  const normalizedDate = dateKey(date);
  const normalizedDt = normalizeDt(dt);
  const normalizedClient = normalizeClient(client);
  return contractorKey && normalizedDate && normalizedDt && normalizedClient ? `${contractorKey}:${normalizedDate}:${normalizedDt}:${normalizedClient}` : "";
}

function recordDate(record: Pick<ModulacionRegistro, "fechaDespacho" | "fechaDt" | "createdAt">) {
  return dateKey(record.fechaDespacho || record.fechaDt || record.createdAt);
}

function normalizeDt(value: unknown) {
  return String(value ?? "").trim().replace(/^DT-?/i, "").replace(/^(?:R\d+)?S(?=\d)/i, "").replace(/\D/g, "");
}

function normalizeClient(value: unknown) {
  return normalizeText(value).replace(/[^a-z0-9]/g, "").replace(/^0+(?=\d)/, "");
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function dateKey(value: unknown) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
    const [day, month, year] = text.split("/");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function canonicalContractor(value: unknown) {
  const normalized = normalizeContractorName(String(value || ""));
  return MODULATION_ADHERENCE_CONTRACTORS.find((contractor) => normalizeContractorName(contractor) === normalized) || "";
}

function contractorOrder(contractor: string) {
  return MODULATION_ADHERENCE_CONTRACTORS.findIndex((item) => item === contractor);
}

function percentage(value: number, total: number) {
  return total ? round(value / total * 100) : null;
}

function round(value: number) {
  return Number(value.toFixed(2));
}
