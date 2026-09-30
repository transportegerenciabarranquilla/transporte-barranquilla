import { contractorLabel } from "./contractors";
import { RANGE_REASONS } from "./rangeReasons";
import type { PuntoCoronaRouteRow } from "./puntoCoronaRoutesStorage";

type ReasonRow = Pick<PuntoCoronaRouteRow, "status" | "withinRadius" | "manualOutOfRadiusReason" | "outOfRadiusReason" | "skippedReason"> & { contractor: string };

function normalize(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

export function summarizeRangeReasons(rows: ReasonRow[]) {
  const groups = new Map<string, { contractor: string; counts: number[]; total: number; unclassified: number }>();
  for (const row of rows) {
    if (row.status === "NOT_STARTED" || row.withinRadius !== false) continue;
    const contractor = contractorLabel(row.contractor) || "Sin contratista";
    const group = groups.get(contractor) || { contractor, counts: RANGE_REASONS.map(() => 0), total: 0, unclassified: 0 };
    const raw = normalize(row.manualOutOfRadiusReason || row.outOfRadiusReason || row.skippedReason || "");
    const reason = raw === "apoyo ingreso" ? "apoyo de ingreso" : raw;
    const index = RANGE_REASONS.findIndex((value) => normalize(value) === reason);
    group.total += 1;
    if (index >= 0) group.counts[index] += 1;
    else group.unclassified += 1;
    groups.set(contractor, group);
  }
  return [...groups.values()].sort((a, b) => a.contractor.localeCompare(b.contractor, "es-CO"));
}
