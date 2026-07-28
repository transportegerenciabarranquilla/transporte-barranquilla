"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowLeft, Building2, ChevronDown, ChevronUp, Clock3, FileSpreadsheet, Maximize2, Minimize2, RefreshCw, Upload } from "lucide-react";

type Person = {
  cc: string;
  nombre: string;
  cargo: string;
  contratista: string;
};

type PeopleGroup = {
  name: string;
  people: Person[];
};

type SeguimientoRoute = {
  contractor: string;
  transporte?: string;
  vehiculo?: string;
  viaje?: string;
  cedulaResponsable?: string;
  cedulaAuxiliar1?: string;
  cedulaAuxiliar2?: string;
  nombreResponsable?: string;
  nombreAuxiliar1?: string;
  nombreAuxiliar2?: string;
  fechaDespacho?: string;
  fechaDt?: string;
  status?: string;
  horaSalida?: string;
  horaLlegada?: string;
};

type RouteAttendance = {
  contratista?: string;
  dt?: string;
  cedulaResponsable?: string;
  cedulaAuxiliar1?: string;
  cedulaAuxiliar2?: string;
  createdAt?: string;
  llave?: string;
};

type ClockRow = {
  identificador?: string;
  nombreCompleto?: string;
  cargo?: string;
  contratista?: string;
  fechaKey?: string;
  entrada?: string;
  salida?: string;
};

type AttendanceSnapshot = {
  operationalDate: string;
  fileName: string;
  uploadedAt: string;
  closedAt: string | null;
  rows: ClockRow[];
};

type PersonState = Person & {
  arrived: boolean;
  inCd: boolean;
  inRoute: boolean;
  status: "Pendiente" | "En CD" | "En ruta";
  arrivalTime: string;
  routeDepartureTime: string;
  pendingReason: "Sin marca de llegada" | "No ha salido a ruta" | "";
};

type CargoRow = {
  cargo: string;
  total: number;
  arrived: number;
  pending: number;
  inCd: number;
  inRoute: number;
};

type DepartureHistoryRow = {
  date: string;
  contractors: Array<{
    id: string;
    label: string;
    total: number;
    onTime: number;
    late: number;
    percentage: number;
  }>;
};

const REFRESH_SECONDS = 10;
const CONTRACTORS = [
  { id: "logisticos", label: "Logísticos", aliases: ["logisticos", "logisticosarenosa"] },
] as const;
const DEPARTURE_CONTRACTORS = [
  { id: "logisticos", label: "Logísticos", aliases: ["logisticos", "logisticosarenosa"] },
  { id: "surti", label: "Surti Cervezas", aliases: ["surti", "surticervezas"] },
  { id: "punto-corona", label: "Punto Corona", aliases: ["puntocorona", "corona", "puntocoronaarenosa", "coronaarenosa"] },
] as const;

export default function ManagementPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dateSelectedByUser = useRef(false);
  const [peopleGroups, setPeopleGroups] = useState<PeopleGroup[]>([]);
  const [seguimientoRoutes, setSeguimientoRoutes] = useState<SeguimientoRoute[]>([]);
  const [routeAttendances, setRouteAttendances] = useState<RouteAttendance[]>([]);
  const [attendanceSnapshots, setAttendanceSnapshots] = useState<AttendanceSnapshot[]>([]);
  const [clockRows, setClockRows] = useState<ClockRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [expandedContractor, setExpandedContractor] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [historyFrom, setHistoryFrom] = useState(() => `${bogotaToday().slice(0, 7)}-01`);
  const [historyTo, setHistoryTo] = useState(() => bogotaToday());
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isTvMode, setIsTvMode] = useState(false);
  const [isAllowed, setIsAllowed] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);
  const [refreshIn, setRefreshIn] = useState(REFRESH_SECONDS);
  const [sourceCounts, setSourceCounts] = useState({ seguimiento: 0, asistencias: 0 });

  const refreshManagementData = useCallback(async () => {
    const response = await fetch(`/api/people/gerencia?refresh=${Date.now()}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "No se pudo cargar el personal, los VH y las asistencias.");
    const liveSeguimiento = (body.seguimiento || []) as SeguimientoRoute[];
    const liveAttendances = (body.asistencias || []) as RouteAttendance[];
    setPeopleGroups(body.contractors || []);
    setSeguimientoRoutes(liveSeguimiento);
    setRouteAttendances(liveAttendances);
    if (!dateSelectedByUser.current) setSelectedDate(bogotaToday());
    setSourceCounts({
      seguimiento: Number(body.sourceCounts?.seguimiento || 0),
      asistencias: Number(body.sourceCounts?.asistencias || 0),
    });
  }, []);

  const refreshAttendanceData = useCallback(async () => {
    const response = await fetch(`/api/people/attendance-snapshots?refresh=${Date.now()}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "No se pudo cargar la asistencia guardada.");
    const snapshots = (body.snapshots || []) as AttendanceSnapshot[];
    setAttendanceSnapshots(snapshots);
    setClockRows(snapshots.flatMap((snapshot) => snapshot.rows || []));
    if (!dateSelectedByUser.current) setSelectedDate(bogotaToday());
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshManagementData(), refreshAttendanceData()]);
    setRefreshIn(REFRESH_SECONDS);
  }, [refreshAttendanceData, refreshManagementData]);

  useEffect(() => {
    fetch("/api/session/session", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!body?.session?.isAdmin && !body?.session?.isPeople) throw new Error("Este módulo está disponible solo para Gerencia y People.");
        setIsAllowed(true);
        return refreshAll();
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "No se pudo cargar Gerencia."))
      .finally(() => setIsLoading(false));
  }, [refreshAll]);

  useEffect(() => {
    if (!isAllowed) return;
    const refresh = () => {
      void refreshAll().catch((caught) => {
        setError(caught instanceof Error ? caught.message : "No se pudo actualizar el tablero.");
      });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isAllowed, refreshAll]);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => {
      setNow(Date.now());
      setRefreshIn((current) => current > 1 ? current - 1 : REFRESH_SECONDS);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleFullscreen = () => setIsTvMode(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  const dates = useMemo(() => {
    const values = new Set([bogotaToday(), ...attendanceSnapshots.map((snapshot) => snapshot.operationalDate)]);
    seguimientoRoutes.forEach((record) => {
      const value = seguimientoDate(record);
      if (value) values.add(value);
    });
    routeAttendances.forEach((record) => {
      const value = routeAttendanceDate(record);
      if (value) values.add(value);
    });
    return Array.from(values).sort().reverse();
  }, [attendanceSnapshots, routeAttendances, seguimientoRoutes]);

  useEffect(() => {
    const selectedSnapshot = attendanceSnapshots.find((snapshot) => snapshot.operationalDate === selectedDate);
    setFileName(selectedSnapshot?.fileName || "");
  }, [attendanceSnapshots, selectedDate]);

  useEffect(() => {
    if (!selectedDate && dates.length) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  const dashboard = useMemo(() => {
    const people = dedupePeople(peopleGroups.flatMap((group) => group.people));
    return CONTRACTORS.map((contractor) => {
      const excelPeople = dedupePeople(
        clockRows
          .filter((row) => dateKey(row.fechaKey) === selectedDate && Boolean(normalizeId(row.identificador)) && Boolean(canonicalCargo(row.cargo)))
          .map((row) => ({
            cc: normalizeId(row.identificador),
            nombre: row.nombreCompleto || `CC ${normalizeId(row.identificador)}`,
            cargo: canonicalCargo(row.cargo),
            contratista: "Logísticos",
          })),
      );
      const masterPeople = people
        .filter((person) => contractor.aliases.includes(normalizeText(person.contratista) as never) && Boolean(canonicalCargo(person.cargo)))
        .map((person) => ({ ...person, cargo: canonicalCargo(person.cargo) }));
      const contractorPeople = excelPeople.length ? excelPeople : masterPeople;
      const peopleIds = new Set(contractorPeople.map((person) => normalizeId(person.cc)).filter(Boolean));
      const clockRecords = buildClockMap(clockRows, selectedDate, contractor.aliases);
      const routedPeople = buildSeguimientoPeople(seguimientoRoutes, routeAttendances, selectedDate, contractor.aliases, peopleIds);
      const rows: PersonState[] = contractorPeople.map((person) => {
        const cc = normalizeId(person.cc);
        const clockRecord = clockRecords.get(cc);
        const routeInfo = routedPeople.get(cc);
        const inRoute = Boolean(routeInfo);
        const arrived = Boolean(clockRecord?.entrada || inRoute);
        return {
          ...person,
          arrived,
          inCd: arrived && !inRoute,
          inRoute,
          status: inRoute ? "En ruta" : arrived ? "En CD" : "Pendiente",
          arrivalTime: clockRecord?.entrada || "",
          routeDepartureTime: routeInfo?.departureTime || "",
          pendingReason: arrived || inRoute ? "" : "Sin marca de llegada",
        };
      });
      return { ...contractor, rows, cargos: summarizeByCargo(rows), totals: summarizePeople(rows) };
    });
  }, [clockRows, peopleGroups, routeAttendances, seguimientoRoutes, selectedDate]);

  const active = dashboard.find((item) => item.id === expandedContractor) || null;
  const tripDashboard = useMemo(
    () => DEPARTURE_CONTRACTORS.map((contractor) => ({
      ...contractor,
      ...summarizeTrips(seguimientoRoutes, selectedDate, contractor.aliases),
    })),
    [seguimientoRoutes, selectedDate],
  );
  const departureHistory = useMemo(() => {
    const days = new Set(
      seguimientoRoutes
        .map(seguimientoDate)
        .filter((date) => date && (!historyFrom || date >= historyFrom) && (!historyTo || date <= historyTo)),
    );

    return Array.from(days)
      .sort()
      .reverse()
      .map((date) => ({
        date,
        contractors: DEPARTURE_CONTRACTORS.map((contractor) => ({
          id: contractor.id,
          label: contractor.label,
          ...summarizeTrips(seguimientoRoutes, date, contractor.aliases),
        })),
      }));
  }, [historyFrom, historyTo, seguimientoRoutes]);
  const deadline = getDepartureDeadline(selectedDate, now);
  const logisticsTripsInRoute = tripDashboard.find((contractor) => contractor.id === "logisticos")?.departed || 0;
  const identifiedDriversInRoute = dashboard.find((contractor) => contractor.id === "logisticos")?.cargos.find((cargo) => cargo.cargo === "Conductor")?.inRoute || 0;
  const unidentifiedDrivers = Math.max(0, logisticsTripsInRoute - identifiedDriversInRoute);
  const previousOpenSnapshot = attendanceSnapshots.find((snapshot) => snapshot.operationalDate < bogotaToday() && !snapshot.closedAt);

  async function toggleTvMode() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        window.scrollTo({ top: 0, behavior: "auto" });
        setExpandedContractor(null);
        await document.documentElement.requestFullscreen();
      }
    } catch {
      setIsTvMode((current) => !current);
    }
  }

  async function closePreviousDay() {
    if (!previousOpenSnapshot) return;
    setIsClosing(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/people/attendance-snapshots", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationalDate: previousOpenSnapshot.operationalDate }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo cerrar la jornada anterior.");
      await refreshAttendanceData();
      setMessage(`Jornada ${formatDate(previousOpenSnapshot.operationalDate)} cerrada y guardada.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cerrar la jornada anterior.");
    } finally {
      setIsClosing(false);
    }
  }

  async function handleAttendanceUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsUploading(true);
    setError("");
    setMessage("");

    try {
      if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("Selecciona un archivo Excel .xlsx o .xls.");
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("El archivo no contiene una hoja de asistencia.");

      const peopleById = new Map(
        peopleGroups.flatMap((group) => group.people).map((person) => [normalizeId(person.cc), person]),
      );
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      const allParsedRows = rawRows.map((row) => parseClockRow(row, peopleById)).filter((row): row is ClockRow => Boolean(row));
      const today = bogotaToday();
      const parsedRows = allParsedRows.filter((row) => dateKey(row.fechaKey) === today).map((row) => ({ ...row, fechaKey: today }));
      if (!parsedRows.length) throw new Error(`El Excel no contiene registros de hoy (${formatDate(today)}). No se guardó ningún dato.`);

      const response = await fetch("/api/people/attendance-snapshots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationalDate: today, fileName: file.name, rows: parsedRows }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo guardar la asistencia en la base de datos.");
      await refreshAttendanceData();
      dateSelectedByUser.current = true;
      setSelectedDate(today);
      setFileName(file.name);
      const ignored = allParsedRows.length - parsedRows.length;
      setMessage(`Asistencia de hoy guardada en la base de datos: ${parsedRows.length} registros.${ignored ? ` Se ignoraron ${ignored} registros de otras fechas.` : ""}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo leer el Excel de asistencia.");
    } finally {
      setIsUploading(false);
    }
  }

  if (isLoading) return <main className="min-h-screen bg-[#f4f7fb]" />;
  if (!isAllowed) return <Restricted message={error} onBack={() => router.push("/")} />;

  return (
    <main className={`${isTvMode ? "h-screen overflow-hidden bg-[radial-gradient(circle_at_10%_0%,rgba(37,99,235,0.10),transparent_32rem),radial-gradient(circle_at_92%_8%,rgba(15,118,110,0.09),transparent_34rem),linear-gradient(145deg,#e8eef6_0%,#f4f7fa_52%,#e7edf4_100%)]" : "min-h-screen bg-[radial-gradient(circle_at_8%_0%,rgba(237,106,90,0.11),transparent_31rem),radial-gradient(circle_at_94%_8%,rgba(124,58,237,0.10),transparent_36rem),#f8f6fc]"} text-slate-900`}>
      <header className={`${isTvMode ? "hidden" : "sticky"} top-0 z-20 border-b border-white/60 bg-white/90 backdrop-blur-xl`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <button aria-label="Volver" className="grid h-10 w-10 place-items-center rounded-lg text-[#10223d] hover:bg-slate-100" onClick={() => router.push("/")} type="button">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3 text-right">
            <span className="hidden items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 sm:inline-flex"><RefreshCw size={14} /> Actualiza en {refreshIn}s</span>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 text-xs font-black text-violet-700 hover:bg-violet-50" onClick={toggleTvMode} type="button"><Maximize2 size={16} /> Modo TV</button>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ed6a5a]">Vista ejecutiva</p>
              <h1 className="text-2xl font-black text-[#2d1b4e]">Gerencia de personal</h1>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#2d1b4e] text-white shadow-lg shadow-violet-200"><FileSpreadsheet size={20} /></span>
          </div>
        </div>
      </header>

      <section className={`mx-auto ${isTvMode ? "grid h-screen max-w-none grid-rows-[46fr_54fr] gap-2 overflow-hidden p-2 font-sans [&_button]:text-sm" : "max-w-7xl space-y-6 px-5 py-7 sm:px-8"}`}>
        {isTvMode ? (
          <div className="fixed right-3 top-3 z-30 flex justify-end gap-2">
            <span className="inline-flex items-center gap-2 rounded-2xl bg-[#102a43] px-4 py-2 text-base font-semibold tracking-[-0.01em] text-white shadow-lg shadow-slate-400/30"><RefreshCw size={17} /> Actualiza en {refreshIn}s</span>
            <button className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-base font-semibold tracking-[-0.01em] text-[#1e3a5f] shadow-lg ring-1 ring-slate-300" onClick={toggleTvMode} type="button"><Minimize2 size={17} /> Salir TV</button>
          </div>
        ) : null}
        {!isTvMode && error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
        {!isTvMode && message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
        {!isTvMode && !clockRows.length ? (
          <div className="flex flex-col gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm text-cyan-900 sm:flex-row sm:items-center sm:justify-between">
            <p>Sube el Excel de asistencia para separar pendientes, personal en CD y personal en ruta.</p>
            <button className="rounded-xl bg-[#2d1b4e] px-4 py-2 font-bold text-white" onClick={() => fileInputRef.current?.click()} type="button">Subir Excel</button>
          </div>
        ) : null}

        <div className={`${isTvMode ? "hidden" : "flex"} flex-col gap-4 rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-[0_18px_55px_rgba(45,27,78,0.07)] sm:flex-row sm:items-end sm:justify-between`}>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ed6a5a]">Corte gerencial</p>
            <p className="mt-1 text-sm font-semibold text-slate-600">{fileName ? `Marcaciones: ${fileName}` : "Sin Excel de marcaciones cargado"}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              Fecha
              <input className="mt-1 block h-10 min-w-48 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-[#2d1b4e]" max={dates[0]} min={dates.at(-1)} onChange={(event) => { dateSelectedByUser.current = true; setSelectedDate(event.target.value); }} type="date" value={selectedDate} />
            </label>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" disabled={!previousOpenSnapshot || isClosing} onClick={closePreviousDay} title={previousOpenSnapshot ? `Cerrar ${formatDate(previousOpenSnapshot.operationalDate)}` : "No hay jornadas anteriores abiertas"} type="button">
              <Archive size={16} /> {isClosing ? "Cerrando…" : previousOpenSnapshot ? `Cerrar ${formatShortDate(previousOpenSnapshot.operationalDate)}` : "Anterior cerrada"}
            </button>
            <input accept=".xlsx,.xls" className="hidden" onChange={handleAttendanceUpload} ref={fileInputRef} type="file" />
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#ed6a5a] px-5 text-sm font-black text-white shadow-lg shadow-rose-100 transition hover:bg-[#d95749] disabled:bg-slate-300" disabled={isUploading} onClick={() => fileInputRef.current?.click()} type="button">
              <Upload size={16} /> {isUploading ? "Procesando…" : "Subir Excel de asistencia"}
            </button>
          </div>
        </div>

        <section className={`min-h-0 overflow-hidden rounded-[22px] border ${isTvMode ? "border-slate-300 bg-gradient-to-br from-white via-[#f8fafc] to-[#edf2f6] shadow-[0_9px_0_-4px_#c5d0da,0_22px_44px_rgba(15,35,58,0.2),inset_0_2px_0_white] ring-1 ring-white" : "border-slate-200 bg-white/95 shadow-[0_18px_55px_rgba(45,27,78,0.07)]"}`}>
          <div className={`flex border-b border-slate-200 sm:flex-row sm:items-center sm:justify-between ${isTvMode ? "gap-2 px-4 py-2" : "flex-col gap-4 px-5 py-5"}`}>
            <div className={isTvMode ? "border-l-4 border-[#0f766e] pl-3" : ""}>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#d76458]">Meta de salida</p>
              <h2 className={`${isTvMode ? "text-2xl tracking-[-0.04em]" : "mt-1 text-xl"} font-bold text-[#102a43]`}>Viajes por contratista</h2>
              {!isTvMode ? <p className="mt-1 text-sm font-semibold text-slate-500">La meta termina a las 7:00 a. m. · Solo Viaje 1 cargado por cada contratista en Seguimiento</p> : null}
              <p className={`${isTvMode ? "flex items-center gap-2 text-sm" : "mt-1 text-xs"} font-semibold text-[#2563a6]`}>
                {isTvMode ? <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" /> : null}
                Seguimiento en vivo: {sourceCounts.seguimiento} VH · Fecha {selectedDate || "sin seleccionar"}{isTvMode ? ` · ${formatTvClock(now)}` : ` · próxima actualización en ${refreshIn}s`}
              </p>
            </div>
            <div className={`flex items-center rounded-2xl border ${isTvMode ? "mr-72 min-w-48 gap-2 px-3 py-2" : "min-w-64 gap-3 px-4 py-3"} ${deadline.isOpen ? "border-amber-300 bg-amber-50 text-amber-900" : isTvMode ? "border-slate-300 bg-slate-100 text-[#334e68]" : "border-violet-200 bg-violet-50 text-violet-800"}`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white"><Clock3 size={19} /></span>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em]">{deadline.isOpen ? "Tiempo restante" : "Estado de la meta"}</p>
                <p className="font-mono text-lg font-semibold tracking-[-0.02em] tabular-nums">{deadline.label}</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className={`w-full min-w-[680px] text-left ${isTvMode ? "border-separate border-spacing-y-2 px-3 text-lg" : "text-sm"}`}>
              <thead className={`uppercase ${isTvMode ? "text-[11px] font-semibold tracking-[0.16em] text-[#51697b]" : "bg-[#edf6ff] text-[10px] font-black tracking-[0.1em] text-[#42627a]"}`}>
                <tr><th className="px-5 py-3">Contratista</th><th className="px-4 py-3 text-center">Viajes totales</th><th className="px-4 py-3 text-center text-emerald-600">VH en ruta</th><th className="px-4 py-3 text-center text-red-600">Después de 7</th><th className="px-5 py-3 text-center">Cumplimiento a tiempo</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tripDashboard.map((contractor, index) => (
                  <tr className={isTvMode ? "drop-shadow-[0_6px_10px_rgba(15,35,58,0.10)] transition duration-200 [&_td]:bg-white/90 [&_td:first-child]:rounded-l-2xl [&_td:last-child]:rounded-r-2xl hover:drop-shadow-[0_9px_15px_rgba(15,35,58,0.15)] hover:[&_td]:bg-white" : "transition-colors hover:bg-[#edf8ff]"} key={contractor.id}>
                    <td className={`${isTvMode ? `border-l-4 py-1 ${index === 0 ? "border-[#315b7d]" : index === 1 ? "border-[#2f716c]" : "border-[#a9823b]"}` : "py-4"} px-5`}><div className="flex items-center gap-3"><span className={`grid place-items-center rounded-xl text-white shadow-md ${isTvMode ? "h-8 w-8" : "h-10 w-10"} ${index === 0 ? "bg-[#315b7d]" : index === 1 ? "bg-[#2f716c]" : "bg-[#a9823b]"}`}><Building2 size={16} /></span><span className={`${isTvMode ? "text-lg" : "text-xl"} font-bold tracking-[-0.02em] text-[#10223d]`}>{contractor.label}</span></div></td>
                    <td className={`px-4 text-center font-bold tracking-[-0.04em] tabular-nums text-[#2d1b4e] ${isTvMode ? "py-1 text-[27px]" : "py-4 text-2xl"}`}>{contractor.total}</td>
                    <td className={`px-4 text-center font-bold tracking-[-0.04em] tabular-nums text-[#059669] ${isTvMode ? "py-1 text-[27px]" : "py-4 text-2xl"}`}>{contractor.departed}</td>
                    <td className={`px-4 text-center font-bold tracking-[-0.04em] tabular-nums text-[#ef4444] ${isTvMode ? "py-1 text-[27px]" : "py-4 text-2xl"}`}>{contractor.late}</td>
                    <td className={`${isTvMode ? "py-0.5" : "py-4"} px-5`}><TripProgressRing percentage={contractor.percentage} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {!isTvMode ? (
          <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white/95 shadow-[0_18px_55px_rgba(45,27,78,0.07)]">
            <div className="border-b border-slate-200 px-5 py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#d76458]">Histórico de cumplimiento</p>
                  <h2 className="mt-1 text-xl font-bold text-[#102a43]">Salidas del CD por día</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Porcentaje = viajes que salieron hasta las 7:00 a. m. ÷ viajes totales del día.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    Desde
                    <input
                      className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-[#2d1b4e]"
                      max={historyTo || undefined}
                      onChange={(event) => setHistoryFrom(event.target.value)}
                      type="date"
                      value={historyFrom}
                    />
                  </label>
                  <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                    Hasta
                    <input
                      className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-[#2d1b4e]"
                      min={historyFrom || undefined}
                      onChange={(event) => setHistoryTo(event.target.value)}
                      type="date"
                      value={historyTo}
                    />
                  </label>
                </div>
              </div>
            </div>
            <DepartureHistoryChart rows={departureHistory} />
          </section>
        ) : null}

        <DepartureIntervalsChart compact={isTvMode} records={seguimientoRoutes} selectedDate={selectedDate} />
        {!isTvMode ? <DepartureOffenderTables records={seguimientoRoutes} /> : null}

        <div className={`min-h-0 w-full ${isTvMode ? "hidden" : "grid gap-5"}`}>
          {dashboard.map((contractor) => (
            <section className={`flex h-full flex-col overflow-hidden rounded-[18px] border ${isTvMode ? "min-h-0 border-slate-300 bg-gradient-to-br from-white via-[#fafbfc] to-[#edf2f4] shadow-[0_9px_0_-4px_#aebcc7,0_20px_40px_rgba(15,35,58,0.24),inset_0_2px_0_white] ring-1 ring-white" : "min-h-[350px] border-slate-200 bg-white/95 shadow-[0_14px_40px_rgba(45,27,78,0.06)]"}`} key={contractor.id}>
              <div className={`border-b px-3.5 ${isTvMode ? "border-[#17384d] bg-gradient-to-b from-[#294f66] via-[#183c52] to-[#102f43] py-1.5 text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.16),inset_0_-3px_0_rgba(0,0,0,0.2),0_5px_12px_rgba(15,35,58,0.25)]" : "border-slate-200 py-3"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${isTvMode ? "bg-gradient-to-br from-white/35 to-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_5px_10px_rgba(0,0,0,0.28)] ring-1 ring-white/40" : "bg-[#2d1b4e] text-white"}`}><Building2 size={16} /></span>
                    <div className="min-w-0">
                      <p className={`text-[9px] font-semibold uppercase tracking-[0.22em] ${isTvMode ? "text-[#a8d8d3]" : "text-[#ed6a5a]"}`}>Contratista</p>
                      <h2 className={`truncate text-lg font-bold tracking-[-0.02em] ${isTvMode ? "text-white" : "text-[#10223d]"}`} title={contractor.label}>{contractor.label}</h2>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {unidentifiedDrivers ? <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-black ${isTvMode ? "bg-amber-100 text-amber-900 shadow-md" : "bg-amber-50 text-amber-800"}`}>{unidentifiedDrivers} conductores sin identificar</span> : null}
                    <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-black ${isTvMode ? "bg-white text-[#102a43] shadow-md" : "bg-violet-50 text-violet-700"}`}>{contractor.totals.arrived}/{contractor.totals.total}</span>
                  </div>
                </div>
                <div className={`${isTvMode ? "mt-1" : "mt-3"} grid grid-cols-3 gap-1.5 text-center text-xs`}>
                  <SmallStat label="Pendientes" large={isTvMode} tone="amber" value={contractor.totals.pending} />
                  <SmallStat label="En CD" large={isTvMode} tone="cyan" value={contractor.totals.inCd} />
                  <SmallStat label="Personas en ruta" large={isTvMode} tone="violet" value={contractor.totals.inRoute} />
                </div>
                {isTvMode ? <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/20"><span className="block h-full rounded-full bg-[#5eead4] transition-[width] duration-500" style={{ width: `${contractor.totals.total ? Math.round((contractor.totals.arrived / contractor.totals.total) * 100) : 0}%` }} /></div> : null}
              </div>

              <div className="flex-1 overflow-x-auto">
                <table className={`w-full min-w-[390px] text-left ${isTvMode ? "border-separate border-spacing-y-1.5 px-2 text-base" : "text-[11px]"}`}>
                  <thead className={`uppercase ${isTvMode ? "text-[10px] font-semibold tracking-[0.14em] text-[#536b7d]" : "bg-[#edf6ff] text-[9px] font-black tracking-[0.08em] text-[#52718a]"}`}>
                    <tr><th className="px-4 py-2.5">Cargo</th><th className="px-2 py-2.5 text-center text-emerald-600" title="Llegaron">Lleg.</th><th className="px-2 py-2.5 text-center text-cyan-600">CD</th><th className="px-3 py-2.5 text-center text-violet-600" title="Personas identificadas en ruta">Ruta ident.</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contractor.cargos.slice(0, 6).map((row, index) => (
                      <tr className={isTvMode ? "drop-shadow-[0_4px_8px_rgba(15,35,58,0.08)] transition duration-200 [&_td]:bg-white/85 [&_td:first-child]:rounded-l-xl [&_td:last-child]:rounded-r-xl hover:drop-shadow-[0_7px_12px_rgba(15,35,58,0.13)] hover:[&_td]:bg-white" : "transition-colors hover:bg-[#edf8ff]"} key={row.cargo}>
                        <td className="px-3.5 py-2"><span className="mr-2 text-[9px] font-semibold text-slate-400">{index + 1}</span><span className="text-base font-semibold tracking-[-0.01em] text-[#10223d]">{row.cargo}</span></td>
                        <CompactNumber large={isTvMode} tone="green" value={row.arrived} />
                        <CompactNumber large={isTvMode} tone="blue" value={row.inCd} />
                        <CompactNumber large={isTvMode} tone="violet" value={row.inRoute} />
                      </tr>
                    ))}
                    {!contractor.cargos.length ? <tr><td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={4}>No hay personal asociado.</td></tr> : null}
                  </tbody>
                </table>
              </div>

              <div className={`${isTvMode ? "hidden" : "block"} border-t border-slate-100 bg-slate-50/60 p-2.5`}>
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-100 bg-white px-3 py-2 text-[11px] font-black text-violet-700 transition hover:border-violet-300 hover:bg-violet-50" onClick={() => setExpandedContractor(active?.id === contractor.id ? null : contractor.id)} type="button">
                  {active?.id === contractor.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  {active?.id === contractor.id ? "Ocultar detalle" : `Ver más · ${contractor.rows.length} personas`}
                </button>
              </div>
            </section>
          ))}
        </div>

        {!isTvMode && active ? (
          <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white/95 shadow-[0_18px_55px_rgba(45,27,78,0.09)]">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700">Detalle del personal</p><h2 className="mt-1 text-lg font-black text-[#10223d]">{active.label}</h2></div>
              <button aria-label="Ocultar detalle" className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200" onClick={() => setExpandedContractor(null)} type="button"><ChevronUp size={17} /></button>
            </div>
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[1080px] text-left text-sm"><thead className="sticky top-0 bg-gradient-to-r from-[#dbeafe] via-[#dcfce7] to-[#f3e8ff] text-xs font-black uppercase tracking-[0.1em] text-[#36546d]"><tr><th className="px-5 py-3">Persona</th><th className="px-4 py-3">Cargo</th><th className="px-4 py-3">Entrada (Excel)</th><th className="px-4 py-3">Salida (Excel)</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Causa pendiente</th></tr></thead><tbody className="divide-y divide-slate-100">{active.rows.map((person, index) => <tr className={`transition-colors ${index % 2 === 0 ? "bg-white hover:bg-[#dbeafe]" : "bg-[#f0fdfa] hover:bg-[#d1fae5]"}`} key={`${person.contratista}:${person.cc}`}><td className="px-5 py-3"><p className="font-bold text-[#10223d]">{person.nombre}</p><p className="text-xs text-slate-400">CC {person.cc}</p></td><td className="px-4 py-3 text-slate-600">{person.cargo || "Sin cargo"}</td><td className="px-4 py-3 font-semibold text-slate-600">{person.arrivalTime || "—"}</td><td className="px-4 py-3 font-black text-violet-700">{person.routeDepartureTime || "—"}</td><td className="px-4 py-3"><Status status={person.status} /></td><td className="px-4 py-3"><PendingReason reason={person.pendingReason} /></td></tr>)}{!active.rows.length ? <tr><td className="px-5 py-10 text-center text-slate-500" colSpan={6}>No hay personal asociado a este contratista.</td></tr> : null}</tbody></table>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function buildClockMap(rows: ClockRow[], selectedDate: string, aliases: readonly string[]) {
  const values = new Map<string, ClockRow>();
  rows.forEach((row) => {
    const cc = normalizeId(row.identificador);
    if (!cc || dateKey(row.fechaKey) !== selectedDate || !aliases.includes(normalizeText(row.contratista))) return;
    const current = values.get(cc);
    if (!current || Number(Boolean(row.entrada)) + Number(Boolean(row.salida)) >= Number(Boolean(current.entrada)) + Number(Boolean(current.salida))) values.set(cc, row);
  });
  return values;
}

function buildSeguimientoPeople(records: SeguimientoRoute[], attendances: RouteAttendance[], selectedDate: string, aliases: readonly string[], peopleIds: Set<string>) {
  const values = new Map<string, { departureTime: string }>();
  const departedByDt = new Map<string, SeguimientoRoute>();
  records.forEach((record) => {
    if (seguimientoDate(record) !== selectedDate || !aliases.includes(normalizeText(record.contractor)) || !hasDepartedRoute(record)) return;
    const departureTime = formatOperationalTime(record.horaSalida);
    const dt = normalizeId(record.transporte);
    if (dt) departedByDt.set(dt, record);
    [record.cedulaResponsable, record.cedulaAuxiliar1, record.cedulaAuxiliar2]
      .map(normalizeId)
      .filter((cc) => Boolean(cc) && peopleIds.has(cc))
      .forEach((cc) => values.set(cc, { departureTime }));
  });
  attendances.forEach((attendance) => {
    if (routeAttendanceDate(attendance) !== selectedDate || !aliases.includes(normalizeText(attendance.contratista))) return;
    const route = departedByDt.get(normalizeId(attendance.dt));
    if (!route) return;
    const departureTime = formatOperationalTime(route.horaSalida);
    [attendance.cedulaResponsable, attendance.cedulaAuxiliar1, attendance.cedulaAuxiliar2]
      .map(normalizeId)
      .filter((cc) => Boolean(cc) && peopleIds.has(cc))
      .forEach((cc) => values.set(cc, { departureTime }));
  });
  return values;
}

function formatOperationalTime(value: string | undefined) {
  const text = String(value || "").trim();
  const time = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (time) return `${time[1].padStart(2, "0")}:${time[2]}${time[3] ? `:${time[3]}` : ""}`;
  return "";
}

function DepartureHistoryChart({ rows }: { rows: DepartureHistoryRow[] }) {
  const [selectedSeries, setSelectedSeries] = useState<string | null>(null);
  if (!rows.length) {
    return <div className="grid min-h-72 place-items-center px-5 text-sm font-semibold text-slate-500">No hay viajes en los días seleccionados.</div>;
  }

  const chronological = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const series = DEPARTURE_CONTRACTORS.map((contractor, index) => {
    const values = chronological.map((row) => row.contractors.find((item) => item.id === contractor.id));
    const operationalValues = values.filter((value) => value && value.percentage > 0);
    const total = operationalValues.reduce((sum, value) => sum + (value?.total || 0), 0);
    const onTime = operationalValues.reduce((sum, value) => sum + (value?.onTime || 0), 0);
    return {
      ...contractor,
      color: index === 0 ? "#7c3aed" : index === 1 ? "#2563eb" : "#16a34a",
      total,
      operationalDays: operationalValues.length,
      compliance: total ? Math.round((onTime / total) * 100) : 0,
      values,
    };
  });
  const visibleSeries = selectedSeries ? series.filter((contractor) => contractor.id === selectedSeries) : series;
  const width = Math.max(900, chronological.length * 92);
  const height = 330;
  const left = 62;
  const right = 30;
  const top = 42;
  const bottom = 62;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = (index: number) => chronological.length === 1 ? left + plotWidth / 2 : left + (index / (chronological.length - 1)) * plotWidth;
  const y = (percentage: number) => top + ((100 - percentage) / 100) * plotHeight;

  return (
    <div className="p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {series.map((contractor) => (
          <button
            aria-pressed={selectedSeries === contractor.id}
            className={`rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
              selectedSeries === contractor.id ? "ring-2 ring-offset-1" : selectedSeries ? "opacity-55" : ""
            }`}
            key={contractor.id}
            onClick={() => setSelectedSeries((current) => current === contractor.id ? null : contractor.id)}
            style={{ borderColor: selectedSeries === contractor.id ? contractor.color : undefined, "--tw-ring-color": contractor.color } as React.CSSProperties}
            type="button"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-black text-[#10223d]">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: contractor.color }} />
                {contractor.label}
              </p>
              <span className="text-2xl font-black tabular-nums" style={{ color: contractor.color }}>{contractor.compliance}%</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">{contractor.total} viajes en {contractor.operationalDays} días con operación</p>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-500">
        Los días en 0% se muestran en la gráfica, pero se excluyen del porcentaje acumulado de cada contratista.
      </p>
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-100 bg-gradient-to-b from-white to-slate-50/60">
        <svg aria-label="Porcentaje diario de salida oportuna del CD" className="block h-[330px]" role="img" style={{ minWidth: width }} viewBox={`0 0 ${width} ${height}`}>
          {[0, 25, 50, 75, 100].map((tick) => {
            const tickY = y(tick);
            return (
              <g key={tick}>
                <line stroke="#dbe5ef" strokeWidth="1" x1={left} x2={width - right} y1={tickY} y2={tickY} />
                <text fill="#64748b" fontSize="12" fontWeight="700" textAnchor="end" x={left - 12} y={tickY + 4}>{tick}%</text>
              </g>
            );
          })}
          {visibleSeries.map((contractor) => {
            const points = contractor.values.map((value, index) => `${x(index)},${y(value?.percentage || 0)}`).join(" ");
            return (
              <g key={contractor.id}>
                <polyline fill="none" points={points} stroke={contractor.color} strokeLinejoin="round" strokeWidth="4" />
                {contractor.values.map((value, index) => {
                  const percentage = value?.percentage || 0;
                  const pointX = x(index);
                  const pointY = y(percentage);
                  return (
                    <g key={`${contractor.id}-${chronological[index].date}`}>
                      <circle cx={pointX} cy={pointY} fill="white" r="6" stroke={contractor.color} strokeWidth="4" />
                      <text fill={contractor.color} fontSize="10" fontWeight="900" textAnchor="middle" x={pointX} y={Math.max(15, pointY - 11 - (contractor.id === "surti" ? 10 : contractor.id === "punto-corona" ? 20 : 0))}>{percentage}%</text>
                      <title>{`${contractor.label} · ${formatDate(chronological[index].date)}: ${percentage}% · ${value?.onTime || 0} de ${value?.total || 0} viajes hasta las 7:00`}</title>
                    </g>
                  );
                })}
              </g>
            );
          })}
          {chronological.map((row, index) => (
            <text fill="#475569" fontSize="11" fontWeight="800" key={row.date} textAnchor="middle" x={x(index)} y={height - 24}>{formatShortDate(row.date)}</text>
          ))}
        </svg>
      </div>
    </div>
  );
}

function DepartureIntervalsChart({ compact = false, records, selectedDate }: { compact?: boolean; records: SeguimientoRoute[]; selectedDate: string }) {
  const [selectedPoint, setSelectedPoint] = useState("");
  const [visibleContractor, setVisibleContractor] = useState("todos");
  const intervalSeconds = 20 * 60;
  const width = 960;
  const height = 270;
  const padding = { top: 32, right: 28, bottom: 48, left: 44 };
  const contractors = DEPARTURE_CONTRACTORS.map((contractor) => ({
    ...contractor,
    color: contractor.id === "surti" ? "#2563eb" : contractor.id === "punto-corona" ? "#16a34a" : "#7c3aed",
  }));
  const uniqueDepartures = new Map<string, SeguimientoRoute>();
  records
    .filter((record) =>
      seguimientoDate(record) === selectedDate &&
      isFirstTrip(record.viaje) &&
      operationalTimeSeconds(record.horaSalida) !== null,
    )
    .forEach((record, index) => {
      const routeKey = [
        normalizeText(record.contractor),
        seguimientoDate(record),
        normalizeId(record.transporte) || normalizeText(record.vehiculo) || String(index),
      ].join(":");
      if (!uniqueDepartures.has(routeKey)) uniqueDepartures.set(routeKey, record);
    });
  const validRecords = Array.from(uniqueDepartures.values());
  const intervalStarts = validRecords.map((record) => Math.floor((operationalTimeSeconds(record.horaSalida) || 0) / intervalSeconds) * intervalSeconds);
  const first = intervalStarts.length ? Math.min(...intervalStarts) : 0;
  const last = intervalStarts.length ? Math.max(...intervalStarts) : -1;
  const intervals = first <= last ? Array.from({ length: Math.floor((last - first) / intervalSeconds) + 1 }, (_, index) => first + index * intervalSeconds) : [];
  const series = contractors.map((contractor) => ({
    ...contractor,
    values: intervals.map((interval) => {
      const matching = validRecords.filter((record) =>
        contractor.aliases.includes(normalizeText(record.contractor) as never) &&
        Math.floor((operationalTimeSeconds(record.horaSalida) || 0) / intervalSeconds) * intervalSeconds === interval,
      );
      return new Set(matching.map((record, index) => normalizeText(record.vehiculo) || normalizeId(record.transporte) || String(index))).size;
    }),
  }));
  const visibleSeries = visibleContractor === "todos" ? series : series.filter((item) => item.id === visibleContractor);
  const maximum = Math.max(1, ...visibleSeries.flatMap((item) => item.values));
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const x = (index: number) => padding.left + (intervals.length <= 1 ? innerWidth / 2 : (index / (intervals.length - 1)) * innerWidth);
  const y = (value: number) => padding.top + innerHeight - (value / maximum) * innerHeight;
  const [selectedContractorId, selectedIntervalValue] = selectedPoint.split(":");
  const selectedContractor = contractors.find((contractor) => contractor.id === selectedContractorId);
  const selectedInterval = Number(selectedIntervalValue);
  const selectedRows = selectedContractor && Number.isFinite(selectedInterval)
    ? validRecords.filter((record) =>
        selectedContractor.aliases.includes(normalizeText(record.contractor) as never) &&
        Math.floor((operationalTimeSeconds(record.horaSalida) || 0) / intervalSeconds) * intervalSeconds === selectedInterval)
    : [];

  return (
    <section className={`min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-[0_18px_55px_rgba(45,27,78,0.07)] ${compact ? "h-full" : ""}`}>
      <div className={`flex flex-wrap items-center justify-between border-b border-slate-200 bg-slate-50/80 ${compact ? "gap-2 px-4 py-2" : "gap-3 px-5 py-4"}`}>
        <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">Evolución de salidas</p><h2 className="mt-0.5 text-lg font-black text-[#2d1b4e]">Carros por intervalos de 20 minutos</h2><p className="mt-1 text-xs text-slate-500">Hora real de salida tomada de Seguimiento · un registro por DT y contratista.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black ring-1 transition ${visibleContractor === "todos" ? "bg-[#10223d] text-white ring-[#10223d]" : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"}`} onClick={() => setVisibleContractor("todos")} type="button">Todas</button>
          {series.map((item) => <button className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold ring-1 transition ${visibleContractor === item.id ? "text-white" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`} key={item.id} onClick={() => setVisibleContractor(item.id)} style={visibleContractor === item.id ? { backgroundColor: item.color, boxShadow: `inset 0 0 0 1px ${item.color}` } : undefined} type="button"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: visibleContractor === item.id ? "white" : item.color }} />{item.label}</button>)}
          <span className="rounded-lg bg-white px-3 py-1.5 text-[10px] font-black text-violet-700 ring-1 ring-slate-200">{intervals.length} intervalos</span>
        </div>
      </div>
      {intervals.length ? <div className={compact ? "p-2" : "p-4"}>
        <div className={`${compact ? "mb-2" : "mb-4"} grid gap-2 sm:grid-cols-3`}>{series.map((item) => {
          const total = item.values.reduce((sum, value) => sum + value, 0);
          const peak = Math.max(0, ...item.values);
          const peakIndex = item.values.indexOf(peak);
          return <button className={`rounded-xl border bg-white text-left transition ${compact ? "px-3 py-1.5" : "p-3"} ${visibleContractor === item.id ? "shadow-md" : "border-slate-200 hover:border-slate-300"}`} key={item.id} onClick={() => setVisibleContractor(visibleContractor === item.id ? "todos" : item.id)} style={visibleContractor === item.id ? { borderColor: item.color } : undefined} type="button"><div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-2 text-xs font-black text-[#10223d]"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span><strong className={compact ? "text-base tabular-nums" : "text-xl tabular-nums"} style={{ color: item.color }}>{total}</strong></div>{!compact ? <p className="mt-1 text-[9px] font-semibold text-slate-500">{peak ? `Pico: ${peak} VH · ${departureIntervalLabel(intervals[peakIndex])}` : "Sin salidas registradas"}</p> : null}</button>;
        })}</div>
        <div className="overflow-x-auto"><svg aria-label="Salidas por contratista en intervalos de veinte minutos" className={compact ? "h-[285px] w-full" : "min-w-[900px] w-full"} preserveAspectRatio="xMidYMid meet" role="img" viewBox={`0 0 ${width} ${height}`}>
        {[0, Math.ceil(maximum / 2), maximum].filter((value, index, values) => values.indexOf(value) === index).map((value) => <g key={value}><line stroke="#e2e8f0" x1={padding.left} x2={width - padding.right} y1={y(value)} y2={y(value)} /><text fill="#64748b" fontSize="10" textAnchor="end" x={padding.left - 8} y={y(value) + 4}>{value}</text></g>)}
        {visibleSeries.map((item) => <g key={item.id}><polyline fill="none" points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(" ")} stroke={item.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={visibleSeries.length === 1 ? "5" : "4"} />{item.values.map((value, index) => {
          const pointKey = `${item.id}:${intervals[index]}`;
          const selected = selectedPoint === pointKey;
          return <g className={value ? "cursor-pointer" : ""} key={pointKey} onClick={() => { if (value) setSelectedPoint(selected ? "" : pointKey); }}><circle cx={x(index)} cy={y(value)} fill={selected ? item.color : "white"} r={selected ? 7 : 5} stroke={item.color} strokeWidth="3"><title>{`${item.label} · ${departureIntervalLabel(intervals[index])}: ${value} carros · clic para ver tripulación`}</title></circle>{value ? <text fill={item.color} fontSize="9" fontWeight="900" textAnchor="middle" x={x(index)} y={y(value) - 10}>{value}</text> : null}</g>;
        })}</g>)}
        {intervals.map((interval, index) => <text fill="#475569" fontSize="9" fontWeight="700" key={interval} textAnchor="middle" x={x(index)} y={height - 17}>{departureIntervalLabel(interval)}</text>)}
      </svg></div>
        {!compact && selectedContractor && selectedRows.length ? <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black uppercase tracking-[0.12em]" style={{ color: selectedContractor.color }}>{selectedContractor.label} · {departureIntervalLabel(selectedInterval)}</p><span className="rounded-md bg-white px-2 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">{selectedRows.length} VH</span></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{selectedRows.map((record, index) => {
            const people = [
              record.nombreResponsable || record.cedulaResponsable,
              record.nombreAuxiliar1 || record.cedulaAuxiliar1,
              record.nombreAuxiliar2 || record.cedulaAuxiliar2,
            ].filter(Boolean);
            return <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm" key={`${normalizeId(record.transporte)}:${normalizeText(record.vehiculo)}:${index}`}><div className="flex items-center justify-between gap-2"><strong className="text-sm text-[#10223d]">{record.vehiculo || "VH sin placa"}</strong><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">DT {record.transporte || "—"}</span></div><p className="mt-1 text-[10px] font-semibold text-slate-500">Salida {formatOperationalTime(record.horaSalida) || "—"}</p><div className="mt-2 space-y-1">{people.length ? people.map((person, personIndex) => <p className="truncate text-[10px] text-slate-700" key={`${person}:${personIndex}`} title={person}>• {person}</p>) : <p className="text-[10px] text-slate-400">Sin tripulación registrada</p>}</div></article>;
          })}</div>
        </div> : null}
      </div> : <div className="grid min-h-64 place-items-center px-5 text-sm font-semibold text-slate-500">No hay horas de salida para la fecha seleccionada.</div>}
    </section>
  );
}

function departureIntervalLabel(interval: number) {
  return `${formatSecondsClock(interval)}–${formatSecondsClock(interval + 20 * 60 - 1)}`;
}

function formatSecondsClock(seconds: number) {
  return `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}`;
}

type DepartureOffender = {
  averageSeconds: number;
  document: string;
  lateDepartures: number;
  name: string;
  records: number;
  role: string;
};

function DepartureOffenderTables({ records }: { records: SeguimientoRoute[] }) {
  const tables = DEPARTURE_CONTRACTORS.map((contractor) => ({
    ...contractor,
    color: contractor.id === "surti" ? "#2563eb" : contractor.id === "punto-corona" ? "#16a34a" : "#7c3aed",
    offenders: buildDepartureOffenders(records, contractor.aliases).slice(0, 10),
  }));

  return (
    <section>
      <div className="mb-3"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">Top offenders</p><h2 className="mt-0.5 text-lg font-black text-[#2d1b4e]">Personas con promedio de salida más tarde</h2><p className="mt-1 text-xs text-slate-500">Histórico disponible en Seguimiento · primer viaje · salidas posteriores a las 7:00 a. m.</p></div>
      <div className="grid gap-4 xl:grid-cols-3">
        {tables.map((table) => <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-[0_14px_40px_rgba(45,27,78,0.06)]" key={table.id}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" style={{ backgroundColor: table.color }}><div><p className="text-[8px] font-bold uppercase tracking-[0.16em] text-white/70">Contratista</p><h3 className="font-black">{table.label}</h3></div><span className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[9px] font-bold">{table.offenders.length} personas</span></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] text-left text-[10px]">
              <thead className="bg-slate-50 text-[8px] font-black uppercase tracking-[0.08em] text-slate-500"><tr><th className="w-8 px-2 py-2 text-center">#</th><th className="px-2 py-2">Persona</th><th className="px-2 py-2">Rol</th><th className="px-2 py-2 text-center">Promedio</th><th className="px-2 py-2 text-center">Tardías</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{table.offenders.map((offender, index) => <tr className="hover:bg-slate-50" key={`${offender.document}:${offender.name}:${offender.role}`}><td className="px-2 py-2 text-center font-black text-slate-400">{index + 1}</td><td className="px-2 py-2"><p className="max-w-40 truncate font-bold text-[#10223d]" title={offender.name}>{offender.name}</p><p className="text-[8px] text-slate-400">{offender.document ? `CC ${offender.document}` : `${offender.records} registros`}</p></td><td className="px-2 py-2 text-slate-500">{offender.role}</td><td className="px-2 py-2 text-center font-mono font-black" style={{ color: table.color }}>{formatSecondsClock(offender.averageSeconds)}</td><td className="px-2 py-2 text-center"><span className="rounded bg-red-50 px-1.5 py-1 font-black text-red-700">{offender.lateDepartures}</span></td></tr>)}
              {!table.offenders.length ? <tr><td className="px-4 py-10 text-center text-xs text-slate-400" colSpan={5}>No hay personas con salidas tardías.</td></tr> : null}</tbody>
            </table>
          </div>
        </article>)}
      </div>
    </section>
  );
}

function buildDepartureOffenders(records: SeguimientoRoute[], aliases: readonly string[]) {
  const routes = new Map<string, SeguimientoRoute>();
  records
    .filter((record) =>
      aliases.includes(normalizeText(record.contractor) as never) &&
      isFirstTrip(record.viaje) &&
      operationalTimeSeconds(record.horaSalida) !== null)
    .forEach((record, index) => {
      const key = [
        seguimientoDate(record),
        normalizeId(record.transporte) || normalizeText(record.vehiculo) || String(index),
      ].join(":");
      if (!routes.has(key)) routes.set(key, record);
    });

  const groups = new Map<string, DepartureOffender & { totalSeconds: number }>();
  routes.forEach((record) => {
    const departureSeconds = operationalTimeSeconds(record.horaSalida);
    if (departureSeconds === null) return;
    const members = [
      { document: normalizeId(record.cedulaResponsable), name: record.nombreResponsable || "", role: "Responsable" },
      { document: normalizeId(record.cedulaAuxiliar1), name: record.nombreAuxiliar1 || "", role: "Auxiliar 1" },
      { document: normalizeId(record.cedulaAuxiliar2), name: record.nombreAuxiliar2 || "", role: "Auxiliar 2" },
    ];
    members.forEach((member) => {
      const name = member.name.trim();
      const key = member.document || normalizeText(name);
      if (!key) return;
      const current = groups.get(key) || { ...member, averageSeconds: 0, lateDepartures: 0, name: name || `CC ${member.document}`, records: 0, totalSeconds: 0 };
      current.records += 1;
      current.totalSeconds += departureSeconds;
      if (departureSeconds > 7 * 60 * 60) current.lateDepartures += 1;
      groups.set(key, current);
    });
  });

  return Array.from(groups.values())
    .map(({ totalSeconds, ...offender }) => ({ ...offender, averageSeconds: Math.round(totalSeconds / offender.records) }))
    .filter((offender) => offender.lateDepartures > 0)
    .sort((a, b) => b.averageSeconds - a.averageSeconds || b.lateDepartures - a.lateDepartures || a.name.localeCompare(b.name, "es"));
}

function routeAttendanceDate(record: RouteAttendance) {
  const keyDate = String(record.llave || "").match(/\d{4}-\d{2}-\d{2}/)?.[0];
  return keyDate || dateKey(record.createdAt);
}

function seguimientoDate(record: SeguimientoRoute) {
  return dateKey(record.fechaDespacho || record.fechaDt);
}


function hasOperationalTime(value: string | undefined) {
  const normalized = normalizeText(value);
  return Boolean(normalized && !["pendiente", "sinregistro", "na", "0"].includes(normalized));
}

function summarizeTrips(records: SeguimientoRoute[], selectedDate: string, aliases: readonly string[]) {
  const trips = new Map<string, SeguimientoRoute>();
  records.forEach((record, index) => {
    if (!isFirstTrip(record.viaje) || seguimientoDate(record) !== selectedDate || !aliases.includes(normalizeText(record.contractor))) return;
    const dt = normalizeId(record.transporte);
    const vehicle = normalizeText(record.vehiculo);
    trips.set(`${dt || "sin-dt"}:${vehicle || index}`, record);
  });

  const total = trips.size;
  const tripRows = Array.from(trips.values());
  const departed = tripRows.filter(hasDepartedRoute).length;
  const onTime = tripRows.filter((record) => isDepartureOnTime(record.horaSalida)).length;
  const late = tripRows.filter((record) => isDepartureLate(record.horaSalida)).length;
  const pending = Math.max(0, total - departed);
  return { total, departed, onTime, late, pending, percentage: total ? Math.round((onTime / total) * 100) : 0 };
}

function isFirstTrip(value: unknown) {
  const trip = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return trip === "primer viaje" || /^(?:v(?:iaje)?\s*)?1(?:\D.*)?$/.test(trip);
}

function hasDepartedRoute(record: SeguimientoRoute) {
  const status = normalizeText(record.status);
  return hasOperationalTime(record.horaSalida) || ["enruta", "retornando", "recargue", "finalizado"].includes(status);
}

function isDepartureOnTime(value: string | undefined) {
  const seconds = operationalTimeSeconds(value);
  return seconds !== null && seconds <= 7 * 60 * 60;
}

function isDepartureLate(value: string | undefined) {
  const seconds = operationalTimeSeconds(value);
  return seconds !== null && seconds > 7 * 60 * 60;
}

function operationalTimeSeconds(value: string | undefined) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function getDepartureDeadline(selectedDate: string, now: number) {
  if (!selectedDate || !now) return { isOpen: false, label: "--:--:--" };
  const target = new Date(`${selectedDate}T07:00:00`).getTime();
  const remaining = target - now;
  if (remaining <= 0) return { isOpen: false, label: "Meta finalizada" };

  const seconds = Math.floor(remaining / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return {
    isOpen: true,
    label: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`,
  };
}

function summarizeByCargo(rows: PersonState[]): CargoRow[] {
  const groups = new Map<string, CargoRow>();
  rows.forEach((person) => {
    const cargo = canonicalCargo(person.cargo);
    if (!cargo) return;
    const current = groups.get(cargo) || { cargo, total: 0, arrived: 0, pending: 0, inCd: 0, inRoute: 0 };
    current.total += 1;
    if (person.arrived) current.arrived += 1;
    if (person.status === "Pendiente") current.pending += 1;
    if (person.inCd) current.inCd += 1;
    if (person.inRoute) current.inRoute += 1;
    groups.set(cargo, current);
  });
  return Array.from(groups.values()).sort((a, b) => b.total - a.total || a.cargo.localeCompare(b.cargo));
}

function summarizePeople(rows: PersonState[]) {
  return rows.reduce((total, person) => ({ total: total.total + 1, arrived: total.arrived + Number(person.arrived), pending: total.pending + Number(person.status === "Pendiente"), inCd: total.inCd + Number(person.inCd), inRoute: total.inRoute + Number(person.inRoute) }), { total: 0, arrived: 0, pending: 0, inCd: 0, inRoute: 0 });
}

function dedupePeople(people: Person[]) {
  const values = new Map<string, Person>();
  people.forEach((person) => {
    const key = `${normalizeText(person.contratista)}:${normalizeId(person.cc)}`;
    if (normalizeId(person.cc)) values.set(key, person);
  });
  return Array.from(values.values());
}

function canonicalCargo(value: unknown) {
  const cargo = normalizeText(value);
  if (cargo.includes("conductor")) return "Conductor";
  if (cargo.includes("auxiliar") && (cargo.includes("reparto") || cargo.includes("rr"))) return "Auxiliar de Reparto";
  if (
    (cargo.includes("responsable") && (cargo.includes("reparto") || cargo.includes("ruta") || cargo.includes("rr"))) ||
    cargo === "rr" ||
    cargo.includes("liderderuta") ||
    (cargo.includes("coordinador") && cargo.includes("ruta"))
  ) return "Responsable de Ruta";
  return "";
}

function parseClockRow(row: Record<string, unknown>, peopleById: Map<string, Person>): ClockRow | null {
  const identificador = normalizeId(readClockValue(row, ["identificador", "cedula", "cc", "documento"]));
  const person = peopleById.get(identificador);
  const nombres = readClockValue(row, ["nombres", "nombre"]);
  const apellidos = readClockValue(row, ["apellidos", "apellido"]);
  const fecha = readClockValue(row, ["fecha"]);
  const entrada = readClockValue(row, ["entro", "entrada"]);
  const salida = readClockValue(row, ["salio", "salida"], true);
  const nombreCompleto = [apellidos, nombres].filter(Boolean).join(" ").trim() || person?.nombre || "";
  if (!identificador && !nombreCompleto && !fecha) return null;

  return {
    identificador,
    nombreCompleto,
    cargo: readClockValue(row, ["cargo"]) || person?.cargo || "",
    contratista: "Logísticos",
    fechaKey: normalizeClockDate(fecha),
    entrada,
    salida,
  };
}

function readClockValue(row: Record<string, unknown>, names: string[], preferLast = false) {
  const values = Object.entries(row)
    .filter(([key]) => {
      const normalized = normalizeHeader(key);
      return names.some((name) => normalized === name || normalized.startsWith(`${name}_`) || normalized.startsWith(`${name}__`) || /^\d+$/.test(normalized.replace(name, "")));
    })
    .map(([, value]) => String(value ?? "").trim())
    .filter(Boolean);
  return preferLast ? values[values.length - 1] || "" : values[0] || "";
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeClockDate(value: string) {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return dateKey(text);
}

function normalizeId(value: unknown) { return String(value || "").replace(/\D/g, ""); }
function normalizeText(value: unknown) { return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""); }
function dateKey(value: unknown) { const text = String(value || ""); if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10); const parsed = new Date(text); return Number.isNaN(parsed.getTime()) ? "" : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`; }
function formatDate(value: string) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" }) : "Sin fecha"; }
function formatShortDate(value: string) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" }) : ""; }
function bogotaToday() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function formatTvClock(value: number) { return value ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(new Date(value)) : "--:--:--"; }

function SmallStat({ label, large = false, tone = "slate", value }: { label: string; large?: boolean; tone?: "slate" | "amber" | "cyan" | "violet"; value: number }) { const tones = { slate: "bg-gradient-to-b from-white to-[#e7edf2] text-[#102a43] ring-slate-300", amber: "bg-gradient-to-b from-white to-[#f3ead8] text-[#8a5a18] ring-[#d5bd91]", cyan: "bg-gradient-to-b from-white to-[#e1ecef] text-[#226173] ring-[#afcbd2]", violet: "bg-gradient-to-b from-white to-[#ebe9f1] text-[#514b72] ring-[#c6c1d5]" }; return <span className={`rounded-lg ring-1 ${large ? `px-2 py-1 shadow-[inset_0_2px_0_white,inset_0_-2px_0_rgba(15,35,58,0.1),0_6px_12px_rgba(15,35,58,0.18)] ${tones[tone]}` : "bg-white px-1.5 py-1.5 text-[#10223d] shadow-sm ring-slate-200"}`}><strong className={`block drop-shadow-sm ${large ? "text-2xl" : "text-base"}`}>{value}</strong><span className={`font-bold uppercase opacity-80 ${large ? "text-[10px]" : "text-[8px]"}`}>{label}</span></span>; }
function CompactNumber({ large = false, tone = "slate", value }: { large?: boolean; tone?: "slate" | "green" | "amber" | "blue" | "violet"; value: number }) { const styles = { slate: "text-[#334e68]", green: "text-[#00a86b]", amber: "text-[#e87900]", blue: "text-[#0096c7]", violet: "text-[#7c3aed]" }; return <td className={`px-2 text-center font-bold tracking-[-0.03em] tabular-nums ${large ? "py-4 text-[26px]" : "py-2"} ${styles[tone]}`}>{value}</td>; }
function TripProgressRing({ large = false, percentage }: { large?: boolean; percentage: number }) { const degrees = Math.max(0, Math.min(100, percentage)) * 3.6; const color = percentage >= 90 ? "#10b981" : percentage >= 70 ? "#facc15" : "#ef4444"; return <div className="flex items-center justify-center gap-3"><div aria-label={`${percentage}% de salidas a tiempo`} className={`grid shrink-0 place-items-center rounded-full shadow-lg ${large ? "h-[72px] w-[72px]" : "h-16 w-16"}`} style={{ background: `conic-gradient(${color} ${degrees}deg, #dbeafe ${degrees}deg)` }}><span className={`grid place-items-center rounded-full bg-white font-black tabular-nums text-[#102a43] ${large ? "h-14 w-14 text-base" : "h-12 w-12 text-sm"}`}>{percentage}%</span></div><span className={`${large ? "text-sm" : "text-xs"} font-bold text-[#52677b]`}>Salieron<br />hasta 7:00</span></div>; }
function Status({ status }: { status: PersonState["status"] }) { const styles = status === "En ruta" ? "bg-violet-100 text-violet-700 ring-1 ring-violet-300" : status === "En CD" ? "bg-cyan-100 text-cyan-700 ring-1 ring-cyan-300" : "bg-amber-100 text-amber-700 ring-1 ring-amber-300"; return <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-black ${styles}`}>{status}</span>; }
function PendingReason({ reason }: { reason: PersonState["pendingReason"] }) { if (!reason) return <span className="text-slate-300">—</span>; const style = reason === "Sin marca de llegada" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"; return <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ${style}`}>{reason}</span>; }
function Restricted({ message, onBack }: { message: string; onBack: () => void }) { return <main className="grid min-h-screen place-items-center bg-[#f4f7fb] px-5"><section className="max-w-md rounded-xl border border-red-100 bg-white p-6 text-center shadow-lg"><h1 className="text-xl font-black text-[#10223d]">Gerencia restringida</h1><p className="mt-2 text-sm text-slate-500">{message || "No tienes permiso para consultar este módulo."}</p><button className="mt-5 rounded-lg bg-[#10223d] px-4 py-2 text-sm font-bold text-white" onClick={onBack} type="button">Volver</button></section></main>; }
