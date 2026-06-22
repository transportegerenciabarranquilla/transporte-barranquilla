"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

export const APP_STORAGE_EVENT = "bavaria-storage-change";
let dataRevision = 0;

export function notifyStorageChange() {
  if (typeof window === "undefined") return;

  dataRevision += 1;
  window.dispatchEvent(new Event(APP_STORAGE_EVENT));
  window.dispatchEvent(new Event("storage"));
}

export function subscribeToStorageChanges(onStoreChange: () => void) {
  window.addEventListener(APP_STORAGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener(APP_STORAGE_EVENT, onStoreChange);
  };
}

export function useStorageSnapshot<T>(storageKeys: string[], readSnapshot: () => T, serverSnapshot: T) {
  const cacheRef = useRef<{ signature: string; value: T } | null>(null);

  const getSnapshot = useCallback(() => {
    const signature = `${dataRevision}:${storageKeys.join("\u001f")}`;
    const cached = cacheRef.current;

    if (cached && cached.signature === signature) return cached.value;

    const value = readSnapshot();
    cacheRef.current = { signature, value };
    return value;
  }, [readSnapshot, storageKeys]);

  return useSyncExternalStore(subscribeToStorageChanges, getSnapshot, () => serverSnapshot);
}
