import { normalizeContractorName } from "./contractors";
import type { PuntoCoronaRouteRow } from "./puntoCoronaRoutesStorage";

type Report = { contractor: string; operationalDate: string; uploadedAt: string; rows: PuntoCoronaRouteRow[] };
type Stamp = { outOfRadiusRecordedAt: string; outOfRadiusRecordedSource: "system" | "report" };

function validTimestamp(value: string | undefined) {
  return value && /T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function key(report: Report, row: PuntoCoronaRouteRow) {
  return JSON.stringify([normalizeContractorName(report.contractor), report.operationalDate, row.dt, row.id, row.truckLicensePlate]);
}

function observations(reports: Report[]) {
  const found = new Map<string, Stamp>();
  for (const report of reports) for (const row of report.rows) {
    const recorded = validTimestamp(row.outOfRadiusRecordedAt);
    // A report is evidence of an observed state, not the exact time of the event.
    const at = recorded || (row.withinRadius === false && row.status !== "NOT_STARTED" ? validTimestamp(report.uploadedAt) : null);
    if (!at) continue;
    const source = recorded && row.outOfRadiusRecordedSource === "system" ? "system" : "report";
    const previous = found.get(key(report, row));
    if (!previous || at < previous.outOfRadiusRecordedAt) {
      found.set(key(report, row), { outOfRadiusRecordedAt: at, outOfRadiusRecordedSource: source });
    }
  }
  return found;
}

export function addHistoricalRangeTimes<T extends Report>(reports: T[]): T[] {
  const found = observations(reports);
  return reports.map(report => ({ ...report, rows: report.rows.map(row => ({ ...row, ...found.get(key(report, row)) })) }));
}

// Only persisted records and the server clock can supply these fields.
export function recordRangeTimes<T extends Report>(incoming: T[], persisted: Report[], now: string): T[] {
  const found = observations(persisted);
  return incoming.map(report => ({ ...report, rows: report.rows.map(row => {
    let stamp = found.get(key(report, row));
    if (!stamp && row.withinRadius === false && row.status !== "NOT_STARTED") {
      stamp = { outOfRadiusRecordedAt: now, outOfRadiusRecordedSource: "system" };
      found.set(key(report, row), stamp);
    }
    return { ...row, outOfRadiusRecordedAt: stamp?.outOfRadiusRecordedAt, outOfRadiusRecordedSource: stamp?.outOfRadiusRecordedSource };
  }) }));
}
