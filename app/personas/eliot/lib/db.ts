import type { BackupPayload, PinRecord, TdSnapshot } from "./types";

const ENDPOINT = "/api/people/atrasos";

export async function listSnapshots(): Promise<TdSnapshot[]> {
  const body = await requestJson(ENDPOINT);
  const snapshots = Array.isArray(body.snapshots) ? (body.snapshots as TdSnapshot[]) : [];
  const incomplete = snapshots.filter(isIncompleteSnapshot);
  for (const snapshot of incomplete) await deleteSnapshot(snapshot.id);
  return snapshots.filter((snapshot) => !isIncompleteSnapshot(snapshot));
}

export async function saveSnapshot(snapshot: TdSnapshot) {
  await requestJson(ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshot }),
  });
}

export async function deleteSnapshot(id: string) {
  await requestJson(`${ENDPOINT}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function findSnapshotByHash(hash: string) {
  const snapshots = await listSnapshots();
  const existing = snapshots.find((snapshot) => snapshot.fileHash === hash);
  if (existing && isIncompleteSnapshot(existing)) {
    await deleteSnapshot(existing.id);
    return null;
  }
  return existing ?? null;
}

function isIncompleteSnapshot(snapshot: TdSnapshot) {
  if (!snapshot.rows.length) return true;
  return !snapshot.rows.some((row) => Object.values(row.crew).some((member) => member.validPerson));
}

export async function getPinRecord(): Promise<PinRecord | null> {
  const body = await requestJson(`${ENDPOINT}?resource=settings`);
  return body.pin ?? null;
}

export async function savePinRecord(record: PinRecord) {
  await requestJson(ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: record }),
  });
}

export async function clearApplicationData() {
  await requestJson(ENDPOINT, { method: "DELETE" });
  await requestJson(`${ENDPOINT}?resource=settings`, { method: "DELETE" });
}

export async function createBackup(): Promise<BackupPayload> {
  return { version: 1, exportedAt: new Date().toISOString(), snapshots: await listSnapshots() };
}

export async function restoreBackup(payload: BackupPayload) {
  if (payload?.version !== 1 || !Array.isArray(payload.snapshots)) throw new Error("El respaldo no tiene un formato compatible.");
  for (const snapshot of payload.snapshots) await saveSnapshot(snapshot);
}

async function requestJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "No fue posible conectar con Supabase.");
  return body;
}
