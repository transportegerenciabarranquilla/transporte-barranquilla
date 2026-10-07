import * as XLSX from "xlsx";
import type { BackupPayload, CrewMember, CrewRole, TdRow, TdSnapshot, TdStatus } from "./types";

const ROLES: CrewRole[] = ["rr", "aux", "conductor"];
const ROUTE_FIELDS = [
  "id", "dt", "trip", "plate", "responsible", "dispatchDate", "dtDate", "routeStatus",
  "clients", "visited", "boxes", "hectoliters", "departureSeconds", "lateDepartureCause",
  "lateDepartureComment", "routeArrival", "routeTime", "plannedTime", "territory", "carrier",
] as const;

export function createBackupWorkbook(payload: BackupPayload): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
    { version: payload.version, exportedAt: payload.exportedAt },
  ]), "Información");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payload.snapshots.map((snapshot) => ({
    id: snapshot.id,
    fileName: snapshot.fileName,
    fileHash: snapshot.fileHash,
    operationalDate: snapshot.operationalDate,
    uploadedAt: snapshot.uploadedAt,
    closedAt: snapshot.closedAt || "",
  })), { header: ["id", "fileName", "fileHash", "operationalDate", "uploadedAt", "closedAt"] }), "Cortes");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payload.snapshots.flatMap((snapshot) =>
    snapshot.rows.map((row) => ({ snapshotId: snapshot.id, ...Object.fromEntries(ROUTE_FIELDS.map((field) => [field, row[field] ?? ""])) })),
  ), { header: ["snapshotId", ...ROUTE_FIELDS] }), "Rutas");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payload.snapshots.flatMap((snapshot) =>
    snapshot.rows.flatMap((row) => ROLES.map((role) => ({
      snapshotId: snapshot.id, routeId: row.id, role,
      name: row.crew[role].name, document: row.crew[role].document,
      arrivalSeconds: row.crew[role].arrivalSeconds ?? "", tdSeconds: row.crew[role].tdSeconds ?? "",
      status: row.crew[role].status, validPerson: row.crew[role].validPerson,
    }))),
  ), { header: ["snapshotId", "routeId", "role", "name", "document", "arrivalSeconds", "tdSeconds", "status", "validPerson"] }), "Tripulación");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(payload.snapshots.flatMap((snapshot) =>
    snapshot.warnings.map((warning) => ({ snapshotId: snapshot.id, warning })),
  ), { header: ["snapshotId", "warning"] }), "Advertencias");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
}

export function parseBackupWorkbook(buffer: ArrayBuffer): BackupPayload {
  const workbook = XLSX.read(buffer, { type: "array" });
  const info = readSheet(workbook, "Información")[0];
  if (Number(info?.version) !== 1) throw new Error("El Excel no es un respaldo TML compatible.");
  const snapshotRows = readSheet(workbook, "Cortes");
  const routeRows = readSheet(workbook, "Rutas");
  const crewRows = readSheet(workbook, "Tripulación");
  const warningRows = readSheet(workbook, "Advertencias");
  const snapshots: TdSnapshot[] = snapshotRows.map((record) => {
    const id = string(record.id);
    if (!id || !string(record.fileName) || !string(record.operationalDate)) throw new Error("El respaldo tiene un corte incompleto.");
    const rows: TdRow[] = routeRows.filter((row) => string(row.snapshotId) === id).map((row) => {
      const routeId = string(row.id);
      if (!routeId) throw new Error("El respaldo tiene una ruta sin identificador.");
      const members = crewRows.filter((member) => string(member.snapshotId) === id && string(member.routeId) === routeId);
      const crew = Object.fromEntries(ROLES.map((role) => {
        const member = members.find((value) => string(value.role) === role);
        if (!member) throw new Error(`Falta la tripulación ${role} de la ruta ${routeId}.`);
        return [role, {
          role, name: string(member.name), document: string(member.document),
          arrivalSeconds: optionalNumber(member.arrivalSeconds), tdSeconds: optionalNumber(member.tdSeconds),
          status: string(member.status) as TdStatus, validPerson: member.validPerson === true || string(member.validPerson).toLowerCase() === "true",
        } satisfies CrewMember];
      })) as Record<CrewRole, CrewMember>;
      return {
        id: routeId, dt: string(row.dt), trip: string(row.trip), plate: string(row.plate), responsible: string(row.responsible),
        dispatchDate: string(row.dispatchDate), dtDate: string(row.dtDate), routeStatus: string(row.routeStatus),
        clients: number(row.clients), visited: number(row.visited), boxes: number(row.boxes), hectoliters: number(row.hectoliters),
        departureSeconds: optionalNumber(row.departureSeconds), lateDepartureCause: string(row.lateDepartureCause),
        lateDepartureComment: string(row.lateDepartureComment), routeArrival: string(row.routeArrival), routeTime: string(row.routeTime),
        plannedTime: string(row.plannedTime), territory: string(row.territory), carrier: string(row.carrier), crew,
      };
    });
    if (!rows.length) throw new Error(`El corte ${id} no tiene rutas en el respaldo.`);
    return {
      id, fileName: string(record.fileName), fileHash: string(record.fileHash), operationalDate: string(record.operationalDate),
      uploadedAt: string(record.uploadedAt), ...(string(record.closedAt) ? { closedAt: string(record.closedAt) } : {}), rows,
      warnings: warningRows.filter((row) => string(row.snapshotId) === id).map((row) => string(row.warning)),
    };
  });
  if (!snapshots.length || routeRows.length !== snapshots.reduce((total, snapshot) => total + snapshot.rows.length, 0)) {
    throw new Error("El Excel no contiene cortes válidos para restaurar.");
  }
  return { version: 1, exportedAt: string(info.exportedAt), snapshots };
}

function readSheet(workbook: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`Falta la hoja ${name} en el respaldo TML.`);
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
}

function string(value: unknown) { return String(value ?? "").trim(); }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function optionalNumber(value: unknown) { return value === "" || value == null ? null : number(value); }
