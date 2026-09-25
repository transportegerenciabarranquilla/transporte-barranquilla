"use client";

import { notifyStorageChange } from "./storageEvents";
import { mergeSeguimientoVersions } from "./seguimientoPersistence";
import type { Vehiculo } from "../seguimiento/types";

const cache = new Map<string, unknown[]>();
const loading = new Map<string, Promise<void>>();
const fetchedAt = new Map<string, number>();
const saveQueues = new Map<string, Promise<void>>();
const mutationVersions = new Map<string, number>();
const preserveAfterWriteUntil = new Map<string, number>();
let cacheGeneration = 0;
const REMOTE_CACHE_TTL_MS = 120_000;
const PUBLIC_ROUTES = ["/asistencia", "/registro-modulacion"];
const ENDPOINT_STORAGE_KEYS: Record<string, string> = {
  "/api/asistencias": "bavaria.asistencia.registros",
  "/api/checkins": "bavaria.checkin.cajas",
  "/api/modulaciones": "bavaria.modulacion.registros",
  "/api/punto-corona-routes": "bavaria.punto-corona.routes",
  "/api/seguimiento": "bavaria.seguimiento.vehiculos",
};
const MODULACIONES_ENDPOINT = "/api/modulaciones";
const MODULACIONES_PENDING_KEY = "bavaria.modulacion.confirmadas";

function shouldRedirectOnUnauthorized() {
  if (typeof window === "undefined") return false;
  if (window.location.pathname === "/") return false;
  return !PUBLIC_ROUTES.some((route) => window.location.pathname.startsWith(route));
}

export function clearRemoteCache() {
  cacheGeneration += 1;
  cache.clear();
  loading.clear();
  fetchedAt.clear();
  notifyStorageChange();
}

export function refreshRemoteRecords(endpoint: string, options: { force?: boolean; requestUrl?: string } = {}) {
  // No leer una versión anterior mientras hay escrituras en curso.
  if (saveQueues.has(endpoint)) return saveQueues.get(endpoint);
  const lastFetch = fetchedAt.get(endpoint) || 0;
  if (!options.force && cache.has(endpoint) && Date.now() - lastFetch < REMOTE_CACHE_TTL_MS) {
    return Promise.resolve();
  }
  if (loading.has(endpoint)) return loading.get(endpoint);

  const mutationVersion = mutationVersions.get(endpoint) || 0;
  const generation = cacheGeneration;
  const request = fetch(options.requestUrl || endpoint, { cache: "no-store" })
    .then(async (response) => {
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401 && shouldRedirectOnUnauthorized()) window.location.assign("/");
        throw new Error(body.error || "No se pudieron consultar los datos.");
      }

      const data = body.records ?? body.persona ?? body.data ?? [];
      // Si hubo una edición mientras esta lectura estaba en curso, su
      // respuesta ya es obsoleta y no debe reemplazar la caché optimista.
      if (generation !== cacheGeneration || (mutationVersions.get(endpoint) || 0) !== mutationVersion) return;
      const incomingRecords = Array.isArray(data) ? data : data ? [data] : [];
      const cachedRecords = cache.get(endpoint) ?? [];
      // Supabase puede responder una lista anterior justo despues del PUT
      // (por replica, cache o una politica RLS que aun se esta propagando).
      // No dejamos que esa respuesta reduzca la lista optimista recien
      // guardada; el siguiente refresco normal la confirmara.
      const preserveOptimisticRecords =
        (preserveAfterWriteUntil.get(endpoint) ?? 0) > Date.now()
        && incomingRecords.length < cachedRecords.length;
      if (preserveOptimisticRecords) return;
      const nextRecords = endpoint === "/api/seguimiento"
        ? mergeSeguimientoVersions(cachedRecords as Vehiculo[], incomingRecords as Vehiculo[])
        : incomingRecords;
      const changed = !cache.has(endpoint) || !sameJsonValue(cachedRecords, nextRecords);
      if (changed) cache.set(endpoint, nextRecords);
      if (endpoint === MODULACIONES_ENDPOINT) removeConfirmedModulaciones(incomingRecords);
      fetchedAt.set(endpoint, Date.now());
      if (changed) notifyStorageChange(ENDPOINT_STORAGE_KEYS[endpoint]);
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

  if (endpoint !== MODULACIONES_ENDPOINT) return (cached ?? []) as T[];

  // El formulario publico y el modulador pueden abrirse en momentos
  // distintos. Si RLS aun no devuelve el registro confirmado, conservamos
  // su copia local y la fusionamos con la lectura remota por id.
  return mergeCachedRecords(readPersistedModulaciones() as T[], (cached ?? []) as T[], (record) => recordId(record)) as T[];
}

export function waitForRemoteSaves(endpoint: string) {
  return saveQueues.get(endpoint) ?? Promise.resolve();
}

export function saveRemoteRecords<T>(
  endpoint: string,
  records: T[],
  options: { extraBody?: Record<string, unknown>; mergeByKey?: (record: T) => string; method?: "PUT" | "PATCH"; prepareRecords?: (current: T[]) => T[] } = {},
) {
  const mutationVersion = (mutationVersions.get(endpoint) || 0) + 1;
  const generation = cacheGeneration;
  mutationVersions.set(endpoint, mutationVersion);
  const previousSave = saveQueues.get(endpoint) ?? Promise.resolve();
  const operation = previousSave.catch(() => undefined).then(async () => {
    if (generation !== cacheGeneration) throw new Error("La sesión cambió. Recarga antes de guardar.");
    const previousRecords = cache.get(endpoint);
    records = options.prepareRecords?.((previousRecords ?? []) as T[]) ?? records;
    cache.set(endpoint, options.mergeByKey ? mergeCachedRecords(previousRecords as T[] | undefined, records, options.mergeByKey) : records);
    notifyStorageChange(ENDPOINT_STORAGE_KEYS[endpoint]);

    try {
      const response = await fetch(endpoint, {
        method: options.method || "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options.method === "PATCH" ? options.extraBody : { records, ...options.extraBody }),
        cache: "no-store",
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401 && shouldRedirectOnUnauthorized()) window.location.assign("/");
        throw new Error(
          body.error || "No se pudieron guardar los datos en Supabase."
        );
      }

      // Una escritura con registros no puede vaciar la tabla local solo porque
      // una lectura posterior quedó temporalmente oculta por RLS o caché. Se
      // conserva la versión optimista hasta el próximo refresco válido.
      if (options.method === "PATCH" && (!body.record || typeof body.record !== "object")) {
        throw new Error("El servidor no confirmó el registro actualizado.");
      }
      const savedRecords = options.method === "PATCH" ? [body.record] : Array.isArray(body.records) && (body.records.length > 0 || records.length === 0)
        ? body.records
        : records;
      // Los PATCH se ejecutan en cola: confirmar cada respuesta antes de
      // empezar la siguiente evita perder campos si después falla un guardado.
      if (generation === cacheGeneration && (endpoint === "/api/seguimiento" || options.method === "PATCH" || (mutationVersions.get(endpoint) || 0) === mutationVersion)) {
        cache.set(endpoint, options.mergeByKey ? mergeCachedRecords(previousRecords as T[] | undefined, savedRecords, options.mergeByKey) : savedRecords);
        if (endpoint === MODULACIONES_ENDPOINT) persistConfirmedModulaciones(savedRecords);
        fetchedAt.set(endpoint, Date.now());
        preserveAfterWriteUntil.set(endpoint, Date.now() + 60_000);
        notifyStorageChange(ENDPOINT_STORAGE_KEYS[endpoint]);
      }
      return savedRecords as T[];
    } catch (error) {
      if (generation === cacheGeneration && (endpoint === "/api/seguimiento" || options.method === "PATCH" || (mutationVersions.get(endpoint) || 0) === mutationVersion)) {
        if (previousRecords) {
          cache.set(endpoint, previousRecords);
        } else {
          cache.delete(endpoint);
        }
        notifyStorageChange(ENDPOINT_STORAGE_KEYS[endpoint]);
      }

      throw error;
    }
  });

  const queueTail = operation.then(() => undefined, () => undefined);
  saveQueues.set(endpoint, queueTail);
  void queueTail.finally(() => {
    if (saveQueues.get(endpoint) === queueTail) saveQueues.delete(endpoint);
  });

  return operation;
}

export async function deleteRemoteRecords<T>(
  endpoint: string,
  ids: string[],
  options: { extraBody?: Record<string, unknown>; getKey?: (record: T) => string } = {},
) {
  mutationVersions.set(endpoint, (mutationVersions.get(endpoint) || 0) + 1);
  const previousRecords = cache.get(endpoint) as T[] | undefined;
  const idSet = new Set(ids);
  const getKey = options.getKey ?? ((record: T) => String((record as { id?: string }).id ?? ""));

  if (previousRecords) {
    cache.set(endpoint, previousRecords.filter((record) => !idSet.has(getKey(record))));
    notifyStorageChange(ENDPOINT_STORAGE_KEYS[endpoint]);
  }

  try {
    const response = await fetch(endpoint, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, ...options.extraBody }),
      cache: "no-store",
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && shouldRedirectOnUnauthorized()) window.location.assign("/");
      throw new Error(body.error || "No se pudieron eliminar los datos en Supabase.");
    }
    if (endpoint === MODULACIONES_ENDPOINT) removePersistedModulaciones(ids);

    fetchedAt.set(endpoint, Date.now());
    notifyStorageChange(ENDPOINT_STORAGE_KEYS[endpoint]);
  } catch (error) {
    if (previousRecords) cache.set(endpoint, previousRecords);
    notifyStorageChange(ENDPOINT_STORAGE_KEYS[endpoint]);
    throw error;
  }
}

function mergeCachedRecords<T>(previousRecords: T[] | undefined, records: T[], getKey: (record: T) => string) {
  const merged = new Map((previousRecords ?? []).map((record) => [getKey(record), record]));

  records.forEach((record) => {
    merged.set(getKey(record), record);
  });

  return Array.from(merged.values());
}

function readPersistedModulaciones() {
  if (typeof window === "undefined") return [] as unknown[];
  try {
    const records = JSON.parse(window.localStorage.getItem(MODULACIONES_PENDING_KEY) || "[]");
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function writePersistedModulaciones(records: unknown[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODULACIONES_PENDING_KEY, JSON.stringify(records));
  } catch {
    // La aplicacion sigue funcionando aunque el navegador bloquee almacenamiento local.
  }
}

function persistConfirmedModulaciones(records: unknown[]) {
  const byId = new Map(readPersistedModulaciones().map((record) => [recordId(record), record]));
  records.forEach((record) => {
    const id = recordId(record);
    if (id) byId.set(id, record);
  });
  writePersistedModulaciones(Array.from(byId.values()));
}

function removeConfirmedModulaciones(records: unknown[]) {
  const confirmedIds = new Set(records.map(recordId).filter(Boolean));
  if (!confirmedIds.size) return;
  writePersistedModulaciones(readPersistedModulaciones().filter((record) => !confirmedIds.has(recordId(record))));
}

function removePersistedModulaciones(ids: string[]) {
  const removed = new Set(ids);
  writePersistedModulaciones(readPersistedModulaciones().filter((record) => !removed.has(recordId(record))));
}

function recordId(record: unknown) {
  return typeof record === "object" && record !== null && "id" in record
    ? String((record as { id?: unknown }).id || "")
    : "";
}

// Las respuestas JSON idénticas no deben invalidar todos los cálculos y tablas.
// Comparamos también campos anidados; una marca de fecha sola no es suficiente.
function sameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left)) {
    return Array.isArray(right) && left.length === right.length && left.every((value, index) => sameJsonValue(value, right[index]));
  }
  if (Array.isArray(right)) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  return keys.length === Object.keys(rightRecord).length && keys.every((key) =>
    Object.prototype.hasOwnProperty.call(rightRecord, key) && sameJsonValue(leftRecord[key], rightRecord[key]));
}
