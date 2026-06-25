"use client";

import { notifyStorageChange } from "./storageEvents";

const cache = new Map<string, unknown[]>();
const loading = new Map<string, Promise<void>>();
const PUBLIC_ROUTES = ["/asistencia", "/registro-modulacion"];
const ENDPOINT_STORAGE_KEYS: Record<string, string> = {
  "/api/asistencias": "bavaria.asistencia.registros",
  "/api/checkins": "bavaria.checkin.cajas",
  "/api/modulaciones": "bavaria.modulacion.registros",
  "/api/seguimiento": "bavaria.seguimiento.vehiculos",
};

function shouldRedirectOnUnauthorized() {
  if (typeof window === "undefined") return false;
  if (window.location.pathname === "/") return false;
  return !PUBLIC_ROUTES.some((route) => window.location.pathname.startsWith(route));
}

export function clearRemoteCache() {
  cache.clear();
  loading.clear();
  notifyStorageChange();
}

export function refreshRemoteRecords(endpoint: string) {
  if (loading.has(endpoint)) return loading.get(endpoint);

  const request = fetch(endpoint, { cache: "no-store" })
    .then(async (response) => {
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401 && shouldRedirectOnUnauthorized()) window.location.assign("/");
        throw new Error(body.error || "No se pudieron consultar los datos.");
      }

      const data = body.records ?? body.persona ?? body.data ?? [];
      cache.set(endpoint, Array.isArray(data) ? data : data ? [data] : []);
      notifyStorageChange(ENDPOINT_STORAGE_KEYS[endpoint]);
    })
    .catch(() => undefined)
    .finally(() => loading.delete(endpoint));

  loading.set(endpoint, request);
  return request;
}

export function readRemoteRecords<T>(endpoint: string): T[] {
  const cached = cache.get(endpoint);

  if (!cached && !loading.has(endpoint)) {
    void refreshRemoteRecords(endpoint);
  }

  return (cached ?? []) as T[];
}

export async function saveRemoteRecords<T>(
  endpoint: string,
  records: T[]
) {
  const previousRecords = cache.get(endpoint);
  cache.set(endpoint, records);
  notifyStorageChange(ENDPOINT_STORAGE_KEYS[endpoint]);

  try {
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
      cache: "no-store",
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && shouldRedirectOnUnauthorized()) window.location.assign("/");
      throw new Error(
        body.error || "No se pudieron guardar los datos en Supabase."
      );
    }

    const savedRecords = Array.isArray(body.records) ? body.records : records;
    cache.set(endpoint, savedRecords);
    notifyStorageChange(ENDPOINT_STORAGE_KEYS[endpoint]);
    return savedRecords as T[];
  } catch (error) {
    if (previousRecords) {
      cache.set(endpoint, previousRecords);
    } else {
      cache.delete(endpoint);
    }

    notifyStorageChange(ENDPOINT_STORAGE_KEYS[endpoint]);
    throw error;
  }
}
