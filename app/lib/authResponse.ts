// Only credential rejections mean the session is invalid. Service failures do not.
export function isRejectedAuthResponse(response: { ok: boolean; status: number }, refresh = false) {
  if (response.ok) return false;
  if (response.status === 401 || response.status === 403 || (refresh && response.status === 400)) return true;
  throw new Error("No se pudo verificar la sesión en este momento. Intenta nuevamente.");
}

export function sharePendingAuthRequests<T>() {
  const pending = new Map<string, Promise<T>>();
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const existing = pending.get(key);
    if (existing) return existing;
    const request = Promise.resolve().then(load).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  };
}
