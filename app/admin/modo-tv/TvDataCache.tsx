"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Vehiculo } from "../../seguimiento/types";
import type { PuntoCoronaRouteReport } from "../../lib/puntoCoronaRoutesStorage";

type SeguimientoData = {
  records: Vehiculo[];
  modulationRacocimi2: { contractor: string; date: string; modulationBoxes: number }[];
  refusalByComRows: Array<{
    causal: string;
    contractor: string;
    codigoCliente: string;
    com: string;
    date: string;
    dt: string;
    jefeVentas: string;
    nombreCliente: string;
    preventista: string;
    reportadas: number;
    gestionadas: number;
    refusalFinal: number;
  }>;
  today: string;
};
type RangoData = {
  reports: { id: string; contractor: string; operationalDate: string; kind: PuntoCoronaRouteReport["kind"]; uploadedAt?: string; updatedAt: string; summary: PuntoCoronaRouteReport["summary"] }[];
};
const EMPTY_SEGUIMIENTO: SeguimientoData = { records: [], modulationRacocimi2: [], refusalByComRows: [], today: "" };
const EMPTY_RANGO: RangoData = { reports: [] };
function seguimientoData(body: SeguimientoData): SeguimientoData {
  if (!Array.isArray(body.records) || !Array.isArray(body.modulationRacocimi2) || !Array.isArray(body.refusalByComRows) || typeof body.today !== "string") {
    throw new Error("La respuesta de seguimiento no es válida.");
  }
  return {
    records: body.records,
    modulationRacocimi2: body.modulationRacocimi2,
    refusalByComRows: body.refusalByComRows,
    today: body.today,
  };
}
function rangoData(body: RangoData): RangoData {
  if (!Array.isArray(body.reports)) throw new Error("La respuesta de rango no es válida.");
  return { reports: body.reports };
}

// This hook lives in the shared TV layout, so navigation never clears its data.
function useCachedEndpoint<T>(url: string, empty: T, select: (body: T) => T) {
  const [snapshot, setSnapshot] = useState({ data: empty, updated: "", signature: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudieron actualizar los datos de TV.");
      const data = select(body);
      // Exclude the server clock: a new response is not necessarily new data.
      const signature = JSON.stringify(data);
      if (pending.current !== controller) return;
      setSnapshot((previous) => previous.signature === signature ? previous : {
        data, signature, updated: new Date().toISOString(),
      });
      setError("");
    } catch (caught) {
      if (pending.current !== controller) return;
      setError(controller.signal.aborted
        ? "La actualización tardó demasiado. Se conservan los últimos datos disponibles."
        : caught instanceof Error ? caught.message : "No se pudieron actualizar los datos de TV.");
    } finally {
      window.clearTimeout(timeout);
      if (pending.current === controller) {
        pending.current = null;
        setLoading(false);
      }
    }
  }, [url, select]);

  useEffect(() => {
    void load();
    const refresh = () => { if (!document.hidden) void load(); };
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      const controller = pending.current;
      pending.current = null;
      controller?.abort();
    };
  }, [load]);

  return { data: snapshot.data, updated: snapshot.updated, loading, error, load };
}

type TvCache = {
  seguimiento: ReturnType<typeof useCachedEndpoint<SeguimientoData>>;
  rango: ReturnType<typeof useCachedEndpoint<RangoData>>;
};
const TvDataContext = createContext<TvCache | null>(null);

export function TvDataCache({ children }: { children: ReactNode }) {
  const seguimiento = useCachedEndpoint("/api/admin/seguimiento?tv=1", EMPTY_SEGUIMIENTO, seguimientoData);
  const rango = useCachedEndpoint("/api/admin/rango?tv=1", EMPTY_RANGO, rangoData);
  return <TvDataContext.Provider value={{ seguimiento, rango }}>{children}</TvDataContext.Provider>;
}

export function useTvData() {
  const cache = useContext(TvDataContext);
  if (!cache) throw new Error("Falta el proveedor de datos de TV.");
  return cache;
}

export function useOptionalTvData() {
  return useContext(TvDataContext);
}
