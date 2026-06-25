"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, CalendarDays, ClipboardCheck, FileDown, FileSpreadsheet, PackageCheck, Trash2, Truck, Users, Boxes } from "lucide-react";
import { MetricCard } from "./components/MetricCard";
import { ModulacionNotificationAlert } from "./components/ModulacionNotificationAlert";
import { SeguimientoFilters } from "./components/SeguimientoFilters";
import { SeguimientoHero } from "./components/SeguimientoHero";
import { VehicleDrawer } from "./components/VehicleDrawer";
import { VehiclesTable } from "./components/VehiclesTable";
import {
  loadSeguimientoVehiculos,
  mergeVehiclesByDt,
  parseSeguimientoFile,
  prepareSeguimientoVehicles,
} from "./services/vehicleRecords";
import type { Vehiculo } from "./types";
import { calculateRouteTime, getProgress, getStatus, getVehicleUiKey } from "./utils";
import { removeAsistenciaByDt } from "../lib/asistenciaStorage";
import { removeCheckinByDt } from "../lib/checkinStorage";
import { getLocalDateKey, getOperationalModulaciones, readModulacionRegistros, type ModulacionRegistro, MODULACION_STORAGE_KEY } from "../lib/modulacionStorage";
import { saveSeguimientoVehiculos, SEGUIMIENTO_STORAGE_KEY } from "../lib/seguimientoStorage";
import { useStorageSnapshot } from "../lib/storageEvents";
import { useContractorBrand } from "../lib/contractorBranding";
import { refreshRemoteRecords } from "../lib/remoteStore";

const SEGUIMIENTO_DATE_FILTER_KEY = "bavaria.seguimiento.fechaFiltro";
const MODULACION_ALERT_VISIBLE_MS = 5 * 60 * 1000;
const DATA_REFRESH_MS = 1500;
const SEGUIMIENTO_SAVE_DEBOUNCE_MS = 200;

export default function SeguimientoPage() {
  const router = useRouter();
  const brand = useContractorBrand();
  const [vehiculoSeleccionado, setVehiculoSeleccionado] = useState<Vehiculo | null>(null);
  const [vehiculoSeleccionadoKey, setVehiculoSeleccionadoKey] = useState<string | null>(null);
  const storedVehiculos = useStorageSnapshot<Vehiculo[]>(
    [SEGUIMIENTO_STORAGE_KEY],
    loadSeguimientoVehiculos,
    [],
  );
  const modulaciones = useStorageSnapshot<ModulacionRegistro[]>([MODULACION_STORAGE_KEY], readModulacionRegistros, []);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [fechaDtFilter, setFechaDtFilter] = useState("");
  const [onlyWithoutResponsible, setOnlyWithoutResponsible] = useState(false);
  
  const [importMessage, setImportMessage] = useState("");
  const [modulacionAlertDismissed, setModulacionAlertDismissed] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [dateLabel, setDateLabel] = useState("");
  const pendingLocalSaveRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDateLabel(new Date().toLocaleDateString("es-CO"));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const urlDate = new URLSearchParams(window.location.search).get("fecha") || "";
    const storedDate = sessionStorage.getItem(SEGUIMIENTO_DATE_FILTER_KEY) || "";
    const nextDate = urlDate || storedDate;
    if (!nextDate) return;

    const timeout = window.setTimeout(() => setFechaDtFilter(nextDate), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (pendingLocalSaveRef.current) return;
    setVehiculos((current) => mergeStoredVehiclesPreservingProgress(current, storedVehiculos));
  }, [storedVehiculos]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  const matchingVehicles = useMemo(() => {
    return vehiculos.filter((item) => {
      const searchable = `${item.vehiculo} ${item.transporte} ${item.responsable} ${item.territorio} ${item.moduladores?.join(" ")}`;
      const matchesSearch = searchable.toLowerCase().includes(search.toLowerCase());
      const matchesFechaDt = !fechaDtFilter || toDateKey(item.fechaDespacho) === fechaDtFilter;
      const matchesResponsible = !onlyWithoutResponsible || isWithoutResponsible(item);

      return matchesSearch && matchesFechaDt && matchesResponsible;
    });
  }, [fechaDtFilter, onlyWithoutResponsible, search, vehiculos]);

  const filteredVehicles = useMemo(
    () => matchingVehicles.filter((item) => statusFilters.length === 0 || statusFilters.includes(getStatus(getProgress(item), item))),
    [matchingVehicles, statusFilters],
  );

  const resumen = useMemo(() => {
    const clientes = filteredVehicles.reduce((total, item) => total + item.clientes, 0);
    const visitados = filteredVehicles.reduce((total, item) => total + item.visitados, 0);

    return {
      vehiculos: filteredVehicles.length,
      cajas: matchingVehicles.reduce((total, item) => total + item.cajas, 0),
      hl: matchingVehicles.reduce((total, item) => total + item.hl, 0).toFixed(1),
      visitados,
      clientes,
      avance: clientes ? Number(((visitados / clientes) * 100).toFixed(1)) : 0,
    };
  }, [filteredVehicles, matchingVehicles]);

  const modulacionesHoy = useMemo(() => {
    const targetDate = fechaDtFilter || getLocalDateKey();
    const operational = getOperationalModulaciones(modulaciones, filteredVehicles);
    const byId = new Map<string, ModulacionRegistro>();

    modulaciones.forEach((registro) => {
      if (getModulacionDateKey(registro) === targetDate) byId.set(registro.id, registro);
    });

    operational.forEach((registro) => {
      if (getModulacionDateKey(registro) === targetDate) byId.set(registro.id, registro);
    });

    return Array.from(byId.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [fechaDtFilter, filteredVehicles, modulaciones]);
  const latestModulacionId = modulacionesHoy[0]?.id || "";
  const latestModulacionCreatedAt = modulacionesHoy[0]?.createdAt || "";
  const showModulacionAlert =
    modulacionesHoy.length > 0 &&
    !modulacionAlertDismissed &&
    isViewingToday(fechaDtFilter) &&
    isRecentModulacion(latestModulacionCreatedAt);
  const selectedVehicle = useMemo(() => {
    if (!vehiculoSeleccionado) return null;

    const selectedKey = vehiculoSeleccionadoKey || getVehicleUiKey(vehiculoSeleccionado);
    return vehiculos.find((item) => getVehicleUiKey(item) === selectedKey) ?? vehiculoSeleccionado;
  }, [vehiculoSeleccionado, vehiculoSeleccionadoKey, vehiculos]);
  const hasTodayVehicles = useMemo(() => vehiculos.some((vehicle) => getVehicleDateKey(vehicle) === getLocalDateKey()), [vehiculos]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    void refreshRemoteRecords("/api/seguimiento");
    void refreshRemoteRecords("/api/modulaciones");
    const interval = window.setInterval(() => {
      void refreshRemoteRecords("/api/seguimiento");
      void refreshRemoteRecords("/api/modulaciones");
    }, DATA_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!latestModulacionId) return;
    const timeout = window.setTimeout(() => setModulacionAlertDismissed(false), 0);
    return () => window.clearTimeout(timeout);
  }, [latestModulacionId]);

  useEffect(() => {
    if (!showModulacionAlert) return;

    const timeout = window.setTimeout(() => {
      setModulacionAlertDismissed(true);
    }, MODULACION_ALERT_VISIBLE_MS);

    return () => window.clearTimeout(timeout);
  }, [latestModulacionId, showModulacionAlert]);

  function actualizarVisitados(recordKey: string, visitados: number) {
    const prepared = prepareSeguimientoVehicles(
      vehiculos.map((item) =>
        getVehicleUiKey(item) === recordKey
          ? {
              ...item,
              visitados: Math.min(Math.max(visitados, 0), item.clientes),
            }
          : item,
      ),
    );

    setVehiculos(prepared);
    scheduleSeguimientoSave(prepared);
  }

  function actualizarVehiculo(recordKey: string, changes: Partial<Vehiculo>) {
    const shouldResetAttendance =
      changes.fechaDespacho !== undefined || changes.status === "Pernoctado" || changes.status === "Cambio de fecha";
    const previousVehicle = vehiculos.find((item) => getVehicleUiKey(item) === recordKey);

    setVehiculoSeleccionado((current) =>
      current && (vehiculoSeleccionadoKey || getVehicleUiKey(current)) === recordKey ? applyVehicleChanges(current, changes, shouldResetAttendance) : current,
    );

    if (previousVehicle) removeStaleRouteData(previousVehicle, shouldResetAttendance);

    const prepared = prepareSeguimientoVehicles(
      vehiculos.map((item) => (getVehicleUiKey(item) === recordKey ? applyVehicleChanges(item, changes, shouldResetAttendance) : item)),
    );

    setVehiculos(prepared);
    scheduleSeguimientoSave(prepared);
  }

  function scheduleSeguimientoSave(records: Vehiculo[]) {
    pendingLocalSaveRef.current = true;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await saveSeguimientoVehiculos(records);
      } catch (error) {
        setImportMessage(error instanceof Error ? error.message : "No se pudieron guardar los cambios.");
      } finally {
        pendingLocalSaveRef.current = false;
        saveTimerRef.current = null;
      }
    }, SEGUIMIENTO_SAVE_DEBOUNCE_MS);
  }

  function applyVehicleChanges(item: Vehiculo, changes: Partial<Vehiculo>, shouldResetAttendance: boolean) {
    const updated = {
      ...item,
      ...changes,
      clientes: changes.clientes === undefined ? item.clientes : Math.max(changes.clientes, 0),
      visitados: changes.visitados === undefined ? item.visitados : Math.max(changes.visitados, 0),
      cajas: changes.cajas === undefined ? item.cajas : Math.round(Math.max(changes.cajas, 0)),
      hl: changes.hl === undefined ? item.hl : Math.max(changes.hl, 0),
      peso: changes.peso === undefined ? item.peso : Math.max(changes.peso, 0),
      capacidad: changes.capacidad === undefined ? item.capacidad : Math.max(changes.capacidad, 0),
    };

    updated.visitados = Math.min(updated.visitados, updated.clientes);

    if (shouldResetAttendance) {
      updated.cedulaResponsable = undefined;
      updated.cedulaAuxiliar1 = undefined;
      updated.cedulaAuxiliar2 = undefined;
      updated.nombreResponsable = undefined;
      updated.nombreAuxiliar1 = undefined;
      updated.nombreAuxiliar2 = undefined;
      updated.responsable = item.responsable.startsWith("RR ") ? "Sin responsable" : updated.responsable;
      updated.visitados = 0;
    }

    if (changes.status === "Pernoctado") {
      updated.horaSalida = "Pendiente";
      updated.horaLlegada = "Pendiente";
      updated.tiempoRuta = "Pendiente";
    }

    if (changes.horaSalida !== undefined || changes.horaLlegada !== undefined) {
      updated.tiempoRuta = calculateRouteTime(updated, now);
    }

    return updated;
  }

  function removeStaleRouteData(item: Vehiculo, shouldResetAttendance: boolean) {
    if (!shouldResetAttendance) return;

    removeAsistenciaByDt(item.transporte);
    removeCheckinByDt(item.transporte);
  }

  function isRecentModulacion(value: string) {
    const createdAt = new Date(value).getTime();
    if (!Number.isFinite(createdAt)) return false;

    return now.getTime() - createdAt <= MODULACION_ALERT_VISIBLE_MS;
  }

  function seleccionarVehiculo(vehicle: Vehiculo) {
    setVehiculoSeleccionado(vehicle);
    setVehiculoSeleccionadoKey(getVehicleUiKey(vehicle));
  }

  function borrarVehiculo(recordKey: string) {
    const vehicle = vehiculos.find((item) => getVehicleUiKey(item) === recordKey);
    const label = vehicle?.transporte || vehicle?.vehiculo || "este DT";

    if (!window.confirm(`Quieres borrar ${label} del seguimiento?`)) return;

    if (vehicle) removeStaleRouteData(vehicle, true);

    const prepared = prepareSeguimientoVehicles(vehiculos.filter((item) => getVehicleUiKey(item) !== recordKey));
    setVehiculos(prepared);
    scheduleSeguimientoSave(prepared);

    if (vehiculoSeleccionadoKey === recordKey) {
      setVehiculoSeleccionado(null);
      setVehiculoSeleccionadoKey(null);
    }
  }

  async function borrarTodoSeguimiento() {
    const todayKey = getLocalDateKey();
    const todayVehicles = vehiculos.filter((vehicle) => getVehicleDateKey(vehicle) === todayKey);
    const remainingVehicles = vehiculos.filter((vehicle) => getVehicleDateKey(vehicle) !== todayKey);

    if (!todayVehicles.length) {
      setImportMessage("No hay seguimiento de hoy para borrar.");
      return;
    }

    if (!window.confirm(`Quieres borrar solo el seguimiento de hoy? Se eliminaran ${todayVehicles.length} vehiculos de hoy y sus checkins/asistencias asociados.`)) return;

    const previousVehicles = vehiculos;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    todayVehicles.forEach((vehicle) => removeStaleRouteData(vehicle, true));
    pendingLocalSaveRef.current = true;
    setVehiculos(remainingVehicles);
    setVehiculoSeleccionado(null);
    setVehiculoSeleccionadoKey(null);
    setImportMessage("Borrando seguimiento de hoy en Supabase...");

    try {
      await saveSeguimientoVehiculos(remainingVehicles);
      setImportMessage("Seguimiento de hoy borrado correctamente.");
    } catch (error) {
      setVehiculos(previousVehicles);
      setImportMessage(error instanceof Error ? error.message : "No se pudo borrar el seguimiento de hoy.");
    } finally {
      pendingLocalSaveRef.current = false;
    }
  }

  async function handleImport(file: File | undefined) {
    if (!file) return;

    try {
      const imported = await parseSeguimientoFile(file, vehiculos);
      if (!imported.length) {
        setImportMessage("No se encontraron filas validas en el archivo.");
        return;
      }

      setImportMessage("Guardando seguimiento en Supabase...");

      const prepared = prepareSeguimientoVehicles(mergeVehiclesByDt(vehiculos, imported));
      const savedRecords = await saveSeguimientoVehiculos(prepared);

      setVehiculos(savedRecords);
      setImportMessage(`${imported.length} registros guardados en Supabase desde ${file.name}.`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "No se pudo leer el archivo.");
    }
  }

  function updateFechaDtFilter(value: string) {
    setFechaDtFilter(value);
    if (value) {
      sessionStorage.setItem(SEGUIMIENTO_DATE_FILTER_KEY, value);
    } else {
      sessionStorage.removeItem(SEGUIMIENTO_DATE_FILTER_KEY);
    }
  }

  function goToGraficas() {
    const query = fechaDtFilter ? `?fecha=${encodeURIComponent(fechaDtFilter)}` : "";
    router.push(`/seguimiento/graficas${query}`);
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <button
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-[#10223d] transition hover:bg-slate-100"
            onClick={() => {
              router.push("/");
            }}
            type="button"
          >
            <ArrowLeft size={18} />
            Portal
          </button>

          <div className="flex items-center gap-3 rounded-md bg-[#e9f3ff] px-3 py-2 text-sm font-medium text-[#10223d]">
            <CalendarDays size={18} />
            {dateLabel}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
        <SeguimientoHero resumen={resumen} brand={brand} />

        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={<Truck size={22} />} label="Vehiculos activos" value={resumen.vehiculos} detail="Rutas en monitoreo" />
          <MetricCard icon={<Boxes size={22} />} label="Cajas" value={resumen.cajas} detail="Carga programada" />
          <MetricCard icon={<PackageCheck size={22} />} label="HL movidos" value={resumen.hl} detail="Volumen total" />
          <MetricCard icon={<Users size={22} />} label="Visitados" value={resumen.visitados} detail="Clientes atendidos" />
        </div>

        <ModulacionNotificationAlert modulaciones={modulacionesHoy} visible={showModulacionAlert} />

        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto]">
          <label className="flex min-h-24 cursor-pointer items-center gap-4 rounded-lg border border-dashed border-slate-300 bg-white px-5 py-4 shadow-sm transition hover:border-[#f5bd19] hover:bg-[#fff8e6]">
            <span className="grid h-11 w-11 place-items-center rounded-md bg-[#e9f3ff] text-[#10223d]">
              <FileSpreadsheet size={22} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-[#10223d]">Subir seguimiento diario</span>
              <span className="mt-1 block text-sm text-slate-500">Acepta Excel o CSV con DT, vehiculo, responsable, cajas y demas columnas.</span>
              {importMessage ? <span className="mt-2 block text-xs font-medium text-[#0f7c58]">{importMessage}</span> : null}
            </span>
            <input
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(event) => handleImport(event.target.files?.[0])}
              type="file"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#0f7c58] px-3 text-xs font-semibold text-white transition hover:bg-[#0b684a]"
              onClick={goToGraficas}
              type="button"
            >
              <BarChart3 size={18} />
              Graficas
            </button>
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#f5bd19] px-3 text-xs font-semibold text-[#10223d] transition hover:bg-[#e6a400]"
              onClick={() => router.push("/seguimiento/checkin")}
              type="button"
            >
              <ClipboardCheck size={18} />
              Cajas checkin
            </button>
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!hasTodayVehicles}
              onClick={borrarTodoSeguimiento}
              type="button"
            >
              <Trash2 size={17} />
              Borrar hoy
            </button>
            <a
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-semibold text-[#10223d] transition hover:border-[#f5bd19] hover:bg-[#fff8e6]"
              download="plantilla-seguimiento.xlsx"
              href="/plantilla-seguimiento.xlsx"
            >
              <FileDown size={18} />
              Plantilla
            </a>
          </div>
        </div>

        <SeguimientoFilters
          fechaDtFilter={fechaDtFilter}
          onlyWithoutResponsible={onlyWithoutResponsible}
          search={search}
          statusFilters={statusFilters}
          onFechaDtChange={updateFechaDtFilter}
          onOnlyWithoutResponsibleChange={setOnlyWithoutResponsible}
          onSearchChange={setSearch}
          onStatusChange={setStatusFilters}
        />

        <VehiclesTable
          vehicles={filteredVehicles}
          now={now}
          onSelectVehicle={seleccionarVehiculo}
          onDeleteVehicle={borrarVehiculo}
          onUpdateVehicle={actualizarVehiculo}
          onUpdateVisited={actualizarVisitados}
        />

        {selectedVehicle ? (
          <VehicleDrawer
            vehicle={selectedVehicle}
            now={now}
            onClose={() => {
              setVehiculoSeleccionado(null);
              setVehiculoSeleccionadoKey(null);
            }}
            onDeleteVehicle={borrarVehiculo}
            onUpdateVehicle={actualizarVehiculo}
            recordKey={vehiculoSeleccionadoKey || getVehicleUiKey(selectedVehicle)}
          />
        ) : null}
      </section>
    </main>
  );
}

function getModulacionDateKey(registro: ModulacionRegistro) {
  return toDateKey(registro.fechaDespacho || registro.fechaDt || registro.createdAt);
}

function mergeStoredVehiclesPreservingProgress(currentVehicles: Vehiculo[], storedVehicles: Vehiculo[]) {
  if (!currentVehicles.length) return storedVehicles;

  const currentByKey = new Map(currentVehicles.map((vehicle) => [getVehicleUiKey(vehicle), vehicle]));

  return storedVehicles.map((storedVehicle) => {
    const currentVehicle = currentByKey.get(getVehicleUiKey(storedVehicle));
    if (!currentVehicle) return storedVehicle;

    const visitados = Math.max(Number(currentVehicle.visitados || 0), Number(storedVehicle.visitados || 0));
    return {
      ...storedVehicle,
      visitados: Math.min(visitados, storedVehicle.clientes || visitados),
    };
  });
}

function getVehicleDateKey(vehicle: Vehiculo) {
  return toDateKey(vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || vehicle.createdAt);
}

function isWithoutResponsible(vehicle: Vehiculo) {
  const responsibleId = vehicle.cedulaResponsable?.trim();
  const responsibleName = vehicle.nombreResponsable?.trim();

  return !responsibleId && !responsibleName;
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

function isViewingToday(value: string) {
  return !value || value === getLocalDateKey();
}
