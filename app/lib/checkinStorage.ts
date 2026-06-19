import { normalizeDt } from "./modulacionStorage";

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

  const current = localStorage.getItem(CHECKIN_STORAGE_KEY);
  if (!current) return [];

  try {
    const parsed = JSON.parse(current);
    return Array.isArray(parsed) ? (parsed as CheckinCajasRegistro[]) : [];
  } catch {
    return [];
  }
}

export function saveCheckinCajasRegistros(records: CheckinCajasRegistro[]) {
  localStorage.setItem(CHECKIN_STORAGE_KEY, JSON.stringify(records));
  window.dispatchEvent(new Event("storage"));
}

export function removeCheckinByDt(dt: string | number | undefined) {
  const targetDt = normalizeDt(dt);
  if (!targetDt || typeof window === "undefined") return;

  const records = readCheckinCajasRegistros();
  const nextRecords = records.filter((record) => normalizeDt(record.dt) !== targetDt);
  saveCheckinCajasRegistros(nextRecords);
}

export function getCheckinByDt(records: CheckinCajasRegistro[], dt: string | number | undefined) {
  const targetDt = normalizeDt(dt);
  if (!targetDt) return undefined;

  return records.find((record) => normalizeDt(record.dt) === targetDt);
}

export function upsertCheckinCajas(records: CheckinCajasRegistro[], dt: string | number | undefined, totalCajas: number) {
  const targetDt = normalizeDt(dt);
  const now = new Date().toISOString();
  const cleanTotal = Math.max(Math.floor(totalCajas), 0);
  const existing = getCheckinByDt(records, targetDt);

  if (!existing) {
    return [
      {
        id: crypto.randomUUID(),
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
