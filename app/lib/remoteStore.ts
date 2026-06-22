"use client";

import { notifyStorageChange } from "./storageEvents";

const cache = new Map<string, unknown[]>();
const loading = new Map<string, Promise<void>>();

export function clearRemoteCache() {
  cache.clear();
  loading.clear();
  notifyStorageChange();
}

export function readRemoteRecords<T>(endpoint: string): T[] {
  const cached = cache.get(endpoint);

  if (!cached && !loading.has(endpoint)) {
    const request = fetch(endpoint, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          if (response.status === 401 && window.location.pathname !== "/") window.location.assign("/");
          throw new Error(
            body.error || "No se pudieron consultar los datos."
          );
        }

        // 🔥 FIX IMPORTANTE: soportar varios formatos
        const data =
          body.records ??
          body.persona ??
          body.data ??
          [];

        cache.set(endpoint, Array.isArray(data) ? data : data ? [data] : []);

        notifyStorageChange();
      })
      .catch(() => {
        cache.set(endpoint, []);
      })
      .finally(() => loading.delete(endpoint));

    loading.set(endpoint, request);
  }

  return (cached ?? []) as T[];
}

export async function saveRemoteRecords<T>(
  endpoint: string,
  records: T[]
) {
  cache.set(endpoint, records);
  notifyStorageChange();

  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && window.location.pathname !== "/") window.location.assign("/");
    throw new Error(
      body.error || "No se pudieron guardar los datos en Supabase."
    );
  }

  cache.set(endpoint, Array.isArray(body.records) ? body.records : records);
  notifyStorageChange();
}
