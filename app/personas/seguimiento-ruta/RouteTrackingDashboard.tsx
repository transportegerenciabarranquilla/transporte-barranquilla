"use client";

import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronUp, Clock3, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeContractorName } from "../../lib/contractors";
import type { Vehiculo } from "../../seguimiento/types";
import { formatDuration } from "../eliot/lib/time";
import { buildRouteTrackingEntries, routeDate, type ManagementAttendanceSnapshot, type RouteTrackingEntry } from "./routeTrackingMetrics";

const CONTRACTOR_CARDS = [
  { id: "logisticos", label: "Logísticos", aliases: ["logisticos"], color: "#7c3aed" },
] as const;

const RANKING_ROLES = [
  { key: "Responsable RR", label: "Responsables RR", color: "#7c3aed" },
  { key: "Auxiliar", label: "Auxiliares", color: "#2563eb" },
  { key: "Conductor", label: "Conductores", color: "#059669" },
] as const;

function roleGroup(role: string) {
  if (role.toLowerCase().includes("responsable")) return "Responsable RR";
  if (role.toLowerCase().includes("conductor")) return "Conductor";
  if (role.toLowerCase().includes("auxiliar")) return "Auxiliar";
  return role;
}

function normalizeSearch(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function shownDuration(seconds: number | null) {
  return seconds === null ? "Pendiente" : formatDuration(seconds);
}

function formatUploadDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha registrada";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota" }).format(date);
}

function timeCoverage(entries: (RouteTrackingEntry & { operationalDate: string })[]) {
  const route = new Map<string, number | null>();
  const routeDayForTrip = new Map<string, string>();
  const tml = new Map<string, number | null>();
  const awake = new Map<string, number | null>();
  const record = (values: Map<string, number | null>, key: string, seconds: number | null) => {
    if (!values.has(key) || (values.get(key) === null && seconds !== null)) values.set(key, seconds);
  };
  for (const entry of entries) {
    if (!entry.document) continue;
    const dayKey = `${entry.operationalDate}:${entry.document}`;
    const tripKey = `${entry.operationalDate}:${entry.key}`;
    record(route, tripKey, entry.routeSeconds);
    routeDayForTrip.set(tripKey, dayKey);
    record(tml, dayKey, entry.tmlSeconds);
    record(awake, dayKey, entry.awakeSeconds);
  }
  const routeDays = new Map<string, number | null>();
  for (const [tripKey, seconds] of route) {
    const dayKey = routeDayForTrip.get(tripKey)!;
    const previous = routeDays.get(dayKey);
    routeDays.set(dayKey, previous === null || seconds === null ? null : (previous ?? 0) + seconds);
  }
  return [
    { key: "route", label: "Tiempo en ruta", unit: "participaciones en ruta", color: "#7c3aed", values: route, dailyValues: routeDays },
    { key: "tml", label: "TML por día", unit: "días/persona", color: "#2563eb", values: tml, dailyValues: tml },
    { key: "awake", label: "vespertino por día", unit: "días/persona", color: "#f59e0b", values: awake, dailyValues: awake },
  ].map(({ values, dailyValues, ...metric }) => {
    const count = [...values.values()].filter((seconds) => seconds !== null).length;
    const days = [...dailyValues.values()].filter((seconds): seconds is number => seconds !== null);
    return { ...metric, total: values.size, count, days: days.length, averageSeconds: days.length ? days.reduce((sum, seconds) => sum + seconds, 0) / days.length : null, percent: values.size ? count / values.size * 100 : null };
  });
}

function averageByPerson(entries: (RouteTrackingEntry & { operationalDate: string })[]) {
  const countedTml = new Set<string>();
  const countedAwake = new Set<string>();
  const people = new Map<string, { key: string; name: string; document: string; role: string; dts: Set<string>; days: Set<string>; trips: Set<string>; route: number[]; routeDays: Map<string, { sum: number; missing: boolean }>; tml: number[]; awake: number[] }>();
  for (const entry of entries) {
    if (!entry.document) continue;
    const role = roleGroup(entry.role);
    const key = `${entry.document}:${role}`;
    const person = people.get(key) || { key, name: entry.name, document: entry.document, role, dts: new Set<string>(), days: new Set<string>(), trips: new Set<string>(), route: [], routeDays: new Map<string, { sum: number; missing: boolean }>(), tml: [], awake: [] };
    person.days.add(entry.operationalDate);
    if (entry.dt.trim()) person.dts.add(entry.dt.trim());
    const tripKey = `${entry.operationalDate}:${entry.key}`;
    if (!person.trips.has(tripKey)) {
      person.trips.add(tripKey);
      if (entry.routeSeconds !== null) person.route.push(entry.routeSeconds);
      const day = person.routeDays.get(entry.operationalDate) || { sum: 0, missing: false };
      if (entry.routeSeconds === null) day.missing = true;
      else day.sum += entry.routeSeconds;
      person.routeDays.set(entry.operationalDate, day);
    }
    const dailyKey = `${entry.operationalDate}:${key}`;
    if (entry.tmlSeconds !== null && !countedTml.has(dailyKey)) {
      person.tml.push(entry.tmlSeconds);
      countedTml.add(dailyKey);
    }
    if (entry.awakeSeconds !== null && !countedAwake.has(dailyKey)) {
      person.awake.push(entry.awakeSeconds);
      countedAwake.add(dailyKey);
    }
    people.set(key, person);
  }
  const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  return [...people.values()].map((person) => {
    const completeRouteDays = [...person.routeDays.values()].filter((day) => !day.missing);
    return {
      key: person.key,
      name: person.name,
      document: person.document,
      role: person.role,
      dts: [...person.dts],
      routeDailyAverageSeconds: average(completeRouteDays.map((day) => day.sum)),
      routeDays: completeRouteDays.length,
      routeTrips: person.route.length,
      routePendingTrips: person.trips.size - person.route.length,
      tmlSeconds: average(person.tml),
      tmlDays: person.tml.length,
      tmlPendingDays: person.days.size - person.tml.length,
      awakeSeconds: average(person.awake),
      awakeDays: person.awake.length,
    };
  }).sort((a, b) => (b.routeDailyAverageSeconds ?? -1) - (a.routeDailyAverageSeconds ?? -1) || a.name.localeCompare(b.name, "es"));
}

export function RouteTrackingDashboard() {
  const [routes, setRoutes] = useState<Vehiculo[]>([]);
  const [attendance, setAttendance] = useState<ManagementAttendanceSnapshot[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [query, setQuery] = useState("");
  const [rankingMetric, setRankingMetric] = useState<"routeDailyAverageSeconds" | "tmlSeconds" | "awakeSeconds">("routeDailyAverageSeconds");
  const [rankingPages, setRankingPages] = useState<Record<string, number>>({});
  const [personQuery, setPersonQuery] = useState("");
  const [showPersonSearch, setShowPersonSearch] = useState(false);
  const personSearchInput = useRef<HTMLInputElement>(null);
  const peopleTableScroll = useRef<HTMLDivElement>(null);
  const [selectedPerson, setSelectedPerson] = useState<{ name: string; document: string } | null>(null);
  const personDialog = useRef<HTMLDialogElement>(null);
  const initializedDates = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sessionResponse = await fetch("/api/session/session", { cache: "no-store" });
      const sessionBody = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok || (!sessionBody.session?.isPeople && !sessionBody.session?.isAdmin)) {
        throw new Error("Este módulo está disponible solo para People y administración.");
      }
      const [routesResponse, attendanceResponse] = await Promise.all([
        fetch("/api/seguimiento?contratista=Logisticos", { cache: "no-store" }),
        fetch("/api/people/attendance-snapshots?export=all", { cache: "no-store" }),
      ]);
      const [routesBody, attendanceBody] = await Promise.all([
        routesResponse.json().catch(() => ({})),
        attendanceResponse.json().catch(() => ({})),
      ]);
      if (!routesResponse.ok) throw new Error(routesBody.error || "No se pudieron consultar las rutas de Seguimiento.");
      if (!attendanceResponse.ok) throw new Error(attendanceBody.error || "No se pudieron consultar las marcaciones de GeoVictoria en Gerencia.");
      const nextRoutes = (Array.isArray(routesBody.records) ? routesBody.records as Vehiculo[] : []).filter((route) => normalizeContractorName(route.transportista) === "logisticos");
      const nextAttendance = (Array.isArray(attendanceBody.snapshots) ? attendanceBody.snapshots as ManagementAttendanceSnapshot[] : [])
        .map((snapshot) => ({ ...snapshot, rows: snapshot.rows.filter((row) => normalizeContractorName(row.contratista) === "logisticos") }))
        .filter((snapshot) => snapshot.rows.length > 0);
      setRoutes(nextRoutes);
      setAttendance(nextAttendance);
      const dates = Array.from(new Set(nextRoutes.map(routeDate).filter(Boolean))).sort().reverse();
      const datesWithGeo = new Set(nextAttendance.map((snapshot) => snapshot.operationalDate));
      const defaultDate = dates.find((date) => datesWithGeo.has(date)) || dates[0] || "";
      if (!initializedDates.current) {
        setStartDate(defaultDate);
        setEndDate(defaultDate);
        initializedDates.current = true;
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cargar el seguimiento de ruta.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const dates = useMemo(() => Array.from(new Set(routes.map(routeDate).filter(Boolean))).sort().reverse(), [routes]);
  const invalidRange = Boolean(startDate && endDate && startDate > endDate);
  const rangeDates = useMemo(() => invalidRange ? [] : dates.filter((date) => (!startDate || date >= startDate) && (!endDate || date <= endDate)), [dates, startDate, endDate, invalidRange]);
  const personHistory = useMemo(() => selectedPerson ? dates.flatMap((date) =>
    buildRouteTrackingEntries(routes, attendance, date, new Date(now))
      .filter((entry) => entry.document === selectedPerson.document)
      .map((entry) => ({ ...entry, operationalDate: date }))
  ) : [], [selectedPerson, dates, routes, attendance, now]);
  useEffect(() => {
    if (selectedPerson && !personDialog.current?.open) personDialog.current?.showModal();
    if (!selectedPerson && personDialog.current?.open) personDialog.current.close();
  }, [selectedPerson]);

  function clearFilters() {
    setStartDate("");
    setEndDate("");
    setQuery("");
    setPersonQuery("");
    setSelectedPerson(null);
  }
  const entries = useMemo(() => rangeDates.flatMap((date) =>
    buildRouteTrackingEntries(routes, attendance, date, new Date(now)).map((entry) => ({ ...entry, operationalDate: date }))
  ), [routes, attendance, rangeDates, now]);
  const filtered = useMemo(() => {
    const search = normalizeSearch(query);
    return search ? entries.filter((entry) => normalizeSearch([entry.dt, entry.trip, entry.carrier, entry.name, entry.document].join(" ")).includes(search)) : entries;
  }, [entries, query]);
  const coverage = useMemo(() => timeCoverage(filtered), [filtered]);
  const personDailyTml = useMemo(() => {
    if (!selectedPerson) return [];
    const daily = new Map<string, number | null>();
    for (const entry of entries) {
      if (entry.document !== selectedPerson.document) continue;
      if (!daily.has(entry.operationalDate) || daily.get(entry.operationalDate) === null) daily.set(entry.operationalDate, entry.tmlSeconds);
    }
    return [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, seconds]) => ({ date, seconds }));
  }, [entries, selectedPerson]);
  const personTmlValues = personDailyTml.flatMap((day) => day.seconds === null ? [] : [day.seconds]);
  const personTmlAverage = personTmlValues.length ? personTmlValues.reduce((sum, seconds) => sum + seconds, 0) / personTmlValues.length : null;
  const personRouteSummary = useMemo(() => {
    const trips = new Map<string, number | null>();
    for (const entry of entries) {
      if (entry.document === selectedPerson?.document) trips.set(`${entry.operationalDate}:${entry.key}`, entry.routeSeconds);
    }
    const days = new Map<string, number | null>();
    for (const [key, seconds] of trips) {
      const date = key.slice(0, 10);
      const previous = days.get(date);
      days.set(date, previous === null || seconds === null ? null : (previous ?? 0) + seconds);
    }
    const complete = [...days.values()].filter((seconds): seconds is number => seconds !== null);
    return { average: complete.length ? complete.reduce((sum, seconds) => sum + seconds, 0) / complete.length : null, days: complete.length, pending: [...trips.values()].filter((seconds) => seconds === null).length };
  }, [entries, selectedPerson]);
  const cards = useMemo(() => CONTRACTOR_CARDS.map((contractor) => ({
    ...contractor,
    people: averageByPerson(filtered.filter((entry) => (contractor.aliases as readonly string[]).includes(normalizeContractorName(entry.carrier)))),
  })), [filtered]);
  const tableCards = useMemo(() => {
    const search = normalizeSearch(personQuery);
    return cards.map((card) => {
      const people = search ? card.people.filter((person) => normalizeSearch(`${person.name} ${person.document}`).includes(search)) : card.people;
      return { ...card, people: [...people].sort((a, b) => (b[rankingMetric] ?? -1) - (a[rankingMetric] ?? -1) || a.name.localeCompare(b.name, "es")) };
    });
  }, [cards, personQuery, rankingMetric]);
  useEffect(() => {
    if (showPersonSearch) personSearchInput.current?.focus();
  }, [showPersonSearch]);
  useEffect(() => {
    if (peopleTableScroll.current) peopleTableScroll.current.scrollTop = 0;
  }, [personQuery]);
  const rankings = useMemo(() => RANKING_ROLES.map((role) => ({
    ...role,
    people: cards.flatMap((card) => card.people)
      .filter((person) => person.role === role.key && person[rankingMetric] !== null)
      .sort((a, b) => b[rankingMetric]! - a[rankingMetric]! || a.name.localeCompare(b.name, "es"))
      .slice(0, 10),
  })), [cards, rankingMetric]);
  const hasGeoVictoria = attendance.some((snapshot) => rangeDates.includes(snapshot.operationalDate) && snapshot.rows.some((row) => normalizeContractorName(row.contratista) === "logisticos" && (row.entrada || row.salida)));
  const hasVehicleArrival = routes.some((route) => rangeDates.includes(routeDate(route)) && normalizeContractorName(route.transportista) === "logisticos" && /^\d{1,2}:\d{2}/.test(String(route.horaLlegada || "")));
  const hasAwakeTime = entries.some((entry) => normalizeContractorName(entry.carrier) === "logisticos" && entry.awakeSeconds !== null);
  const lastUploadedFile = useMemo(() => attendance
    .filter((snapshot) => snapshot.uploadedAt)
    .sort((a, b) => Date.parse(b.uploadedAt || "") - Date.parse(a.uploadedAt || ""))[0] || null, [attendance]);

  return (
    <main className="min-h-screen bg-[#f4f2fa] px-4 py-6 text-slate-800 sm:px-8 sm:py-9">
      <div className="w-full space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-50 text-violet-700"><Clock3 size={22} /></span>
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">People Transporte</p><h1 className="text-2xl font-black text-[#2d1b4e]">Seguimiento de ruta</h1><p className="mt-1 text-sm text-slate-500">Rutas de Seguimiento y marcaciones de GeoVictoria cargadas en Gerencia.</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50" disabled={loading} onClick={() => void loadData()} type="button"><RefreshCw size={16} /> Actualizar</button>
            <Link className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50" href="/"><ArrowLeft size={16} /> Volver</Link>
          </div>
        </header>

        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">{error}</p> : null}
        {!loading && rangeDates.length > 0 && (!hasGeoVictoria || !hasVehicleArrival || !hasAwakeTime) ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">{!hasGeoVictoria ? `No hay marcaciones de GeoVictoria cargadas en Gerencia en el rango seleccionado; el TML y el tiempo vespertino quedan pendientes. ` : ""}{!hasVehicleArrival ? "Seguimiento aún no registra llegadas de vehículo para este rango; el tiempo vespertino queda pendiente hasta que se registren." : hasGeoVictoria && !hasAwakeTime ? "Las salidas de GeoVictoria guardadas no coinciden por cédula con tripulantes de rutas que ya llegaron; el tiempo vespertino queda pendiente." : ""}</p> : null}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><h2 className="text-lg font-black text-[#2d1b4e]">Tiempo en ruta, TML y tiempo vespertino</h2><p className="mt-1 text-xs text-slate-500">Promedios por persona y día en el período seleccionado. Los círculos indican el porcentaje de registros con tiempo calculado. Para Tiempo en ruta se suman los viajes del mismo día antes de promediar; los días pendientes no cuentan como cero. TML: entrada GeoVictoria a primera salida de ruta. vespertino: llegada del vehículo a salida GeoVictoria.</p></div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-bold text-slate-600">Desde<input type="date" className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" onChange={(event) => setStartDate(event.target.value)} value={startDate} /></label>
              <label className="text-xs font-bold text-slate-600">Hasta<input type="date" className="mt-1 block rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" onChange={(event) => setEndDate(event.target.value)} value={endDate} /></label>
              <label className="text-xs font-bold text-slate-600">Buscar<span className="mt-1 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"><Search size={15} /><input className="w-44 bg-transparent text-sm outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="DT o persona" value={query} /></span></label>
              <button type="button" onClick={clearFilters} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-violet-700 hover:bg-violet-50">Limpiar filtros</button>
            </div>
          </div>
          {loading ? <p className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">Cargando seguimiento…</p> : invalidRange ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">La fecha inicial debe ser anterior o igual a la fecha final.</p> : !rangeDates.length ? <p className="rounded-2xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">No hay rutas de Seguimiento en el rango seleccionado.</p> : (
            <div className="w-full space-y-5">
              <div className="grid gap-4 md:grid-cols-3" aria-label="Promedios por persona y día">
                {coverage.map((metric) => <article className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm" key={metric.key}>
                  <h3 className="text-sm font-black text-[#2d1b4e]">{metric.label}</h3>
                  <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Promedio por persona y día</p>
                  <p className="mt-1 font-mono text-xl font-black tabular-nums" style={{ color: metric.color }}>{metric.averageSeconds === null ? "—" : formatDuration(metric.averageSeconds)}</p>
                </article>)}
              </div>
              <section aria-label="Top 10 peores de Logísticos" className="space-y-3">
                <div>
                  <h3 className="text-lg font-black text-[#2d1b4e]">Top 10 peores · Logísticos</h3>
                  <p className="text-xs text-slate-500">Mayor promedio diario primero, según las fechas y la búsqueda. Tiempo en ruta suma los viajes de cada persona por día; TML y vespertino cuentan una vez por día. Los días pendientes no cuentan como cero.</p>
                  <label className="mt-3 inline-block text-xs font-bold text-slate-600">Calcular Top 10 por
                    <select
                      aria-label="Calcular Top 10 por indicador"
                      className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                      onChange={(event) => {
                        setRankingMetric(event.target.value as typeof rankingMetric);
                        setRankingPages({});
                      }}
                      value={rankingMetric}
                    >
                      <option value="routeDailyAverageSeconds">Tiempo en ruta</option>
                      <option value="tmlSeconds">TML</option>
                      <option value="awakeSeconds">Tiempo vespertino</option>
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {rankings.map((ranking) => {
                    const pageSize = 5;
                    const pageCount = Math.max(1, Math.ceil(ranking.people.length / pageSize));
                    const page = Math.min(rankingPages[ranking.key] || 0, pageCount - 1);
                    const visiblePeople = ranking.people.slice(page * pageSize, (page + 1) * pageSize);
                    return <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" key={ranking.key}>
                    <div className="flex items-center justify-between px-4 py-3 text-white" style={{ backgroundColor: ranking.color }}>
                      <h4 className="text-sm font-black">{ranking.label}</h4>
                      <span className="text-xs font-bold">{ranking.people.length} peores</span>
                    </div>
                    <div>
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-slate-500">
                          <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Nombre / Cédula</th><th className="px-3 py-2 text-right">{rankingMetric === "routeDailyAverageSeconds" ? "Tiempo en ruta" : rankingMetric === "tmlSeconds" ? "TML por día" : "vespertino por día"}</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {visiblePeople.map((person, index) => <tr className="hover:bg-slate-50" key={person.key}>
                            <td className="px-3 py-2 align-top font-black text-slate-400">{page * pageSize + index + 1}</td>
                            <td className="px-3 py-2">
                              <button type="button" className="text-left font-bold text-[#10223d] underline decoration-violet-200 underline-offset-2 hover:text-violet-700 focus-visible:outline-violet-600" onClick={() => setSelectedPerson(person)} aria-label={`Ver todos los DT de ${person.name}`}>{person.name}</button>
                              <p className="text-[10px] text-slate-500">CC {person.document}</p>
                              <p className="text-[10px] text-slate-500">{rankingMetric === "routeDailyAverageSeconds" ? `${person.routeDays} días completos · ${person.routeTrips} viajes con tiempo` : rankingMetric === "tmlSeconds" ? `${person.tmlDays} días con TML` : `${person.awakeDays} días con vespertino`}</p>
                              {(rankingMetric === "routeDailyAverageSeconds" ? person.routePendingTrips : rankingMetric === "tmlSeconds" ? person.tmlPendingDays : 0) > 0 ? <p className="text-[10px] font-semibold text-amber-700">Datos parciales · {rankingMetric === "routeDailyAverageSeconds" ? `${person.routePendingTrips} viajes sin tiempo` : `${person.tmlPendingDays} días con ruta sin TML`}</p> : null}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right align-top font-mono font-black tabular-nums" style={{ color: ranking.color }}>{shownDuration(person[rankingMetric])}</td>
                          </tr>)}
                        </tbody>
                      </table>
                      {!ranking.people.length ? <p className="px-4 py-8 text-center text-xs text-slate-500">Sin tiempos calculados para este rol e indicador en el rango seleccionado.</p> : null}
                      {ranking.people.length > pageSize ? <div className="flex items-center justify-center gap-3 border-t border-slate-100 px-3 py-2">
                        <button aria-label={`Ver página anterior de ${ranking.label}`} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30" disabled={page === 0} onClick={() => setRankingPages((current) => ({ ...current, [ranking.key]: page - 1 }))} type="button"><ChevronUp size={17} /></button>
                        <span className="text-[10px] font-bold text-slate-500">{page + 1} / {pageCount}</span>
                        <button aria-label={`Ver página siguiente de ${ranking.label}`} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30" disabled={page >= pageCount - 1} onClick={() => setRankingPages((current) => ({ ...current, [ranking.key]: page + 1 }))} type="button"><ChevronDown size={17} /></button>
                      </div> : null}
                    </div>
                  </article>;
                  })}
                </div>
              </section>
              {tableCards.map((card) => <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_40px_rgba(45,27,78,0.06)]" key={card.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-white" style={{ backgroundColor: card.color }}>
                  <div><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/75">Contratista</p><h3 className="text-base font-black">{card.label}</h3></div>
                  <div className="flex items-center gap-3">
                    <button type="button" aria-expanded={showPersonSearch} aria-controls="table-person-search" onClick={() => { setShowPersonSearch(true); personSearchInput.current?.focus(); }} className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20"><Search size={15} /> Buscar personas</button>
                    <span className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-bold">{card.people.length} personas</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2">
                </div>
                {showPersonSearch ? <div id="table-person-search" className="flex flex-wrap items-end gap-3 border-b border-slate-100 bg-violet-50/50 px-4 py-3">
                  <label className="text-xs font-bold text-slate-600">Nombre o cédula<input ref={personSearchInput} type="search" value={personQuery} onChange={(event) => setPersonQuery(event.target.value)} placeholder="Escribe el nombre o la cédula" className="mt-1 block w-72 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-violet-600" /></label>
                  <button type="button" onClick={() => { setPersonQuery(""); personSearchInput.current?.focus(); }} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700">Limpiar búsqueda</button>
                  <p className="pb-2 text-xs text-slate-500">Busca en esta tabla dentro del rango seleccionado.</p>
                </div> : null}
                <div ref={peopleTableScroll} className="max-h-[calc(100dvh-16rem)] min-h-80 overflow-auto">
                  <table className="w-full min-w-[800px] text-left text-[10px]">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500"><tr><th className="w-8 px-2 py-2 text-center">#</th><th className="px-2 py-2">Persona</th><th className="px-2 py-2">DTs</th><th className="px-2 py-2">Rol</th><th className="px-2 py-2 text-right">Tiempo en ruta</th><th className="px-2 py-2 text-right">TML por día</th><th className="px-2 py-2 text-right">vespertino por dia</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{card.people.map((person, index) => <tr className="hover:bg-slate-50" key={person.key}><td className="px-2 py-2 text-center font-black text-slate-400">{index + 1}</td><td className="px-2 py-2"><button type="button" className="text-left font-bold text-[#10223d] underline decoration-violet-200 underline-offset-2 hover:text-violet-700 focus-visible:outline-violet-600" onClick={() => setSelectedPerson(person)} aria-label={`Ver todos los DT de ${person.name}`}>{person.name}</button><p className="text-[9px] text-slate-400">CC {person.document}</p></td><td className="px-2 py-2 font-mono font-semibold text-slate-600">{person.dts.length ? <div className="flex max-w-xs flex-wrap gap-x-3 gap-y-1">{person.dts.map((dt) => <span className="whitespace-nowrap" key={dt}>{dt}</span>)}</div> : "Sin DT"}</td><td className="px-2 py-2 text-slate-500">{person.role}</td><td className="px-2 py-2 text-right font-mono font-black tabular-nums" style={{ color: card.color }}>{shownDuration(person.routeDailyAverageSeconds)}</td><td className="px-2 py-2 text-right font-mono font-black tabular-nums text-violet-700">{shownDuration(person.tmlSeconds)}</td><td className="px-2 py-2 text-right font-mono font-black tabular-nums text-amber-700">{shownDuration(person.awakeSeconds)}</td></tr>)}</tbody>
                  </table>
                  {!card.people.length ? <p className="px-4 py-10 text-center text-xs text-slate-500">No hay personas para este rango y búsqueda.</p> : null}
                </div>
              </article>)}
              <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-xs font-semibold text-slate-600 shadow-sm">
                {lastUploadedFile ? <>Último archivo montado: <span className="font-black text-slate-800">{lastUploadedFile.fileName || "Archivo de asistencia"}</span> · {formatUploadDate(lastUploadedFile.uploadedAt || "")}</> : "No hay archivos montados con fecha registrada."}
              </p>
            </div>
          )}
        </section>
      </div>
      <dialog ref={personDialog} onClose={() => setSelectedPerson(null)} aria-labelledby="person-history-title" className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-950/50">
        <div className="flex items-start justify-between gap-4 bg-violet-600 px-5 py-4 text-white">
          <div>
            <h2 id="person-history-title" className="text-lg font-black">DTs de {selectedPerson?.name}</h2>
            <p className="mt-1 text-xs">CC {selectedPerson?.document} · {new Set(personHistory.map((entry) => entry.dt).filter(Boolean)).size} DTs · {personHistory.length} participaciones</p>
          </div>
          <button type="button" onClick={() => personDialog.current?.close()} className="rounded-lg border border-white/30 px-3 py-2 text-sm font-bold hover:bg-white/10">Cerrar</button>
        </div>
        <p className="px-5 py-3 text-xs text-slate-500">Todo el histórico disponible de Logísticos, sin limitar por las fechas o la búsqueda de la tabla. Incluye los distintos roles de la persona.</p>
        <div className="max-h-[60dvh] overflow-auto">
          <section className="mx-5 mb-4 rounded-xl border border-violet-200 bg-violet-50 p-4" aria-label="Desglose diario del TML">
            <h3 className="text-sm font-black text-violet-900">Tiempo en ruta del rango seleccionado</h3>
            <p className="mt-2 text-sm text-violet-900">Promedio por día: <strong>{shownDuration(personRouteSummary.average)}</strong> · {personRouteSummary.days} días completos · {personRouteSummary.pending} viajes pendientes</p>
            <p className="mb-4 mt-1 text-xs text-slate-600">Suma los viajes de cada día y promedia únicamente los días completos dentro del rango.</p>
            <h3 className="text-sm font-black text-violet-900">TML del rango seleccionado · {startDate || "Inicio del histórico"} a {endDate || "Fin del histórico"}</h3>
            <p className="mt-2 text-sm text-violet-900">Promedio por día: <strong>{shownDuration(personTmlAverage)}</strong></p>
            <p className="mt-1 text-xs text-slate-600">{personTmlValues.length} días calculados de {personDailyTml.length} días con ruta. La suma cuenta cada día una vez, aunque tenga varios DTs.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {personDailyTml.map((day) => <div key={day.date} className="rounded-lg border border-violet-100 bg-white px-3 py-2 text-xs"><p className="font-bold text-slate-600">{day.date}</p><p className={day.seconds === null ? "text-amber-700" : "font-mono font-bold text-violet-700"}>{shownDuration(day.seconds)}</p></div>)}
            </div>
            {personDailyTml.length > personTmlValues.length ? <p className="mt-3 text-xs text-amber-800">Faltan datos para calcular el TML de los días pendientes. Se necesitan entrada GeoVictoria y salida de ruta del mismo día.</p> : null}
          </section>
          <table className="w-full min-w-[750px] text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">DT</th><th className="px-4 py-3">Viaje</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3 text-right">Ruta</th><th className="px-4 py-3 text-right">TML</th><th className="px-4 py-3 text-right">vespertino</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {personHistory.map((entry, index) => <tr key={`${entry.operationalDate}:${entry.key}:${index}`} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3">{entry.operationalDate}</td>
                <td className="px-4 py-3 font-bold text-violet-700">{entry.dt || "Sin DT"}</td>
                <td className="px-4 py-3">{entry.trip || "—"}</td>
                <td className="px-4 py-3">{entry.role}</td>
                <td className="px-4 py-3 text-right font-mono font-bold">{shownDuration(entry.routeSeconds)}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-violet-700">{shownDuration(entry.tmlSeconds)}</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-amber-700">{shownDuration(entry.awakeSeconds)}</td>
              </tr>)}
            </tbody>
          </table>
          {!personHistory.length ? <p className="px-5 py-10 text-center text-sm text-slate-500">No hay DTs disponibles para esta persona.</p> : null}
        </div>
      </dialog>
    </main>
  );
}
