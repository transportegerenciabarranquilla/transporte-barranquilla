"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, BarChart3, Boxes, CalendarDays, ChevronDown, ClipboardCheck, FileDown, FileSpreadsheet, PackageCheck, Trash2, Truck, Users, X } from "lucide-react";
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
import { calculateRouteTime, getProgress, getStatus, getVehicleUiKey, hasTimeValue, isRouteClockBlockedStatus, normalizeCajasTotal } from "./utils";
import { ASISTENCIA_STORAGE_KEY, removeAsistenciaByDt } from "../lib/asistenciaStorage";
import { CHECKIN_STORAGE_KEY, removeCheckinByDt } from "../lib/checkinStorage";
import { getLocalDateKey, getOperationalModulaciones, readModulacionRegistros, type ModulacionRegistro, MODULACION_STORAGE_KEY } from "../lib/modulacionStorage";
import { saveSeguimientoVehiculos, SEGUIMIENTO_STORAGE_KEY } from "../lib/seguimientoStorage";
import { useStorageSnapshot } from "../lib/storageEvents";
import { useContractorBrand } from "../lib/contractorBranding";
import { refreshRemoteRecords } from "../lib/remoteStore";
import { isManualResponsibleEditEnabled, MANUAL_RESPONSABLE_EDIT_ENABLED_KEY } from "../lib/adminSettings";
import {
  formatCurrentTime,
  getModulacionDateKey,
  getVehicleDateKey,
  isViewingToday,
  isWithoutResponsible,
  mergeStoredVehiclesPreservingProgress,
  toDateKey,
} from "./pageUtils";

const SEGUIMIENTO_DATE_FILTER_KEY = "bavaria.seguimiento.fechaFiltro";
const MODULACION_ALERT_VISIBLE_MS = 5 * 60 * 1000;
const DATA_REFRESH_MS = 30_000;
const SEGUIMIENTO_SAVE_DEBOUNCE_MS = 200;

export default function SeguimientoPage() {
  const router = useRouter();
  const brand = useContractorBrand();
  const [vehiculoSeleccionado, setVehiculoSeleccionado] = useState<Vehiculo | null>(null);
  const [vehiculoSeleccionadoKey, setVehiculoSeleccionadoKey] = useState<string | null>(null);
  const storedVehiculos = useStorageSnapshot<Vehiculo[]>(
    [SEGUIMIENTO_STORAGE_KEY, ASISTENCIA_STORAGE_KEY, MODULACION_STORAGE_KEY, CHECKIN_STORAGE_KEY],
    loadSeguimientoVehiculos,
    [],
  );
  const modulaciones = useStorageSnapshot<ModulacionRegistro[]>([MODULACION_STORAGE_KEY], readModulacionRegistros, []);
  const canEditResponsibleManual = useStorageSnapshot<boolean>(
    [MANUAL_RESPONSABLE_EDIT_ENABLED_KEY],
    isManualResponsibleEditEnabled,
    false,
  );
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [fechaDtFilter, setFechaDtFilter] = useState("");
  const [onlyWithoutResponsible, setOnlyWithoutResponsible] = useState(false);
  
  const [importMessage, setImportMessage] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [deleteCandidateKey, setDeleteCandidateKey] = useState<string | null>(null);
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
      cajas: normalizeCajasTotal(filteredVehicles.reduce((total, item) => total + Number(item.cajas || 0), 0)),
      hl: filteredVehicles.reduce((total, item) => total + item.hl, 0).toFixed(1),
      visitados,
      clientes,
      avance: clientes ? Number(((visitados / clientes) * 100).toFixed(1)) : 0,
    };
  }, [filteredVehicles]);

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
  const deleteCandidate = useMemo(() => {
    if (!deleteCandidateKey) return null;
    return vehiculos.find((item) => getVehicleUiKey(item) === deleteCandidateKey) ?? null;
  }, [deleteCandidateKey, vehiculos]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    void refreshRemoteRecords("/api/seguimiento");
    void refreshRemoteRecords("/api/asistencias");
    void refreshRemoteRecords("/api/modulaciones");
    void refreshRemoteRecords("/api/checkins");
    const interval = window.setInterval(() => {
      void refreshRemoteRecords("/api/seguimiento");
      void refreshRemoteRecords("/api/asistencias");
      void refreshRemoteRecords("/api/modulaciones");
      void refreshRemoteRecords("/api/checkins");
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

  async function guardarSalidaTardia(recordKey: string, changes: Pick<Vehiculo, "causalSalidaTardia" | "comentarioSalidaTardia">) {
    const prepared = prepareSeguimientoVehicles(
      vehiculos.map((item) => (getVehicleUiKey(item) === recordKey ? applyVehicleChanges(item, changes, false) : item)),
    );

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    pendingLocalSaveRef.current = true;
    setImportMessage("Guardando salida tardia en Supabase...");

    try {
      const savedRecords = await saveSeguimientoVehiculos(prepared);
      setVehiculos(savedRecords);
      setImportMessage("Salida tardia guardada en Supabase.");
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "No se pudo guardar la salida tardia.");
      throw error;
    } finally {
      pendingLocalSaveRef.current = false;
    }
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
      cajas: changes.cajas === undefined ? item.cajas : Math.max(changes.cajas, 0),
      hl: changes.hl === undefined ? item.hl : Math.max(changes.hl, 0),
      peso: changes.peso === undefined ? item.peso : Math.max(changes.peso, 0),
      capacidad: changes.capacidad === undefined ? item.capacidad : Math.max(changes.capacidad, 0),
    };
    let shouldRecalculateRouteTime = changes.horaSalida !== undefined || changes.horaLlegada !== undefined || changes.status !== undefined;

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

    if (changes.status === "En ruta" && !hasTimeValue(updated.horaSalida)) {
      updated.horaSalida = formatCurrentTime();
      updated.horaLlegada = "Pendiente";
      updated.tiempoRuta = "Pendiente";
    }

    if (changes.status && isRouteClockBlockedStatus(changes.status)) {
      updated.horaSalida = "Pendiente";
      updated.horaLlegada = "Pendiente";
      updated.tiempoRuta = "Pendiente";
    }

    if (shouldRecalculateRouteTime) {
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
    setDeleteCandidateKey(recordKey);
  }

  async function confirmDeleteVehicle() {
    if (!deleteCandidateKey) return;
    const vehicle = vehiculos.find((item) => getVehicleUiKey(item) === deleteCandidateKey);
    if (vehicle) removeStaleRouteData(vehicle, true);

    const previousVehicles = vehiculos;
    const prepared = prepareSeguimientoVehicles(vehiculos.filter((item) => getVehicleUiKey(item) !== deleteCandidateKey));
    setVehiculos(prepared);
    pendingLocalSaveRef.current = true;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    if (vehiculoSeleccionadoKey === deleteCandidateKey) {
      setVehiculoSeleccionado(null);
      setVehiculoSeleccionadoKey(null);
    }
    setDeleteCandidateKey(null);
    setImportMessage("Borrando DT en Supabase...");

    try {
      const savedRecords = await saveSeguimientoVehiculos(prepared);
      setVehiculos(savedRecords);
      setImportMessage("DT borrado correctamente.");
    } catch (error) {
      setVehiculos(previousVehicles);
      setImportMessage(error instanceof Error ? error.message : "No se pudo borrar el DT.");
    } finally {
      pendingLocalSaveRef.current = false;
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

  function handleMarkFilteredInRoute() {
    if (!filteredVehicles.length) {
      setImportMessage("No hay vehiculos filtrados para pasar a En ruta.");
      return;
    }

    const nowTime = formatCurrentTime();
    const filteredKeys = new Set(filteredVehicles.map((vehicle) => getVehicleUiKey(vehicle)));
    const prepared = prepareSeguimientoVehicles(
      vehiculos.map((vehicle) => {
        if (!filteredKeys.has(getVehicleUiKey(vehicle))) return vehicle;

        return {
          ...vehicle,
          status: "En ruta",
          recargue: "No",
          horaSalida: hasTimeValue(vehicle.horaSalida) ? vehicle.horaSalida : nowTime,
          horaLlegada: "Pendiente",
          tiempoRuta: "Pendiente",
        };
      }),
    );

    setVehiculos(prepared);
    scheduleSeguimientoSave(prepared);
    setImportMessage(`${filteredVehicles.length} vehiculos pasaron a En ruta.`);
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

  async function handleExportDailyVehicles() {
    const exportDate = fechaDtFilter || getLocalDateKey();
    const vehiclesForDate = vehiculos.filter((vehicle) => getVehicleDateKey(vehicle) === exportDate);

    if (!vehiclesForDate.length) {
      setImportMessage(`No hay carros cargados para exportar el dia ${exportDate}.`);
      return;
    }

    try {
      const XLSX = await import("xlsx");
      const exportRows = vehiclesForDate.map((vehicle) => ({
        DT: vehicle.transporte,
        Placa: vehicle.vehiculo,
        Responsable: vehicle.responsable,
        "Nombre RR": vehicle.nombreResponsable || vehicle.responsable || "",
        "Cedula RR": vehicle.cedulaResponsable || "",
        "Nombre conductor / auxiliar 1": vehicle.nombreAuxiliar1 || "",
        "Cedula conductor / auxiliar 1": vehicle.cedulaAuxiliar1 || "",
        "Nombre auxiliar 2": vehicle.nombreAuxiliar2 || "",
        "Cedula auxiliar 2": vehicle.cedulaAuxiliar2 || "",
        "Fecha despacho": vehicle.fechaDespacho,
        "Fecha DT": vehicle.fechaDt,
        Estado: vehicle.status,
        Clientes: vehicle.clientes,
        Visitados: vehicle.visitados,
        Cajas: vehicle.cajas,
        HL: vehicle.hl,
        "Hora salida": vehicle.horaSalida,
        "Causal salida tardia": vehicle.causalSalidaTardia || "",
        "Comentario salida tardia": vehicle.comentarioSalidaTardia || "",
        "Hora llegada": vehicle.horaLlegada,
        "Tiempo ruta": vehicle.tiempoRuta,
        "Tiempo planeado": vehicle.tiempoPlaneado || "",
        Territorio: vehicle.territorio,
        Transportista: vehicle.transportista,
      }));

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Seguimiento");
      const filename = `seguimiento-carros-${exportDate}.xlsx`;
      XLSX.writeFile(workbook, filename);
      setImportMessage(`${vehiclesForDate.length} carros exportados del dia ${exportDate} en ${filename}.`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "No se pudo exportar el Excel.");
    }
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
              <span className="mt-1 block text-sm text-slate-500">Acepta Excel o CSV con DT, vehiculo, responsable, tiempo planeado y demas columnas.</span>
              {importMessage ? <span className="mt-2 block text-xs font-medium text-[#0f7c58]">{importMessage}</span> : null}
            </span>
            <input
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(event) => handleImport(event.target.files?.[0])}
              type="file"
            />
          </label>

          <div className="relative flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
            <button
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-semibold text-[#10223d] transition hover:border-[#f5bd19] hover:bg-[#fff8e6]"
              onClick={() => setActionsOpen((current) => !current)}
              type="button"
            >
              Acciones
              <ChevronDown size={16} />
            </button>
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

            {actionsOpen ? (
              <div className="absolute right-2 top-12 z-20 min-w-52 rounded-md border border-slate-200 bg-white p-1.5 shadow-xl">
                <button
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-semibold text-[#10223d] transition hover:bg-[#fff8e6]"
                  onClick={() => {
                    handleMarkFilteredInRoute();
                    setActionsOpen(false);
                  }}
                  type="button"
                >
                  <Truck size={15} />
                  Filtrados en ruta
                </button>
                <button
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-semibold text-[#10223d] transition hover:bg-[#fff8e6]"
                  onClick={() => {
                    void handleExportDailyVehicles();
                    setActionsOpen(false);
                  }}
                  type="button"
                >
                  <FileDown size={15} />
                  Exportar dia
                </button>
                <a
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs font-semibold text-[#10223d] transition hover:bg-[#fff8e6]"
                  download="plantilla-seguimiento.xlsx"
                  href="/plantilla-seguimiento.xlsx"
                  onClick={() => setActionsOpen(false)}
                >
                  <FileDown size={15} />
                  Plantilla
                </a>
              </div>
            ) : null}
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
            canEditResponsibleManual={canEditResponsibleManual}
            vehicle={selectedVehicle}
            now={now}
            onClose={() => {
              setVehiculoSeleccionado(null);
              setVehiculoSeleccionadoKey(null);
            }}
            onDeleteVehicle={borrarVehiculo}
            onSaveLateDeparture={guardarSalidaTardia}
            onUpdateVehicle={actualizarVehiculo}
            recordKey={vehiculoSeleccionadoKey || getVehicleUiKey(selectedVehicle)}
          />
        ) : null}
      </section>

      {deleteCandidate ? (
        <DeleteVehicleDialog
          onCancel={() => setDeleteCandidateKey(null)}
          onConfirm={confirmDeleteVehicle}
          vehicle={deleteCandidate}
        />
      ) : null}
    </main>
  );
}

function DeleteVehicleDialog({
  onCancel,
  onConfirm,
  vehicle,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  vehicle: Vehiculo;
}) {
  const label = vehicle.transporte || vehicle.vehiculo || "esta ruta";

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#10223d]/55 px-4 py-6 backdrop-blur-sm">
      <section className="w-full max-w-md overflow-hidden rounded-lg border border-white/70 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.28)]">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-red-50 text-red-700">
                <AlertTriangle size={20} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-700">Confirmar borrado</p>
                <h2 className="mt-1 text-lg font-semibold text-[#10223d]">Borrar DT {label}</h2>
              </div>
            </div>
            <button
              aria-label="Cerrar confirmacion"
              className="grid h-8 w-8 place-items-center rounded-md text-slate-500 transition hover:bg-white hover:text-[#10223d]"
              onClick={onCancel}
              type="button"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="px-4 py-4">
          <p className="text-sm leading-6 text-slate-600">
            Se eliminara esta ruta del seguimiento y tambien sus datos asociados de asistencia y check-in.
          </p>
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <p className="font-semibold text-[#10223d]">{vehicle.vehiculo || "Sin placa"}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              DT {vehicle.transporte || "-"} · {vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || "Sin fecha"}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:justify-end">
          <button
            className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700"
            onClick={onConfirm}
            type="button"
          >
            <Trash2 size={16} />
            Borrar ruta
          </button>
        </div>
      </section>
    </div>
  );
}
