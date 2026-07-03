"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, PackageSearch, Search, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { ASISTENCIA_STORAGE_KEY, readAsistenciaRegistros, type AsistenciaRegistro } from "../lib/asistenciaStorage";
import { MODULACION_STORAGE_KEY, readModulacionRegistros, type ModulacionRegistro } from "../lib/modulacionStorage";
import { refreshRemoteRecords } from "../lib/remoteStore";
import { readSeguimientoVehiculos, SEGUIMIENTO_STORAGE_KEY } from "../lib/seguimientoStorage";
import { useStorageSnapshot } from "../lib/storageEvents";
import type { Vehiculo } from "../seguimiento/types";

const REFRESH_MS = 60_000;
const MAX_RESULTS = 8;

type SearchResult = {
  id: string;
  title: string;
  detail: string;
  meta: string;
  href: string;
  type: "vehicle" | "attendance" | "modulation";
  score: number;
};

export function GlobalOperationsSearch({ isAdmin = false }: { isAdmin?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const vehicles = useStorageSnapshot<Vehiculo[]>([SEGUIMIENTO_STORAGE_KEY], readSeguimientoVehiculos, []);
  const attendances = useStorageSnapshot<AsistenciaRegistro[]>([ASISTENCIA_STORAGE_KEY], readAsistenciaRegistros, []);
  const modulaciones = useStorageSnapshot<ModulacionRegistro[]>([MODULACION_STORAGE_KEY], readModulacionRegistros, []);

  useEffect(() => {
    if (!isAdmin) return;

    void refreshRemoteRecords("/api/seguimiento");
    void refreshRemoteRecords("/api/asistencias");
    void refreshRemoteRecords("/api/modulaciones");

    const interval = window.setInterval(() => {
      void refreshRemoteRecords("/api/seguimiento");
      void refreshRemoteRecords("/api/asistencias");
      void refreshRemoteRecords("/api/modulaciones");
    }, REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [isAdmin]);

  const results = useMemo(() => buildResults(query, vehicles, attendances, modulaciones), [attendances, modulaciones, query, vehicles]);

  if (!isAdmin) return null;

  return (
    <section className="mb-7 rounded-lg border border-slate-200 bg-white/90 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,420px)_1fr] lg:items-start">
        <div>
          <p className="text-sm font-medium text-slate-500">Busqueda global</p>
          <h2 className="text-2xl font-semibold text-[#10223d]">Encuentra DT, placa o responsable</h2>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={18} />
          <input
            className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#1264ff] focus:ring-2 focus:ring-[#1264ff]/10"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por DT, placa, cedula, nombre, cliente o contratista"
            value={query}
          />

          {query.trim() ? (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {results.length ? (
                results.map((result) => (
                  <button
                    className="flex w-full items-start gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-b-0 hover:bg-slate-50"
                    key={result.id}
                    onClick={() => router.push(result.href)}
                    type="button"
                  >
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-100 text-[#10223d]">
                      <ResultIcon type={result.type} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#10223d]">{result.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">{result.detail}</span>
                    </span>
                    <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{result.meta}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-sm text-slate-500">No hay resultados para esa busqueda.</div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function buildResults(query: string, vehicles: Vehiculo[], attendances: AsistenciaRegistro[], modulaciones: ModulacionRegistro[]) {
  const needle = normalizeSearch(query);
  if (needle.length < 2) return [];

  const results: SearchResult[] = [
    ...vehicles.map((vehicle, index) => vehicleResult(vehicle, index, needle)),
    ...attendances.map((attendance, index) => attendanceResult(attendance, index, needle)),
    ...modulaciones.map((modulacion, index) => modulationResult(modulacion, index, needle)),
  ].filter((result): result is SearchResult => Boolean(result));

  return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "es-CO", { numeric: true })).slice(0, MAX_RESULTS);
}

function vehicleResult(vehicle: Vehiculo, index: number, needle: string): SearchResult | null {
  const dt = normalizeDt(vehicle.transporte);
  const haystack = normalizeSearch(
    [
      dt,
      vehicle.transporte,
      vehicle.vehiculo,
      vehicle.responsable,
      vehicle.nombreResponsable,
      vehicle.cedulaResponsable,
      vehicle.territorio,
      vehicle.transportista,
    ].join(" "),
  );
  const score = scoreMatch(haystack, needle, [normalizeSearch(dt), normalizeSearch(vehicle.vehiculo), normalizeSearch(vehicle.cedulaResponsable)]);
  if (!score) return null;

  const params = new URLSearchParams();
  params.set("q", dt || vehicle.vehiculo || vehicle.responsable || needle);
  const date = toDateKey(vehicle.fechaDespacho || vehicle.date || vehicle.createdAt);
  if (date) params.set("fecha", date);

  return {
    id: `vehicle-${vehicle.recordId || dt || index}`,
    title: `DT ${dt || vehicle.transporte || "sin dato"} - ${vehicle.vehiculo || "sin placa"}`,
    detail: `${vehicle.responsable || vehicle.nombreResponsable || "Sin responsable"} - ${vehicle.transportista || "Sin contratista"}`,
    meta: "Seguimiento",
    href: `/seguimiento?${params.toString()}`,
    type: "vehicle",
    score,
  };
}

function attendanceResult(attendance: AsistenciaRegistro, index: number, needle: string): SearchResult | null {
  const dt = normalizeDt(attendance.dt);
  const haystack = normalizeSearch(
    [
      dt,
      attendance.dt,
      attendance.contratista,
      attendance.cedulaResponsable,
      attendance.nombreResponsable,
      attendance.cedulaAuxiliar1,
      attendance.nombreAuxiliar1,
      attendance.cedulaAuxiliar2,
      attendance.nombreAuxiliar2,
    ].join(" "),
  );
  const score = scoreMatch(haystack, needle, [normalizeSearch(dt), normalizeSearch(attendance.cedulaResponsable)]);
  if (!score) return null;

  const params = new URLSearchParams();
  params.set("q", dt || attendance.cedulaResponsable || needle);
  const date = toDateKey(attendance.createdAt);
  if (date) params.set("fecha", date);

  return {
    id: `attendance-${attendance.id || index}`,
    title: `Asistencia DT ${dt || attendance.dt || "sin dato"}`,
    detail: `${attendance.nombreResponsable || attendance.cedulaResponsable || "Responsable sin nombre"} - ${attendance.contratista}`,
    meta: "Asistencia",
    href: `/seguimiento?${params.toString()}`,
    type: "attendance",
    score,
  };
}

function modulationResult(modulacion: ModulacionRegistro, index: number, needle: string): SearchResult | null {
  const dt = normalizeDt(modulacion.dt);
  const haystack = normalizeSearch(
    [
      dt,
      modulacion.dt,
      modulacion.contratista,
      modulacion.codigoCliente,
      modulacion.nombreCliente,
      modulacion.persona,
      modulacion.personaNombre,
      modulacion.preventista,
      modulacion.preventistaNombre,
      modulacion.causal,
    ].join(" "),
  );
  const score = scoreMatch(haystack, needle, [normalizeSearch(dt), normalizeSearch(modulacion.codigoCliente)]);
  if (!score) return null;

  const params = new URLSearchParams();
  params.set("q", dt || modulacion.codigoCliente || needle);
  const date = toDateKey(modulacion.fechaDespacho || modulacion.fechaDt || modulacion.createdAt);
  if (date) params.set("fecha", date);

  return {
    id: `modulation-${modulacion.id || index}`,
    title: `Modulacion DT ${dt || modulacion.dt || "sin dato"}`,
    detail: `${modulacion.nombreCliente || modulacion.codigoCliente || "Cliente sin nombre"} - ${modulacion.causal || "Sin causal"}`,
    meta: "Modulacion",
    href: `/seguimiento?${params.toString()}`,
    type: "modulation",
    score,
  };
}

function ResultIcon({ type }: { type: SearchResult["type"] }) {
  if (type === "vehicle") return <Truck size={18} />;
  if (type === "attendance") return <ClipboardCheck size={18} />;
  return <PackageSearch size={18} />;
}

function scoreMatch(haystack: string, needle: string, priorityValues: string[]) {
  if (!haystack.includes(needle)) return 0;
  if (priorityValues.some((value) => value === needle)) return 100;
  if (priorityValues.some((value) => value.startsWith(needle))) return 80;
  return haystack.startsWith(needle) ? 60 : 40;
}

function normalizeSearch(value: string | number | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeDt(value: string | number | undefined) {
  return String(value ?? "")
    .replace(/^DT-?/i, "")
    .replace(/\D/g, "");
}

function toDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(Number);
    if ([day, month, year].every(Number.isFinite)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}
