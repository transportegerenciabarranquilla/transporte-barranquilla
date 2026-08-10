"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Database, Eye, FileSpreadsheet, RefreshCw, ShieldX, SlidersHorizontal, Truck, Upload, Users } from "lucide-react";
import {
  assignUniqueResponsibles,
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

type ApiData = { rows: RawRow[]; history: RawRow[]; source: { table: string; rows: number; columns?: string[] } };

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

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/people/zki", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo cargar ZKI.");
      setData(body as ApiData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cargar ZKI.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const trips = useMemo(() => parseTrips(planningRows), [planningRows]);
  const history = useMemo(() => parseCrewHistory(data?.history || []), [data]);
  const visits = useMemo(() => parseZkiVisits(data?.rows || []), [data]);
  const territoryClients = useMemo(() => parseTerritoryClients(territoryRows), [territoryRows]);
  const activeTrip = trips.find((trip) => trip.id === selectedTrip) || trips[0];
  const clientsForTrip = useMemo(
    () => activeTrip ? territoryClients.filter((row) => row.territoryId === activeTrip.territoryId).map((row) => row.client) : [],
    [activeTrip, territoryClients],
  );
  const capacities = useMemo(() => capacityMap(planningRows), [planningRows]);
  const rankedPlanning = useMemo(() => trips.map((trip) => {
    const clientCodes = territoryClients.filter((row) => row.territoryId === trip.territoryId).map((row) => row.client);
    const ranked = rankCandidates(trip, history, visits, clientCodes, capacities, settings);
    return { trip, candidates: ranked };
  }), [capacities, history, settings, territoryClients, trips, visits]);
  const planning = useMemo(() => {
    const assignments = assignUniqueResponsibles(rankedPlanning.map(({ trip, candidates: ranked }) => ({ tripId: trip.id, candidates: ranked })));
    return rankedPlanning.map(({ trip, candidates: ranked }) => ({ trip, candidates: ranked, recommendation: assignments.get(trip.id) }));
  }, [rankedPlanning]);
  const candidates = useMemo(
    () => activeTrip ? rankCandidates(activeTrip, history, visits, clientsForTrip, capacities, settings) : [],
    [activeTrip, capacities, clientsForTrip, history, settings, visits],
  );
  const viable = candidates.filter((candidate) => candidate.viable);
  const recommendation = planning.find(({ trip }) => trip.id === activeTrip?.id)?.recommendation;

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
        {data?.source.rows === 0 ? <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"><p className="font-bold">La consulta autenticada recibió 0 filas de la tabla ZKI.</p><p className="mt-1 text-xs leading-5">Supabase puede mostrar registros en el editor y aun así ocultarlos a la aplicación por RLS. Ejecuta <code className="rounded bg-red-100 px-1">supabase/zki_access.sql</code> en el SQL Editor y luego pulsa Actualizar.</p></div> : null}
        {data && data.source.rows > 0 && visits.length === 0 ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-bold">ZKI contiene {formatNumber(data.source.rows)} filas, pero no se reconocieron las columnas cliente–RR.</p><p className="mt-1 text-xs">Columnas recibidas: {(data.source.columns || []).join(", ") || "sin columnas detectables"}.</p></div> : null}

        <section className="rounded-xl border border-slate-300 bg-white shadow-sm">
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-cyan-50 text-cyan-800"><Database size={21} /></span>
              <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Fuente operativa</p><h2 className="text-xl font-semibold text-[#0b2235]">Tabla ZKI + histórico de tripulaciones</h2><p className="mt-1 text-sm text-slate-500">Cruza cada zona con RR, conductor y vehículo habitual; el sobrepeso bloquea la opción.</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold hover:bg-slate-50" disabled={loading} onClick={() => void load()} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={16} />Actualizar</button>
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
