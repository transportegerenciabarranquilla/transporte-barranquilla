type CacheEntry<T> = {
  expiresAt: number;
  promise?: Promise<T>;
  value?: T;
};

const serverCache = new Map<string, CacheEntry<unknown>>();

export function readServerCache<T>(key: string, ttlMs: number, load: () => Promise<T>) {
  const now = Date.now();
  const current = serverCache.get(key) as CacheEntry<T> | undefined;

  if (current?.value !== undefined && current.expiresAt > now) {
    return Promise.resolve(current.value);
  }

  if (current?.promise) return current.promise;

  const promise = load()
    .then((value) => {
      serverCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((error) => {
      serverCache.delete(key);
      throw error;
    });

  serverCache.set(key, { promise, expiresAt: now + ttlMs });
  return promise;
}

export function clearServerCache(prefix?: string) {
  if (!prefix) {
    serverCache.clear();
    return;
  }

  Array.from(serverCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) serverCache.delete(key);
  });
}

export async function cachedJsonFetch<T>(key: string, ttlMs: number, url: string, init: RequestInit) {
  return readServerCache<T>(key, ttlMs, async () => {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        body && typeof body === "object" && ("message" in body || "error" in body)
          ? String((body as { message?: unknown; error?: unknown }).message || (body as { error?: unknown }).error)
          : `Supabase respondio ${response.status}`;
      throw new Error(message);
    }

    return body as T;
  });
}
