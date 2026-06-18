"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Boxes, CalendarDays, FileDown, FileSpreadsheet, PackageCheck, Truck, Users } from "lucide-react";
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
import { getProgress, getStatus, getVehicleRecordKey } from "./utils";
import { getLocalDateKey, isTodayDate, readModulacionRegistros, type ModulacionRegistro } from "../lib/modulacionStorage";

type DateScope = "today" | "all";

export default function SeguimientoPage() {
  const router = useRouter();
  const [vehiculoSeleccionado, setVehiculoSeleccionado] = useState<Vehiculo | null>(null);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>(() => loadSeguimientoVehiculos());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [fechaDtFilter, setFechaDtFilter] = useState("");
  const [dateScope, setDateScope] = useState<DateScope>("today");
  const [importMessage, setImportMessage] = useState("");
  const [modulaciones] = useState<ModulacionRegistro[]>(() => readModulacionRegistros());
  const [modulacionAlertDismissed, setModulacionAlertDismissed] = useState(false);

  const filteredVehicles = useMemo(() => {
    return vehiculos.filter((item) => {
      const status = getStatus(getProgress(item));
      const searchable = `${item.vehiculo} ${item.transporte} ${item.responsable} ${item.territorio} ${item.moduladores?.join(" ")}`;
      const matchesSearch = searchable.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "Todos" || status === statusFilter;
      const matchesDate = dateScope === "all" || item.fechaDespacho === getLocalDateKey();
      const matchesFechaDt = !fechaDtFilter || item.fechaDt === fechaDtFilter;

      return matchesSearch && matchesStatus && matchesDate && matchesFechaDt;
    });
  }, [dateScope, fechaDtFilter, search, statusFilter, vehiculos]);

  const resumen = useMemo(() => {
    const clientes = filteredVehicles.reduce((total, item) => total + item.clientes, 0);
    const visitados = filteredVehicles.reduce((total, item) => total + item.visitados, 0);

    return {
      vehiculos: filteredVehicles.length,
      cajas: filteredVehicles.reduce((total, item) => total + item.cajas, 0),
      hl: filteredVehicles.reduce((total, item) => total + item.hl, 0).toFixed(1),
      visitados,
      clientes,
      avance: clientes ? Math.round((visitados / clientes) * 100) : 0,
    };
  }, [filteredVehicles]);

  const modulacionesHoy = useMemo(
    () =>
      modulaciones
        .filter((registro) => isTodayDate(registro.createdAt))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [modulaciones],
  );
  const showModulacionAlert = modulacionesHoy.length > 0 && !modulacionAlertDismissed;

  useEffect(() => {
    if (!modulacionesHoy.length) return;

    const timeout = window.setTimeout(() => setModulacionAlertDismissed(true), 30000);

    return () => window.clearTimeout(timeout);
  }, [modulacionesHoy]);

  function actualizarVisitados(recordKey: string, visitados: number) {
    setVehiculos((current) =>
      persistVehicles(
        current.map((item) =>
          getVehicleRecordKey(item) === recordKey
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
    setVehiculos((current) =>
      persistVehicles(
        current.map((item) =>
          getVehicleRecordKey(item) === recordKey
            ? {
                ...item,
                ...changes,
                clientes: changes.clientes === undefined ? item.clientes : Math.max(changes.clientes, 0),
              }
            : item,
        ),
      ),
    );
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

      setVehiculos(prepared);
      setDateScope("today");
      setImportMessage(`${imported.length} registros cargados desde ${file.name}.`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "No se pudo leer el archivo.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <button
            className="flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[#10223d] transition hover:bg-slate-100"
            onClick={() => {
              sessionStorage.setItem("bavaria.demo.session", "active");
              sessionStorage.setItem("bavaria.demo.welcomeSeen", "true");
              router.push("/");
            }}
            type="button"
          >
            <ArrowLeft size={18} />
            Portal
          </button>

          <div className="flex items-center gap-3 rounded-md bg-[#e9f3ff] px-3 py-2 text-sm font-medium text-[#10223d]">
            <CalendarDays size={18} />
            {new Date().toLocaleDateString("es-CO")}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
        <SeguimientoHero resumen={resumen} />

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
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0f7c58] px-4 text-sm font-semibold text-white transition hover:bg-[#0b684a]"
              onClick={() => router.push("/seguimiento/graficas")}
              type="button"
            >
              <BarChart3 size={18} />
              Graficas
            </button>
            <a
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-4 text-sm font-semibold text-[#10223d] transition hover:border-[#f5bd19] hover:bg-[#fff8e6]"
              download="plantilla-seguimiento.xlsx"
              href="/plantilla-seguimiento.xlsx"
            >
              <FileDown size={18} />
              Plantilla
            </a>
            <button
              className={`h-10 rounded-md px-4 text-sm font-semibold transition ${
                dateScope === "today" ? "bg-[#10223d] text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
              onClick={() => setDateScope("today")}
              type="button"
            >
              Hoy
            </button>
            <button
              className={`h-10 rounded-md px-4 text-sm font-semibold transition ${
                dateScope === "all" ? "bg-[#10223d] text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
              onClick={() => setDateScope("all")}
              type="button"
            >
              Todo
            </button>
          </div>
        </div>

        <SeguimientoFilters
          fechaDtFilter={fechaDtFilter}
          search={search}
          statusFilter={statusFilter}
          onFechaDtChange={(value) => {
            setFechaDtFilter(value);
            if (value) setDateScope("all");
          }}
          onSearchChange={setSearch}
          onStatusChange={setStatusFilter}
        />

        <VehiclesTable
          vehicles={filteredVehicles}
          onSelectVehicle={setVehiculoSeleccionado}
          onUpdateVehicle={actualizarVehiculo}
          onUpdateVisited={actualizarVisitados}
        />

        {vehiculoSeleccionado ? (
          <VehicleDrawer vehicle={vehiculoSeleccionado} onClose={() => setVehiculoSeleccionado(null)} />
        ) : null}
      </section>
    </main>
  );
}
