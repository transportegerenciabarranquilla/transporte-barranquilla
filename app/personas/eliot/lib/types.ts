export type CrewRole = "rr" | "aux" | "conductor";

export type TdStatus = "bien" | "regular" | "mal" | "sin-marcacion";

export type CrewMember = {
  role: CrewRole;
  name: string;
  document: string;
  arrivalSeconds: number | null;
  tdSeconds: number | null;
  status: TdStatus;
  validPerson: boolean;
};

export type TdRow = {
  id: string;
  dt: string;
  trip: string;
  plate: string;
  responsible: string;
  dispatchDate: string;
  dtDate: string;
  routeStatus: string;
  clients: number;
  visited: number;
  boxes: number;
  hectoliters: number;
  departureSeconds: number | null;
  lateDepartureCause: string;
  lateDepartureComment: string;
  routeArrival: string;
  routeTime: string;
  plannedTime: string;
  territory: string;
  carrier: string;
  crew: Record<CrewRole, CrewMember>;
};

export type TdSnapshot = {
  id: string;
  fileName: string;
  fileHash: string;
  operationalDate: string;
  uploadedAt: string;
  closedAt?: string;
  rows: TdRow[];
  warnings: string[];
};

export type ParseResult = {
  operationalDate: string;
  rows: TdRow[];
  warnings: string[];
};

export type RankingEntry = {
  key: string;
  role: CrewRole;
  name: string;
  document: string;
  averageSeconds: number;
  records: number;
  missingMarks: number;
  plates: string[];
  status: TdStatus;
};

export type TrendPoint = {
  snapshotId: string;
  uploadedAt: string;
  averages: Record<CrewRole, number>;
  missingMarks: number;
};

export type PinRecord = {
  salt: string;
  hash: string;
};

export type BackupPayload = {
  version: 1;
  exportedAt: string;
  snapshots: TdSnapshot[];
};
