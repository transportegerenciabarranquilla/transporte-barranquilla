"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, Database, Eye, FileSpreadsheet, RefreshCw, Search, ShieldX, SlidersHorizontal, Truck, Upload, Users, X } from "lucide-react";
import { normalizeCedula, remainingActivePersonnel } from "../../lib/activePersonnel";
import {
  assignUniqueResponsibles,
  assignFreeResponsiblesToDriverVehicles,

  enforceUniqueAssignedCrew,
  capacityMap,
  DEFAULT_ZKI_SETTINGS,
  parseCrewHistory,
  parseTerritoryClients,
  parseZkiVisits,
  rankCandidates,
  rankTerritoryAuxiliaries,
  tripsFromTerritoryClients,
  samePerson,
  normalizeZkiCode,
  normalizePersonName,
  type Candidate,
  type RawRow,
  type ZkiVisit,
  type ZkiSettings,
} from "./zkiEngine";

type CrewPair = { plate: string; driver: string; driverId: string; responsible: string; responsibleId: string };
type ApiData = { rows: RawRow[]; history: RawRow[]; capacities: RawRow[]; crew: CrewPair[]; source: { table: string; rows: number; columns?: string[] } };
type PersonnelRule = { id: string; name: string; role: "RR" | "Líder de Ruta" | "Conductor" | "Auxiliar"; available: boolean; contractor?: string; minimumClients?: number; maximumClients?: number };
type VehicleStatus = { plate: string; contractor: string; capacity: number; available: boolean; useInZki: boolean };
const ZKI_BROWSER_CACHE_KEY = "zki-dashboard-cache-v7-free-rr";
const ACTIVE_PERSONNEL_CACHE_KEY = "zki-active-personnel-v1";
let zkiMemoryCache: ApiData | null = null;

function isApiData(value: unknown): value is ApiData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ApiData>;
  return Array.isArray(candidate.rows) && Array.isArray(candidate.history) && Array.isArray(candidate.capacities) && Array.isArray(candidate.crew)
    && Boolean(candidate.source && typeof candidate.source.rows === "number");
}

function normalizePerson(value: unknown) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function matchesPersonnel(person: PersonnelRule, id: string, name: string) {
  const personId = String(person.id || "").replace(/\D/g, "");
  const candidateId = String(id || "").replace(/\D/g, "");
  if (personId && candidateId) return personId === candidateId;
  return Boolean(person.name && name && normalizePersonName(person.name) === normalizePersonName(name));
}

function candidateIsActiveRr(candidate: Candidate, rules: PersonnelRule[]) {
  return rules.some((person) => (person.role === "RR" || normalizePerson(person.role).includes("liderderuta"))
    && normalizePerson(person.contractor) === "logisticos" && matchesPersonnel(person, candidate.rrId, candidate.rr));
}

function displayPlate(value: unknown) {
  const plate = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^CO[A-Z]{3}\d{3}$/.test(plate)) return plate;
  if (/^[A-Z]{3}\d{3}$/.test(plate)) return `CO${plate}`;
  return String(value || "").trim();
}

function resolveExportCrewIds(item: Candidate | undefined, personnel: PersonnelRule[]) {
  if (!item) return { responsibleId: "", driverId: "", auxiliaryId: "" };
  const byPerson = (id: string, name: string, roles: PersonnelRule["role"][]) => personnel.find((person) =>
    roles.includes(person.role) && matchesPersonnel(person, id, name),
  )?.id.replace(/\D/g, "") || "";
  const responsibleId = byPerson(item.rrId, item.rr, ["RR", "Líder de Ruta"]);
  let driverId = byPerson(item.driverId, item.driver, ["Conductor"]);
  const auxiliaryId = byPerson(item.auxiliaryId, item.auxiliary, ["Auxiliar"]);

  // Una cÃ©dula no puede identificar simultÃ¡neamente a dos nombres diferentes.
  // Si una fuente histÃ³rica la trae cruzada, conserva la del RR validada y no
  // replica el documento en la columna del conductor.
  if (responsibleId && driverId === responsibleId && normalizePerson(item.rr) !== normalizePerson(item.driver)) driverId = "";
  return { responsibleId, driverId, auxiliaryId };
}

export default function ZkiPage() {
  const router = useRouter();
  const uploadRef = useRef<HTMLInputElement>(null);
  const activePersonnelUploadRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<ApiData | null>(null);
  const [settings, setSettings] = useState<ZkiSettings>(DEFAULT_ZKI_SETTINGS);
  const [selectedTrip, setSelectedTrip] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activePersonnelIds, setActivePersonnelIds] = useState<string[] | null>(null);
  const [activePersonnelFileName, setActivePersonnelFileName] = useState("");
  const [activePersonnelDate, setActivePersonnelDate] = useState("");
  const [currentDate, setCurrentDate] = useState(todayKey);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [catalogRows, setCatalogRows] = useState<RawRow[]>([]);
  const [showMatrix, setShowMatrix] = useState(false);
  const [showVehicles, setShowVehicles] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleContractor, setVehicleContractor] = useState("Todos");
  const [vehicleAvailability, setVehicleAvailability] = useState<Record<string, VehicleStatus>>({});
  const [vehicleError, setVehicleError] = useState("");
  const [personnelRules, setPersonnelRules] = useState<PersonnelRule[]>([]);

  async function loadPersonnel() {
    const response = await fetch("/api/people/zki/personnel", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(body.error || "No se pudo cargar la tabla de personal."); return; }
    const records = (body.records || []) as PersonnelRule[];
    setPersonnelRules([...new Map(records.map((person) => [person.id, person])).values()]);
  }

  useEffect(() => { void loadPersonnel(); }, []);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(ACTIVE_PERSONNEL_CACHE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as { ids?: unknown; fileName?: unknown; date?: unknown };
      if (parsed.date !== todayKey()) { sessionStorage.removeItem(ACTIVE_PERSONNEL_CACHE_KEY); return; }
      if (Array.isArray(parsed.ids) && parsed.ids.every((id) => typeof id === "string" && Boolean(normalizeCedula(id)))) {
        setActivePersonnelIds(parsed.ids);
        setActivePersonnelFileName(typeof parsed.fileName === "string" ? parsed.fileName : "Excel de personal activo");
        setActivePersonnelDate(todayKey());
      }
    } catch { /* La carga puede repetirse si no hay copia local. */ }
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDate(todayKey()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
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
      zkiMemoryCache = body;
      setData(body);
      try { sessionStorage.setItem(ZKI_BROWSER_CACHE_KEY, JSON.stringify(body)); } catch { /* La caché es opcional. */ }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cargar ZKI.");
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
    if (zkiMemoryCache) {
      setData(zkiMemoryCache);
      setLoading(false);
      return;
    }
    try {
      const cached = sessionStorage.getItem(ZKI_BROWSER_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as unknown;
        if (isApiData(parsed)) {
          zkiMemoryCache = parsed;
          setData(parsed);
          setLoading(false);
          return;
        }
        sessionStorage.removeItem(ZKI_BROWSER_CACHE_KEY);
      }
    } catch { /* Si la copia local falla, se consulta normalmente. */ }
    void load();
  }, []);

  const history = useMemo(() => parseCrewHistory(data?.history || []), [data]);
  const visits = useMemo(() => parseZkiVisits(data?.rows || []), [data]);
  const trips = useMemo(() => tripsFromTerritoryClients(catalogRows, visits), [catalogRows, visits]);
  const hasCurrentPersonnel = Boolean(activePersonnelIds && activePersonnelDate === currentDate);
  const activePersonnel = useMemo(() => {
    const ids = new Set(hasCurrentPersonnel ? activePersonnelIds : []);
    return personnelRules.filter((person) => ids.has(normalizeCedula(person.id))).map((person) => ({ ...person, available: true }));
  }, [activePersonnelIds, hasCurrentPersonnel, personnelRules]);
  const activeCrewPairs = useMemo(() => (data?.crew || []).filter((pair) => activePersonnel.some((person) =>
    person.role === "Conductor" && matchesPersonnel(person, pair.driverId, pair.driver),
  )), [activePersonnel, data?.crew]);
  const auxiliaryRoster = useMemo(() => activePersonnel.filter((person) => person.role === "Auxiliar").map((person): ZkiVisit => ({
    rr: person.name, rrId: person.id, client: "", zone: "", driver: "", vehicle: "", role: "Auxiliar", count: 1,
  })), [activePersonnel]);
  const territoryClients = useMemo(() => parseTerritoryClients(catalogRows), [catalogRows]);
  const clientsByTerritory = useMemo(() => {
    const index = new Map<string, string[]>();
    territoryClients.forEach((row) => {
      const current = index.get(row.territoryId);
      if (current) current.push(row.client);
      else index.set(row.territoryId, [row.client]);
    });
    return index;
  }, [territoryClients]);
  const visitsByClient = useMemo(() => {
    const index = new Map<string, ZkiVisit[]>();
    visits.forEach((visit) => {
      const key = normalizeZkiCode(visit.client);
      if (!key) return;
      const current = index.get(key);
      if (current) current.push(visit);
      else index.set(key, [visit]);
    });
    return index;
  }, [visits]);
  const activeTrip = trips.find((trip) => trip.id === selectedTrip) || trips[0];
  const allCapacities = useMemo(() => capacityMap([...(data?.capacities || []), ...(data?.history || [])]), [data?.capacities, data?.history]);
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
  const rankedPlanning = useMemo(() => trips.map((trip) => {
    const clientCodes = clientsByTerritory.get(trip.territoryId) || [];
    const relevantVisits = [...new Set(clientCodes.map(normalizeZkiCode).filter(Boolean))].flatMap((code) => visitsByClient.get(code) || []);
    const rankedWithHistory = applyPersonnelClientRanges(rankCandidates(trip, history, relevantVisits, clientCodes, capacities, settings, auxiliaryRoster, visits), activePersonnel, trip.clients)
      .map((candidate) => ({ ...candidate, viable: candidate.capacity >= trip.weight && candidate.totalZki >= settings.minimumZki }))
      .filter((candidate) => candidateIsActiveRr(candidate, activePersonnel));
    const auxiliaryScores = rankTerritoryAuxiliaries(trip, relevantVisits, clientCodes, settings);
    const ranked = addCrewResponsibleFallbacks(rankedWithHistory, activeCrewPairs, capacities, auxiliaryRoster, activePersonnel, auxiliaryScores)
      .filter((candidate) => candidateIsActiveRr(candidate, activePersonnel));
    return { trip, candidates: ranked };
  }), [activeCrewPairs, activePersonnel, auxiliaryRoster, capacities, clientsByTerritory, history, settings, trips, visits, visitsByClient]);
  const planning = useMemo(() => {
    const assignments = assignUniqueResponsibles(
      rankedPlanning.map(({ trip, candidates }) => ({ tripId: trip.id, candidates })),
      settings.minimumZki,
    );
    const preliminary = rankedPlanning.map(({ trip, candidates }) => ({ trip, candidates, recommendation: assignments.get(trip.id) }));
    const paired = assignFreeResponsiblesToDriverVehicles(preliminary, activeCrewPairs, capacities, settings.minimumZki);
    const unique = enforceUniqueAssignedCrew(preliminary.map(item => {
      const recommendation = paired.get(item.trip.id);
      const ids = resolveExportCrewIds(recommendation, activePersonnel);
      return { tripId: item.trip.id, recommendation: recommendation ? { ...recommendation, rrId: ids.responsibleId || recommendation.rrId, driverId: ids.driverId || recommendation.driverId, auxiliaryId: ids.auxiliaryId || recommendation.auxiliaryId } : undefined };
    }), settings.minimumZki);
    return preliminary.map(item => ({ ...item, recommendation: unique.get(item.trip.id) }));
  }, [activeCrewPairs, activePersonnel, capacities, rankedPlanning, settings.minimumZki]);
  const candidates = useMemo(
    () => activeTrip ? rankedPlanning.find((item) => item.trip.id === activeTrip.id)?.candidates || [] : [],
    [activeTrip, rankedPlanning],
  );
  const viable = planning.flatMap(({ recommendation: assigned }) => assigned?.viable && hasCompleteCrew(assigned) ? [assigned] : []);
  const recommendation = planning.find(({ trip }) => trip.id === activeTrip?.id)?.recommendation;
  const incompleteTrips = planning.filter(({ recommendation: item }) => !hasCompleteCrew(item) || !item?.viable || item.totalZki < settings.minimumZki);
  const planningComplete = planning.length > 0 && incompleteTrips.length === 0;
  const assignedRrCount = planning.filter(({ recommendation: item }) => item?.rr && !normalizePerson(item.rr).startsWith("sin")).length;
  const assignedDriverCount = planning.filter(({ trip, recommendation: item }) => item?.driver && !normalizePerson(item.driver).startsWith("sin") && item.vehicle && !normalizePerson(item.vehicle).startsWith("sin") && item.capacity >= trip.weight).length;
  const qualifiedZkiCount = planning.filter(({ recommendation: item }) => item && item.totalZki >= settings.minimumZki).length;
  const incompleteDetails = incompleteTrips.map(({ trip, recommendation: item }) => {
    const tripCandidates = rankedPlanning.find((entry) => entry.trip.id === trip.id)?.candidates || [];
    const hasCatalogCodes = Boolean(clientsByTerritory.get(trip.territoryId)?.length);
    return { trip, candidates: tripCandidates.length, reason: !hasCurrentPersonnel ? "Carga el Excel de cédulas activas de hoy para cruzarlo con la tabla de personal." : hasCatalogCodes
      ? incompleteCrewReason(item, tripCandidates.length, trip.weight, settings.minimumZki)
      : "El catálogo cargado no contiene códigos de cliente para esta ruta; no se puede calcular su ZKI." };
  });
  const source = data?.source;

  async function uploadActivePersonnel(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/people/zki/upload?mode=active-personnel", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo leer el Excel de personal activo.");
      const ids = (body.ids || []) as string[];
      const matched = ids.filter((id) => personnelRules.some((person) => normalizeCedula(person.id) === id));
      if (personnelRules.length && !matched.length) throw new Error("Ninguna cédula del Excel coincide con la tabla de personal.");
      setActivePersonnelIds(ids);
      setActivePersonnelFileName(file.name);
      setActivePersonnelDate(todayKey());
      try { sessionStorage.setItem(ACTIVE_PERSONNEL_CACHE_KEY, JSON.stringify({ ids, fileName: file.name, date: todayKey() })); } catch { /* La copia local es opcional. */ }
      setMessage(`${ids.length} cédulas activas cargadas; ${matched.length} coinciden con la tabla de personal.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo leer el Excel de personal activo.");
    } finally {
      setUploading(false);
      if (activePersonnelUploadRef.current) activePersonnelUploadRef.current.value = "";
    }
  }

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
      const rows = Array.isArray(body.rows) ? body.rows as RawRow[] : [];
      const clients = parseTerritoryClients(rows);
      if (!clients.length) throw new Error("El archivo necesita ID de territorio, código de cliente y barrio.");
      setCatalogRows(rows);
      setSelectedTrip("");
      setMessage(new Set(clients.map((row) => row.territoryId)).size + " territorios y " + clients.length + " relaciones con clientes cargados desde " + file.name + ". Los RR se cruzan con la tabla ZKI.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo subir el Excel.");
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function downloadExcel() {
    if (!planning.length) {
      setError("Carga el Excel de territorios y clientes antes de generar el Excel.");
      return;
    }
    if (!hasCurrentPersonnel) {
      setError("Carga el Excel del personal activo de hoy antes de generar el resultado.");
      return;
    }
    const assignedPeople: Array<{ id: string; name: string; territory: string; role: string }> = [];
    for (const { trip, recommendation: item } of planning) {
      if (!item) continue;
      const ids = resolveExportCrewIds(item, activePersonnel);
      for (const person of [
        { id: ids.responsibleId, name: item.rr, role: "responsable" },
        { id: ids.driverId, name: item.driver, role: "conductor" },
        { id: ids.auxiliaryId, name: item.auxiliary, role: "auxiliar" },
      ]) {
        if (!person.name.trim() || /^sin\b/i.test(person.name.trim())) continue;
        const previous = assignedPeople.find(other => samePerson(other.id, other.name, person.id, person.name));
        if (previous) {
          setError(`No se generó el Excel: ${person.name} figura como ${previous.role} en territorio ${previous.territory} y como ${person.role} en territorio ${trip.territoryId}. Actualiza la planeación y revisa su registro de personal.`);
          return;
        }
        assignedPeople.push({ ...person, territory: trip.territoryId });
      }
    }
    const XLSX = await import("xlsx");
    const assignments = planning.map(({ trip, recommendation: item }) => {
      const ids = resolveExportCrewIds(item, activePersonnel);
      return {
      "ID territorio": trip.territoryId,
      Barrios: Array.isArray(trip.raw.neighborhoods) ? trip.raw.neighborhoods.join(", ") : trip.zone,
      "Peso territorio": trip.weight || "",
      "Cedula responsable": ids.responsibleId,
      "ZKI responsable": item?.zki || 0,
      "Nombre responsable": item?.rr || "Sin historial suficiente",
      "Nombre conductor": item?.driver || "",
      "Cedula conductor": ids.driverId,
      Placa: displayPlate(item?.vehicle),
      "Capacidad de carga": item?.capacity || 0,
      "Clientes únicos": item?.uniqueClients || 0,
      "Clientes territorio": item?.territoryClients || Math.max(trip.clients, new Set(territoryClients.filter((row) => row.territoryId === trip.territoryId).map((row) => row.client)).size),
      "Cedula auxiliar": ids.auxiliaryId,
      "ZKI auxiliar": item?.auxiliaryZki || 0,
      "Nombre auxiliar": item?.auxiliary || "",
      "ZKI total": item?.totalZki || 0,
      Estado: !item ? "Sin asignación" : !hasCompleteCrew(item) ? "Tripulación pendiente" : item.totalZki < settings.minimumZki ? "ZKI pendiente" : "ZKI cumple; peso sin verificar",
      };
    });
    const matrix = planning.flatMap(({ trip, candidates: ranked }) => ranked.filter((item) => item.hasKnowledge || item.auxiliaryZki > 0).map((item) => ({
      "ID territorio": trip.territoryId,
      Barrios: Array.isArray(trip.raw.neighborhoods) ? trip.raw.neighborhoods.join(", ") : trip.zone,
      "ID Empleado": item.rrId,
      Tipo: 1,
      Nombre: item.rr,
      "% Cobertura": item.coverage,
      "Frecuencia Promedio": item.frequency,
      "Frecuencia Tope": Math.min(item.frequency, settings.frequencyCap),
      "Clientes atendidos con visitas mínimas (%)": item.depth,
      "Clientes únicos": item.uniqueClients || 0,
      "Clientes territorio": item.territoryClients || Math.max(trip.clients, new Set(territoryClients.filter((row) => row.territoryId === trip.territoryId).map((row) => row.client)).size),
      ZKI: item.zki,
      "Nombre auxiliar": item.auxiliary,
      "ZKI auxiliar": item.auxiliaryZki,
      "ZKI total": item.totalZki,
      Vehículo: item.vehicle,
      Capacidad: item.capacity,
      Estado: item.totalZki >= settings.minimumZki ? "ZKI cumple; peso sin verificar" : item.reason,
    })));
    const availablePeople = remainingActivePersonnel(activePersonnel, assignedPeople.map((person) => person.id))
      .sort((left, right) => left.role.localeCompare(right.role, "es") || left.name.localeCompare(right.name, "es"));
    const workbook = XLSX.utils.book_new();
    const assignmentsSheet = XLSX.utils.json_to_sheet(assignments);
    const matrixSheet = XLSX.utils.json_to_sheet(matrix);
    const availableSheet = XLSX.utils.aoa_to_sheet([
      ["Cédula", "Nombre", "Cargo", "Contratista"],
      ...availablePeople.map((person) => [person.id, person.name, person.role, person.contractor || ""]),
    ]);
    assignmentsSheet["!cols"] = [12, 44, 16, 20, 16, 34, 34, 20, 14, 20, 16, 18, 18, 14, 34, 14, 42].map((wch) => ({ wch }));
    matrixSheet["!cols"] = [12, 44, 18, 8, 34, 14, 20, 17, 16, 18, 18, 12, 34, 14, 14, 16, 14, 42].map((wch) => ({ wch }));
    availableSheet["!cols"] = [{ wch: 18 }, { wch: 38 }, { wch: 20 }, { wch: 20 }];
    availableSheet["!autofilter"] = { ref: `A1:D${Math.max(1, availablePeople.length + 1)}` };
    XLSX.utils.book_append_sheet(workbook, assignmentsSheet, "Asignaciones");
    XLSX.utils.book_append_sheet(workbook, matrixSheet, "Matriz ZKI");
    XLSX.utils.book_append_sheet(workbook, availableSheet, "Personal disponible");
    XLSX.writeFile(workbook, `${planningComplete ? "asignaciones" : "diagnostico"}_zki_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
              <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Fuente operativa</p><h2 className="text-xl font-semibold text-[#0b2235]">Tabla ZKI + histórico de tripulaciones</h2><p className="mt-1 text-sm text-slate-500">Cruza cada zona</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50" disabled={loading} onClick={() => void load(true)} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={16} />Actualizar</button>
              <input accept=".xlsx,.xls,.csv" aria-label="Excel de cédulas activas" className="hidden" onChange={(event) => void uploadActivePersonnel(event.target.files?.[0])} ref={activePersonnelUploadRef} type="file" />
              <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-cyan-300 bg-cyan-50 px-4 text-sm font-semibold text-cyan-900 hover:bg-cyan-100 disabled:bg-slate-200" disabled={uploading} onClick={() => activePersonnelUploadRef.current?.click()} type="button"><Users size={16} />Cargar personal activo</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100" onClick={() => setShowVehicles(true)} type="button"><Truck size={16} />Vehículos</button>
              <input accept=".xlsx,.xls,.csv" aria-label="Excel de territorios, barrios y códigos de cliente" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} ref={uploadRef} type="file" />
              <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0b2235] px-4 text-sm font-semibold text-white disabled:bg-slate-400" disabled={uploading} onClick={() => uploadRef.current?.click()} type="button"><Upload size={16} />{uploading ? "Importando…" : "Cargar territorios y clientes"}</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100" onClick={() => router.push("/personas/zki/graficas")} type="button"><BarChart3 size={16} />Gráficas ZKI</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-400" disabled={!planning.length || !hasCurrentPersonnel} onClick={() => void downloadExcel()} type="button"><FileSpreadsheet size={16} />{planningComplete ? "Descargar asignaciones" : "Descargar diagnóstico"}</button>
            </div>
          </div>
          <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-700">
            {hasCurrentPersonnel ? <span><strong>{activePersonnelFileName}</strong>: {activePersonnelIds?.length || 0} cédulas activas, {activePersonnel.length} encontradas en la tabla. El archivo de territorios aporta ID, barrio y código de cliente; no trae peso.</span> : <span className="font-semibold text-amber-800">Carga las cédulas del personal disponible hoy y el archivo de territorios, barrios y clientes. El peso no viene en ese archivo.</span>}
          </div>
          <div className="grid border-t border-slate-200 bg-slate-50 sm:grid-cols-4">
            <Stat label="Territorios cargados" value={trips.length} />
            <Stat label="Visitas históricas ZKI" value={source?.rows || visits.length} />
            <Stat label="Clientes del catálogo" value={new Set(territoryClients.map((row) => row.client)).size} />
            <Stat label="Asignaciones viables" value={viable.length} />
          </div>
          <div className="border-t border-slate-200 p-4">
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-[#10283d] text-[10px] uppercase tracking-wider text-white"><tr><th className="px-4 py-2 text-left">Recurso</th><th className="px-4 py-2 text-center">Total</th><th className="px-4 py-2 text-center">Disponibles</th><th className="px-4 py-2 text-center">Indisponibles</th></tr></thead>
                <tbody className="divide-y divide-slate-200">
                  <AvailabilitySummaryRow label="Personal activo del Excel" available={activePersonnel.length} total={personnelRules.length} />
                  <AvailabilitySummaryRow label="Vehículos (VH)" available={Object.values(vehicleAvailability).filter((vehicle) => vehicle.available).length} total={Object.keys(vehicleAvailability).length} />
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="grid min-w-0 gap-5 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-5">
            <section className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2"><SlidersHorizontal size={18} className="text-cyan-700" /><h2 className="font-semibold text-[#0b2235]">Parámetros ZKI</h2></div>
              <div className="space-y-4">
                <Setting label="Visitas mínimas por cliente" value={settings.depthThreshold} onChange={(value) => setSettings({ ...settings, depthThreshold: Math.max(1, value) })} />
                <Setting label="Umbral ZKI combinado (mínimo 75)" suffix="%" value={settings.minimumZki} onChange={(value) => setSettings({ ...settings, minimumZki: Math.min(200, Math.max(75, value)) })} />
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-500">Cada código de cliente del archivo se cruza con la tabla ZKI. El barrio identifica la zona y ayuda a revisar el territorio; las visitas de otro cliente del mismo barrio no cuentan para ese código. Los RR y auxiliares se distribuyen entre territorios para maximizar las rutas que alcanzan el umbral.</p>
            </section>

            <section className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm">
              <label className="text-xs font-bold uppercase tracking-[.14em] text-slate-500" htmlFor="trip">Zona o viaje</label>
              <select className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" id="trip" onChange={(event) => setSelectedTrip(event.target.value)} value={activeTrip?.id || ""}>
                {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.zone}</option>)}
              </select>
              {activeTrip ? <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><Detail label="ID territorio" value={activeTrip.territoryId || "—"} /><Detail label="Clientes" value={formatNumber(activeTrip.clients)} /><Detail label="Barrios principales" value={activeTrip.zone} /><Detail label="Peso" value="No informado" /></div> : null}
            </section>
          </aside>

          <div className="min-w-0 space-y-5">
            <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="font-semibold text-[#0b2235]">Asignaciones recomendadas</h2><p className="mt-1 text-xs text-slate-500">Una salida resumida por territorio. La matriz completa queda disponible para auditoría.</p></div>
                <div className="flex gap-2"><button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-50" onClick={() => setShowMatrix((value) => !value)} type="button"><Eye size={15} />{showMatrix ? "Ocultar matriz" : "Ver opciones viables"}</button><button className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white disabled:bg-slate-400" disabled={!planning.length || !hasCurrentPersonnel} onClick={() => void downloadExcel()} type="button"><FileSpreadsheet size={15} />{planningComplete ? "Descargar asignaciones" : "Descargar diagnóstico"}</button></div>
              </div>
              {planning.length && !planningComplete ? <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs font-semibold text-amber-900"><AlertTriangle className="mt-0.5 shrink-0" size={16} /><div><p>Hay {incompleteTrips.length} territorios pendientes de tripulación o ZKI combinado mínimo de {settings.minimumZki}: {incompleteTrips.map(({ trip }) => trip.territoryId).join(", ")}. Puedes descargar un diagnóstico; no se marcará como asignación final.</p><p className="mt-1">De {planning.length} territorios: {assignedRrCount} con RR, {assignedDriverCount} con conductor y placa, {qualifiedZkiCount} con ZKI combinado suficiente. Falta el peso para verificar capacidad.</p></div></div> : null}
              {incompleteDetails.length ? <div className="border-b border-amber-200 bg-amber-50/40 p-4"><div className="mb-2 flex items-center justify-between gap-3"><div><h3 className="text-xs font-black text-amber-950">Diagnóstico de rutas pendientes</h3><p className="text-[10px] text-amber-800">Se evalúa cada RR disponible contra los códigos de cliente del territorio.</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-900">{incompleteDetails.length} rutas</span></div><div className="max-h-64 overflow-auto rounded-lg border border-amber-200 bg-white"><table className="w-full min-w-[760px] text-left text-[10px]"><thead className="sticky top-0 bg-amber-100 text-[9px] uppercase tracking-wide text-amber-950"><tr><th className="px-3 py-2">Territorio</th><th className="px-3 py-2">Zona</th><th className="px-3 py-2 text-right">Clientes</th><th className="px-3 py-2 text-right">Peso</th><th className="px-3 py-2 text-center">RR candidatos</th><th className="px-3 py-2">Razón</th></tr></thead><tbody className="divide-y divide-amber-100">{incompleteDetails.map(({ trip, candidates: count, reason }) => <tr key={`missing-${trip.id}`}><td className="px-3 py-2 font-black text-[#10283d]">{trip.territoryId}</td><td className="px-3 py-2 font-semibold text-slate-700">{trip.zone}</td><td className="px-3 py-2 text-right">{trip.clients}</td><td className="px-3 py-2 text-right font-semibold">No informado</td><td className="px-3 py-2 text-center"><span className={`rounded-full px-2 py-1 font-black ${count ? "bg-cyan-100 text-cyan-800" : "bg-red-100 text-red-700"}`}>{count}</span></td><td className="px-3 py-2 font-semibold text-amber-900">{reason}</td></tr>)}</tbody></table></div></div> : null}
              <div className="max-h-[680px] w-full max-w-full overflow-auto overscroll-contain">
                <table className="w-full min-w-[1120px] table-fixed text-left text-xs">
                  <thead className="sticky top-0 z-20 bg-[#10283d] text-[10px] uppercase tracking-[.12em] text-white"><tr><th className="w-[110px] px-4 py-3.5">Territorio</th><th className="w-[160px] px-4 py-3.5">Peso / capacidad</th><th className="w-[220px] px-4 py-3.5">Responsable</th><th className="w-[220px] px-4 py-3.5">Conductor / vehículo</th><th className="w-[220px] px-4 py-3.5">Auxiliar</th><th className="w-[110px] px-4 py-3.5 text-center">ZKI total</th><th className="w-[180px] px-4 py-3.5">Estado</th></tr></thead>
                  <tbody>{planning.map(({ trip, recommendation: item }, index) => (
                    <tr className={`border-b border-slate-200 align-middle transition hover:bg-cyan-50/70 ${index % 2 ? "bg-slate-50/70" : "bg-white"}`} key={trip.id}>
                      <td className="px-4 py-3.5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#10283d] text-sm font-black text-white">{trip.territoryId}</span><p className="mt-1 max-w-24 truncate text-[10px] text-slate-400" title={trip.zone}>{trip.zone}</p></td>
                      <td className="px-4 py-3.5"><p className="font-bold text-slate-800">Peso no informado</p><p className="mt-1 text-[10px] text-slate-500">Capacidad del VH: {item?.capacity ? `${formatNumber(item.capacity)} kg` : "pendiente"}</p></td>
                      <td className="px-4 py-3.5"><p className="font-bold leading-5 text-[#10283d]">{item?.rr || "Sin historial suficiente"}</p>{item ? <><ScoreBadge value={item.zki} /><p className="mt-1 text-[10px] font-semibold text-slate-500">Carga anterior: {item.previousClients || 0} clientes{item.workloadAdjustment ? ` · ajuste ${item.workloadAdjustment > 0 ? "+" : ""}${formatNumber(item.workloadAdjustment)}` : ""}</p></> : null}</td>
                      <td className="px-4 py-3.5"><p className="font-medium leading-5 text-slate-700">{item?.driver || "Sin conductor"}</p><span className="mt-1 inline-flex rounded-md bg-slate-200 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">{displayPlate(item?.vehicle) || "Sin placa"}</span></td>
                      <td className="px-4 py-3.5"><p className="font-medium leading-5 text-slate-700">{item?.auxiliary || "Sin auxiliar"}</p>{item ? <ScoreBadge value={item.auxiliaryZki} /> : null}</td>
                      <td className="px-4 py-3.5 text-center">{item ? <span className={`inline-grid min-w-16 place-items-center rounded-xl px-3 py-2 text-base font-black ${item.totalZki >= 160 ? "bg-emerald-100 text-emerald-800" : item.totalZki >= 120 ? "bg-cyan-100 text-cyan-900" : "bg-amber-100 text-amber-800"}`}>{formatNumber(item.totalZki)}</span> : "—"}</td>
                      <td className="px-4 py-3.5"><AssignmentStatus candidate={item} minimumZki={settings.minimumZki} tripWeight={trip.weight} /></td>
                    </tr>
                  ))}</tbody>
                </table>
                {!planning.length ? <Empty icon={<FileSpreadsheet size={28} />} text="Carga el Excel de territorios, barrios y códigos de cliente." /> : null}
              </div>
            </section>

            {recommendation ? (
              <section className="rounded-xl border border-emerald-300 bg-gradient-to-r from-emerald-50 to-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-700">Recomendación actual</p><h2 className="mt-1 text-2xl font-bold text-[#0b2235]">{recommendation.rr}</h2><p className="mt-1 text-sm text-slate-600">{recommendation.driver} · {displayPlate(recommendation.vehicle)}</p></div>
                  <div className="rounded-xl bg-[#0b2235] px-6 py-3 text-center text-white"><p className="text-[10px] uppercase tracking-[.16em] text-cyan-200">ZKI estimado</p><p className="text-3xl font-black">{formatPercent(recommendation.zki)}</p></div>
                </div>
              </section>
            ) : null}

            {showMatrix ? <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 p-5"><div><h2 className="font-semibold text-[#0b2235]">Combinaciones con ZKI suficiente</h2><p className="mt-1 text-xs text-slate-500">Cumplen ZKI y disponibilidad; el peso falta para verificar capacidad.</p></div><Users size={20} className="text-cyan-700" /></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-xs">
                  <thead className="bg-slate-100 text-[10px] uppercase tracking-wider text-slate-600"><tr><Th>Estado</Th><Th>Responsable</Th><Th>Conductor</Th><Th>Vehículo</Th><Th>Cobertura</Th><Th>Frecuencia</Th><Th>Clientes con visitas mínimas</Th><Th>ZKI responsable</Th><Th>Auxiliar</Th><Th>ZKI auxiliar</Th><Th>ZKI total</Th><Th>Capacidad</Th><Th>Decisión</Th></tr></thead>
                  <tbody>{viable.map((candidate) => <CandidateRow candidate={candidate} key={`${candidate.rr}:${candidate.driver}:${candidate.vehicle}`} />)}</tbody>
                </table>
                {!loading && !trips.length ? <Empty icon={<Truck size={28} />} text="Carga el Excel de territorios y clientes para comenzar la planeación. Este archivo no modifica la tabla histórica ZKI." /> : null}
                {!loading && trips.length > 0 && !visits.length ? <Empty icon={<Database size={28} />} text="Los territorios están listos, pero la tabla histórica ZKI no devolvió relaciones cliente–RR. Sin ese historial todavía no se puede calcular el conocimiento." /> : null}
                {!loading && trips.length > 0 && visits.length > 0 && !candidates.length ? <Empty icon={<Users size={28} />} text="No hay RR disponibles para este territorio. Revisa sus códigos de cliente y el personal de la base de datos." /> : null}
                {loading ? <Empty icon={<RefreshCw className="animate-spin" size={28} />} text="Calculando combinaciones…" /> : null}
              </div>
            </section> : null}
          </div>
        </section>
      </section>
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
                  <div><p className="font-mono text-base font-black uppercase text-slate-800">{displayPlate(vehicle.plate)}</p><p className="text-[10px] font-semibold uppercase text-slate-400">{vehicle.contractor} · Capacidad: {vehicle.capacity ? `${formatNumber(vehicle.capacity)} kg` : "Sin dato"}</p></div>
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

function applyPersonnelClientRanges(candidates: Candidate[], rules: PersonnelRule[], tripClients: number) {
  return candidates.flatMap((rawCandidate) => {
    const candidate = withAvailableAuxiliary(rawCandidate, rules);
    const rule = rules.find((person) => matchesPersonnel(person, candidate.rrId, candidate.rr));
    if (rule?.minimumClients === undefined || rule.maximumClients === undefined) return [{ ...candidate, workloadAdjustment: 0 }];
    const minimum = rule.minimumClients;
    const maximum = Math.max(minimum, rule.maximumClients);
    if (tripClients < minimum || tripClients > maximum) return [];
    const previous = candidate.previousClients || 0;
    const loadFactor = maximum ? Math.max(0.5, tripClients / maximum) : 1;
    const adjustment = previous > maximum
      ? -Math.min(40, (previous - maximum) * 2 * loadFactor)
      : previous > 0 && previous < minimum
        ? Math.min(15, (minimum - previous) * loadFactor)
        : 0;
    return [{ ...candidate, workloadAdjustment: Math.round(adjustment * 100) / 100 }];
  }).sort((left, right) => Number(right.viable) - Number(left.viable) || (right.totalZki + (right.workloadAdjustment || 0)) - (left.totalZki + (left.workloadAdjustment || 0)));
}

function addCrewResponsibleFallbacks(
  candidates: Candidate[],
  crewPairs: CrewPair[],
  capacities: Map<string, number>,
  auxiliaryRoster: ZkiVisit[],
  personnelRules: PersonnelRule[],
  auxiliaryScores: Array<{ name: string; id: string; zki: number }>,
) {
  const existingIds = new Set(candidates.map((candidate) => candidate.rrId.replace(/\D/g, "")).filter(Boolean));
  const existingNames = new Set(candidates.map((candidate) => normalizePerson(candidate.rr)).filter(Boolean));
  const unavailable = personnelRules.filter((person) => !person.available);
  const isUnavailable = (id: string, name: string) => unavailable.some((person) =>
    (person.id && id && person.id.replace(/\D/g, "") === id.replace(/\D/g, "")) || normalizePerson(person.name) === normalizePerson(name),
  );
  const scoredByName = new Map(auxiliaryScores.map(option => [normalizePersonName(option.name), option]));
  const auxiliaryOptions = [...new Map(auxiliaryRoster
    .filter((person) => person.rr && !isUnavailable(person.rrId || "", person.rr))
    .map((person) => [normalizePersonName(person.rr), scoredByName.get(normalizePersonName(person.rr)) || { name: person.rr, id: person.rrId || "", zki: 0 }])).values()].sort((left, right) => right.zki - left.zki);

  const fallbacks = crewPairs.flatMap((pair): Candidate[] => {
    const rrId = pair.responsibleId.replace(/\D/g, "");
    const rrName = normalizePerson(pair.responsible);
    if ((!rrId && !rrName) || existingIds.has(rrId) || existingNames.has(rrName) || !pair.responsible || isUnavailable(pair.responsibleId, pair.responsible)) return [];
    if (rrId) existingIds.add(rrId);
    if (rrName) existingNames.add(rrName);
    const auxiliary = auxiliaryOptions[0] || { name: "Sin auxiliar disponible", id: "", zki: 0 };
    const vehicleKey = normalizePerson(pair.plate);
    return [{
      rr: pair.responsible,
      rrId: pair.responsibleId,
      driver: pair.driver,
      driverId: pair.driverId,
      vehicle: pair.plate,
      coverage: 0,
      frequency: 0,
      frequencyScore: 0,
      depth: 0,
      zki: 0,
      auxiliary: auxiliary.name,
      auxiliaryId: auxiliary.id,
      auxiliaryZki: auxiliary.zki,
      auxiliaryOptions,
      totalZki: auxiliary.zki,
      capacity: capacities.get(vehicleKey) || 0,
      viable: false,
      hasKnowledge: false,
      habitualVehicle: true,
      reason: "Asignado como respaldo con su conductor y placa habitual; el RR no tiene visitas ZKI para los códigos de cliente de esta ruta.",
    }];
  });
  const personnelFallbacks = personnelRules.flatMap((person): Candidate[] => {
    if (!(["RR", "Líder de Ruta"] as PersonnelRule["role"][]).includes(person.role)
      || normalizePerson(person.contractor) !== "logisticos" || !person.available || !person.name) return [];
    const rrId = person.id.replace(/\D/g, "");
    const rrName = normalizePerson(person.name);
    if ((rrId && existingIds.has(rrId)) || existingNames.has(rrName)) return [];
    if (rrId) existingIds.add(rrId);
    existingNames.add(rrName);
    const auxiliary = auxiliaryOptions[0] || { name: "Sin auxiliar disponible", id: "", zki: 0 };
    return [{
      rr: person.name, rrId: person.id,
      driver: "Sin conductor identificado", driverId: "",
      vehicle: "Sin vehículo identificado",
      coverage: 0, frequency: 0, frequencyScore: 0, depth: 0, zki: 0,
      auxiliary: auxiliary.name, auxiliaryId: auxiliary.id, auxiliaryZki: auxiliary.zki,
      auxiliaryOptions, totalZki: auxiliary.zki,
      capacity: 0, viable: false, hasKnowledge: false, habitualVehicle: false,
      reason: "RR disponible sin visitas ZKI para los códigos de cliente de esta ruta.",
    }];
  });
  return [...candidates, ...fallbacks, ...personnelFallbacks];
}

function withAvailableAuxiliary(candidate: Candidate, rules: PersonnelRule[]) {
  const options = (candidate.auxiliaryOptions || []).filter((option) => rules.some((person) =>
    person.role === "Auxiliar" && matchesPersonnel(person, option.id, option.name),
  ));
  const selected = options[0];
  if (!selected) return {
    ...candidate,
    auxiliary: "Sin auxiliar disponible",
    auxiliaryId: "",
    auxiliaryZki: 0,
    auxiliaryOptions: [],
    totalZki: Math.round(candidate.zki * 100) / 100,
  };
  return {
    ...candidate,
    auxiliary: selected.name,
    auxiliaryId: selected.id,
    auxiliaryZki: selected.zki,
    auxiliaryOptions: options,
    totalZki: Math.round((candidate.zki + selected.zki) * 100) / 100,
  };
}

function CandidateRow({ candidate }: { candidate: Candidate }) {
  const status = candidate.viable ? "ZKI cumple; peso sin verificar" : "Pendiente";
  return <tr className={`border-b border-slate-100 ${candidate.viable ? "" : "bg-red-50/60"}`}><Td>{candidate.viable ? <span className="inline-flex items-center gap-1 font-bold text-emerald-700"><CheckCircle2 size={15} />{status}</span> : <span className="inline-flex items-center gap-1 font-bold text-red-700"><ShieldX size={15} />{status}</span>}</Td><Td strong>{candidate.rr}</Td><Td>{candidate.driver}</Td><Td>{displayPlate(candidate.vehicle)}</Td><Td>{formatPercent(candidate.coverage)}</Td><Td>{formatNumber(candidate.frequency)} / {formatPercent(candidate.frequencyScore)}</Td><Td>{formatPercent(candidate.depth)}</Td><Td><span className={`rounded-md px-2 py-1 font-black ${candidate.zki >= 80 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{formatPercent(candidate.zki)}</span></Td><Td>{candidate.auxiliary}</Td><Td>{formatPercent(candidate.auxiliaryZki)}</Td><Td><span className="rounded-md bg-cyan-100 px-2 py-1 font-black text-cyan-900">{formatNumber(candidate.totalZki)}</span></Td><Td>{candidate.capacity ? `${formatNumber(candidate.capacity)} kg` : "Sin dato"}</Td><Td><span className={candidate.viable ? "text-slate-600" : "font-semibold text-red-700"}>{candidate.reason}</span></Td></tr>;
}

function ScoreBadge({ value }: { value: number }) {
  const tone = value >= 80 ? "bg-emerald-100 text-emerald-800" : value >= 50 ? "bg-cyan-100 text-cyan-800" : "bg-amber-100 text-amber-800";
  return <span className={`mt-1.5 inline-flex rounded-md px-2 py-0.5 text-[10px] font-black ${tone}`}>ZKI {formatPercent(value)}</span>;
}

function AssignmentStatus({ candidate, minimumZki, tripWeight }: { candidate?: Candidate; minimumZki: number; tripWeight: number }) {
  if (!candidate) return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">Sin asignación</span>;
  if (candidate.viable) return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800"><CheckCircle2 size={12} />ZKI cumple; peso sin verificar</span>;
  const status = !candidate.capacity
    ? "Sin placa compatible"
    : candidate.capacity < tripWeight
      ? "Bloqueada por peso"
    : candidate.totalZki < minimumZki
          ? "ZKI combinado insuficiente"
          : "Pendiente";
  return <div title={candidate.reason}><span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800"><AlertTriangle size={12} />{status}</span><p className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-slate-500">{candidate.reason}</p></div>;
}

function hasCompleteCrew(candidate: Candidate | undefined) {
  if (!candidate) return false;
  const missingLabel = (value: string | undefined) => !value?.trim() || normalizePerson(value).startsWith("sin");
  return !missingLabel(candidate.rr)
    && !missingLabel(candidate.driver)
    && !missingLabel(candidate.auxiliary)
    && !missingLabel(candidate.vehicle)
    && candidate.capacity > 0;
}

function incompleteCrewReason(candidate: Candidate | undefined, candidateCount: number, tripWeight: number, minimumZki: number) {
  if (!candidateCount) return "No hay RR de Logísticos disponibles para este territorio.";
  if (!candidate) return "Los RR candidatos ya fueron asignados a otras rutas; no queda un responsable único disponible.";
  if (!candidate.rr) return "No queda un RR disponible para este territorio.";
  if (!candidate.driver || normalizePerson(candidate.driver).startsWith("sin")) return "No queda una pareja conductor–placa disponible en el catálogo Conductores-placas.";
  if (!candidate.vehicle || normalizePerson(candidate.vehicle).startsWith("sin")) return "El conductor no tiene una placa fija disponible en el catálogo Conductores-placas.";
  if (!candidate.capacity) return "La placa asignada no tiene capacidad registrada.";
  if (candidate.capacity < tripWeight) return `La placa disponible soporta ${formatNumber(candidate.capacity)} kg y la ruta requiere ${formatNumber(tripWeight)} kg.`;
  if (!candidate.auxiliary || normalizePerson(candidate.auxiliary).startsWith("sin")) return "No queda un auxiliar disponible para completar la tripulación.";
  if (candidate.totalZki < minimumZki) return `El ZKI combinado es ${formatNumber(candidate.totalZki)} y debe ser mínimo ${minimumZki}.`;
  return candidate.reason || "La combinación no pudo completarse con los recursos disponibles.";
}

function Stat({ danger = false, label, value }: { danger?: boolean; label: string; value: number }) { return <div className="border-b border-slate-200 px-5 py-3 last:border-0 sm:border-b-0 sm:border-r"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-1 text-2xl font-black ${danger ? "text-red-700" : "text-[#0b2235]"}`}>{formatNumber(value)}</p></div>; }

function AvailabilitySummaryRow({ available, label, total }: { available: number; label: string; total: number }) {
  return <tr><td className="px-4 py-2.5 font-semibold text-slate-700">{label}</td><td className="px-4 py-2.5 text-center font-bold text-slate-700">{formatNumber(total)}</td><td className="px-4 py-2.5 text-center font-bold text-emerald-700">{formatNumber(available)}</td><td className="px-4 py-2.5 text-center font-bold text-red-700">{formatNumber(Math.max(total - available, 0))}</td></tr>;
}
function Setting({ label, onChange, suffix, value }: { label: string; onChange: (value: number) => void; suffix?: string; value: number }) { return <label className="block"><span className="text-xs font-semibold text-slate-600">{label}</span><div className="mt-1 flex h-10 overflow-hidden rounded-lg border border-slate-300"><input className="min-w-0 flex-1 px-3 outline-none" min="0" onChange={(event) => onChange(Number(event.target.value) || 0)} type="number" value={value} />{suffix ? <span className="grid w-10 place-items-center bg-slate-100 text-xs font-bold text-slate-500">{suffix}</span> : null}</div></label>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-2"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 truncate font-semibold text-slate-700">{value}</p></div>; }
function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-3">{children}</th>; }
function Td({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) { return <td className={`px-3 py-3 ${strong ? "font-bold text-[#0b2235]" : "text-slate-600"}`}>{children}</td>; }
function Empty({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="grid min-h-52 place-items-center p-8 text-center text-slate-400"><div><span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-slate-100">{icon}</span><p className="max-w-md text-sm">{text}</p></div></div>; }
function formatNumber(value: number) { return Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 }); }
function formatPercent(value: number) { return `${formatNumber(value)}%`; }
