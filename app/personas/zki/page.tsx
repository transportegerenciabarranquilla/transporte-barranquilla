"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, Database, Eye, FileSpreadsheet, RefreshCw, Search, ShieldX, SlidersHorizontal, Truck, Upload, Users, X } from "lucide-react";
import { normalizeCedula, remainingActivePersonnel } from "../../lib/activePersonnel";
import {
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
import type { ExactChoice } from "./zkiExact";

type CrewPair = { plate: string; driver: string; driverId: string; responsible: string; responsibleId: string };
type ApiData = { rows: RawRow[]; history: RawRow[]; capacities: RawRow[]; crew: CrewPair[]; source: { table: string; rows: number; columns?: string[] } };
type PersonnelRule = { id: string; name: string; role: "RR" | "Líder de Ruta" | "Conductor" | "Auxiliar"; available: boolean; contractor?: string; minimumClients?: number; maximumClients?: number };
type VehicleStatus = { plate: string; contractor: string; capacity: number; available: boolean; useInZki: boolean };
const ZKI_BROWSER_CACHE_KEY = "zki-dashboard-cache-v10-paged-clients";
const ZKI_CATALOG_CACHE_KEY = "zki-catalog-cache-v1";
const ZKI_CLIENTS_PER_REQUEST = 25;
const ACTIVE_PERSONNEL_CACHE_KEY = "zki-active-personnel-v1";
let zkiMemoryCache: ApiData | null = null;

function isApiData(value: unknown): value is ApiData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ApiData>;
  return Array.isArray(candidate.rows) && Array.isArray(candidate.history) && Array.isArray(candidate.capacities) && Array.isArray(candidate.crew)
    && Boolean(candidate.source && typeof candidate.source.rows === "number");
}

async function fetchZkiJson(url: string, init: RequestInit = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(12_000) });
      const body = await response.json().catch(() => ({}));
      if (response.ok || ![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === 2) return { response, body };
    } catch (error) {
      if (attempt === 2) throw error;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error("No se pudo consultar ZKI.");
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
  return Boolean(activeResponsible(candidate, rules));
}

function activeResponsible(candidate: Candidate, rules: PersonnelRule[]) {
  return rules.find((person) => (person.role === "RR" || normalizePerson(person.role).includes("liderderuta"))
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
  const [loadProgress, setLoadProgress] = useState("");
  const [catalogRows, setCatalogRows] = useState<RawRow[]>([]);
  const [showMatrix, setShowMatrix] = useState(false);
  const [showVehicles, setShowVehicles] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleContractor, setVehicleContractor] = useState("Todos");
  const [vehicleAvailability, setVehicleAvailability] = useState<Record<string, VehicleStatus>>({});
  const [vehicleError, setVehicleError] = useState("");
  const [exactResult, setExactResult] = useState<{ input: object; choices: ExactChoice[]; optimal: boolean; error?: string } | null>(null);
  const [personnelRules, setPersonnelRules] = useState<PersonnelRule[]>([]);
  const territoryClients = useMemo(() => parseTerritoryClients(catalogRows), [catalogRows]);

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

  async function load(forceRefresh = false, background = false, clientCodes?: string[]) {
    if (!background) setLoading(true);
    setError("");
    try {
      const codes = [...new Set(clientCodes || territoryClients.map((row) => row.client))];
      const { response: baseResponse, body: base } = await fetchZkiJson(`/api/people/zki${forceRefresh ? "?refresh=1" : ""}`);
      if (!baseResponse.ok) throw new Error(base.error || "No se pudo cargar el personal y los vehículos ZKI.");
      if (!isApiData(base)) throw new Error("La respuesta de ZKI está incompleta. Actualiza nuevamente.");
      let payload: ApiData = base;
      if (codes.length) {
        const batches = Array.from({ length: Math.ceil(codes.length / ZKI_CLIENTS_PER_REQUEST) }, (_, index) => codes.slice(index * ZKI_CLIENTS_PER_REQUEST, (index + 1) * ZKI_CLIENTS_PER_REQUEST));
        const results: RawRow[][] = new Array(batches.length);
        let nextBatch = 0;
        let completed = 0;
        let sourceRows = 0;
        setLoadProgress(`Consultando historial ZKI: 0 de ${batches.length} grupos`);
        await Promise.all(Array.from({ length: Math.min(3, batches.length) }, async () => {
          while (nextBatch < batches.length) {
            const index = nextBatch++;
            const rows: RawRow[] = [];
            for (let offset = 0; ;) {
              const { response, body: page } = await fetchZkiJson("/api/people/zki", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientCodes: batches[index], offset }),
              });
              if (!response.ok) throw new Error(page.error || `Falló la consulta ZKI del grupo ${index + 1} (HTTP ${response.status}).`);
              if (!Array.isArray(page.rows) || !Number.isInteger(page.sourceRows) || typeof page.hasMore !== "boolean") {
                throw new Error(`La respuesta ZKI del grupo ${index + 1} está incompleta.`);
              }
              rows.push(...page.rows);
              sourceRows += page.sourceRows;
              if (!page.hasMore) break;
              if (page.sourceRows === 0) throw new Error(`La consulta ZKI del grupo ${index + 1} no avanzó.`);
              offset += page.sourceRows;
            }
            results[index] = rows;
            completed += 1;
            setLoadProgress(`Consultando historial ZKI: ${completed} de ${batches.length} grupos`);
          }
        }));
        payload = { ...base, rows: results.flat(), source: { ...base.source, rows: sourceRows } };
      }
      zkiMemoryCache = payload;
      setData(payload);
      try { sessionStorage.setItem(ZKI_BROWSER_CACHE_KEY, JSON.stringify(payload)); } catch { /* La caché es opcional. */ }
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cargar ZKI.");
      return false;
    } finally {
      setLoadProgress("");
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
    let storedCatalog: RawRow[] = [];
    try {
      const cached = sessionStorage.getItem(ZKI_CATALOG_CACHE_KEY);
      const parsed = cached ? JSON.parse(cached) as unknown : null;
      if (Array.isArray(parsed) && parseTerritoryClients(parsed).length) {
        storedCatalog = parsed as RawRow[];
        setCatalogRows(storedCatalog);
      } else if (cached) sessionStorage.removeItem(ZKI_CATALOG_CACHE_KEY);
    } catch { /* El catálogo puede cargarse nuevamente si la copia local falla. */ }
    if (zkiMemoryCache && storedCatalog.length) {
      setData(zkiMemoryCache);
      setLoading(false);
      return;
    }
    try {
      const cached = sessionStorage.getItem(ZKI_BROWSER_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as unknown;
        if (storedCatalog.length && isApiData(parsed)) {
          zkiMemoryCache = parsed;
          setData(parsed);
          setLoading(false);
          return;
        }
        sessionStorage.removeItem(ZKI_BROWSER_CACHE_KEY);
      }
    } catch { /* Si la copia local falla, se consulta normalmente. */ }
    void load(false, false, parseTerritoryClients(storedCatalog).map((row) => row.client));
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
      .flatMap((candidate) => {
        const person = activeResponsible(candidate, activePersonnel);
        return person ? [{ ...candidate, rr: person.name, rrId: person.id }] : [];
      });
    return { trip, candidates: ranked };
  }), [activeCrewPairs, activePersonnel, auxiliaryRoster, capacities, clientsByTerritory, history, settings, trips, visits, visitsByClient]);
  const exactInput = useMemo(() => ({
    plans: rankedPlanning,
    drivers: activePersonnel.filter((person) => person.role === "Conductor").map((person) => ({ name: person.name, id: person.id })),
    pairs: activeCrewPairs,
    capacities: [...capacities.entries()],
    minimumZki: settings.minimumZki,
  }), [activeCrewPairs, activePersonnel, capacities, rankedPlanning, settings.minimumZki]);
  useEffect(() => {
    setExactResult(null);
    if (!exactInput.plans.length || !exactInput.drivers.length || !exactInput.pairs.length) return;
    const worker = new Worker(new URL("./zkiExact.worker.ts", import.meta.url));
    worker.onmessage = ({ data: result }: MessageEvent<{ choices?: ExactChoice[]; optimal?: boolean; error?: string }>) =>
      setExactResult(result.choices && result.optimal ? { input: exactInput, choices: result.choices, optimal: true } : { input: exactInput, choices: [], optimal: false, error: result.error });
    worker.onerror = () => setExactResult({ input: exactInput, choices: [], optimal: false, error: "No se pudo ejecutar el optimizador global." });
    worker.postMessage(exactInput);
    return () => worker.terminate();
  }, [exactInput]);

  const exactOptimal = exactResult?.input === exactInput && exactResult.optimal;
  const planning = useMemo(() => {
    const choices = new Map(exactOptimal ? exactResult!.choices.map((choice) => [choice.tripId, choice]) : []);
    return rankedPlanning.map(({ trip, candidates }) => {
      const choice = choices.get(trip.id);
      const candidate = choice && candidates[choice.rrIndex];
      if (!candidate || !choice) return { trip, candidates, recommendation: undefined as Candidate | undefined };
      const auxiliary = choice.auxiliary;
      const totalZki = Math.round((candidate.zki + (auxiliary?.zki || 0)) * 100) / 100;
      const complete = Boolean(auxiliary && choice.driver && choice.plate && choice.capacity >= trip.weight);
      const recommendation: Candidate = {
        ...candidate,
        driver: choice.driver?.name || "Sin conductor disponible", driverId: choice.driver?.id || "",
        vehicle: choice.plate ? displayPlate(choice.plate) : "Sin placa", capacity: choice.capacity,
        auxiliary: auxiliary?.name || "Sin auxiliar disponible", auxiliaryId: auxiliary?.id || "", auxiliaryZki: auxiliary?.zki || 0,
        totalZki, viable: complete && totalZki >= settings.minimumZki,
        habitualVehicle: activeCrewPairs.some((pair) => samePerson(pair.driverId, pair.driver, choice.driver?.id, choice.driver?.name)
          && displayPlate(pair.plate) === displayPlate(choice.plate)),
        reason: !complete ? "Pendiente: falta tripulación o capacidad suficiente." : totalZki < settings.minimumZki
          ? `El ZKI combinado es ${totalZki} y debe ser mínimo ${settings.minimumZki}.`
          : `ZKI combinado ${formatNumber(totalZki)}% (RR ${formatNumber(candidate.zki)}% + auxiliar ${formatNumber(auxiliary?.zki || 0)}%) y capacidad cumplen.`,
      };
      return { trip, candidates, recommendation };
    });
  }, [activeCrewPairs, exactOptimal, exactResult, rankedPlanning, settings.minimumZki]);
  const candidates = useMemo(
    () => activeTrip ? rankedPlanning.find((item) => item.trip.id === activeTrip.id)?.candidates || [] : [],
    [activeTrip, rankedPlanning],
  );
  const viable = planning.flatMap(({ trip, recommendation: assigned }) => assigned?.viable && hasCompleteCrew(assigned) ? [{ candidate: assigned, weightKnown: Boolean(trip.raw.weightKnown) }] : []);
  const recommendation = planning.find(({ trip }) => trip.id === activeTrip?.id)?.recommendation;
  const incompleteTrips = planning.filter(({ recommendation: item }) => !hasCompleteCrew(item) || !item?.viable || item.totalZki < settings.minimumZki);
  const planningComplete = Boolean(exactOptimal) && planning.length > 0 && incompleteTrips.length === 0;
  const assignedResponsibles: Candidate[] = [];
  planning.forEach(({ recommendation: item }) => {
    if (!item?.rr || normalizePerson(item.rr).startsWith("sin")) return;
    if (!assignedResponsibles.some((assigned) => samePerson(assigned.rrId, assigned.rr, item.rrId, item.rr))) assignedResponsibles.push(item);
  });
  const assignedRrCount = assignedResponsibles.length;
  const assignedDriverCount = planning.filter(({ trip, recommendation: item }) => item?.driver && !normalizePerson(item.driver).startsWith("sin") && item.vehicle && !normalizePerson(item.vehicle).startsWith("sin") && item.capacity >= trip.weight).length;
  const qualifiedZkiCount = planning.filter(({ recommendation: item }) => item && item.totalZki >= settings.minimumZki).length;
  const incompleteDetails = incompleteTrips.map(({ trip, recommendation: item }) => {
    const tripCandidates = rankedPlanning.find((entry) => entry.trip.id === trip.id)?.candidates || [];
    const hasCatalogCodes = Boolean(clientsByTerritory.get(trip.territoryId)?.length);
    const bestLocalZki = tripCandidates.reduce((best, candidate) => {
      const auxiliaryScores = (candidate.auxiliaryOptions || []).filter((auxiliary) =>
        !samePerson(candidate.rrId, candidate.rr, auxiliary.id, auxiliary.name),
      ).map((auxiliary) => auxiliary.zki);
      return Math.max(best, candidate.zki + Math.max(0, ...auxiliaryScores));
    }, 0);
    const hasCrew = Boolean(item && hasCompleteCrew(item));
    const reason = !hasCurrentPersonnel ? "Carga el Excel de cédulas activas de hoy para cruzarlo con la tabla de personal."
      : !hasCatalogCodes ? "El catálogo cargado no contiene códigos de cliente para esta ruta; no se puede calcular su ZKI."
      : !hasCrew ? incompleteCrewReason(item, tripCandidates.length, trip.weight, settings.minimumZki)
      : bestLocalZki >= settings.minimumZki
        ? `La pareja asignada suma ${formatNumber(item!.totalZki)}; las personas con mayor ZKI se asignaron a otras rutas para maximizar el total.`
        : `Ninguna pareja RR–auxiliar activa alcanza ${settings.minimumZki} en este territorio.`;
    return { trip, candidates: tripCandidates.length, bestLocalZki, reason };
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
      const territoryWeights = new Map<string, number>();
      clients.forEach(({ territoryId, weight }) => {
        if (!weight) return;
        const previous = territoryWeights.get(territoryId);
        if (previous !== undefined && Math.abs(previous - weight) > 0.01) {
          throw new Error(`El territorio ${territoryId} tiene pesos diferentes en el Excel (${formatNumber(previous)} y ${formatNumber(weight)} kg).`);
        }
        territoryWeights.set(territoryId, weight);
      });
      if (!await load(true, true, clients.map((row) => row.client))) return;
      try { sessionStorage.setItem(ZKI_CATALOG_CACHE_KEY, JSON.stringify(rows)); } catch { /* La copia local es opcional. */ }
      setCatalogRows(rows);
      setSelectedTrip("");
      setMessage(new Set(clients.map((row) => row.territoryId)).size + " territorios y " + clients.length + " relaciones con clientes cargados desde " + file.name + ". Peso informado en " + territoryWeights.size + " territorios; se cruza con la capacidad del VH.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo subir el Excel.");
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function downloadExcel() {
    setError("");
    if (!exactOptimal) {
      setError(exactResult?.input === exactInput ? exactResult.error || "Espera a que termine la optimización global antes de descargar." : "Espera a que termine la optimización global antes de descargar.");
      return;
    }
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
      "Peso territorio": trip.raw.weightKnown ? trip.weight : "",
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
      Estado: !item ? "Sin asignación" : !hasCompleteCrew(item) ? "Tripulación pendiente" : item.capacity < trip.weight ? "Capacidad insuficiente" : item.totalZki < settings.minimumZki ? "ZKI pendiente" : trip.raw.weightKnown ? viableZkiLabel(item) : "ZKI combinado cumple; peso sin verificar",
      };
    });
    const matrix = planning.flatMap(({ trip, candidates: ranked }) => ranked.map((item) => ({
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
      Estado: item.totalZki >= settings.minimumZki ? "ZKI potencial; tripulación sin validar" : "ZKI potencial bajo el umbral",
    })));
    const nearThreshold = incompleteTrips.flatMap(({ trip, recommendation: item }) => {
      if (!item || item.totalZki < 60 || item.totalZki > 70) return [];
      const ids = resolveExportCrewIds(item, activePersonnel);
      return [{
        "ID territorio": trip.territoryId,
        Barrios: Array.isArray(trip.raw.neighborhoods) ? trip.raw.neighborhoods.join(", ") : trip.zone,
        "Cédula responsable": ids.responsibleId,
        "Nombre responsable": item.rr,
        "ZKI responsable": item.zki,
        "Cédula auxiliar": ids.auxiliaryId,
        "Nombre auxiliar": item.auxiliary,
        "ZKI auxiliar": item.auxiliaryZki,
        "ZKI total": item.totalZki,
        Conductor: item.driver,
        Placa: displayPlate(item.vehicle),
        Motivo: incompleteCrewReason(item, rankedPlanning.find((entry) => entry.trip.id === trip.id)?.candidates.length || 0, trip.weight, settings.minimumZki),
      }];
    });
    const availablePeople = remainingActivePersonnel(activePersonnel, assignedPeople.map((person) => person.id))
      .sort((left, right) => left.role.localeCompare(right.role, "es") || left.name.localeCompare(right.name, "es"));
    const driverAvailability = (person: PersonnelRule) => {
      if (person.role !== "Conductor") return { plate: "", reason: "" };
      const pairs = (data?.crew || []).filter((pair) => matchesPersonnel(person, pair.driverId, pair.driver));
      if (!pairs.length) return { plate: "", reason: "Sin placa habitual registrada en Conductores-placas" };
      const habitualEnabled = pairs.some((pair) => capacities.has(pair.plate));
      return {
        plate: pairs.map((pair) => displayPlate(pair.plate)).join(", "),
        reason: habitualEnabled
          ? "Su placa habitual habilitada ya está asignada o no admite una ruta pendiente"
          : "Placa habitual indisponible; no quedó otro VH habilitado libre con capacidad",
      };
    };
    const workbook = XLSX.utils.book_new();
    const assignmentsSheet = XLSX.utils.json_to_sheet(assignments);
    const matrixSheet = XLSX.utils.json_to_sheet(matrix);
    const nearThresholdSheet = XLSX.utils.json_to_sheet(nearThreshold, { header: ["ID territorio", "Barrios", "Cédula responsable", "Nombre responsable", "ZKI responsable", "Cédula auxiliar", "Nombre auxiliar", "ZKI auxiliar", "ZKI total", "Conductor", "Placa", "Motivo"] });
    const availableSheet = XLSX.utils.aoa_to_sheet([
      ["Cédula", "Nombre", "Cargo", "Contratista", "Placa vinculada", "Motivo sin asignación"],
      ...availablePeople.map((person) => {
        const detail = driverAvailability(person);
        return [person.id, person.name, person.role, person.contractor || "", detail.plate, detail.reason];
      }),
    ]);
    assignmentsSheet["!cols"] = [12, 44, 16, 20, 16, 34, 34, 20, 14, 20, 16, 18, 18, 14, 34, 14, 42].map((wch) => ({ wch }));
    matrixSheet["!cols"] = [12, 44, 18, 8, 34, 14, 20, 17, 16, 18, 18, 12, 34, 14, 14, 16, 14, 42].map((wch) => ({ wch }));
    nearThresholdSheet["!cols"] = [14, 44, 20, 34, 17, 20, 34, 15, 14, 34, 14, 70].map((wch) => ({ wch }));
    availableSheet["!cols"] = [{ wch: 18 }, { wch: 38 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 55 }];
    availableSheet["!autofilter"] = { ref: `A1:F${Math.max(1, availablePeople.length + 1)}` };
    XLSX.utils.book_append_sheet(workbook, assignmentsSheet, "Asignaciones");
    XLSX.utils.book_append_sheet(workbook, matrixSheet, "Matriz ZKI");
    XLSX.utils.book_append_sheet(workbook, nearThresholdSheet, "Pendientes 60-70");
    XLSX.utils.book_append_sheet(workbook, availableSheet, "Personal disponible");
    XLSX.writeFile(workbook, `${planningComplete ? "asignaciones" : "diagnostico"}_zki_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setMessage(`${planning.length} territorios exportados; ${assignedDriverCount} con conductor y placa, ${incompleteTrips.length} pendientes de tripulación o ZKI.`);
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
        {loadProgress ? <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm font-semibold text-cyan-900" role="status">{loadProgress}</div> : null}
        {catalogRows.length > 0 && source?.rows === 0 ? <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"><p className="font-bold">La consulta autenticada recibió 0 filas de la tabla ZKI para los clientes del Excel.</p><p className="mt-1 text-xs leading-5">Revisa los códigos de cliente del archivo y los permisos de lectura de ZKI. Después pulsa Actualizar.</p></div> : null}
        {source && source.rows > 0 && visits.length === 0 ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">ZKI contiene {formatNumber(source.rows)} filas, pero no se reconocieron las columnas cliente–RR.</p><p className="mt-1 text-xs">Columnas recibidas: {(source.columns || []).join(", ") || "sin columnas detectables"}.</p></div> : null}

        <section className="rounded-xl border border-slate-300 bg-white shadow-sm">
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-cyan-50 text-cyan-800"><Database size={21} /></span>
              <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Fuente operativa</p><h2 className="text-xl font-semibold text-[#0b2235]">Tabla ZKI + histórico de tripulaciones</h2><p className="mt-1 text-sm text-slate-500">Cruza cada zona</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50" disabled={loading || uploading} onClick={() => void load(true)} type="button"><RefreshCw className={loading || uploading ? "animate-spin" : ""} size={16} />Actualizar</button>
              <input accept=".xlsx,.xls,.csv" aria-label="Excel de cédulas activas" className="hidden" onChange={(event) => void uploadActivePersonnel(event.target.files?.[0])} ref={activePersonnelUploadRef} type="file" />
              <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-cyan-300 bg-cyan-50 px-4 text-sm font-semibold text-cyan-900 hover:bg-cyan-100 disabled:bg-slate-200" disabled={uploading} onClick={() => activePersonnelUploadRef.current?.click()} type="button"><Users size={16} />Cargar personal activo</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100" onClick={() => setShowVehicles(true)} type="button"><Truck size={16} />Vehículos</button>
              <input accept=".xlsx,.xls,.csv" aria-label="Excel de territorios, barrios y códigos de cliente" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} ref={uploadRef} type="file" />
              <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0b2235] px-4 text-sm font-semibold text-white disabled:bg-slate-400" disabled={uploading} onClick={() => uploadRef.current?.click()} type="button"><Upload size={16} />{uploading ? "Importando…" : "Cargar territorios y clientes"}</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100" onClick={() => router.push("/personas/zki/graficas")} type="button"><BarChart3 size={16} />Gráficas ZKI</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:bg-slate-400" disabled={!exactOptimal || !hasCurrentPersonnel} onClick={() => void downloadExcel()} type="button"><FileSpreadsheet size={16} />{planningComplete ? "Descargar asignaciones" : "Descargar diagnóstico"}</button>
            </div>
          </div>
          <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-700">
            {hasCurrentPersonnel ? <span><strong>{activePersonnelFileName}</strong>: {activePersonnelIds?.length || 0} cédulas activas, {activePersonnel.length} encontradas en la tabla. El archivo de territorios aporta ID, barrio, código de cliente y, si está incluido, peso para verificar la capacidad del VH.</span> : <span className="font-semibold text-amber-800">Carga las cédulas del personal disponible hoy y el archivo de territorios, barrios y clientes. Si el archivo incluye el peso, se verificará la capacidad del VH.</span>}
          </div>
          <div className="grid border-t border-slate-200 bg-slate-50 sm:grid-cols-4">
            <Stat label="Territorios cargados" value={trips.length} />
            <Stat label="Filas ZKI de clientes cargados" value={source?.rows ?? visits.length} />
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
                  <AvailabilitySummaryRow label="VH habilitados para ZKI con capacidad" available={[...capacities.values()].filter((capacity) => capacity > 0).length} total={Object.keys(vehicleAvailability).length} />
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
                <Setting label="Umbral ZKI combinado" suffix="%" value={settings.minimumZki} onChange={(value) => setSettings({ ...settings, minimumZki: Math.min(200, Math.max(0, value)) })} />
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-500">Cada código de cliente del archivo se cruza con la tabla ZKI. El barrio identifica la zona y ayuda a revisar el territorio; las visitas de otro cliente del mismo barrio no cuentan para ese código. Los RR y auxiliares se distribuyen entre territorios para maximizar las rutas que alcanzan el umbral.</p>
            </section>

            <section className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm">
              <label className="text-xs font-bold uppercase tracking-[.14em] text-slate-500" htmlFor="trip">Zona o viaje</label>
              <select className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" id="trip" onChange={(event) => setSelectedTrip(event.target.value)} value={activeTrip?.id || ""}>
                {trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.zone}</option>)}
              </select>
              {activeTrip ? <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><Detail label="ID territorio" value={activeTrip.territoryId || "—"} /><Detail label="Clientes" value={formatNumber(activeTrip.clients)} /><Detail label="Barrios principales" value={activeTrip.zone} /><Detail label="Peso" value={activeTrip.raw.weightKnown ? `${formatNumber(activeTrip.weight)} kg` : "No informado"} /></div> : null}
            </section>
          </aside>

          <div className="min-w-0 space-y-5">
            <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="font-semibold text-[#0b2235]">Asignaciones recomendadas</h2><p className="mt-1 text-xs text-slate-500">Una salida resumida por territorio. La matriz completa queda disponible para auditoría.</p></div>
                <div className="flex gap-2"><button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-50" onClick={() => setShowMatrix((value) => !value)} type="button"><Eye size={15} />{showMatrix ? "Ocultar matriz" : "Ver opciones viables"}</button><button className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white disabled:bg-slate-400" disabled={!exactOptimal || !hasCurrentPersonnel} onClick={() => void downloadExcel()} type="button"><FileSpreadsheet size={15} />{planningComplete ? "Descargar asignaciones" : "Descargar diagnóstico"}</button></div>
              </div>
              {rankedPlanning.length && hasCurrentPersonnel && !exactOptimal ? <div className="border-b border-cyan-200 bg-cyan-50 px-5 py-3 text-xs font-semibold text-cyan-900">{exactResult?.input === exactInput && exactResult.error || "Optimizando todas las combinaciones de RR, auxiliar, conductor y VH. La descarga se habilitará cuando se confirme el mejor resultado."}</div> : null}
              {exactOptimal ? <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-2 text-xs font-semibold text-emerald-900">Óptimo global confirmado: {viable.length} de {planning.length} territorios cumplen tripulación, capacidad y ZKI mínimo de {settings.minimumZki}.</div> : null}
              {exactOptimal && planning.length && !planningComplete ? <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs font-semibold text-amber-900"><AlertTriangle className="mt-0.5 shrink-0" size={16} /><div><p>Hay {incompleteTrips.length} territorios pendientes de tripulación o ZKI combinado mínimo de {settings.minimumZki}: {incompleteTrips.map(({ trip }) => trip.territoryId).join(", ")}. Puedes descargar un diagnóstico; no se marcará como asignación final.</p><p className="mt-1">De {planning.length} territorios: {assignedRrCount} con RR, {assignedDriverCount} con conductor y placa, {qualifiedZkiCount} con ZKI combinado suficiente.{trips.some((trip) => !trip.raw.weightKnown) ? " Falta el peso de algunos territorios para verificar capacidad." : " La capacidad se verificó con el peso del Excel."}</p></div></div> : null}
              {incompleteDetails.length ? <div className="border-b border-amber-200 bg-amber-50/40 p-4"><div className="mb-2 flex items-center justify-between gap-3"><div><h3 className="text-xs font-black text-amber-950">Diagnóstico de rutas pendientes</h3><p className="text-[10px] text-amber-800">Se evalúa cada RR disponible contra los códigos de cliente del territorio.</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-900">{incompleteDetails.length} rutas</span></div><div className="max-h-64 overflow-auto rounded-lg border border-amber-200 bg-white"><table className="w-full min-w-[760px] text-left text-[10px]"><thead className="sticky top-0 bg-amber-100 text-[9px] uppercase tracking-wide text-amber-950"><tr><th className="px-3 py-2">Territorio</th><th className="px-3 py-2">Zona</th><th className="px-3 py-2 text-right">Clientes</th><th className="px-3 py-2 text-right">Peso</th><th className="px-3 py-2 text-center">RR candidatos</th><th className="px-3 py-2 text-right">Mejor ZKI local</th><th className="px-3 py-2">Razón</th></tr></thead><tbody className="divide-y divide-amber-100">{incompleteDetails.map(({ trip, candidates: count, bestLocalZki, reason }) => <tr key={`missing-${trip.id}`}><td className="px-3 py-2 font-black text-[#10283d]">{trip.territoryId}</td><td className="px-3 py-2 font-semibold text-slate-700">{trip.zone}</td><td className="px-3 py-2 text-right">{trip.clients}</td><td className="px-3 py-2 text-right font-semibold">{trip.raw.weightKnown ? `${formatNumber(trip.weight)} kg` : "No informado"}</td><td className="px-3 py-2 text-center"><span className={`rounded-full px-2 py-1 font-black ${count ? "bg-cyan-100 text-cyan-800" : "bg-red-100 text-red-700"}`}>{count}</span></td><td className="px-3 py-2 text-right font-bold text-slate-700">{formatNumber(bestLocalZki)}%</td><td className="px-3 py-2 font-semibold text-amber-900">{reason}</td></tr>)}</tbody></table></div></div> : null}
              <div className="max-h-[680px] w-full max-w-full overflow-auto overscroll-contain">
                <table className="w-full min-w-[1120px] table-fixed text-left text-xs">
                  <thead className="sticky top-0 z-20 bg-[#10283d] text-[10px] uppercase tracking-[.12em] text-white"><tr><th className="w-[110px] px-4 py-3.5">Territorio</th><th className="w-[160px] px-4 py-3.5">Peso / capacidad</th><th className="w-[220px] px-4 py-3.5">Responsable</th><th className="w-[220px] px-4 py-3.5">Conductor / vehículo</th><th className="w-[220px] px-4 py-3.5">Auxiliar</th><th className="w-[110px] px-4 py-3.5 text-center">ZKI total</th><th className="w-[180px] px-4 py-3.5">Estado</th></tr></thead>
                  <tbody>{planning.map(({ trip, recommendation: item }, index) => (
                    <tr className={`border-b border-slate-200 align-middle transition hover:bg-cyan-50/70 ${index % 2 ? "bg-slate-50/70" : "bg-white"}`} key={trip.id}>
                      <td className="px-4 py-3.5"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#10283d] text-sm font-black text-white">{trip.territoryId}</span><p className="mt-1 max-w-24 truncate text-[10px] text-slate-400" title={trip.zone}>{trip.zone}</p></td>
                      <td className="px-4 py-3.5"><p className="font-bold text-slate-800">{trip.raw.weightKnown ? `${formatNumber(trip.weight)} kg` : "Peso no informado"}</p><p className="mt-1 text-[10px] text-slate-500">Capacidad del VH: {item?.capacity ? `${formatNumber(item.capacity)} kg` : "pendiente"}</p></td>
                      <td className="px-4 py-3.5"><p className="font-bold leading-5 text-[#10283d]">{item?.rr || "Sin historial suficiente"}</p>{item ? <><ScoreBadge value={item.zki} /><p className="mt-1 text-[10px] font-semibold text-slate-500">Carga anterior: {item.previousClients || 0} clientes{item.workloadAdjustment ? ` · ajuste ${item.workloadAdjustment > 0 ? "+" : ""}${formatNumber(item.workloadAdjustment)}` : ""}</p></> : null}</td>
                      <td className="px-4 py-3.5"><p className="font-medium leading-5 text-slate-700">{item?.driver || "Sin conductor"}</p><span className="mt-1 inline-flex rounded-md bg-slate-200 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">{displayPlate(item?.vehicle) || "Sin placa"}</span></td>
                      <td className="px-4 py-3.5"><p className="font-medium leading-5 text-slate-700">{item?.auxiliary || "Sin auxiliar"}</p>{item ? <ScoreBadge value={item.auxiliaryZki} /> : null}</td>
                      <td className="px-4 py-3.5 text-center">{item ? <span className={`inline-grid min-w-16 place-items-center rounded-xl px-3 py-2 text-base font-black ${item.totalZki >= 160 ? "bg-emerald-100 text-emerald-800" : item.totalZki >= 120 ? "bg-cyan-100 text-cyan-900" : "bg-amber-100 text-amber-800"}`}>{formatNumber(item.totalZki)}</span> : "—"}</td>
                      <td className="px-4 py-3.5"><AssignmentStatus candidate={item} minimumZki={settings.minimumZki} tripWeight={trip.weight} weightKnown={Boolean(trip.raw.weightKnown)} /></td>
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
                  <tbody>{viable.map(({ candidate, weightKnown }) => <CandidateRow candidate={candidate} key={`${candidate.rr}:${candidate.driver}:${candidate.vehicle}`} weightKnown={weightKnown} />)}</tbody>
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
    const previous = candidate.previousClients || 0;
    const loadFactor = maximum ? Math.max(0.5, tripClients / maximum) : 1;
    const rangeAdjustment = tripClients < minimum
      ? -Math.min(40, (minimum - tripClients) * 2)
      : tripClients > maximum
        ? -Math.min(40, (tripClients - maximum) * 2)
        : 0;
    const adjustment = rangeAdjustment + (previous > maximum
      ? -Math.min(40, (previous - maximum) * 2 * loadFactor)
      : previous > 0 && previous < minimum
        ? Math.min(15, (minimum - previous) * loadFactor)
        : 0);
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

function CandidateRow({ candidate, weightKnown }: { candidate: Candidate; weightKnown: boolean }) {
  const status = candidate.viable ? weightKnown ? "ZKI y capacidad cumplen" : "ZKI cumple; peso sin verificar" : "Pendiente";
  return <tr className={`border-b border-slate-100 ${candidate.viable ? "" : "bg-red-50/60"}`}><Td>{candidate.viable ? <span className="inline-flex items-center gap-1 font-bold text-emerald-700"><CheckCircle2 size={15} />{status}</span> : <span className="inline-flex items-center gap-1 font-bold text-red-700"><ShieldX size={15} />{status}</span>}</Td><Td strong>{candidate.rr}</Td><Td>{candidate.driver}</Td><Td>{displayPlate(candidate.vehicle)}</Td><Td>{formatPercent(candidate.coverage)}</Td><Td>{formatNumber(candidate.frequency)} / {formatPercent(candidate.frequencyScore)}</Td><Td>{formatPercent(candidate.depth)}</Td><Td><span className={`rounded-md px-2 py-1 font-black ${candidate.zki >= 80 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{formatPercent(candidate.zki)}</span></Td><Td>{candidate.auxiliary}</Td><Td>{formatPercent(candidate.auxiliaryZki)}</Td><Td><span className="rounded-md bg-cyan-100 px-2 py-1 font-black text-cyan-900">{formatNumber(candidate.totalZki)}</span></Td><Td>{candidate.capacity ? `${formatNumber(candidate.capacity)} kg` : "Sin dato"}</Td><Td><span className={candidate.viable ? "text-slate-600" : "font-semibold text-red-700"}>{candidate.reason}</span></Td></tr>;
}

function ScoreBadge({ value }: { value: number }) {
  const tone = value >= 80 ? "bg-emerald-100 text-emerald-800" : value >= 50 ? "bg-cyan-100 text-cyan-800" : "bg-amber-100 text-amber-800";
  return <span className={`mt-1.5 inline-flex rounded-md px-2 py-0.5 text-[10px] font-black ${tone}`}>ZKI {formatPercent(value)}</span>;
}

function AssignmentStatus({ candidate, minimumZki, tripWeight, weightKnown }: { candidate?: Candidate; minimumZki: number; tripWeight: number; weightKnown: boolean }) {
  if (!candidate) return <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">Sin asignación</span>;
  if (candidate.viable) return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800" title={candidate.reason}><CheckCircle2 size={12} />{weightKnown ? viableZkiLabel(candidate) : "ZKI combinado cumple; peso sin verificar"}</span>;
  const status = !candidate.capacity
    ? "Sin placa compatible"
    : candidate.capacity < tripWeight
      ? "Bloqueada por peso"
    : candidate.totalZki < minimumZki
          ? "ZKI combinado insuficiente"
          : "Pendiente";
  return <div title={candidate.reason}><span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800"><AlertTriangle size={12} />{status}</span><p className="mt-1.5 line-clamp-2 text-[10px] leading-4 text-slate-500">{candidate.reason}</p></div>;
}

function viableZkiLabel(candidate: Candidate) {
  if (candidate.zki === 0) return "Cumple por auxiliar; RR 0%";
  if (candidate.auxiliaryZki === 0) return "Cumple por RR; auxiliar 0%";
  return "ZKI combinado y capacidad cumplen";
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
  if (!candidate.driver || normalizePerson(candidate.driver).startsWith("sin")) return "No queda un VH habilitado con capacidad y un conductor activo libre.";
  if (!candidate.vehicle || normalizePerson(candidate.vehicle).startsWith("sin")) return "No queda un VH habilitado con capacidad para esta ruta.";
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
