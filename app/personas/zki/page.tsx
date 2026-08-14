"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Database, Eye, FileSpreadsheet, RefreshCw, Search, ShieldX, SlidersHorizontal, Trash2, Truck, Upload, UserPlus, Users, X } from "lucide-react";
import {
  assignUniqueResponsibles,
  assignCompatibleVehicles,
  capacityMap,
  DEFAULT_ZKI_SETTINGS,
  parseCrewHistory,
  parseTrips,
  parseTerritoryClients,
  parseZkiVisits,
  rankCandidates,
  type Candidate,
  type RawRow,
  type ZkiSettings,
} from "./zkiEngine";

type ApiData = { rows: RawRow[]; history: RawRow[]; capacities: RawRow[]; source: { table: string; rows: number; columns?: string[] } };
type PersonnelRule = { id: string; name: string; role: "RR" | "Conductor" | "Auxiliar"; available: boolean; contractor?: string };
type VehicleStatus = { plate: string; contractor: string; capacity: number; available: boolean; useInZki: boolean };
const ZKI_BROWSER_CACHE_KEY = "zki-dashboard-cache-v2";

function isApiData(value: unknown): value is ApiData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ApiData>;
  return Array.isArray(candidate.rows) && Array.isArray(candidate.history) && Array.isArray(candidate.capacities)
    && Boolean(candidate.source && typeof candidate.source.rows === "number");
}

function normalizePerson(value: unknown) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function candidatePersonnelAvailable(candidate: Candidate, rules: PersonnelRule[]) {
  const unavailable = rules.filter((person) => !person.available);
  const matches = (person: PersonnelRule, id: string, name: string) =>
    (person.id && id && person.id.replace(/\D/g, "") === id.replace(/\D/g, "")) ||
    (person.name && normalizePerson(person.name) === normalizePerson(name));
  // Un RR histórico no puede planearse si ya no pertenece al catálogo
  // vigente de Logísticos (el API depura ese catálogo con asistencias).
  const activeResponsible = rules.some((person) => person.role === "RR" && person.available && matches(person, candidate.rrId, candidate.rr));
  const blocked = (id: string, name: string) => unavailable.some((person) => matches(person, id, name));
  return activeResponsible && !blocked(candidate.driverId, candidate.driver) && !blocked(candidate.auxiliaryId, candidate.auxiliary);
}

export default function ZkiPage() {
  const router = useRouter();
  const uploadRef = useRef<HTMLInputElement>(null);
  const territoryUploadRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<ApiData | null>(null);
  const [settings, setSettings] = useState<ZkiSettings>(DEFAULT_ZKI_SETTINGS);
  const [selectedTrip, setSelectedTrip] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [planningRows, setPlanningRows] = useState<RawRow[]>([]);
  const [territoryRows, setTerritoryRows] = useState<RawRow[]>([]);
  const [showMatrix, setShowMatrix] = useState(false);
  const [showPersonnel, setShowPersonnel] = useState(false);
  const [showVehicles, setShowVehicles] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleContractor, setVehicleContractor] = useState("Todos");
  const [vehicleAvailability, setVehicleAvailability] = useState<Record<string, VehicleStatus>>({});
  const [vehicleError, setVehicleError] = useState("");
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [personnelRules, setPersonnelRules] = useState<PersonnelRule[]>([]);
  const [personForm, setPersonForm] = useState({ id: "", name: "", role: "RR" as PersonnelRule["role"] });

  async function loadPersonnel() {
    const response = await fetch("/api/people/zki/personnel", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      const records = (body.records || []) as PersonnelRule[];
      setPersonnelRules([...new Map(records.map((person) => [person.id, person])).values()]);
    }
  }

  useEffect(() => { void loadPersonnel(); }, []);

  async function loadVehicleAvailability() {
    const response = await fetch("/api/people/zki/vehicles", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setVehicleError(body.error || "No se pudieron cargar las placas."); return; }
    setVehicleError("");
    setVehicleAvailability(Object.fromEntries(((body.records || []) as VehicleStatus[]).map((vehicle) => [vehicle.plate, vehicle])));
  }

  useEffect(() => { void loadVehicleAvailability(); }, []);

  async function load(forceRefresh = false, background = false) {
    if (!background) setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/people/zki${forceRefresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo cargar ZKI.");
      if (!isApiData(body)) throw new Error("La respuesta de ZKI está incompleta. Actualiza nuevamente.");
      setData(body);
      try { sessionStorage.setItem(ZKI_BROWSER_CACHE_KEY, JSON.stringify(body)); } catch { /* La caché es opcional. */ }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cargar ZKI.");
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(ZKI_BROWSER_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as unknown;
        if (isApiData(parsed)) {
          setData(parsed);
          setLoading(false);
          void load(false, true);
          return;
        }
        sessionStorage.removeItem(ZKI_BROWSER_CACHE_KEY);
      }
    } catch { /* Si la copia local falla, se consulta normalmente. */ }
    void load();
  }, []);

  const trips = useMemo(() => parseTrips(planningRows), [planningRows]);
  const history = useMemo(() => parseCrewHistory(data?.history || []), [data]);
  const visits = useMemo(() => parseZkiVisits(data?.rows || []), [data]);
  const territoryClients = useMemo(() => parseTerritoryClients(territoryRows), [territoryRows]);
  const activeTrip = trips.find((trip) => trip.id === selectedTrip) || trips[0];
  const clientsForTrip = useMemo(
    () => activeTrip ? territoryClients.filter((row) => row.territoryId === activeTrip.territoryId).map((row) => row.client) : [],
    [activeTrip, territoryClients],
  );
  const allCapacities = useMemo(() => capacityMap([...(data?.capacities || []), ...(data?.history || []), ...planningRows]), [data?.capacities, data?.history, planningRows]);
  const capacities = useMemo(() => {
    // La tabla `placas`, representada por vehicleAvailability, es la lista
    // blanca. Historial, capacidad_carga y el Excel solo aportan capacidad;
    // nunca pueden incorporar por sí solos una placa a la planeación.
    return new Map(Object.values(vehicleAvailability)
      .filter((vehicle) => vehicle.available && vehicle.useInZki)
      .map((vehicle) => [vehicle.plate, vehicle.capacity || allCapacities.get(vehicle.plate) || 0]));
  }, [allCapacities, vehicleAvailability]);
  const filteredVehicles = useMemo(() => Object.values(vehicleAvailability)
    .map((vehicle) => ({ ...vehicle, capacity: vehicle.capacity || allCapacities.get(vehicle.plate) || 0 }))
    .filter((vehicle) => vehicle.plate.includes(normalizePerson(vehicleSearch)) && (vehicleContractor === "Todos" || vehicle.contractor === vehicleContractor)), [allCapacities, vehicleAvailability, vehicleContractor, vehicleSearch]);
  const vehicleContractors = useMemo(() => ["Todos", ...new Set(Object.values(vehicleAvailability).map((vehicle) => vehicle.contractor))], [vehicleAvailability]);
  const filteredPersonnel = useMemo(() => {
    const query = normalizePerson(personnelSearch);
    if (!query) return personnelRules;
    return personnelRules.filter((person) => normalizePerson(`${person.name} ${person.id} ${person.role}`).includes(query));
  }, [personnelRules, personnelSearch]);
  const rankedPlanning = useMemo(() => trips.map((trip) => {
    const clientCodes = territoryClients.filter((row) => row.territoryId === trip.territoryId).map((row) => row.client);
    const ranked = rankCandidates(trip, history, visits, clientCodes, capacities, settings).filter((candidate) => candidatePersonnelAvailable(candidate, personnelRules));
    return { trip, candidates: ranked };
  }), [capacities, history, personnelRules, settings, territoryClients, trips, visits]);
  const planning = useMemo(() => {
    const assignments = assignUniqueResponsibles(rankedPlanning.map(({ trip, candidates: ranked }) => ({ tripId: trip.id, candidates: ranked })));
    const basePlanning = rankedPlanning.map(({ trip, candidates: ranked }) => ({ trip, candidates: ranked, recommendation: assignments.get(trip.id) }));
    const vehicleAssignments = assignCompatibleVehicles(basePlanning, capacities);
    return basePlanning.map((item) => ({ ...item, recommendation: vehicleAssignments.get(item.trip.id) || item.recommendation }));
  }, [capacities, rankedPlanning]);
  const candidates = useMemo(
    () => activeTrip ? rankCandidates(activeTrip, history, visits, clientsForTrip, capacities, settings).filter((candidate) => candidatePersonnelAvailable(candidate, personnelRules)) : [],
    [activeTrip, capacities, clientsForTrip, history, personnelRules, settings, visits],
  );
  const viable = candidates.filter((candidate) => candidate.viable);
  const recommendation = planning.find(({ trip }) => trip.id === activeTrip?.id)?.recommendation;
  const source = data?.source;

  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/people/zki/upload", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo subir el Excel.");
      applyUploadedRows(Array.isArray(body.rows) ? body.rows : [], file.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo subir el Excel.");
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function uploadTerritories(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/people/zki/upload", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo leer el catálogo de territorios.");
      applyUploadedRows(Array.isArray(body.rows) ? body.rows : [], file.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo leer el catálogo de territorios.");
    } finally {
      setUploading(false);
      if (territoryUploadRef.current) territoryUploadRef.current.value = "";
    }
  }

  function applyUploadedRows(rows: RawRow[], fileName: string) {
    const detectedTerritories = parseTerritoryClients(rows);
    const detectedTrips = parseTrips(rows);
    if (detectedTerritories.length > 0 && detectedTrips.length === 0) {
      setTerritoryRows(rows);
      setMessage(`${detectedTerritories.length.toLocaleString("es-CO")} relaciones territorio–cliente detectadas en ${fileName}.`);
      return;
    }
    if (detectedTrips.length > 0) {
      setPlanningRows(rows);
      setSelectedTrip("");
      setMessage(`${detectedTrips.length.toLocaleString("es-CO")} viajes detectados en ${fileName}. La tabla histórica ZKI no fue modificada.`);
      return;
    }
    throw new Error("No se reconocieron columnas de viajes ni de territorio–cliente en el archivo.");
  }

  async function downloadExcel() {
    if (!planning.length) {
      setError("Carga los viajes y el catálogo de territorios antes de generar el Excel.");
      return;
    }
    const XLSX = await import("xlsx");
    const assignments = planning.map(({ trip, recommendation: item }) => ({
      "ID territorio": trip.territoryId,
      "Peso territorio": trip.weight,
      "Cedula responsable": item?.rrId || "",
      "ZKI responsable": item?.zki || 0,
      "Nombre responsable": item?.rr || "Sin historial suficiente",
      "Nombre conductor": item?.driver || "",
      "Cedula conductor": item?.driverId || "",
      Placa: item?.vehicle || "",
      "Capacidad de carga": item?.capacity || 0,
      "Cedula auxiliar": item?.auxiliaryId || "",
      "ZKI auxiliar": item?.auxiliaryZki || 0,
      "Nombre auxiliar": item?.auxiliary || "",
      "ZKI total": item?.totalZki || 0,
      Estado: item?.viable ? "Viable" : item?.reason || "Sin asignación",
    }));
    const matrix = planning.flatMap(({ trip, candidates: ranked }) => ranked.map((item) => ({
      "ID territorio": trip.territoryId,
      "ID Empleado": item.rrId,
      Tipo: 1,
      Nombre: item.rr,
      "% Cobertura": item.coverage,
      "Frecuencia Promedio": item.frequency,
      "Frecuencia Tope": Math.min(item.frequency, settings.frequencyCap),
      "% Clientes 5+": item.depth,
      ZKI: item.zki,
      "Nombre auxiliar": item.auxiliary,
      "ZKI auxiliar": item.auxiliaryZki,
      "ZKI total": item.totalZki,
      Vehículo: item.vehicle,
      Capacidad: item.capacity,
      Estado: item.viable ? "Viable" : item.reason,
    })));
    const workbook = XLSX.utils.book_new();
    const assignmentsSheet = XLSX.utils.json_to_sheet(assignments);
    const matrixSheet = XLSX.utils.json_to_sheet(matrix);
    assignmentsSheet["!cols"] = [12, 16, 20, 16, 34, 34, 20, 14, 20, 18, 14, 34, 14, 42].map((wch) => ({ wch }));
    matrixSheet["!cols"] = [12, 18, 8, 34, 14, 20, 17, 16, 12, 34, 14, 14, 16, 14, 42].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(workbook, assignmentsSheet, "Asignaciones");
    XLSX.utils.book_append_sheet(workbook, matrixSheet, "Matriz SKI");
    XLSX.writeFile(workbook, `asignaciones_zki_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function addPerson(event: FormEvent) {
    event.preventDefault();
    const name = personForm.name.trim(); const id = personForm.id.replace(/\D/g, "");
    if (!name || !id) { setError("La cédula y el nombre son obligatorios."); return; }
    const response = await fetch("/api/people/zki/personnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...personForm, id, name, contractor: "Logisticos", available: true }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || "No se pudo agregar la persona."); return; }
    setPersonnelRules((current) => [...current, body.person as PersonnelRule].sort((a, b) => a.name.localeCompare(b.name, "es")));
    setPersonForm({ id: "", name: "", role: "Conductor" });
    setShowAddPerson(false);
    setError("");
    setMessage(`${name} fue agregado a la base de datos.`);
  }

  async function setPersonAvailability(person: PersonnelRule, available: boolean) {
    const response = await fetch("/api/people/zki/personnel", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...person, available }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || "No se pudo actualizar la disponibilidad."); return; }
    setPersonnelRules((current) => current.map((item) => item.id === person.id ? { ...item, available } : item));
    setError("");
    setMessage(`${person.name} quedó ${available ? "disponible" : "indisponible"} para la planeación.`);
  }

  async function removePerson(person: PersonnelRule) {
    if (!confirm(`¿Eliminar definitivamente a ${person.name} (CC ${person.id}) de la base de datos? Esta acción no se puede deshacer.`)) return;
    const response = await fetch(`/api/people/zki/personnel?id=${encodeURIComponent(person.id)}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || "No se pudo eliminar la persona."); return; }
    setPersonnelRules((current) => current.filter((item) => item.id !== person.id));
    setMessage(`${person.name} fue eliminado de la base de datos.`);
  }

  async function updateVehicle(plate: string, changes: Partial<VehicleStatus>) {
    const current = vehicleAvailability[plate];
    if (!current) return;
    const next = { ...current, ...changes };
    const response = await fetch("/api/people/zki/vehicles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || "No se pudo actualizar el vehículo."); return; }
    setVehicleAvailability((statuses) => ({ ...statuses, [plate]: next }));
    setError("");
    setMessage(`Se actualizó el vehículo ${plate.toUpperCase()} para la planeación.`);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#eef2f5] text-slate-900">
      <header className="border-b border-[#17364d] bg-[#0b2235] text-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-5 py-4 sm:px-8">
          <button aria-label="Volver" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-white/10" onClick={() => router.push("/")} type="button"><ArrowLeft size={20} /></button>
          <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-300">People Intelligence</p><h1 className="text-xl font-semibold">Planeación ZKI</h1></div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5 sm:px-8">
        {error ? <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="shrink-0" size={19} /><span>{error}</span></div> : null}
        {message ? <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 size={19} />{message}</div> : null}
        {source?.rows === 0 ? <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"><p className="font-bold">La consulta autenticada recibió 0 filas de la tabla ZKI.</p><p className="mt-1 text-xs leading-5">Supabase puede mostrar registros en el editor y aun así ocultarlos a la aplicación por RLS. Ejecuta <code className="rounded bg-red-100 px-1">supabase/zki_access.sql</code> en el SQL Editor y luego pulsa Actualizar.</p></div> : null}
        {source && source.rows > 0 && visits.length === 0 ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">ZKI contiene {formatNumber(source.rows)} filas, pero no se reconocieron las columnas cliente–RR.</p><p className="mt-1 text-xs">Columnas recibidas: {(source.columns || []).join(", ") || "sin columnas detectables"}.</p></div> : null}

        <section className="rounded-xl border border-slate-300 bg-white shadow-sm">
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-cyan-50 text-cyan-800"><Database size={21} /></span>
              <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Fuente operativa</p><h2 className="text-xl font-semibold text-[#0b2235]">Tabla ZKI + histórico de tripulaciones</h2><p className="mt-1 text-sm text-slate-500">Cruza cada zona con RR, conductor y vehículo habitual; el sobrepeso bloquea la opción.</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50" disabled={loading} onClick={() => void load(true)} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={16} />Actualizar</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-cyan-300 bg-cyan-50 px-4 text-sm font-semibold text-cyan-900 hover:bg-cyan-100" onClick={() => setShowPersonnel(true)} type="button"><UserPlus size={16} />Personal</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100" onClick={() => setShowVehicles(true)} type="button"><Truck size={16} />Vehículos</button>
              <input accept=".xlsx,.xls" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} ref={uploadRef} type="file" />
              <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0b2235] px-4 text-sm font-semibold text-white disabled:bg-slate-400" disabled={uploading} onClick={() => uploadRef.current?.click()} type="button"><Upload size={16} />{uploading ? "Importando…" : "Cargar viajes"}</button>
              <input accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={(event) => void uploadTerritories(event.target.files?.[0])} ref={territoryUploadRef} type="file" />
              <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-cyan-700 px-4 text-sm font-semibold text-white disabled:bg-slate-400" disabled={uploading} onClick={() => territoryUploadRef.current?.click()} type="button"><Users size={16} />Cargar territorios</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-400" disabled={!planning.length} onClick={() => void downloadExcel()} type="button"><FileSpreadsheet size={16} />Descargar Excel</button>
            </div>
          </div>
          <div className="grid border-t border-slate-200 bg-slate-50 sm:grid-cols-4">
            <Stat label="Viajes cargados" value={trips.length} />
            <Stat label="Clientes históricos" value={new Set(visits.map((row) => row.client)).size} />
            <Stat label="Clientes del catálogo" value={new Set(territoryClients.map((row) => row.client)).size} />
            <Stat label="Opciones viables" value={viable.length} />
          </div>
        </section>

        <section className="grid min-w-0 gap-5 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-5">
            <section className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2"><SlidersHorizontal size={18} className="text-cyan-700" /><h2 className="font-semibold text-[#0b2235]">Parámetros ZKI</h2></div>
              <div className="space-y-4">
                <Setting label="Peso cobertura" suffix="%" value={settings.coverageWeight} onChange={(value) => setSettings({ ...settings, coverageWeight: value })} />
                <Setting label="Peso frecuencia" suffix="%" value={settings.frequencyWeight} onChange={(value) => setSettings({ ...settings, frequencyWeight: value })} />
                <Setting label="Peso profundidad" suffix="%" value={settings.depthWeight} onChange={(value) => setSettings({ ...settings, depthWeight: value })} />
                <Setting label="Tope frecuencia" value={settings.frequencyCap} onChange={(value) => setSettings({ ...settings, frequencyCap: Math.max(1, value) })} />
                <Setting label="Visitas para profundidad" value={settings.depthThreshold} onChange={(value) => setSettings({ ...settings, depthThreshold: Math.max(1, value) })} />
                <Setting label="Umbral viable" suffix="%" value={settings.minimumZki} onChange={(value) => setSettings({ ...settings, minimumZki: value })} />
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-500">Profundidad cuenta los clientes que el RR atendió al menos el número de veces configurado.</p>
            </section>

            <section className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm">
              <label className="text-xs font-bold uppercase tracking-[.14em] text-slate-500" htmlFor="trip">Zona o viaje</label>
              <select className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" id="trip" onChange={(event) => setSelectedTrip(event.target.value)} value={activeTrip?.id || ""}>
                {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.zone}</option>)}
              </select>
              {activeTrip ? <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><Detail label="ID territorio" value={activeTrip.territoryId || "—"} /><Detail label="Clientes catálogo" value={formatNumber(clientsForTrip.length)} /><Detail label="Peso" value={`${formatNumber(activeTrip.weight)} kg`} /><Detail label="Clientes plan" value={formatNumber(activeTrip.clients)} /><Detail label="Placa plan" value={activeTrip.assignedPlate || "—"} /><Detail label="Peso máx." value={`${formatNumber(activeTrip.maximumWeight)} kg`} /></div> : null}
            </section>
          </aside>

          <div className="min-w-0 space-y-5">
            <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="font-semibold text-[#0b2235]">Asignaciones recomendadas</h2><p className="mt-1 text-xs text-slate-500">Una salida resumida por territorio. La matriz completa queda disponible para auditoría.</p></div>
                <div className="flex gap-2"><button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-50" onClick={() => setShowMatrix((value) => !value)} type="button"><Eye size={15} />{showMatrix ? "Ocultar matriz" : "Ver matriz completa"}</button><button className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white disabled:bg-slate-400" disabled={!planning.length} onClick={() => void downloadExcel()} type="button"><FileSpreadsheet size={15} />Descargar Excel</button></div>
              </div>
              <div className="max-h-[680px] w-full max-w-full overflow-auto overscroll-contain">
                <table className="w-full min-w-[1120px] table-fixed text-left text-xs">
                  <thead className="sticky top-0 z-20 bg-[#10283d] text-[10px] uppercase tracking-[.12em] text-white"><tr><th className="w-[110px] px-4 py-3.5">Territorio</th><th className="w-[160px] px-4 py-3.5">Carga</th><th className="w-[220px] px-4 py-3.5">Responsable</th><th className="w-[220px] px-4 py-3.5">Conductor / vehículo</th><th className="w-[220px] px-4 py-3.5">Auxiliar</th><th className="w-[110px] px-4 py-3.5 text-center">ZKI total</th><th className="w-[180px] px-4 py-3.5">Estado</th></tr></thead>
                  <tbody>{planning.map(({ trip, recommendation: item }, index) => (
                    <tr className={`border-b border-slate-200 align-middle transition hover:bg-cyan-50/70 ${index % 2 ? "bg-slate-50/70" : "bg-white"}`} key={trip.id}>
                      <td className="px-4 py-3.5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#10283d] text-sm font-black text-white">{trip.territoryId}</span><p className="mt-1 max-w-24 truncate text-[10px] text-slate-400" title={trip.zone}>{trip.zone}</p></td>
                      <td className="px-4 py-3.5"><p className="font-bold text-slate-800">{formatNumber(trip.weight)} kg</p><p className="mt-1 text-[10px] text-slate-500">Capacidad: {item?.capacity ? `${formatNumber(item.capacity)} kg` : "pendiente"}</p>{item?.capacity ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${trip.weight <= item.capacity ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, (trip.weight / item.capacity) * 100)}%` }} /></div> : null}</td>
                      <td className="px-4 py-3.5"><p className="font-bold leading-5 text-[#10283d]">{item?.rr || "Sin historial suficiente"}</p>{item ? <ScoreBadge value={item.zki} /> : null}</td>
                      <td className="px-4 py-3.5"><p className="font-medium leading-5 text-slate-700">{item?.driver || "Sin conductor"}</p><span className="mt-1 inline-flex rounded-md bg-slate-200 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">{item?.vehicle || "Sin placa"}</span></td>
                      <td className="px-4 py-3.5"><p className="font-medium leading-5 text-slate-700">{item?.auxiliary || "Sin auxiliar"}</p>{item ? <ScoreBadge value={item.auxiliaryZki} /> : null}</td>
                      <td className="px-4 py-3.5 text-center">{item ? <span className={`inline-grid min-w-16 place-items-center rounded-xl px-3 py-2 text-base font-black ${item.totalZki >= 160 ? "bg-emerald-100 text-emerald-800" : item.totalZki >= 120 ? "bg-cyan-100 text-cyan-900" : "bg-amber-100 text-amber-800"}`}>{formatNumber(item.totalZki)}</span> : "—"}</td>
                      <td className="px-4 py-3.5"><AssignmentStatus candidate={item} /></td>
                    </tr>
                  ))}</tbody>
                </table>
                {!planning.length ? <Empty icon={<FileSpreadsheet size={28} />} text="Carga viajes y territorios para generar las asignaciones y el Excel." /> : null}
              </div>
            </section>

            {recommendation ? (
              <section className="rounded-xl border border-emerald-300 bg-gradient-to-r from-emerald-50 to-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-700">Recomendación actual</p><h2 className="mt-1 text-2xl font-bold text-[#0b2235]">{recommendation.rr}</h2><p className="mt-1 text-sm text-slate-600">{recommendation.driver} · {recommendation.vehicle}</p></div>
                  <div className="rounded-xl bg-[#0b2235] px-6 py-3 text-center text-white"><p className="text-[10px] uppercase tracking-[.16em] text-cyan-200">ZKI estimado</p><p className="text-3xl font-black">{formatPercent(recommendation.zki)}</p></div>
                </div>
              </section>
            ) : null}

            {showMatrix ? <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 p-5"><div><h2 className="font-semibold text-[#0b2235]">Todas las combinaciones</h2><p className="mt-1 text-xs text-slate-500">Primero aparecen las viables y luego las bloqueadas por capacidad.</p></div><Users size={20} className="text-cyan-700" /></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-xs">
                  <thead className="bg-slate-100 text-[10px] uppercase tracking-wider text-slate-600"><tr><Th>Estado</Th><Th>Responsable</Th><Th>Conductor</Th><Th>Vehículo</Th><Th>Cobertura</Th><Th>Frecuencia</Th><Th>Profundidad</Th><Th>ZKI responsable</Th><Th>Auxiliar</Th><Th>ZKI auxiliar</Th><Th>ZKI total</Th><Th>Capacidad</Th><Th>Decisión</Th></tr></thead>
                  <tbody>{candidates.map((candidate) => <CandidateRow candidate={candidate} key={`${candidate.rr}:${candidate.driver}:${candidate.vehicle}`} />)}</tbody>
                </table>
                {!loading && !trips.length ? <Empty icon={<Truck size={28} />} text="Falta cargar el Excel de viajes para comenzar la planeación. Este archivo no modifica la tabla histórica ZKI." /> : null}
                {!loading && trips.length > 0 && !visits.length ? <Empty icon={<Database size={28} />} text="Los viajes están listos, pero la tabla histórica ZKI no devolvió relaciones cliente–RR. Sin ese historial todavía no se puede calcular el conocimiento." /> : null}
                {!loading && trips.length > 0 && visits.length > 0 && !candidates.length ? <Empty icon={<Users size={28} />} text="Este viaje no tiene coincidencias cliente–RR en ZKI. Se marca sin historial suficiente y no se le asigna artificialmente un porcentaje de 0%." /> : null}
                {loading ? <Empty icon={<RefreshCw className="animate-spin" size={28} />} text="Calculando combinaciones…" /> : null}
              </div>
            </section> : null}
          </div>
        </section>
      </section>
      {showPersonnel ? (
        <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPersonnel(false); }} role="dialog">
          <section className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <header className="flex items-center justify-between bg-[#0b2235] px-5 py-4 text-white">
              <div><p className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-300">Planeación ZKI</p><h2 className="text-lg font-bold">Disponibilidad del personal</h2><p className="text-xs text-slate-300">Personal cargado desde la base de datos.</p></div>
              <button aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" onClick={() => setShowPersonnel(false)} type="button"><X size={18} /></button>
            </header>
            <div className="border-b border-slate-200 bg-slate-50 p-4">
              <div className="flex gap-2">
                <label className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" onChange={(event) => setPersonnelSearch(event.target.value)} placeholder="Buscar por nombre, cédula o cargo" value={personnelSearch} />
                </label>
                <button className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 text-sm font-bold text-white hover:bg-cyan-800" onClick={() => setShowAddPerson((current) => !current)} type="button"><UserPlus size={16} />{showAddPerson ? "Cancelar" : "Nueva persona"}</button>
              </div>
              {showAddPerson ? <form className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[130px_1fr_130px_auto]" onSubmit={addPerson}>
                <input className="h-10 rounded-lg border border-slate-300 px-3 text-sm" onChange={(event) => setPersonForm({ ...personForm, id: event.target.value })} placeholder="Cédula" value={personForm.id} />
                <input className="h-10 rounded-lg border border-slate-300 px-3 text-sm" onChange={(event) => setPersonForm({ ...personForm, name: event.target.value })} placeholder="Nombre completo" value={personForm.name} />
                <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm" onChange={(event) => setPersonForm({ ...personForm, role: event.target.value as PersonnelRule["role"] })} value={personForm.role}><option>RR</option><option>Conductor</option><option>Auxiliar</option></select>
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cyan-700 px-4 text-sm font-bold text-white" type="submit"><UserPlus size={15} />Agregar</button>
              </form> : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {filteredPersonnel.length ? <div className="space-y-2">{filteredPersonnel.map((person) => (
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-slate-200 p-3" key={person.id}>
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-slate-800">{person.name}</p><p className="text-[10px] font-semibold uppercase text-slate-400">{person.role} · {person.contractor || "Sin contratista"} · CC {person.id}</p></div>
                  <button className={`rounded-full px-3 py-1.5 text-[10px] font-black ${person.available ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`} onClick={() => void setPersonAvailability(person, !person.available)} type="button">{person.available ? "Disponible" : "Indisponible"}</button>
                  <button aria-label={`Eliminar definitivamente a ${person.name}`} className="grid h-8 w-8 place-items-center rounded-lg text-red-600 hover:bg-red-50" onClick={() => void removePerson(person)} title="Eliminar de la empresa" type="button"><Trash2 size={15} /></button>
                </div>
              ))}</div> : <div className="grid min-h-40 place-items-center text-center text-sm text-slate-400">{personnelSearch ? "No se encontraron personas con esa búsqueda." : "No hay RR, conductores ni auxiliares en la base de datos."}</div>}
            </div>
          </section>
        </div>
      ) : null}
      {showVehicles ? (
        <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowVehicles(false); }} role="dialog">
          <section className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <header className="flex items-center justify-between bg-[#0b2235] px-5 py-4 text-white">
              <div><p className="text-[9px] font-black uppercase tracking-[.16em] text-amber-300">Planeación ZKI</p><h2 className="text-lg font-bold">Disponibilidad de vehículos</h2><p className="text-xs text-slate-300">Fuente: tabla placa. Los vehículos externos requieren habilitación.</p></div>
              <button aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/10" onClick={() => setShowVehicles(false)} type="button"><X size={18} /></button>
            </header>
            <div className="border-b border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-2 sm:grid-cols-[1fr_210px]">
                <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" onChange={(event) => setVehicleSearch(event.target.value)} placeholder="Buscar placa" value={vehicleSearch} /></label>
                <select className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm" onChange={(event) => setVehicleContractor(event.target.value)} value={vehicleContractor}>{vehicleContractors.map((contractor) => <option key={contractor}>{contractor}</option>)}</select>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {vehicleError ? <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{vehicleError}</div> : null}
              {filteredVehicles.length ? <div className="space-y-2">{filteredVehicles.map((vehicle) => {
                const isOwn = vehicle.contractor === "Logisticos";
                return <div className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center" key={vehicle.plate}>
                  <div><p className="font-mono text-base font-black uppercase text-slate-800">{vehicle.plate}</p><p className="text-[10px] font-semibold uppercase text-slate-400">{vehicle.contractor} · Capacidad: {vehicle.capacity ? `${formatNumber(vehicle.capacity)} kg` : "Sin dato"}</p></div>
                  <button className={`rounded-full px-3 py-2 text-[10px] font-black ${vehicle.useInZki ? "bg-cyan-100 text-cyan-800" : "bg-slate-200 text-slate-600"}`} onClick={() => void updateVehicle(vehicle.plate, { useInZki: !vehicle.useInZki })} type="button">{vehicle.useInZki ? (isOwn ? "En uso" : "Usar externo") : "No usar"}</button>
                  <button className={`rounded-full px-3 py-2 text-[10px] font-black ${vehicle.available ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`} onClick={() => void updateVehicle(vehicle.plate, { available: !vehicle.available })} type="button">{vehicle.available ? "Disponible" : "Indisponible"}</button>
                </div>;
              })}</div> : <div className="grid min-h-40 place-items-center text-center text-sm text-slate-400">No se encontraron vehículos.</div>}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function CandidateRow({ candidate }: { candidate: Candidate }) {
  const status = candidate.viable ? "Viable" : candidate.hasKnowledge ? "Bloqueada" : "No evaluable";
  return <tr className={`border-b border-slate-100 ${candidate.viable ? "" : "bg-red-50/60"}`}><Td>{candidate.viable ? <span className="inline-flex items-center gap-1 font-bold text-emerald-700"><CheckCircle2 size={15} />{status}</span> : <span className="inline-flex items-center gap-1 font-bold text-red-700"><ShieldX size={15} />{status}</span>}</Td><Td strong>{candidate.rr}</Td><Td>{candidate.driver}</Td><Td>{candidate.vehicle}</Td><Td>{formatPercent(candidate.coverage)}</Td><Td>{formatNumber(candidate.frequency)} / {formatPercent(candidate.frequencyScore)}</Td><Td>{formatPercent(candidate.depth)}</Td><Td><span className={`rounded-md px-2 py-1 font-black ${candidate.zki >= 80 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{formatPercent(candidate.zki)}</span></Td><Td>{candidate.auxiliary}</Td><Td>{formatPercent(candidate.auxiliaryZki)}</Td><Td><span className="rounded-md bg-cyan-100 px-2 py-1 font-black text-cyan-900">{formatNumber(candidate.totalZki)}</span></Td><Td>{candidate.capacity ? `${formatNumber(candidate.capacity)} kg` : "Sin dato"}</Td><Td><span className={candidate.viable ? "text-slate-600" : "font-semibold text-red-700"}>{candidate.reason}</span></Td></tr>;
}

function ScoreBadge({ value }: { value: number }) {
  const tone = value >= 80 ? "bg-emerald-100 text-emerald-800" : value >= 50 ? "bg-cyan-100 text-cyan-800" : "bg-amber-100 text-amber-800";
  return <span className={`mt-1.5 inline-flex rounded-md px-2 py-0.5 text-[10px] font-black ${tone}`}>ZKI {formatPercent(value)}</span>;
}

function AssignmentStatus({ candidate }: { candidate?: Candidate }) {
  if (!candidate) return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">Sin asignación</span>;
  if (candidate.viable) return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800"><CheckCircle2 size={12} />Viable</span>;
  const missingCapacity = !candidate.capacity;
  return <div title={candidate.reason}><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${missingCapacity ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}><AlertTriangle size={12} />{missingCapacity ? "Capacidad pendiente" : "Bloqueada por peso"}</span><p className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-slate-500">{candidate.reason}</p></div>;
}

function Stat({ danger = false, label, value }: { danger?: boolean; label: string; value: number }) { return <div className="border-b border-slate-200 px-5 py-3 last:border-0 sm:border-b-0 sm:border-r"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-1 text-2xl font-black ${danger ? "text-red-700" : "text-[#0b2235]"}`}>{formatNumber(value)}</p></div>; }
function Setting({ label, onChange, suffix, value }: { label: string; onChange: (value: number) => void; suffix?: string; value: number }) { return <label className="block"><span className="text-xs font-semibold text-slate-600">{label}</span><div className="mt-1 flex h-10 overflow-hidden rounded-lg border border-slate-300"><input className="min-w-0 flex-1 px-3 outline-none" min="0" onChange={(event) => onChange(Number(event.target.value) || 0)} type="number" value={value} />{suffix ? <span className="grid w-10 place-items-center bg-slate-100 text-xs font-bold text-slate-500">{suffix}</span> : null}</div></label>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-2"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 truncate font-semibold text-slate-700">{value}</p></div>; }
function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-3">{children}</th>; }
function Td({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) { return <td className={`px-3 py-3 ${strong ? "font-bold text-[#0b2235]" : "text-slate-600"}`}>{children}</td>; }
function Empty({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="grid min-h-52 place-items-center p-8 text-center text-slate-400"><div><span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-slate-100">{icon}</span><p className="max-w-md text-sm">{text}</p></div></div>; }
function formatNumber(value: number) { return Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 }); }
function formatPercent(value: number) { return `${formatNumber(value)}%`; }
