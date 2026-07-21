import type { BackupPayload, PinRecord, TdSnapshot } from "./types";
import { deleteCloudSnapshot, listCloudSnapshots, saveCloudSnapshot } from "./supabase-db";

const DB_NAME = "control-td-tripulaciones";
const DB_VERSION = 1;
const SNAPSHOTS_STORE = "snapshots";
const SETTINGS_STORE = "settings";
const PIN_KEY = "pin";

type SettingRecord<T> = { key: string; value: T };

export async function listSnapshots(): Promise<TdSnapshot[]> {
  const localSnapshots = await listLocalSnapshots();
  try {
    let cloudSnapshots = await listCloudSnapshots();
    const cloudIds = new Set(cloudSnapshots.map((snapshot) => snapshot.id));
    const pending = localSnapshots.filter((snapshot) => !cloudIds.has(snapshot.id));
    for (const snapshot of pending) await saveCloudSnapshot(snapshot);
    if (pending.length) cloudSnapshots = await listCloudSnapshots();
    return cloudSnapshots;
  } catch {
    return localSnapshots;
  }
}

async function listLocalSnapshots(): Promise<TdSnapshot[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SNAPSHOTS_STORE, "readonly").objectStore(SNAPSHOTS_STORE).getAll();
    request.onsuccess = () => resolve((request.result as TdSnapshot[]).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)));
    request.onerror = () => reject(request.error);
  });
}

export async function saveSnapshot(snapshot: TdSnapshot) {
  await saveCloudSnapshot(snapshot);
  const db = await openDatabase();
  await transactionRequest(db, SNAPSHOTS_STORE, "readwrite", (store) => store.put(snapshot));
}

export async function deleteSnapshot(id: string) {
  await deleteCloudSnapshot(id);
  const db = await openDatabase();
  await transactionRequest(db, SNAPSHOTS_STORE, "readwrite", (store) => store.delete(id));
}

export async function findSnapshotByHash(hash: string) {
  const snapshots = await listSnapshots();
  return snapshots.find((snapshot) => snapshot.fileHash === hash) ?? null;
}

export async function getPinRecord(): Promise<PinRecord | null> {
  return getSetting<PinRecord>(PIN_KEY);
}

export async function savePinRecord(record: PinRecord) {
  return setSetting(PIN_KEY, record);
}

export async function clearApplicationData() {
  const db = await openDatabase();
  await Promise.all([
    transactionRequest(db, SNAPSHOTS_STORE, "readwrite", (store) => store.clear()),
    transactionRequest(db, SETTINGS_STORE, "readwrite", (store) => store.clear()),
  ]);
}

export async function createBackup(): Promise<BackupPayload> {
  return { version: 1, exportedAt: new Date().toISOString(), snapshots: await listSnapshots() };
}

export async function restoreBackup(payload: BackupPayload) {
  if (payload?.version !== 1 || !Array.isArray(payload.snapshots)) throw new Error("El respaldo no tiene un formato compatible.");
  for (const snapshot of payload.snapshots) await saveCloudSnapshot(snapshot);
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(SNAPSHOTS_STORE, "readwrite");
    const store = transaction.objectStore(SNAPSHOTS_STORE);
    payload.snapshots.forEach((snapshot) => store.put(snapshot));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function getSetting<T>(key: string): Promise<T | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).get(key);
    request.onsuccess = () => resolve((request.result as SettingRecord<T> | undefined)?.value ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function setSetting<T>(key: string, value: T) {
  const db = await openDatabase();
  await transactionRequest(db, SETTINGS_STORE, "readwrite", (store) => store.put({ key, value } satisfies SettingRecord<T>));
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Este navegador no permite almacenamiento local IndexedDB."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) db.createObjectStore(SNAPSHOTS_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionRequest(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest,
) {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = createRequest(transaction.objectStore(storeName));
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
