"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Boxes, CalendarDays, FileSpreadsheet, PackageCheck, Truck, Users } from "lucide-react";
import { initialVehicles } from "./data";
import type { Vehiculo } from "./types";
import { getProgress, getStatus, getVehicleRecordKey } from "./utils";
import { MetricCard } from "./components/MetricCard";
import { SeguimientoFilters } from "./components/SeguimientoFilters";
import { SeguimientoHero } from "./components/SeguimientoHero";
import { VehicleDrawer } from "./components/VehicleDrawer";
import { VehiclesTable } from "./components/VehiclesTable";
import { ASISTENCIA_STORAGE_KEY, type AsistenciaRegistro } from "../lib/asistenciaStorage";
import { getModulacionesByDt, readModulacionRegistros, summarizeModulaciones } from "../lib/modulacionStorage";
import { readSeguimientoVehiculos, saveSeguimientoVehiculos } from "../lib/seguimientoStorage";

type DateScope = "today" | "all";

export default function SeguimientoPage() {
  const router = useRouter();
  const [vehiculoSeleccionado, setVehiculoSeleccionado] = useState<Vehiculo | null>(null);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>(() => loadSeguimientoVehiculos());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [dateScope, setDateScope] = useState<DateScope>("today");
  const [importMessage, setImportMessage] = useState("");

  const filteredVehicles = useMemo(() => {
    return vehiculos.filter((item) => {
      const status = getStatus(getProgress(item));
      const matchesSearch = `${item.vehiculo} ${item.transporte} ${item.responsable} ${item.territorio} ${item.moduladores?.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesStatus = statusFilter === "Todos" || status === statusFilter;
      const matchesDate = dateScope === "all" || item.fechaDespacho === getTodayKey();

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [dateScope, search, statusFilter, vehiculos]);

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

  function actualizarVisitados(recordKey: string, visitados: number) {
    setVehiculos((current) =>
      persistVehicles(
        current.map((item) =>
          getVehicleRecordKey(item) === recordKey
            ? {
                ...item,
                visitados: Math.min(Math.max(visitados, 0), item.clientes),
              }
            : item
        )
      )
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
          : item
        )
      )
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

      const modulaciones = readModulacionRegistros();
      const merged = mergeVehiclesByDt(vehiculos, imported);
      const enriched = enrichVehiclesWithModulacion(merged, modulaciones);

      saveSeguimientoVehiculos(enriched);
      setVehiculos(enriched);
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

        <SeguimientoCharts vehicles={filteredVehicles} />

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

          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
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
          search={search}
          statusFilter={statusFilter}
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

function loadSeguimientoVehiculos() {
  if (typeof window === "undefined") return initialVehicles;

  const stored = readSeguimientoVehiculos();
  if (stored.length) return enrichVehiclesWithModulacion(stored, readModulacionRegistros());

  const current = localStorage.getItem(ASISTENCIA_STORAGE_KEY);
  const modulaciones = readModulacionRegistros();
  if (!current) return enrichVehiclesWithModulacion(initialVehicles, modulaciones);

  try {
    const registros = JSON.parse(current) as AsistenciaRegistro[];
    const puntoCorona = registros.filter((registro) => registro.contratista === "Punto Corona");

    return enrichVehiclesWithModulacion([...initialVehicles, ...puntoCorona.map(mapAttendanceToVehicle)], modulaciones);
  } catch {
    return enrichVehiclesWithModulacion(initialVehicles, modulaciones);
  }
}

function persistVehicles(records: Vehiculo[]) {
  const enriched = enrichVehiclesWithModulacion(records, readModulacionRegistros());
  saveSeguimientoVehiculos(enriched);
  return enriched;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function parseSeguimientoFile(file: File, currentVehicles: Vehiculo[]) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const capacityByPlate = createCapacityByPlate([...initialVehicles, ...currentVehicles]);

  return rows.map((row) => mapExcelRowToVehicle(row, capacityByPlate)).filter(Boolean) as Vehiculo[];
}

function mergeVehiclesByDt(current: Vehiculo[], imported: Vehiculo[]) {
  const records = new Map(current.map((vehicle) => [getVehicleRecordKey(vehicle), vehicle]));
  const capacityByPlate = createCapacityByPlate(current);

  imported.forEach((vehicle) => {
    const currentRecord = records.get(getVehicleRecordKey(vehicle));
    const fixedCapacity = getFixedCapacity(vehicle.vehiculo, capacityByPlate, vehicle.capacidad);

    records.set(getVehicleRecordKey(vehicle), {
      ...currentRecord,
      ...vehicle,
      capacidad: fixedCapacity,
    });
  });

  return Array.from(records.values());
}

function mapExcelRowToVehicle(row: Record<string, unknown>, capacityByPlate: Map<string, number>) {
  const value = createRowReader(row);
  const transporte = stringValue(value(["dt", "transporte", "documento transporte", "nro dt", "numero dt"]));
  const vehiculo = stringValue(value(["vehiculo", "placa", "carro", "nombre vehiculo", "nombre de la ruta"])) || transporte;

  if (!transporte && !vehiculo) return null;

  const fecha = dateValue(value(["fecha despacho", "fecha", "fecha dt", "dia"])) || getTodayKey();
  const clientes = numberValue(value(["clientes", "total clientes", "clientes programados"]), 0);
  const visitados = numberValue(value(["visitados", "clientes visitados"]), 0);
  const importedCapacity = numberValue(value(["capacidad", "capacidad peso", "capacidad vehiculo"]), 1);

  return {
    mes: stringValue(value(["mes"])) || new Date(`${fecha}T00:00:00`).toLocaleDateString("es-CO", { month: "long" }),
    cd: stringValue(value(["cd", "centro distribucion"])) || "BAQ",
    transportista: stringValue(value(["transportista", "contratista"])) || "Pendiente",
    llave: stringValue(value(["llave"])) || `${transporte || vehiculo}-${fecha}`,
    transporte: transporte || vehiculo,
    centro: stringValue(value(["centro", "sede"])) || "Punto Corona",
    codTransportista: stringValue(value(["cod transportista", "codigo transportista"])) || "-",
    fechaDt: dateValue(value(["fecha dt"])) || fecha,
    fechaDespacho: fecha,
    vehiculo,
    responsable: stringValue(value(["responsable", "rr", "conductor", "nombre"])) || "Sin responsable",
    territorio: stringValue(value(["territorio", "zona", "ruta"])) || "Pendiente",
    viaje: stringValue(value(["viaje"])) || "Pendiente",
    bloque: stringValue(value(["bloque"])) || "Pendiente",
    cajas: numberValue(value(["cajas", "total cajas", "cajas programadas", "cajas salida"]), 0),
    hl: numberValue(value(["hl", "hectolitros"]), 0),
    clientes,
    visitados: Math.min(visitados, clientes || visitados),
    horaSalida: stringValue(value(["hora salida", "salida"])) || "Pendiente",
    peso: numberValue(value(["peso", "peso dt"]), 0),
    capacidad: getFixedCapacity(vehiculo, capacityByPlate, importedCapacity),
    validadorPeso: stringValue(value(["validador peso", "validador"])) || "Pendiente",
    avanceRuta: stringValue(value(["avance ruta", "avance"])) || "0%",
    status: stringValue(value(["status", "estado"])) || "Cargando",
    horaLlegada: stringValue(value(["hora llegada", "llegada"])) || "Pendiente",
    tiempoRuta: stringValue(value(["tiempo ruta", "tiempo en ruta"])) || "Pendiente",
    metaRelevo: stringValue(value(["meta relevo"])) || "Pendiente",
    horaInicioRelevo: stringValue(value(["hora inicio relevo"])) || "Pendiente",
    clasificacionRelevo: stringValue(value(["clasificacion relevo"])) || "Pendiente",
    alertaSifPotencial: stringValue(value(["alerta sif potencial", "alerta sif"])) || "Pendiente",
    relevador: stringValue(value(["relevador"])) || "-",
    causalDesviado: stringValue(value(["causal desviado"])) || "-",
    clasificacionOnTime: stringValue(value(["clasificacion on time", "on time"])) || "Pendiente",
    recargue: stringValue(value(["recargue"])) || "Pendiente",
    cedulaResponsable: stringValue(value(["cedula responsable", "cedula rr"])),
    cedulaAuxiliar1: stringValue(value(["cedula auxiliar 1", "cedula conductor"])),
    cedulaAuxiliar2: stringValue(value(["cedula auxiliar 2"])),
  };
}

function createCapacityByPlate(vehicles: Vehiculo[]) {
  const capacities = new Map<string, number>();

  vehicles.forEach((vehicle) => {
    const plate = normalizePlate(vehicle.vehiculo);
    if (!plate || capacities.has(plate) || !vehicle.capacidad) return;
    capacities.set(plate, vehicle.capacidad);
  });

  return capacities;
}

function getFixedCapacity(plate: string, capacityByPlate: Map<string, number>, fallback: number) {
  return capacityByPlate.get(normalizePlate(plate)) ?? fallback;
}

function normalizePlate(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
}

function createRowReader(row: Record<string, unknown>) {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));

  return (aliases: string[]) => {
    for (const alias of aliases) {
      const found = normalized.get(normalizeHeader(alias));
      if (found !== undefined && found !== "") return found;
    }

    return "";
  };
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function stringValue(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").trim();
}

function SeguimientoCharts({ vehicles }: { vehicles: Vehiculo[] }) {
  const maxCajas = Math.max(...vehicles.map((vehicle) => vehicle.cajas), 1);
  const statusItems = ["Cargando", "En ruta", "Finalizado"].map((status) => ({
    status,
    count: vehicles.filter((vehicle) => getStatus(getProgress(vehicle)) === status).length,
  }));
  const maxStatus = Math.max(...statusItems.map((item) => item.count), 1);
  const topVehicles = [...vehicles].sort((a, b) => b.cajas - a.cajas).slice(0, 6);

  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-[#10223d]">Cajas por DT</h2>
          <p className="mt-1 text-sm text-slate-500">Calculado con el filtro actual de fecha y estado.</p>
        </div>
        {topVehicles.length ? (
          <div className="space-y-4">
            {topVehicles.map((vehicle) => (
              <div key={getVehicleRecordKey(vehicle)}>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-600">
                    {vehicle.transporte} · {vehicle.vehiculo}
                  </span>
                  <span className="font-semibold text-[#10223d]">{vehicle.cajas.toLocaleString("es-CO")}</span>
                </div>
                <div className="h-4 overflow-hidden rounded-md bg-slate-100">
                  <div className="h-full rounded-md bg-[#0f7c58]" style={{ width: `${(vehicle.cajas / maxCajas) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
            No hay vehiculos para el filtro seleccionado.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-[#10223d]">Estado de rutas</h2>
          <p className="mt-1 text-sm text-slate-500">No mezcla placas repetidas porque separa por DT y fecha.</p>
        </div>
        <div className="space-y-4">
          {statusItems.map((item) => (
            <div key={item.status}>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-600">{item.status}</span>
                <span className="font-semibold text-[#10223d]">{item.count}</span>
              </div>
              <div className="h-4 overflow-hidden rounded-md bg-slate-100">
                <div className="h-full rounded-md bg-[#f5bd19]" style={{ width: `${(item.count / maxStatus) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(String(value ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dateValue(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const text = stringValue(value);
  if (!text) return "";

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return "";

  const [, day, month, year] = match;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function mapAttendanceToVehicle(registro: AsistenciaRegistro): Vehiculo {
  const createdAt = new Date(registro.createdAt);
  const fecha = createdAt.toISOString().slice(0, 10);

  return {
    mes: createdAt.toLocaleDateString("es-CO", { month: "long" }),
    cd: "Punto Corona",
    transportista: registro.contratista,
    llave: registro.llave,
    transporte: registro.dt,
    centro: "Punto Corona",
    codTransportista: "-",
    fechaDt: fecha,
    fechaDespacho: fecha,
    vehiculo: `DT-${registro.dt}`,
    responsable: `RR ${registro.cedulaResponsable}`,
    territorio: "Pendiente",
    viaje: "Pendiente",
    bloque: "Pendiente",
    cajas: 0,
    hl: 0,
    clientes: 1,
    visitados: 0,
    horaSalida: "Pendiente",
    peso: 0,
    capacidad: 1,
    validadorPeso: "Pendiente",
    avanceRuta: "0%",
    status: "Cargando",
    horaLlegada: "Pendiente",
    tiempoRuta: "Pendiente",
    metaRelevo: "Pendiente",
    horaInicioRelevo: "Pendiente",
    clasificacionRelevo: "Pendiente",
    alertaSifPotencial: "Pendiente",
    relevador: "-",
    causalDesviado: "-",
    clasificacionOnTime: "Pendiente",
    recargue: "Pendiente",
    cedulaResponsable: registro.cedulaResponsable,
    cedulaAuxiliar1: registro.cedulaAuxiliar1,
    cedulaAuxiliar2: registro.cedulaAuxiliar2,
  };
}

function enrichVehiclesWithModulacion(vehiculos: Vehiculo[], modulaciones: ReturnType<typeof readModulacionRegistros>) {
  return vehiculos.map((vehiculo) => {
    const registrosDt = getModulacionesByDt(modulaciones, vehiculo.transporte);
    const resumen = summarizeModulaciones(registrosDt, vehiculo.cajas);

    return {
      ...vehiculo,
      cajasRechazadas: resumen.cajasRechazadas,
      cajasReubicadas: resumen.cajasReubicadas,
      clientesRechazan: resumen.clientesRechazan,
      topeMaximoCajas: resumen.topeMaximoCajas,
      refusal: resumen.refusal,
      moduladores: resumen.moduladores,
      causalesModulacion: resumen.causales,
    };
  });
}
