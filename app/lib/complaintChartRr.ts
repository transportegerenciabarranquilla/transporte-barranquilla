import { normalizeComplaintDt } from "./complaints.ts";
import { contractorLabel, normalizeContractorName } from "./contractors.ts";
import { chartDate, type ComplaintChartRow } from "./complaintCharts.ts";

export type ComplaintRrTracking = {
  transporte: string;
  transportista: string;
  nombreResponsable?: string;
  responsable?: string;
  cedulaResponsable?: string;
  fechaDespacho?: string;
  fechaDt?: string;
  date?: string;
  createdAt?: string;
};

export type ComplaintRrGroup = { key: string; label: string; count: number; dts: string[]; complaints: ComplaintChartRow[] };

export function complaintRrGroups(rows: ComplaintChartRow[], tracking: ComplaintRrTracking[]) {
  const byDt = new Map<string, ComplaintRrTracking[]>();
  for (const vehicle of tracking) {
    const dt = normalizeComplaintDt(vehicle.transporte);
    if (dt) byDt.set(dt, [...(byDt.get(dt) || []), vehicle]);
  }
  const groups = new Map<string, ComplaintRrGroup>();
  let unmatched = 0;
  for (const row of rows) {
    const contractor = normalizeContractorName(contractorLabel(row.contractor));
    const candidates = (byDt.get(normalizeComplaintDt(row.dt)) || []).filter(vehicle =>
      normalizeContractorName(contractorLabel(vehicle.transportista)) === contractor);
    const ranked = candidates.map(vehicle => {
      const dates = [vehicle.fechaDespacho, vehicle.fechaDt, vehicle.date, vehicle.createdAt].map(value => chartDate(value || "")).filter(Boolean);
      const distance = row.date ? Math.min(...dates.map(date => Math.abs(Date.parse(date) - Date.parse(row.date)))) : Infinity;
      return { vehicle, distance };
    });
    const nearest = Math.min(...ranked.map(item => item.distance));
    const matches = Number.isFinite(nearest) ? ranked.filter(item => item.distance === nearest).map(item => item.vehicle) : candidates;
    const identities = new Map(matches.map(vehicle => {
      const name = (vehicle.nombreResponsable || vehicle.responsable || "").trim();
      const id = (vehicle.cedulaResponsable || "").trim();
      return [id || name.toLocaleLowerCase("es"), { name, id }];
    }));
    const match = identities.size === 1 ? [...identities.values()][0] : undefined;
    // Existing complaints already carry the RR resolved by the complaints API.
    const name = match?.name || row.rr?.trim() || "";
    const id = match?.id || row.rrId?.trim() || "";
    const identity = name || id ? `${contractor}:${id || name.toLocaleLowerCase("es")}` : "unmatched";
    const label = name || (id ? "RR sin nombre" : "Sin RR identificado");
    if (identity === "unmatched") unmatched += row.count;
    const group = groups.get(identity);
    const dt = normalizeComplaintDt(row.dt);
    if (group) {
      group.count += row.count;
      group.complaints.push(row);
      if (dt && !group.dts.includes(dt)) group.dts.push(dt);
    } else groups.set(identity, { key: identity, label, count: row.count, dts: dt ? [dt] : [], complaints: [row] });
  }
  return { values: [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es")), unmatched };
}
