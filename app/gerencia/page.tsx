"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, CheckCircle2, ChevronDown, ChevronUp, Clock3, FileSpreadsheet, MapPin, Route, Upload, Users } from "lucide-react";

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
  cedulaResponsable?: string;
  cedulaAuxiliar1?: string;
  cedulaAuxiliar2?: string;
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

type StoredAttendance = {
  fileName?: string;
  savedAt?: string;
  rows?: ClockRow[];
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

const ATTENDANCE_STORAGE_KEY = "bavaria.people.attendance.excel.v1";
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
  const [clockRows, setClockRows] = useState<ClockRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [expandedContractor, setExpandedContractor] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isAllowed, setIsAllowed] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);
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
    const latestOperationalDate = getLatestOperationalDate(liveSeguimiento, liveAttendances);
    if (!dateSelectedByUser.current && latestOperationalDate) setSelectedDate(latestOperationalDate);
    setSourceCounts({
      seguimiento: Number(body.sourceCounts?.seguimiento || 0),
      asistencias: Number(body.sourceCounts?.asistencias || 0),
    });
  }, []);

  useEffect(() => {
    const stored = readStoredAttendance();
    setClockRows(stored?.rows || []);
    setFileName(stored?.fileName || "");

    fetch("/api/session/session", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!body?.session?.isAdmin && !body?.session?.isPeople) throw new Error("Este módulo está disponible solo para Gerencia y People.");
        setIsAllowed(true);
        return refreshManagementData();
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "No se pudo cargar Gerencia."))
      .finally(() => setIsLoading(false));
  }, [refreshManagementData]);

  useEffect(() => {
    if (!isAllowed) return;
    const refresh = () => {
      void refreshManagementData().catch((caught) => {
        setError(caught instanceof Error ? caught.message : "No se pudo actualizar Seguimiento.");
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
  }, [isAllowed, refreshManagementData]);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const dates = useMemo(() => {
    const values = new Set(clockRows.map((row) => dateKey(row.fechaKey)).filter(Boolean));
    seguimientoRoutes.forEach((record) => {
      const value = seguimientoDate(record);
      if (value) values.add(value);
    });
    routeAttendances.forEach((record) => {
      const value = routeAttendanceDate(record);
      if (value) values.add(value);
    });
    return Array.from(values).sort().reverse();
  }, [clockRows, routeAttendances, seguimientoRoutes]);

  useEffect(() => {
    if (!selectedDate && dates.length) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  const dashboard = useMemo(() => {
    const people = dedupePeople(peopleGroups.flatMap((group) => group.people));
    return CONTRACTORS.map((contractor) => {
      const contractorPeople = people.filter((person) => contractor.aliases.includes(normalizeText(person.contratista) as never));
      const peopleIds = new Set(contractorPeople.map((person) => normalizeId(person.cc)).filter(Boolean));
      const arrivals = buildArrivalMap(clockRows, selectedDate, contractor.aliases);
      const routedPeople = buildRoutedPeople(routeAttendances, seguimientoRoutes, selectedDate, peopleIds);
      const rows: PersonState[] = contractorPeople.map((person) => {
        const cc = normalizeId(person.cc);
        const arrival = arrivals.get(cc);
        const routeInfo = routedPeople.get(cc);
        const inRoute = Boolean(routeInfo);
        const arrived = Boolean(arrival || inRoute);
        return {
          ...person,
          arrived,
          inCd: arrived && !inRoute,
          inRoute,
          status: inRoute ? "En ruta" : arrived ? "En CD" : "Pendiente",
          arrivalTime: arrival?.entrada || "",
          routeDepartureTime: routeInfo?.departureTime || "",
          pendingReason: inRoute ? "" : arrival ? "No ha salido a ruta" : "Sin marca de llegada",
        };
      });
      return { ...contractor, rows, cargos: summarizeByCargo(rows), totals: summarizePeople(rows), peopleIds };
    });
  }, [clockRows, peopleGroups, routeAttendances, selectedDate]);

  const active = dashboard.find((item) => item.id === expandedContractor) || null;
  const global = dashboard.reduce(
    (total, item) => ({
      total: total.total + item.totals.total,
      arrived: total.arrived + item.totals.arrived,
      pending: total.pending + item.totals.pending,
      inCd: total.inCd + item.totals.inCd,
      inRoute: total.inRoute + item.totals.inRoute,
    }),
    { total: 0, arrived: 0, pending: 0, inCd: 0, inRoute: 0 },
  );
  const tripDashboard = useMemo(
    () => DEPARTURE_CONTRACTORS.map((contractor) => ({
      ...contractor,
      ...summarizeTrips(seguimientoRoutes, selectedDate, contractor.aliases),
    })),
    [seguimientoRoutes, selectedDate],
  );
  const deadline = getDepartureDeadline(selectedDate, now);

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
      const parsedRows = rawRows.map((row) => parseClockRow(row, peopleById)).filter((row): row is ClockRow => Boolean(row));
      if (!parsedRows.length) throw new Error("No se encontraron registros válidos de asistencia.");

      const payload = { fileName: file.name, savedAt: new Date().toISOString(), rows: parsedRows };
      localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(payload));
      setClockRows(parsedRows);
      setFileName(file.name);
      const latestOperationalDate = getLatestOperationalDate(seguimientoRoutes, routeAttendances);
      const latestExcelDate = parsedRows.map((row) => dateKey(row.fechaKey)).filter(Boolean).sort().reverse()[0];
      if (latestOperationalDate || latestExcelDate) setSelectedDate(latestOperationalDate || latestExcelDate);
      setMessage(`Asistencia cargada: ${parsedRows.length} marcaciones procesadas.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo leer el Excel de asistencia.");
    } finally {
      setIsUploading(false);
    }
  }

  if (isLoading) return <main className="min-h-screen bg-[#f4f7fb]" />;
  if (!isAllowed) return <Restricted message={error} onBack={() => router.push("/")} />;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_8%_0%,rgba(237,106,90,0.11),transparent_31rem),radial-gradient(circle_at_94%_8%,rgba(124,58,237,0.10),transparent_36rem),#f8f6fc] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-white/60 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <button aria-label="Volver" className="grid h-10 w-10 place-items-center rounded-lg text-[#10223d] hover:bg-slate-100" onClick={() => router.push("/")} type="button">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3 text-right">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ed6a5a]">Vista ejecutiva</p>
              <h1 className="text-2xl font-black text-[#2d1b4e]">Gerencia de personal</h1>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#2d1b4e] text-white shadow-lg shadow-violet-200"><FileSpreadsheet size={20} /></span>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl space-y-6 px-5 py-7 sm:px-8">
        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
        {message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
        {!clockRows.length ? (
          <div className="flex flex-col gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm text-cyan-900 sm:flex-row sm:items-center sm:justify-between">
            <p>Sube el Excel de asistencia para separar pendientes, personal en CD y personal en ruta.</p>
            <button className="rounded-xl bg-[#2d1b4e] px-4 py-2 font-bold text-white" onClick={() => fileInputRef.current?.click()} type="button">Subir Excel</button>
          </div>
        ) : null}

        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-[0_18px_55px_rgba(45,27,78,0.07)] sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ed6a5a]">Corte gerencial</p>
            <p className="mt-1 text-sm font-semibold text-slate-600">{fileName ? `Marcaciones: ${fileName}` : "Sin Excel de marcaciones cargado"}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              Fecha
              <select className="mt-1 block h-10 min-w-48 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-[#2d1b4e]" onChange={(event) => { dateSelectedByUser.current = true; setSelectedDate(event.target.value); }} value={selectedDate}>
                {!dates.length ? <option value="">Sin fechas</option> : null}
                {dates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}
              </select>
            </label>
            <input accept=".xlsx,.xls" className="hidden" onChange={handleAttendanceUpload} ref={fileInputRef} type="file" />
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#ed6a5a] px-5 text-sm font-black text-white shadow-lg shadow-rose-100 transition hover:bg-[#d95749] disabled:bg-slate-300" disabled={isUploading} onClick={() => fileInputRef.current?.click()} type="button">
              <Upload size={16} /> {isUploading ? "Procesando…" : "Subir Excel de asistencia"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric icon={<Users size={18} />} label="Personal" tone="slate" value={global.total} />
          <Metric icon={<CheckCircle2 size={18} />} label="Llegaron" tone="green" value={global.arrived} />
          <Metric icon={<Clock3 size={18} />} label="Pendientes" tone="amber" value={global.pending} />
          <Metric icon={<MapPin size={18} />} label="En el CD" tone="blue" value={global.inCd} />
          <Metric icon={<Route size={18} />} label="En ruta · Seguimiento" tone="violet" value={global.inRoute} />
        </div>

        <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white/95 shadow-[0_18px_55px_rgba(45,27,78,0.07)]">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#ed6a5a]">Meta de salida</p>
              <h2 className="mt-1 text-xl font-black text-[#2d1b4e]">Viajes por contratista</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">La meta termina a las 7:00 a. m. · VH cargados por cada contratista en Seguimiento</p>
              <p className="mt-1 text-xs font-bold text-violet-600">Actualización en vivo: {sourceCounts.seguimiento} VH · {sourceCounts.asistencias} asistencias · Fecha {selectedDate || "sin seleccionar"}</p>
            </div>
            <div className={`flex min-w-64 items-center gap-3 rounded-2xl border px-4 py-3 ${deadline.isOpen ? "border-amber-200 bg-amber-50 text-amber-800" : "border-violet-200 bg-violet-50 text-violet-800"}`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white"><Clock3 size={19} /></span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.13em]">{deadline.isOpen ? "Tiempo restante" : "Estado de la meta"}</p>
                <p className="font-mono text-lg font-black tabular-nums">{deadline.label}</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                <tr><th className="px-5 py-3">Contratista</th><th className="px-4 py-3 text-center">Viajes totales</th><th className="px-4 py-3 text-center text-emerald-600">En ruta</th><th className="px-4 py-3 text-center text-red-600">Después de 7</th><th className="px-4 py-3 text-center text-amber-600">Pendientes</th><th className="px-5 py-3 text-center">Cumplimiento a tiempo</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tripDashboard.map((contractor) => (
                  <tr className="hover:bg-slate-50/70" key={contractor.id}>
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#2d1b4e] text-white"><Building2 size={16} /></span><span className="font-black text-[#10223d]">{contractor.label}</span></div></td>
                    <td className="px-4 py-4 text-center text-2xl font-black text-[#2d1b4e]">{contractor.total}</td>
                    <td className="px-4 py-4 text-center text-2xl font-black text-emerald-600">{contractor.departed}</td>
                    <td className="px-4 py-4 text-center text-2xl font-black text-red-600">{contractor.late}</td>
                    <td className="px-4 py-4 text-center text-2xl font-black text-amber-600">{contractor.pending}</td>
                    <td className="px-5 py-4"><TripProgressRing percentage={contractor.percentage} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid w-full gap-5">
          {dashboard.map((contractor) => (
            <section className="flex h-full min-h-[350px] flex-col overflow-hidden rounded-[18px] border border-slate-200 bg-white/95 shadow-[0_14px_40px_rgba(45,27,78,0.06)]" key={contractor.id}>
              <div className="border-b border-slate-200 px-3.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#2d1b4e] text-white"><Building2 size={16} /></span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ed6a5a]">Contratista</p>
                      <h2 className="truncate text-base font-black text-[#10223d]" title={contractor.label}>{contractor.label}</h2>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-700">{contractor.totals.arrived}/{contractor.totals.total}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-xs">
                  <SmallStat label="Pendientes" value={contractor.totals.pending} />
                  <SmallStat label="En CD" value={contractor.totals.inCd} />
                  <SmallStat label="En ruta" value={contractor.totals.inRoute} />
                </div>
              </div>

              <div className="flex-1 overflow-x-auto">
                <table className="w-full min-w-[390px] text-left text-[11px]">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                    <tr><th className="px-4 py-2.5">Cargo</th><th className="px-2 py-2.5 text-center" title="Personal">Per.</th><th className="px-2 py-2.5 text-center text-emerald-600" title="Llegaron">Lleg.</th><th className="px-2 py-2.5 text-center text-amber-600" title="Pendientes">Pend.</th><th className="px-2 py-2.5 text-center text-cyan-600">CD</th><th className="px-3 py-2.5 text-center text-violet-600">Ruta</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contractor.cargos.slice(0, 6).map((row, index) => (
                      <tr className="hover:bg-slate-50/80" key={row.cargo}>
                        <td className="px-3.5 py-2"><span className="mr-1.5 text-[9px] font-black text-slate-400">{index + 1}</span><span className="font-bold text-[#10223d]">{row.cargo}</span></td>
                        <CompactNumber value={row.total} />
                        <CompactNumber tone="green" value={row.arrived} />
                        <CompactNumber tone="amber" value={row.pending} />
                        <CompactNumber tone="blue" value={row.inCd} />
                        <CompactNumber tone="violet" value={row.inRoute} />
                      </tr>
                    ))}
                    {!contractor.cargos.length ? <tr><td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={6}>No hay personal asociado.</td></tr> : null}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-slate-100 bg-slate-50/60 p-2.5">
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-100 bg-white px-3 py-2 text-[11px] font-black text-violet-700 transition hover:border-violet-300 hover:bg-violet-50" onClick={() => setExpandedContractor(active?.id === contractor.id ? null : contractor.id)} type="button">
                  {active?.id === contractor.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  {active?.id === contractor.id ? "Ocultar detalle" : `Ver más · ${contractor.rows.length} personas`}
                </button>
              </div>
            </section>
          ))}
        </div>

        {active ? (
          <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white/95 shadow-[0_18px_55px_rgba(45,27,78,0.09)]">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700">Detalle del personal</p><h2 className="mt-1 text-lg font-black text-[#10223d]">{active.label}</h2></div>
              <button aria-label="Ocultar detalle" className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200" onClick={() => setExpandedContractor(null)} type="button"><ChevronUp size={17} /></button>
            </div>
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[1080px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-5 py-3">Persona</th><th className="px-4 py-3">Cargo</th><th className="px-4 py-3">Llegada</th><th className="px-4 py-3">Salida a ruta</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Causa pendiente</th></tr></thead><tbody className="divide-y divide-slate-100">{active.rows.map((person) => <tr key={`${person.contratista}:${person.cc}`}><td className="px-5 py-3"><p className="font-bold text-[#10223d]">{person.nombre}</p><p className="text-xs text-slate-400">CC {person.cc}</p></td><td className="px-4 py-3 text-slate-600">{person.cargo || "Sin cargo"}</td><td className="px-4 py-3 font-semibold text-slate-600">{person.arrivalTime || (person.inRoute ? "Asistencia de ruta" : "-")}</td><td className="px-4 py-3 font-black text-violet-700">{person.routeDepartureTime || "—"}</td><td className="px-4 py-3"><Status status={person.status} /></td><td className="px-4 py-3"><PendingReason reason={person.pendingReason} /></td></tr>)}{!active.rows.length ? <tr><td className="px-5 py-10 text-center text-slate-500" colSpan={6}>No hay personal asociado a este contratista.</td></tr> : null}</tbody></table>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function buildArrivalMap(rows: ClockRow[], selectedDate: string, aliases: readonly string[]) {
  const values = new Map<string, ClockRow>();
  rows.forEach((row) => {
    const cc = normalizeId(row.identificador);
    if (!cc || dateKey(row.fechaKey) !== selectedDate || !aliases.includes(normalizeText(row.contratista))) return;
    if (row.entrada) values.set(cc, row);
  });
  return values;
}

function buildRoutedPeople(attendances: RouteAttendance[], seguimiento: SeguimientoRoute[], selectedDate: string, contractorPeopleIds: Set<string>) {
  const values = new Map<string, { departureTime: string }>();
  const routesByDt = new Map<string, SeguimientoRoute>();
  seguimiento.forEach((route) => {
    if (seguimientoDate(route) !== selectedDate) return;
    const dt = normalizeId(route.transporte);
    if (dt && !routesByDt.has(dt)) routesByDt.set(dt, route);
  });

  attendances.forEach((record) => {
    if (routeAttendanceDate(record) !== selectedDate) return;
    const route = routesByDt.get(normalizeId(record.dt));
    const departureTime = formatOperationalTime(route?.horaSalida) || formatOperationalTime(record.createdAt);
    [record.cedulaResponsable, record.cedulaAuxiliar1, record.cedulaAuxiliar2]
      .map(normalizeId)
      .filter((cc) => Boolean(cc) && contractorPeopleIds.has(cc))
      .forEach((cc) => {
        if (!values.has(cc)) values.set(cc, { departureTime });
      });
  });
  return values;
}

function routeAttendanceDate(record: RouteAttendance) {
  const keyDate = String(record.llave || "").match(/\d{4}-\d{2}-\d{2}/)?.[0];
  return keyDate || dateKey(record.createdAt);
}

function seguimientoDate(record: SeguimientoRoute) {
  return dateKey(record.fechaDespacho || record.fechaDt);
}

function getLatestOperationalDate(seguimiento: SeguimientoRoute[], attendances: RouteAttendance[]) {
  return [
    ...seguimiento.map(seguimientoDate),
    ...attendances.map(routeAttendanceDate),
  ].filter(Boolean).sort().reverse()[0] || "";
}

function formatOperationalTime(value: string | undefined) {
  const text = String(value || "").trim();
  const time = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (time) return `${time[1].padStart(2, "0")}:${time[2]}${time[3] ? `:${time[3]}` : ""}`;
  if (!text) return "";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/Bogota" }).format(parsed);
}

function hasOperationalTime(value: string | undefined) {
  const normalized = normalizeText(value);
  return Boolean(normalized && !["pendiente", "sinregistro", "na", "0"].includes(normalized));
}

function summarizeTrips(records: SeguimientoRoute[], selectedDate: string, aliases: readonly string[]) {
  const trips = new Map<string, SeguimientoRoute>();
  records.forEach((record, index) => {
    if (seguimientoDate(record) !== selectedDate || !aliases.includes(normalizeText(record.contractor))) return;
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
    const cargo = person.cargo || "Sin cargo";
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

function readStoredAttendance(): StoredAttendance | null {
  try { return JSON.parse(localStorage.getItem(ATTENDANCE_STORAGE_KEY) || "null") as StoredAttendance | null; } catch { return null; }
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
    contratista: person?.contratista || readClockValue(row, ["contratista", "transportista"]) || "Sin contratista",
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
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return dateKey(text);
}

function normalizeId(value: unknown) { return String(value || "").replace(/\D/g, ""); }
function normalizeText(value: unknown) { return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""); }
function dateKey(value: unknown) { const text = String(value || ""); if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10); const parsed = new Date(text); return Number.isNaN(parsed.getTime()) ? "" : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`; }
function formatDate(value: string) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" }) : "Sin fecha"; }

function Metric({ icon, label, tone, value }: { icon: React.ReactNode; label: string; tone: "slate" | "green" | "amber" | "blue" | "violet"; value: number }) { const styles = { slate: "bg-slate-100 text-slate-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", blue: "bg-cyan-50 text-cyan-700", violet: "bg-violet-50 text-violet-700" }; return <article className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_18px_55px_rgba(45,27,78,0.07)]"><span className={`grid h-9 w-9 place-items-center rounded-xl ${styles[tone]}`}>{icon}</span><p className="mt-3 text-3xl font-black text-[#2d1b4e]">{value}</p><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p></article>; }
function SmallStat({ label, value }: { label: string; value: number }) { return <span className="rounded-lg bg-white px-1.5 py-1.5 ring-1 ring-slate-100"><strong className="block text-base text-[#10223d]">{value}</strong><span className="text-[8px] font-bold uppercase text-slate-400">{label}</span></span>; }
function CompactNumber({ tone = "slate", value }: { tone?: "slate" | "green" | "amber" | "blue" | "violet"; value: number }) { const styles = { slate: "text-slate-700", green: "text-emerald-700", amber: "text-amber-700", blue: "text-cyan-700", violet: "text-violet-700" }; return <td className={`px-2 py-2 text-center font-black ${styles[tone]}`}>{value}</td>; }
function TripProgressRing({ percentage }: { percentage: number }) { const degrees = Math.max(0, Math.min(100, percentage)) * 3.6; return <div className="flex items-center justify-center gap-3"><div aria-label={`${percentage}% de salidas a tiempo`} className="grid h-16 w-16 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#7c3aed ${degrees}deg, #ede9fe ${degrees}deg)` }}><span className="grid h-12 w-12 place-items-center rounded-full bg-white text-sm font-black text-[#2d1b4e]">{percentage}%</span></div><span className="text-xs font-bold text-slate-500">Salieron<br />hasta 7:00</span></div>; }
function Status({ status }: { status: PersonState["status"] }) { const styles = status === "En ruta" ? "bg-violet-50 text-violet-700" : status === "En CD" ? "bg-cyan-50 text-cyan-700" : "bg-amber-50 text-amber-700"; return <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-black ${styles}`}>{status}</span>; }
function PendingReason({ reason }: { reason: PersonState["pendingReason"] }) { if (!reason) return <span className="text-slate-300">—</span>; const style = reason === "Sin marca de llegada" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"; return <span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold ${style}`}>{reason}</span>; }
function Restricted({ message, onBack }: { message: string; onBack: () => void }) { return <main className="grid min-h-screen place-items-center bg-[#f4f7fb] px-5"><section className="max-w-md rounded-xl border border-red-100 bg-white p-6 text-center shadow-lg"><h1 className="text-xl font-black text-[#10223d]">Gerencia restringida</h1><p className="mt-2 text-sm text-slate-500">{message || "No tienes permiso para consultar este módulo."}</p><button className="mt-5 rounded-lg bg-[#10223d] px-4 py-2 text-sm font-bold text-white" onClick={onBack} type="button">Volver</button></section></main>; }
