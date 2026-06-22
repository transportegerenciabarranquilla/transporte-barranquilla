"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, CalendarDays, ClipboardCheck, FileDown, FileSpreadsheet, PackageCheck, Truck, Users, Boxes } from "lucide-react";
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
  persistVehicles,
} from "./services/vehicleRecords";
import type { Vehiculo } from "./types";
import { calculateRouteTime, getProgress, getStatus, getVehicleUiKey } from "./utils";
import { removeAsistenciaByDt } from "../lib/asistenciaStorage";
import { removeCheckinByDt } from "../lib/checkinStorage";
import { getOperationalModulaciones, readModulacionRegistros, type ModulacionRegistro, isTodayDate, MODULACION_STORAGE_KEY } from "../lib/modulacionStorage";
import { saveSeguimientoVehiculos, SEGUIMIENTO_STORAGE_KEY } from "../lib/seguimientoStorage";
import { useStorageSnapshot } from "../lib/storageEvents";
import { useContractorBrand } from "../lib/contractorBranding";

export default function SeguimientoPage() {
  const router = useRouter();
  const brand = useContractorBrand();
  const [vehiculoSeleccionado, setVehiculoSeleccionado] = useState<Vehiculo | null>(null);
  const [vehiculoSeleccionadoKey, setVehiculoSeleccionadoKey] = useState<string | null>(null);
  const storedVehiculos = useStorageSnapshot<Vehiculo[]>(
    [SEGUIMIENTO_STORAGE_KEY, MODULACION_STORAGE_KEY],
    loadSeguimientoVehiculos,
    [],
  );
  const modulaciones = useStorageSnapshot<ModulacionRegistro[]>([MODULACION_STORAGE_KEY], readModulacionRegistros, []);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [fechaDtFilter, setFechaDtFilter] = useState("");
  
  const [importMessage, setImportMessage] = useState("");
  const [modulacionAlertDismissed, setModulacionAlertDismissed] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [dateLabel, setDateLabel] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDateLabel(new Date().toLocaleDateString("es-CO"));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    setVehiculos(storedVehiculos);
  }, [storedVehiculos]);

  const matchingVehicles = useMemo(() => {
    return vehiculos.filter((item) => {
      const searchable = `${item.vehiculo} ${item.transporte} ${item.responsable} ${item.territorio} ${item.moduladores?.join(" ")}`;
      const matchesSearch = searchable.toLowerCase().includes(search.toLowerCase());
      const matchesFechaDt = !fechaDtFilter || item.fechaDt === fechaDtFilter || item.fechaDespacho === fechaDtFilter;

      return matchesSearch && matchesFechaDt;
    });
  }, [fechaDtFilter, search, vehiculos]);

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
      avance: clientes ? Math.round((visitados / clientes) * 100) : 0,
    };
  }, [filteredVehicles, matchingVehicles]);

  const modulacionesHoy = useMemo(() => {
    const operational = getOperationalModulaciones(modulaciones, filteredVehicles);
    const byId = new Map<string, ModulacionRegistro>();

    modulaciones.forEach((registro) => {
      if (isTodayDate(registro.createdAt)) byId.set(registro.id, registro);
    });

    operational.forEach((registro) => byId.set(registro.id, registro));

    return Array.from(byId.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [filteredVehicles, modulaciones]);
  const showModulacionAlert = modulacionesHoy.length > 0 && !modulacionAlertDismissed;
  const latestModulacionId = modulacionesHoy[0]?.id || "";
  const selectedVehicle = useMemo(() => {
    if (!vehiculoSeleccionado) return null;

    const selectedKey = vehiculoSeleccionadoKey || getVehicleUiKey(vehiculoSeleccionado);
    return vehiculos.find((item) => getVehicleUiKey(item) === selectedKey) ?? vehiculoSeleccionado;
  }, [vehiculoSeleccionado, vehiculoSeleccionadoKey, vehiculos]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!latestModulacionId) return;
    setModulacionAlertDismissed(false);
  }, [latestModulacionId]);

  function actualizarVisitados(recordKey: string, visitados: number) {
    setVehiculos((current) =>
      persistVehicles(
        current.map((item) =>
          getVehicleUiKey(item) === recordKey
            ? {
                ...item,
                visitados: Math.min(Math.max(visitados, 0), item.clientes),
              }
            : item,
        ),
      ),
    );
  }

  function actualizarVehiculo(recordKey: string, changes: Partial<Vehiculo>) {
    const shouldResetAttendance =
      changes.fechaDespacho !== undefined || changes.status === "Pernoctado" || changes.status === "Cambio de fecha";

    setVehiculoSeleccionado((current) =>
      current && (vehiculoSeleccionadoKey || getVehicleUiKey(current)) === recordKey ? applyVehicleChanges(current, changes, shouldResetAttendance) : current,
    );

    setVehiculos((current) =>
      persistVehicles(
        current.map((item) => {
          if (getVehicleUiKey(item) !== recordKey) return item;

          removeStaleRouteData(item, shouldResetAttendance);
          return applyVehicleChanges(item, changes, shouldResetAttendance);
        }),
      ),
    );
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

  function seleccionarVehiculo(vehicle: Vehiculo) {
    setVehiculoSeleccionado(vehicle);
    setVehiculoSeleccionadoKey(getVehicleUiKey(vehicle));
  }

  function borrarVehiculo(recordKey: string) {
    const vehicle = vehiculos.find((item) => getVehicleUiKey(item) === recordKey);
    const label = vehicle?.transporte || vehicle?.vehiculo || "este DT";

    if (!window.confirm(`Quieres borrar ${label} del seguimiento?`)) return;

    if (vehicle) removeStaleRouteData(vehicle, true);

    setVehiculos((current) => persistVehicles(current.filter((item) => getVehicleUiKey(item) !== recordKey)));

    if (vehiculoSeleccionadoKey === recordKey) {
      setVehiculoSeleccionado(null);
      setVehiculoSeleccionadoKey(null);
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

      const prepared = persistVehicles(mergeVehiclesByDt(vehiculos, imported));
      await saveSeguimientoVehiculos(prepared);

      setVehiculos(prepared);
      setImportMessage(`${imported.length} registros guardados en Supabase desde ${file.name}.`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "No se pudo leer el archivo.");
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
              onClick={() => router.push("/seguimiento/graficas")}
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
          search={search}
          statusFilters={statusFilters}
          onFechaDtChange={setFechaDtFilter}
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
