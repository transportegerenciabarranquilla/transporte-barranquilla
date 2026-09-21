import { normalizeDt } from "./modulacionStorage";
import { deleteRemoteRecords, readRemoteRecords, saveRemoteRecords } from "./remoteStore";

export const CHECKIN_STORAGE_KEY = "bavaria.checkin.cajas";

export type CheckinCajasRegistro = {
  id: string;
  dt: string;
  totalCajas: number;
  createdAt: string;
  updatedAt: string;
};

export function readCheckinCajasRegistros() {
  if (typeof window === "undefined") return [];

  return readRemoteRecords<CheckinCajasRegistro>("/api/checkins");
}

export function saveCheckinCajasRegistros(records: CheckinCajasRegistro[]) {
  return saveRemoteRecords("/api/checkins", records);
}

export function saveCheckinCajasRegistro(record: CheckinCajasRegistro) {
  return saveRemoteRecords("/api/checkins", [record], {
    extraBody: { deleteMissing: false },
    mergeByKey: (item) => normalizeDt(item.dt),
  });
}

export function deleteCheckinCajasRegistro(record: CheckinCajasRegistro) {
  return deleteRemoteRecords<CheckinCajasRegistro>("/api/checkins", [record.id]);
}

export function removeCheckinByDt(dt: string | number | undefined) {
  const targetDt = normalizeDt(dt);
  if (!targetDt || typeof window === "undefined") return;

  const records = readCheckinCajasRegistros();
  const nextRecords = records.filter((record) => normalizeDt(record.dt) !== targetDt);
  void saveCheckinCajasRegistros(nextRecords).catch(() => undefined);
}

export function getCheckinByDt(
  records: CheckinCajasRegistro[],
  dt: string | number | undefined,
  options: { contractor?: string; dateKey?: string } = {},
) {
  const targetDt = normalizeDt(dt);
  if (!targetDt) return undefined;

  const matches = records.filter((record) => {
    const matchDt = normalizeDt(record.dt) === targetDt;
    const matchContractor = !options.contractor || normalizeContractor(options.contractor) === normalizeContractor((record as CheckinCajasRegistro & { contratista?: string }).contratista ?? "");
    const matchDate = !options.dateKey || !record.createdAt || normalizeDateKey(record.createdAt) === normalizeDateKey(options.dateKey);
    return matchDt && matchContractor && matchDate;
  });

  if (!matches.length) return undefined;

  return matches.sort((left, right) => getTimestamp(right.updatedAt || right.createdAt) - getTimestamp(left.updatedAt || left.createdAt))[0];
}

export function upsertCheckinCajas(records: CheckinCajasRegistro[], dt: string | number | undefined, totalCajas: number) {
  const targetDt = normalizeDt(dt);
  const now = new Date().toISOString();
  const cleanTotal = Math.max(Math.floor(totalCajas), 0);
  const existing = getCheckinByDt(records, targetDt);

  if (!existing) {
    return [
      {
        id: createCheckinId(),
        dt: targetDt,
        totalCajas: cleanTotal,
        createdAt: now,
        updatedAt: now,
      },
      ...records,
    ];
  }

  return records.map((record) =>
    normalizeDt(record.dt) === targetDt
      ? {
          ...record,
          totalCajas: cleanTotal,
          updatedAt: now,
        }
      : record,
  );
}

function normalizeContractor(value: string | undefined) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function getTimestamp(value: string | undefined) {
  const parsed = new Date(value || "").getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function createCheckinId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `checkin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
