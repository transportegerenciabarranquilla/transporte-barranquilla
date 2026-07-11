import { readRemoteRecords, saveRemoteRecords } from "./remoteStore";

export const PUNTO_CORONA_ROUTES_STORAGE_KEY = "bavaria.punto-corona.routes";
export const PUNTO_CORONA_CONTRACTOR = "Punto Corona";

export type PuntoCoronaRouteStatus =
  | "CONCLUDED"
  | "DEFINITELY_RETURNED"
  | "NOT_STARTED"
  | "WAITING_MODULATION"
  | "RESCHEDULED"
  | "DELIVERY_STARTED"
  | "PARTIAL_DELIVERY"
  | string;

export type PuntoCoronaRouteRow = {
  id: string;
  dt: string;
  tourDisplayId: string;
  tourDate: string;
  driverName: string;
  truckLicensePlate: string;
  pocExternalId: string;
  pocName: string;
  status: PuntoCoronaRouteStatus;
  withinRadius: boolean | null;
  outOfRadiusReason: string;
  skippedReason: string;
  deliveredVolume: number;
  refusedVolume: number;
  seguimientoCajas?: number;
  seguimientoClientes?: number;
  seguimientoVisitados?: number;
  seguimientoProgress?: number;
};

export type PuntoCoronaCrewSummary = {
  key: string;
  dt: string;
  driverName: string;
  truckLicensePlate: string;
  totalStarted: number;
  inRange: number;
  outOfRange: number;
  concluded: number;
  returned: number;
  open: number;
  modulatedRows?: number;
  modulationOpenRows?: number;
  modulationPercent: number;
  deliveryRangePercent: number;
  seguimientoClientes?: number;
  seguimientoVisitados?: number;
  seguimientoProgress?: number;
};

export type PuntoCoronaRouteSummary = {
  seguimientoDts: number;
  csvDts: number;
  matchedDts: number;
  totalRows: number;
  ignoredNotStarted: number;
  startedRows: number;
  inRange: number;
  outOfRange: number;
  concluded: number;
  returned: number;
  openRows: number;
  modulatedRows?: number;
  modulationOpenRows?: number;
  modulationPercent: number;
  deliveryRangePercent: number;
  crews: PuntoCoronaCrewSummary[];
};

export type PuntoCoronaRouteReport = {
  id: string;
  contractor: string;
  operationalDate: string;
  kind: "current" | "closure";
  fileName: string;
  uploadedAt: string;
  closedAt?: string;
  rows: PuntoCoronaRouteRow[];
  summary: PuntoCoronaRouteSummary;
};

export function readPuntoCoronaRouteReports() {
  if (typeof window === "undefined") return [];
  return readRemoteRecords<PuntoCoronaRouteReport>("/api/punto-corona-routes");
}

export function savePuntoCoronaRouteReports(records: PuntoCoronaRouteReport[]) {
  return saveRemoteRecords("/api/punto-corona-routes", records, { mergeByKey: (record) => record.id });
}

export function getPuntoCoronaCurrentReportId(operationalDate: string, contractor = PUNTO_CORONA_CONTRACTOR) {
  return `rango:${normalizeContractorKey(contractor)}:${operationalDate}:current`;
}

export function getPuntoCoronaClosureReportId(operationalDate: string, contractor = PUNTO_CORONA_CONTRACTOR) {
  return `rango:${normalizeContractorKey(contractor)}:${operationalDate}:closure`;
}

function normalizeContractorKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
