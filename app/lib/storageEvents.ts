"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

export const APP_STORAGE_EVENT = "bavaria-storage-change";
const STORAGE_PING_KEY = "bavaria-storage-ping";
let dataRevision = 0;
const keyedRevisions = new Map<string, number>();

function bumpRevisions(keys?: string[]) {
  if (keys?.length) {
    keys.forEach((key) => keyedRevisions.set(key, (keyedRevisions.get(key) || 0) + 1));
  } else {
    dataRevision += 1;
  }
}

export function notifyStorageChange(keys?: string | string[]) {
  if (typeof window === "undefined") return;

  const changedKeys = Array.isArray(keys) ? keys : keys ? [keys] : [];
  bumpRevisions(changedKeys);

  window.dispatchEvent(new Event(APP_STORAGE_EVENT));
  try {
    window.localStorage.setItem(STORAGE_PING_KEY, JSON.stringify({ keys: changedKeys, time: Date.now() }));
  } catch {
    // Ignore private mode/storage quota failures; same-tab events still work.
  }
}

export function subscribeToStorageChanges(onStoreChange: () => void) {
  window.addEventListener(APP_STORAGE_EVENT, onStoreChange);
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_PING_KEY) return;

    try {
      const payload = JSON.parse(event.newValue || "{}") as { keys?: string[] };
      bumpRevisions(payload.keys);
    } catch {
      bumpRevisions();
    }

    onStoreChange();
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(APP_STORAGE_EVENT, onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useStorageSnapshot<T>(storageKeys: string[], readSnapshot: () => T, serverSnapshot: T) {
  const cacheRef = useRef<{ signature: string; value: T } | null>(null);

  const getSnapshot = useCallback(() => {
    const keySignature = storageKeys.map((key) => `${key}:${keyedRevisions.get(key) || 0}`).join("\u001f");
    const signature = `${dataRevision}:${keySignature}`;
    const cached = cacheRef.current;

    if (cached && cached.signature === signature) return cached.value;

    const value = readSnapshot();
    cacheRef.current = { signature, value };
    return value;
  }, [readSnapshot, storageKeys]);

  return useSyncExternalStore(subscribeToStorageChanges, getSnapshot, () => serverSnapshot);
}
