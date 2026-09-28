import type { PuntoCoronaRouteReport } from "./puntoCoronaRoutesStorage";
import type { ModulacionRegistro } from "./modulacionStorage";
import type { ImportedRangeVisit } from "./clientRangeImport";

export type ClientRangeFilters = { contractor: string; from: string; to: string; dt: string };
export type ClientRangeVisit = {
  key: string;
  date: string;
  dt: string;
  status: string;
  withinRadius: boolean | null;
  deliveredVolume: number | null;
  refusedVolume: number | null;
};
export type ClientRangeModulation = {
  key: string;
  date: string;
  dt: string;
  causal: string;
  comment: string;
};
export type ClientRangeSummary = {
  key: string; code: string; name: string; contractor: string;
  attentions: number; refusal: number | null; refusedVolume: number; deliveredVolume: number;
  inside: number; outside: number; outsidePercent: number | null; unknown: number; modulations: number;
  maxDistance: number | null; maxExcess: number | null;
  visits: ClientRangeVisit[];
  modulationHistory: ClientRangeModulation[];
};
type Report = PuntoCoronaRouteReport & { updatedAt?: string };

const normalize = (value: string) => value.trim().toLocaleLowerCase("es-CO");
const dtKey = (value: string) => value.trim().replace(/^DT-?/i, "").replace(/^(?:R\d+)?S(?=\d)/i, "").replace(/\D/g, "");

export function buildClientRangeSummary(reports: Report[], modulations: ModulacionRegistro[], filters: ClientRangeFilters, imports: ImportedRangeVisit[] = [], radius = 50) {
  const preferred = new Map<string, Report>();
  const timestamp = (report: Report) => Date.parse(report.closedAt || report.uploadedAt || report.updatedAt || "") || 0;
  for (const report of reports) {
    const key = JSON.stringify([report.contractor, report.operationalDate]);
    const current = preferred.get(key);
    if (!current || (report.kind === "closure" && current.kind !== "closure") ||
      (report.kind === current.kind && timestamp(report) > timestamp(current))) preferred.set(key, report);
  }
  const matches = (contractor: string, date: string, dt: string) =>
    (filters.contractor === "Todas" || contractor === filters.contractor) &&
    (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to) &&
    (!dtKey(filters.dt) || dtKey(dt).includes(dtKey(filters.dt)));
  const clients = new Map<string, ClientRangeSummary>();
  function client(contractor: string, code: string, name: string, fallback: string) {
    const key = JSON.stringify([contractor, normalize(code) || fallback]);
    let row = clients.get(key);
    if (!row) {
      row = { key, contractor, code: code.trim(), name: name.trim() || "Sin nombre", attentions: 0, refusal: null, refusedVolume: 0, deliveredVolume: 0, inside: 0, outside: 0, outsidePercent: null, unknown: 0, modulations: 0, maxDistance: null, maxExcess: null, visits: [], modulationHistory: [] };
      clients.set(key, row);
    } else if (row.name === "Sin nombre" && name.trim()) row.name = name.trim();
    return row;
  }
  const visits = new Set<string>();
  // El Excel aporta coordenadas a la misma visita sin duplicar su conteo BEES.
  for (const row of imports) {
    if (!matches(row.contractor, row.date, row.dt)) continue;
    const visit = JSON.stringify([row.contractor, row.date, dtKey(row.dt), normalize(row.code)]);
    if (visits.has(visit)) continue;
    visits.add(visit);
    const summary = client(row.contractor, row.code, row.name, visit);
    summary.attentions++;
    summary.visits.push({ key: visit, date: row.date, dt: row.dt, status: "IMPORTADO", withinRadius: row.meters <= radius, deliveredVolume: null, refusedVolume: null });
    if (row.meters <= radius) summary.inside++;
    else summary.outside++;
    summary.maxDistance = Math.max(summary.maxDistance ?? 0, row.meters);
    summary.maxExcess = Math.max(summary.maxExcess ?? 0, Math.max(0, row.meters - radius));
  }
  for (const report of preferred.values()) {
    for (const row of report.rows) {
      if (row.status === "NOT_STARTED" || !matches(report.contractor, report.operationalDate, row.dt)) continue;
      const identity = normalize(row.pocExternalId) || `row:${report.id}:${row.id}`;
      const visit = JSON.stringify([report.contractor, report.operationalDate, dtKey(row.dt), identity]);
      if (visits.has(visit)) continue;
      visits.add(visit);
      const summary = client(report.contractor, row.pocExternalId, row.pocName, identity);
      summary.visits.push({
        key: visit, date: report.operationalDate, dt: row.dt, status: row.status,
        withinRadius: row.withinRadius ?? null,
        deliveredVolume: Number.isFinite(row.deliveredVolume) ? Math.max(0, row.deliveredVolume) : null,
        refusedVolume: Number.isFinite(row.refusedVolume) ? Math.max(0, row.refusedVolume) : null,
      });
      summary.attentions++;
      summary.refusedVolume += Number.isFinite(row.refusedVolume) ? Math.max(0, row.refusedVolume) : 0;
      summary.deliveredVolume += Number.isFinite(row.deliveredVolume) ? Math.max(0, row.deliveredVolume) : 0;
      const volume = summary.deliveredVolume + summary.refusedVolume;
      summary.refusal = volume > 0 ? summary.refusedVolume / volume * 100 : null;
      if (row.withinRadius === true) summary.inside++;
      else if (row.withinRadius === false) summary.outside++;
      else summary.unknown++;
    }
  }
  const seenModulations = new Set<string>();
  for (const row of modulations) {
    const contractor = row.contratista || "Sin contratista";
    const date = (row.fechaDespacho || row.fechaDt || row.createdAt || "").slice(0, 10);
    const key = JSON.stringify([contractor, row.id]);
    if (!matches(contractor, date, row.dt) || seenModulations.has(key)) continue;
    seenModulations.add(key);
    const summary = client(contractor, row.codigoCliente, row.nombreCliente || "", `modulation:${row.id}`);
    summary.modulations++;
    summary.modulationHistory.push({ key, date, dt: row.dt, causal: row.causal || "Sin causal registrada", comment: row.comentarioModulador || row.comentario || "" });
  }
  for (const summary of clients.values()) {
    const validated = summary.inside + summary.outside;
    summary.outsidePercent = validated > 0 ? summary.outside / validated * 100 : null;
    summary.visits.sort((a, b) => b.date.localeCompare(a.date) || a.dt.localeCompare(b.dt));
    summary.modulationHistory.sort((a, b) => b.date.localeCompare(a.date) || a.dt.localeCompare(b.dt));
  }
  return [...clients.values()].sort((a, b) => b.outside - a.outside || b.modulations - a.modulations || a.name.localeCompare(b.name, "es-CO"));
}
