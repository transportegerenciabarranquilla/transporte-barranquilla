"use client";

export class ApiQueryError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function apiQuery<T>(url: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 25_000);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    const body = await response.json();
    if (!response.ok) {
      if (response.status === 401) window.dispatchEvent(new Event("bavaria-session-invalid"));
      throw new ApiQueryError(body.error || "No se pudieron consultar los datos.", response.status);
    }
    return body as T;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new ApiQueryError("La conexión está tardando demasiado. Tus datos anteriores siguen disponibles; vuelve a intentar.", 408);
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
