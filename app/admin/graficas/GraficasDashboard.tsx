"use client"; // Panel compartido entre administración y contratistas.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import ManagementOriginChart from "./ManagementOriginChart";
import styles from "./mobile.module.css";
import { ArrowLeft, BarChart3, CalendarDays, ChevronRight, ClipboardCheck, Clock3, Gauge, MapPinCheck, MessageSquareText, PackageCheck, Search, ShieldAlert, Table2, TrendingUp, Trophy, Users, X } from "lucide-react";
import { normalizeContractorName } from "../../lib/contractors";
import type { DailyAbsenteeismRecord } from "../../lib/dailyAbsenteeism";
import { checklistPercentage, type DailyChecklistRecord } from "../../lib/dailyChecklist";
import type { RtiRecord } from "../../personas/rti/rtiTypes";
import { parseDatabaseRows, recordDateKey } from "../../personas/rti/rtiUtils";
import type { Vehiculo } from "../../seguimiento/types";
import { normalizeCajasTotal } from "../../seguimiento/utils";
import type { CheckinCajasRegistro } from "../../lib/checkinStorage";
import { calculateRefusalTotals, normalizeDt, type ModulacionRegistro } from "../../lib/modulacionStorage";
import { ChartPanel, ContractorRefusalHistory, Metric, MiniStat, RefusalClientsByRange, RrRefusalTop, RefusalCausePreventistaBars, RefusalComBars, TopRefusalClientsTable } from "./components";
import type { AdminRefusalComRow, ContractorRefusalTrend, ModulationRefusalRecord } from "./types";
import {
  buildFilteredHref,
  buildGraphTotals,
  buildLateComments,
  buildRefusalByCom,
  buildRefusalByJefeVentas,
  buildRefusalCauseByPreventista,
  buildTopRefusalClients,
  buildRrRefusalTop,
  filterModulationRecords,
  filterRecords,
  filterRefusalRows,
  getActiveDateRange,
  getContractors,
  getInitialGraphFilters,
  getVehicleDateKey,
  normalizeJefeVentas,
  normalizeDateRange,
  toDateKey,
} from "./utils";

type RangoOverviewReport = {
  contractor: string;
  operationalDate: string;
  kind: "current" | "closure";
  updatedAt: string;
  summary: { startedRows: number; inRange: number; outOfRange: number };
};

type ModulationOverviewRecord = ModulationRefusalRecord & {
  contratista: string;
  fechaDespacho: string;
  fechaDt: string;
  totalCajas: string;
  cajasGestionadas: string;
};

type AttendanceSnapshot = { operationalDate: string; rows: Array<{ nombreCompleto?: string; identificador?: string; cargo?: string; contratista?: string; entrada?: string }> };
type AdminCheckinRecord = CheckinCajasRegistro & { contratista?: string };
type GraphView = "summary" | "ontime" | "modulation" | "refusal" | "people";

export default function GraficasDashboard({ contractorMode = false, contractorName = "" }: { contractorMode?: boolean; contractorName?: string }) {
  const router = useRouter();
  const today = toDateKey(new Date());
  const [initialFilters] = useState(() => getInitialGraphFilters(today));
  const [records, setRecords] = useState<Vehiculo[]>([]);
  const [refusalRows, setRefusalRows] = useState<AdminRefusalComRow[]>([]);
  const [contractor, setContractor] = useState(contractorMode && contractorName ? contractorName : initialFilters.contractor);
  const [dateRange, setDateRange] = useState(initialFilters.dateRange);
  const [dtSearch, setDtSearch] = useState(initialFilters.dtSearch);
  const [autoDateRange, setAutoDateRange] = useState(initialFilters.autoDateRange);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rangoReports, setRangoReports] = useState<RangoOverviewReport[]>([]);
  const [modulationRecords, setModulationRecords] = useState<ModulationOverviewRecord[]>([]);
  const [checkinRecords, setCheckinRecords] = useState<AdminCheckinRecord[]>([]);
  const [rtiRecords, setRtiRecords] = useState<RtiRecord[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [managementError, setManagementError] = useState("");
  const [managementLoading, setManagementLoading] = useState(true);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceError, setAttendanceError] = useState("");
  const attendanceRequested = useRef(false);
  const [dailyChecklists, setDailyChecklists] = useState<DailyChecklistRecord[]>([]);
  const [absenteeismRecords, setAbsenteeismRecords] = useState<DailyAbsenteeismRecord[]>([]);
  const [attendanceSnapshots, setAttendanceSnapshots] = useState<AttendanceSnapshot[]>([]);
  const [activeView, setActiveView] = useState<GraphView>("summary");
  const [clientCausal, setClientCausal] = useState("Todas");
  const [salesBoss, setSalesBoss] = useState("Todos");

  useEffect(() => {
    fetch("/api/admin/seguimiento", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudo cargar graficas admin.");
        const nextRecords = (body.records || []) as Vehiculo[];
        setRecords(nextRecords);
        setRefusalRows(body.refusalByComRows || []);
        if (contractorMode && !contractorName && nextRecords[0]?.transportista) setContractor(nextRecords[0].transportista);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar graficas admin."))
      .finally(() => setLoading(false));
  }, [contractorMode, contractorName]);

  useEffect(() => {
    // Publicar cada respuesta sin esperar a las consultas m?s lentas.
    void Promise.allSettled([
      fetchJson<{ reports?: RangoOverviewReport[] }>("/api/admin/rango")
        .then((body) => setRangoReports(body.reports || [])),
      fetchJson<{ records?: ModulationOverviewRecord[] }>("/api/modulaciones")
        .then((body) => setModulationRecords(body.records || []))
        .catch(() => setManagementError("No se pudieron cargar las gestiones. Recarga la p?gina para intentar de nuevo."))
        .finally(() => setManagementLoading(false)),
      fetchJson<{ records?: AdminCheckinRecord[] }>("/api/checkins")
        .then((body) => setCheckinRecords(body.records || [])),
      fetchJson<{ records?: Record<string, unknown>[]; tables?: { RTI?: Record<string, unknown>[] } }>("/api/people/rti")
        .then((body) => setRtiRecords(parseDatabaseRows(body.records || body.tables?.RTI || []))),
      fetchJson<{ records?: DailyChecklistRecord[] }>("/api/daily-checklists")
        .then((body) => setDailyChecklists(body.records || [])),
      fetchJson<{ records?: DailyAbsenteeismRecord[] }>("/api/daily-absenteeism")
        .then((body) => setAbsenteeismRecords(body.records || [])),
    ]).finally(() => setOverviewLoading(false));
  }, []);

  useEffect(() => {
    if (activeView !== "people" || attendanceRequested.current) return;
    attendanceRequested.current = true;
    void fetchJson<{ snapshots?: AttendanceSnapshot[] }>("/api/people/attendance-snapshots")
      .then((body) => setAttendanceSnapshots(body.snapshots || []))
      .catch(() => setAttendanceError("No se pudo cargar la asistencia. Recarga la p?gina para intentar de nuevo."))
      .finally(() => setAttendanceLoading(false));
  }, [activeView]);

  const contractors = useMemo(() => getContractors(records), [records]);

  const activeDateRange = useMemo(() => getActiveDateRange(autoDateRange, records, dateRange), [autoDateRange, dateRange, records]);

  const visibleRecords = useMemo(() => filterRecords(records, activeDateRange, contractor, dtSearch), [activeDateRange, contractor, dtSearch, records]);

  const comparisonRecords = useMemo(() => filterRecords(records, activeDateRange, contractorMode ? contractor : "Todas", dtSearch), [activeDateRange, contractor, contractorMode, dtSearch, records]);

  const onTimeByContractor = useMemo(() => buildOnTimeByContractor(comparisonRecords).filter((row) => !contractorMode || normalizeContractorName(row.contractor) === normalizeContractorName(contractor)), [comparisonRecords, contractor, contractorMode]);

  const visibleRefusalRows = useMemo(
    () => filterRefusalRows(refusalRows, activeDateRange, contractor, dtSearch),
    [activeDateRange, contractor, dtSearch, refusalRows],
  );

  const clientCausalRows = useMemo(
    () => clientCausal === "Todas" ? visibleRefusalRows : visibleRefusalRows.filter((row) => (row.causal?.trim() || "Sin causal") === clientCausal),
    [clientCausal, visibleRefusalRows],
  );

  const availableRefusalCauses = useMemo(() => buildRefusalCauseByPreventista(visibleRefusalRows), [visibleRefusalRows]);

  const availableSalesBosses = useMemo(
    () => buildRefusalByJefeVentas(visibleRefusalRows).map((item) => item.label),
    [visibleRefusalRows],
  );

  const filteredRefusalRows = useMemo(
    () => salesBoss === "Todos" ? clientCausalRows : clientCausalRows.filter((row) => normalizeJefeVentas(row.jefeVentas) === salesBoss),
    [clientCausalRows, salesBoss],
  );

  const refusalByCom = useMemo(() => buildRefusalByCom(filteredRefusalRows), [filteredRefusalRows]);

  const refusalByJefeVentas = useMemo(() => buildRefusalByJefeVentas(filteredRefusalRows), [filteredRefusalRows]);

  const refusalCauseByPreventista = useMemo(() => buildRefusalCauseByPreventista(filteredRefusalRows), [filteredRefusalRows]);

  const topRefusalClients = useMemo(() => buildTopRefusalClients(filteredRefusalRows), [filteredRefusalRows]);
  const visibleModulationRefusals = useMemo(
    () => filterModulationRecords(modulationRecords, activeDateRange, contractor, dtSearch),
    [activeDateRange, contractor, dtSearch, modulationRecords],
  );
  const rrRefusalTop = useMemo(() => buildRrRefusalTop(visibleModulationRefusals), [visibleModulationRefusals]);
  const refusalHistory = useMemo(
    () => buildContractorRefusalHistory(records, modulationRecords, checkinRecords, activeDateRange, contractor, dtSearch),
    [activeDateRange, checkinRecords, contractor, dtSearch, modulationRecords, records],
  );
  const contractorRefusalInsights = useMemo(
    () => buildContractorRefusalInsights(visibleModulationRefusals, checkinRecords, activeDateRange, contractor),
    [activeDateRange, checkinRecords, contractor, visibleModulationRefusals],
  );

  const lateComments = useMemo(() => buildLateComments(visibleRecords), [visibleRecords]);

  const finalRefusalBoxes = useMemo(
    () => refusalHistory.reduce((total, contractor) => total + contractor.points.reduce((dayTotal, point) => dayTotal + point.pending, 0), 0),
    [refusalHistory],
  );

  const totals = useMemo(
    () => buildGraphTotals(visibleRecords, filteredRefusalRows, refusalCauseByPreventista, lateComments, finalRefusalBoxes),
    [filteredRefusalRows, finalRefusalBoxes, lateComments, refusalCauseByPreventista, visibleRecords],
  );

  const operationalOverview = useMemo(
    () => buildOperationalOverview(rangoReports, modulationRecords, rtiRecords, dailyChecklists, absenteeismRecords, activeDateRange, contractor),
    [absenteeismRecords, activeDateRange, contractor, dailyChecklists, modulationRecords, rangoReports, rtiRecords],
  );
  const operationalTrend = useMemo(
    () => buildOperationalTrend(rangoReports, modulationRecords, rtiRecords, dailyChecklists, absenteeismRecords, activeDateRange, contractor),
    [absenteeismRecords, activeDateRange, contractor, dailyChecklists, modulationRecords, rangoReports, rtiRecords],
  );
  const contractorBenchmark = useMemo(
    () => buildContractorBenchmark(rangoReports, modulationRecords, rtiRecords, dailyChecklists, absenteeismRecords, activeDateRange).filter((row) => !contractorMode || normalizeContractorName(row.contractor) === normalizeContractorName(contractor)),
    [absenteeismRecords, activeDateRange, contractor, contractorMode, dailyChecklists, modulationRecords, rangoReports, rtiRecords],
  );
  const departurePerformance = useMemo(() => buildDeparturePerformance(visibleRecords), [visibleRecords]);
  const modulationTiming = useMemo(
    () => buildModulationTiming(modulationRecords, activeDateRange, contractor, dtSearch),
    [activeDateRange, contractor, dtSearch, modulationRecords],
  );
  const lateArrivalRanking = useMemo(
    () => buildLateArrivalRanking(attendanceSnapshots, activeDateRange, contractor),
    [activeDateRange, attendanceSnapshots, contractor],
  );

  function updateDateRange(nextValue: { from: string; to: string }) {
    setAutoDateRange(false);
    setDateRange(normalizeDateRange(nextValue.from, nextValue.to));
  }

  function clearFilters() {
    if (!contractorMode) setContractor("Todas");
    setAutoDateRange(false);
    setDateRange({ from: today, to: today });
    setDtSearch("");
    setClientCausal("Todas");
    setSalesBoss("Todos");
  }

  return (
    <main className={`${styles.dashboard} min-h-screen bg-[#f4f7fb] text-slate-900`}>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className={`mx-auto flex flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between ${contractorMode ? "max-w-[1900px]" : "max-w-7xl"}`}>
          <div className="flex items-center gap-3">
            <button
              aria-label={contractorMode ? "Volver al portal" : "Volver a admin"}
              className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100"
              onClick={() => router.push(contractorMode ? "/" : "/admin")}
              type="button"
            >
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">{contractorMode ? "SIC / Gráficas" : "Gráficas admin"}</p>
              <h1 className="text-2xl font-semibold text-[#10223d]">{contractorMode ? "Indicadores de mi operación" : "Centro de gráficas"}</h1>
            </div>
          </div>
          {!contractorMode ? <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-amber-100 bg-amber-50 px-4 text-sm font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100"
              onClick={() => router.push(buildFilteredHref("/admin/graficas/causales", activeDateRange, dtSearch, contractor))}
              type="button"
            >
              <MessageSquareText size={16} />
              Causales
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-[#10223d] shadow-sm transition hover:bg-slate-50"
              onClick={() => router.push("/admin")}
              type="button"
            >
              <Table2 size={16} />
              Panel admin
            </button>
          </div> : (
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-bold text-cyan-800">
              Solo lectura · {contractor === "Todas" ? "Mi contratista" : contractor}
            </span>
          )}
        </div>
      </header>

      <section className={`mx-auto px-4 py-6 sm:px-6 ${contractorMode ? "max-w-[1900px]" : "max-w-7xl"}`}>
        {error ? <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
        {loading ? <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Cargando graficas...</div> : null}

        <section className="mb-5 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <label className="text-sm font-semibold text-[#10223d]">
              <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                <CalendarDays size={16} />
                Desde
              </span>
              <input
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
                onChange={(event) => updateDateRange({ ...activeDateRange, from: event.target.value })}
                type="date"
                value={activeDateRange.from}
              />
            </label>
            <label className="text-sm font-semibold text-[#10223d]">
              <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                <CalendarDays size={16} />
                Hasta
              </span>
              <input
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
                onChange={(event) => updateDateRange({ ...activeDateRange, to: event.target.value })}
                type="date"
                value={activeDateRange.to}
              />
            </label>
            <label className="text-sm font-semibold text-[#10223d]">
              <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                <Search size={16} />
                DT
              </span>
              <input
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
                inputMode="numeric"
                onChange={(event) => setDtSearch(event.target.value)}
                placeholder="Ej: 123456"
                type="search"
                value={dtSearch}
              />
            </label>
            <button
              className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              onClick={clearFilters}
              type="button"
            >
              <X size={16} />
              Limpiar
            </button>
          </div>
          {!contractorMode ? <div className="mt-3 flex flex-wrap gap-2">
            {["Todas", ...contractors].map((item) => (
              <button
                className={`h-9 rounded-md px-3 text-xs font-semibold transition ${
                  contractor === item ? "bg-[#10223d] text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
                key={item}
                onClick={() => setContractor(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div> : null}
        </section>

        <nav aria-label="Secciones de graficas" className={`sticky top-[88px] z-10 mb-6 grid gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg shadow-slate-200/50 backdrop-blur ${contractorMode ? "sm:grid-cols-4" : "sm:grid-cols-5"}`}>
          {([
            ["summary", "Resumen", "Indicadores generales"],
            ...(!contractorMode ? [["ontime", "On Time", "Vehiculos y salidas"]] as const : []),
            ["modulation", "Modulacion", "Clientes por horario"],
            ["refusal", "Refusal", contractorMode ? "Indicadores de mi operación" : "Cajas y causales"],
            ["people", "Personal", "Llegadas y salida antes de 7"],
          ] as const).map(([value, label, detail]) => (
            <button
              aria-pressed={activeView === value}
              className={`rounded-xl px-4 py-3 text-left transition ${activeView === value ? "bg-slate-950 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"}`}
              key={value}
              onClick={() => setActiveView(value)}
              type="button"
            >
              <span className="block text-xs font-black uppercase tracking-wide">{label}</span>
              <span className={`mt-0.5 block text-[10px] font-semibold ${activeView === value ? "text-cyan-300" : "text-slate-400"}`}>{detail}</span>
            </button>
          ))}
        </nav>

        {activeView === "summary" ? <>
        <section className="mb-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">Vista ejecutiva</p>
              <h2 className="mt-1 text-xl font-black text-[#10223d]">Estado general de la operación</h2>
            </div>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500">
              {activeDateRange.from} — {activeDateRange.to}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" id="rti-sic">
            <OperationalHealthCard
              detail={`${operationalOverview.range.inRange.toLocaleString("es-CO")} de ${operationalOverview.range.total.toLocaleString("es-CO")} visitas`}
              href="/admin/rango"
              icon={<MapPinCheck size={20} />}
              label="Entrega en rango"
              loading={overviewLoading}
              percentage={operationalOverview.range.percentage}
              tone="emerald"
              onOpen={router.push}
            />
            <OperationalHealthCard
              detail={`${operationalOverview.modulation.managed.toLocaleString("es-CO")} de ${operationalOverview.modulation.total.toLocaleString("es-CO")} cajas`}
              href="/modulacion"
              icon={<PackageCheck size={20} />}
              label="Avance modulación"
              loading={overviewLoading}
              percentage={operationalOverview.modulation.percentage}
              tone="violet"
              onOpen={router.push}
            />
            <OperationalHealthCard
              detail={`${operationalOverview.rti.returned.toLocaleString("es-CO")} de ${operationalOverview.rti.outbound.toLocaleString("es-CO")} envases`}
              href={contractorMode ? "#rti-sic" : "/personas/rti"}
              icon={<Gauge size={20} />}
              label="Retorno RTI"
              loading={overviewLoading}
              percentage={operationalOverview.rti.percentage}
              tone="cyan"
              onOpen={(href) => contractorMode ? document.querySelector(href)?.scrollIntoView({ behavior: "smooth" }) : router.push(href)}
            />
            <OperationalHealthCard
              detail={`${totals.refusalFinal.toLocaleString("es-CO")} cajas refusal final`}
              href="#detalle-refusal"
              icon={<ShieldAlert size={20} />}
              label="Nivel de refusal"
              loading={loading}
              percentage={totals.refusal}
              tone="red"
              onOpen={(href) => document.querySelector(href)?.scrollIntoView({ behavior: "smooth" })}
            />
            <OperationalHealthCard detail={`${operationalOverview.checklists.departure.records} registros diarios`} href="/control-diario" icon={<ClipboardCheck size={20} />} label="Checklist de salida" loading={overviewLoading} percentage={operationalOverview.checklists.departure.percentage} tone="cyan" onOpen={router.push} />
            <OperationalHealthCard detail={`${operationalOverview.checklists.return.records} registros diarios`} href="/control-diario" icon={<ClipboardCheck size={20} />} label="Checklist de retorno" loading={overviewLoading} percentage={operationalOverview.checklists.return.percentage} tone="violet" onOpen={router.push} />
            <OperationalHealthCard detail={`${operationalOverview.absenteeism.absent} ausentes de ${operationalOverview.absenteeism.scheduled} programados`} href="/control-diario" icon={<Users size={20} />} label="Ausentismo" loading={overviewLoading} percentage={operationalOverview.absenteeism.percentage} tone="red" onOpen={router.push} />
          </div>
        </section>

        <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <SignalStat icon={<MapPinCheck size={16} />} label="Fuera de rango" tone="red" value={operationalOverview.range.outOfRange.toLocaleString("es-CO")} />
          <SignalStat icon={<PackageCheck size={16} />} label="Modulaciones" tone="violet" value={operationalOverview.modulation.records.toLocaleString("es-CO")} />
          <SignalStat icon={<PackageCheck size={16} />} label="Cajas por gestionar" tone="amber" value={operationalOverview.modulation.pending.toLocaleString("es-CO")} />
          <SignalStat icon={<Gauge size={16} />} label="Envases pendientes" tone="cyan" value={operationalOverview.rti.pending.toLocaleString("es-CO")} />
          <SignalStat icon={<Table2 size={16} />} label="Rutas analizadas" tone="blue" value={totals.rutas.toLocaleString("es-CO")} />
          <SignalStat icon={<MessageSquareText size={16} />} label="Causales activas" tone="amber" value={totals.causales.toLocaleString("es-CO")} />
        </section>

        <section className="mb-5 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
          <ExecutiveTrendChart data={operationalTrend} />
          <ContractorBenchmarkTable rows={contractorBenchmark} />
        </section>
        </> : null}

        {!contractorMode && activeView === "ontime" ? <>
        <section className="mb-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Seguimiento de vehiculos</p>
              <h2 className="mt-1 text-xl font-black text-[#10223d]">Cumplimiento On Time por contratista</h2>
              <p className="mt-1 text-xs text-slate-500">Clasificacion registrada en seguimiento. Los casos sin clasificar no afectan el porcentaje.</p>
            </div>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
              {onTimeByContractor.reduce((sum, item) => sum + item.classified, 0).toLocaleString("es-CO")} vehiculos clasificados
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {onTimeByContractor.map((item) => <OnTimeContractorCard item={item} key={item.contractor} />)}
          </div>
          <OnTimeComparisonChart rows={onTimeByContractor} />
        </section>
        </> : null}

        {activeView === "modulation" ? (
          <section className="mb-5 space-y-4">
            <ManagementOriginChart records={visibleModulationRefusals} loading={managementLoading} error={managementError} />
            <ModulationTimingChart data={modulationTiming} singleContractor={contractorMode} />
          </section>
        ) : null}

        {contractorMode && activeView === "refusal" ? <ContractorRefusalPanel data={contractorRefusalInsights} /> : null}

        {!contractorMode && activeView === "refusal" ? <>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" id="detalle-refusal">
          <Metric icon={<ShieldAlert size={20} />} label="% refusal" value={`${totals.refusal.toLocaleString("es-CO")}%`} tone="red" />
          <Metric icon={<BarChart3 size={20} />} label="Cajas refusal final" value={totals.refusalFinal.toLocaleString("es-CO")} tone="red" />
          <Metric icon={<MessageSquareText size={20} />} label="Causales" value={totals.causales.toLocaleString("es-CO")} tone="amber" />
          <Metric icon={<Table2 size={20} />} label="Rutas filtradas" value={totals.rutas.toLocaleString("es-CO")} tone="blue" />
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-700">Filtro de las tablas</p>
            <p className="text-xs font-semibold text-[#10223d]">Mostrar resultados por causal y jefe de ventas</p>
          </div>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
            <select
              aria-label="Filtrar tablas por causal"
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-[#10223d] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:w-64"
              onChange={(event) => setClientCausal(event.target.value)}
              value={clientCausal}
            >
              <option value="Todas">Todas las causales</option>
              {availableRefusalCauses.map((item) => <option key={item.causal} value={item.causal}>{item.causal}</option>)}
            </select>
            <select
              aria-label="Filtrar tablas por jefe de ventas"
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-[#10223d] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 sm:w-64"
              onChange={(event) => setSalesBoss(event.target.value)}
              value={salesBoss}
            >
              <option value="Todos">Todos los jefes de ventas</option>
              {availableSalesBosses.map((boss) => <option key={boss} value={boss}>{boss}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-4 grid gap-3 xl:grid-cols-3">
          <ChartPanel icon={<BarChart3 size={16} />} title="Refusal por preventista">
            <RefusalComBars data={refusalByCom.slice(0, 10)} emptyText="Sin datos de refusal por preventista para este filtro." />
          </ChartPanel>
          <ChartPanel icon={<ShieldAlert size={16} />} title="Refusal por jefe de ventas">
            <RefusalComBars data={refusalByJefeVentas.slice(0, 8)} emptyText="Sin datos de refusal por jefe de ventas para este filtro." />
          </ChartPanel>
          <ChartPanel icon={<MessageSquareText size={16} />} title="Causales">
            <RefusalCausePreventistaBars data={refusalCauseByPreventista.slice(0, 8)} />
          </ChartPanel>
        </div>

        <div className="mb-5 grid gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm sm:grid-cols-3">
          <MiniStat label="Cajas reportadas" value={totals.reportadas.toLocaleString("es-CO")} />
          <MiniStat label="Gestionadas" value={totals.gestionadas.toLocaleString("es-CO")} tone="slate" />
          <MiniStat label="Cajas refusal final" value={totals.refusalFinal.toLocaleString("es-CO")} tone="slate" />
        </div>

        <TopRefusalClientsTable
          causales={availableRefusalCauses.map((item) => item.causal)}
          data={topRefusalClients.slice(0, 20)}
          onCausalChange={setClientCausal}
          selectedCausal={clientCausal}
        />
        <RefusalClientsByRange data={topRefusalClients} rows={filteredRefusalRows} />
        <RrRefusalTop data={rrRefusalTop} />
        <ContractorRefusalHistory data={refusalHistory} />
        </> : null}

        {activeView === "people" ? (
          <section className="mb-5 grid items-start gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <DeparturePerformanceCard departure={departurePerformance} />
            {attendanceLoading ? <p role="status" className="rounded-2xl bg-white p-5 text-sm text-slate-500">Cargando llegadas del personal?</p> : attendanceError ? <p role="alert" className="rounded-2xl bg-white p-5 text-sm text-red-600">{attendanceError}</p> : <LateArrivalRanking rows={lateArrivalRanking} />}
          </section>
        ) : null}

      </section>
    </main>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || `No se pudo consultar ${url}.`);
  return body as T;
}

type ContractorRefusalPersonRow = {
  person: string;
  dts: string[];
  dates: string[];
  modulated: number;
  checkin: number;
  difference: number;
  adherence: number | null;
  checkinDts: number;
  causes: string[];
};

type ContractorRefusalInsights = {
  rows: ContractorRefusalPersonRow[];
  totalModulated: number;
  totalCheckin: number;
  excessBoxes: number;
  pendingBoxes: number;
  withCheckin: number;
  causes: Array<{ label: string; boxes: number }>;
};

function buildContractorRefusalInsights(
  modulations: ModulationRefusalRecord[],
  checkins: AdminCheckinRecord[],
  range: { from: string; to: string },
  contractor: string,
): ContractorRefusalInsights {
  const matchesContractor = (value?: string) => !value || contractor === "Todas" || normalizeContractorName(value) === normalizeContractorName(contractor);
  const matchesDate = (value: string) => (!range.from || value >= range.from) && (!range.to || value <= range.to);
  const checkinsByDtAndDate = new Map<string, AdminCheckinRecord>();
  const latestCheckinByDt = new Map<string, AdminCheckinRecord>();

  checkins.filter((record) => matchesContractor(record.contratista)).forEach((record) => {
    const dt = normalizeDt(record.dt);
    const date = toDateKey(new Date(record.createdAt));
    if (!dt || (date && !matchesDate(date))) return;
    const current = latestCheckinByDt.get(dt);
    if (!current || record.updatedAt > current.updatedAt) latestCheckinByDt.set(dt, record);
    if (date) {
      const key = `${dt}:${date}`;
      const dated = checkinsByDtAndDate.get(key);
      if (!dated || record.updatedAt > dated.updatedAt) checkinsByDtAndDate.set(key, record);
    }
  });

  type DtGroup = { dt: string; date: string; modulated: number; managed: number; people: Map<string, number>; causesByPerson: Map<string, Set<string>> };
  const groups = new Map<string, DtGroup>();
  const causeTotals = new Map<string, number>();
  modulations.forEach((record) => {
    const dt = normalizeDt(record.dt);
    const date = (record.fechaDespacho || record.fechaDt || record.createdAt || "").slice(0, 10);
    if (!dt || !matchesContractor(record.contratista) || !matchesDate(date)) return;
    const key = `${dt}:${date}`;
    const current = groups.get(key) || { dt, date, modulated: 0, managed: 0, people: new Map<string, number>(), causesByPerson: new Map<string, Set<string>>() };
    const boxes = parseMetricNumber(record.totalCajas);
    const person = (record.personaNombre || record.persona || "Sin responsable registrado").trim();
    const cause = (record.causal || "Sin causal").trim();
    current.modulated += boxes;
    current.managed += parseMetricNumber(record.cajasGestionadas || "");
    current.people.set(person, (current.people.get(person) || 0) + boxes);
    const personCauses = current.causesByPerson.get(person) || new Set<string>();
    personCauses.add(cause);
    current.causesByPerson.set(person, personCauses);
    causeTotals.set(cause, (causeTotals.get(cause) || 0) + boxes);
    groups.set(key, current);
  });

  const people = new Map<string, ContractorRefusalPersonRow>();
  Array.from(groups.values()).forEach((group) => {
    const checkin = checkinsByDtAndDate.get(`${group.dt}:${group.date}`) || latestCheckinByDt.get(group.dt);
    const checkinBoxes = checkin ? Number(checkin.totalCajas || 0) : 0;
    group.people.forEach((modulated, person) => {
      const key = normalizeContractorName(person) || person;
      const current = people.get(key) || { person, dts: [], dates: [], modulated: 0, checkin: 0, difference: 0, adherence: null, checkinDts: 0, causes: [] };
      const allocatedCheckin = checkin && group.modulated > 0 ? checkinBoxes * (modulated / group.modulated) : 0;
      current.modulated += modulated;
      current.checkin += allocatedCheckin;
      if (checkin) current.checkinDts += 1;
      if (!current.dts.includes(group.dt)) current.dts.push(group.dt);
      if (!current.dates.includes(group.date)) current.dates.push(group.date);
      group.causesByPerson.get(person)?.forEach((cause) => { if (!current.causes.includes(cause)) current.causes.push(cause); });
      people.set(key, current);
    });
  });
  const rows = Array.from(people.values()).map((row) => ({
    ...row,
    checkin: Math.round(row.checkin),
    difference: Math.round(row.checkin) - row.modulated,
    adherence: row.checkinDts > 0 && row.modulated > 0
      ? Math.max(0, Math.min(100, Math.round((row.modulated - row.checkin) / row.modulated * 1000) / 10))
      : null,
  })).sort((a, b) => b.difference - a.difference || b.modulated - a.modulated);

  return {
    rows,
    totalModulated: rows.reduce((sum, row) => sum + row.modulated, 0),
    totalCheckin: rows.reduce((sum, row) => sum + (row.checkin || 0), 0),
    excessBoxes: rows.reduce((sum, row) => sum + Math.max(row.difference || 0, 0), 0),
    pendingBoxes: Array.from(groups.values()).reduce((sum, row) => sum + Math.max(row.modulated - row.managed, 0), 0),
    withCheckin: rows.filter((row) => row.checkinDts > 0).length,
    causes: Array.from(causeTotals, ([label, boxes]) => ({ label, boxes })).sort((a, b) => b.boxes - a.boxes).slice(0, 6),
  };
}

function ContractorRefusalPanel({ data }: { data: ContractorRefusalInsights }) {
  const [selectedPerson, setSelectedPerson] = useState<ContractorRefusalPersonRow | null>(null);
  const maxCause = Math.max(...data.causes.map((item) => item.boxes), 1);
  const coverage = data.rows.length ? Math.round(data.withCheckin / data.rows.length * 100) : 0;
  const rowsWithCheckin = data.rows.filter((row) => row.adherence !== null);
  const bestRows = [...rowsWithCheckin].sort((a, b) => (b.adherence || 0) - (a.adherence || 0) || Math.abs(a.difference) - Math.abs(b.difference)).slice(0, 10);
  const worstRows = [...rowsWithCheckin].sort((a, b) => (a.adherence || 0) - (b.adherence || 0) || b.modulated - a.modulated).slice(0, 10);
  const excessRows = [...rowsWithCheckin].filter((row) => row.difference > 0).sort((a, b) => b.difference - a.difference || b.checkin - a.checkin).slice(0, 10);
  return (
    <section className="mb-5 space-y-4" id="detalle-refusal">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<PackageCheck size={20} />} label="Cajas moduladas" value={data.totalModulated.toLocaleString("es-CO")} tone="blue" />
        <Metric icon={<ClipboardCheck size={20} />} label="Cajas en check-in" value={data.totalCheckin.toLocaleString("es-CO")} tone="blue" />
        <Metric icon={<ShieldAlert size={20} />} label="Exceso sobre modulación" value={data.excessBoxes.toLocaleString("es-CO")} tone="red" />
        <Metric icon={<Gauge size={20} />} label="Cobertura de check-in" value={`${coverage}%`} tone="amber" />
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/50">
          <div className="flex min-h-[76px] items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white px-3 py-2.5">
            <div><p className="text-[8px] font-black uppercase tracking-[.16em] text-emerald-600">Mejor desempeño</p><h2 className="text-sm font-black text-slate-950">Top 10 mejor adherencia</h2><p className="text-[9px] text-slate-500">Acumulado por persona.</p></div>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[8px] font-black text-emerald-700">Mejores</span>
          </div>
          <div className="overflow-hidden">
            <table className="w-full table-fixed text-left text-[10px]">
              <thead className="bg-slate-50 text-[7px] font-black uppercase tracking-wide text-slate-500"><tr><th className="w-7 px-1.5 py-2">#</th><th className="px-1.5 py-2">Persona</th><th className="w-14 px-1 py-2 text-right">Mod.</th><th className="w-14 px-1 py-2 text-right">Trajo</th><th className="w-14 px-1 py-2 text-right">Dif.</th><th className="w-20 px-1.5 py-2 text-right">Adh.</th></tr></thead>
              <tbody>{bestRows.map((row, index) => <CompactAdherenceRow index={index} key={row.person} onOpen={setSelectedPerson} row={row} />)}</tbody>
            </table>
            {!bestRows.length ? <div className="grid h-28 place-items-center p-5 text-center text-xs text-slate-400">No hay personas con check-in para los filtros seleccionados.</div> : null}
          </div>
        </article>

        <AdherenceRankingTable onOpen={setSelectedPerson} rows={worstRows} />
        <ExcessBoxesRankingTable onOpen={setSelectedPerson} rows={excessRows} />
      </div>
      {selectedPerson ? <ContractorPersonDetailModal onClose={() => setSelectedPerson(null)} row={selectedPerson} /> : null}

      <div className="grid gap-3 lg:grid-cols-[.7fr_1.3fr]">
          <article className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl"><p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-300">Pendiente de gestión</p><p className="mt-2 text-4xl font-black">{data.pendingBoxes.toLocaleString("es-CO")}</p><p className="mt-1 text-xs text-slate-400">cajas moduladas que aún no figuran como gestionadas</p></article>
          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/60"><p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-600">Causales principales</p><h3 className="mt-1 text-lg font-black text-slate-950">Cajas por causal</h3><div className="mt-4 space-y-3">{data.causes.map((item) => <div key={item.label}><div className="mb-1 flex justify-between gap-3 text-[10px] font-bold"><span className="truncate text-slate-600" title={item.label}>{item.label}</span><span className="text-slate-900">{item.boxes.toLocaleString("es-CO")}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500" style={{ width: `${item.boxes / maxCause * 100}%` }} /></div></div>)}{!data.causes.length ? <p className="py-8 text-center text-xs text-slate-400">Sin causales registradas.</p> : null}</div></article>
      </div>
    </section>
  );
}

function ExcessBoxesRankingTable({ rows, onOpen }: { rows: ContractorRefusalPersonRow[]; onOpen: (row: ContractorRefusalPersonRow) => void }) {
  return <article className="overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-md shadow-orange-100/60"><div className="flex min-h-[76px] items-center justify-between gap-2 border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white px-3 py-2.5"><div><p className="text-[8px] font-black uppercase tracking-[.16em] text-orange-600">Exceso real</p><h2 className="text-sm font-black text-slate-950">Top 10 mayor exceso</h2><p className="text-[9px] text-slate-500">Trajo menos lo modulado.</p></div><span className="rounded-full bg-orange-100 px-2 py-1 text-[8px] font-black text-orange-700">Top 10</span></div><div className="overflow-hidden"><table className="w-full table-fixed text-left text-[10px]"><thead className="bg-slate-50 text-[7px] font-black uppercase tracking-wide text-slate-500"><tr><th className="w-7 px-1.5 py-2">#</th><th className="px-1.5 py-2">Persona</th><th className="w-14 px-1 py-2 text-right">Mod.</th><th className="w-14 px-1 py-2 text-right">Trajo</th><th className="w-16 px-1.5 py-2 text-right">Exceso</th></tr></thead><tbody>{rows.map((row, index) => <tr className="cursor-pointer border-t border-slate-100 hover:bg-orange-50/60" key={row.person} onClick={() => onOpen(row)}><td className="px-1.5 py-1.5 font-black text-slate-400">{index + 1}</td><td className="min-w-0 px-1.5 py-1.5"><p className="truncate font-black text-slate-800" title={row.person}>{row.person}</p><p className="text-[7px] font-bold text-slate-400">{row.dts.length} DT · tocar para ver</p></td><td className="px-1 py-1.5 text-right font-black text-violet-700">{row.modulated.toLocaleString("es-CO")}</td><td className="px-1 py-1.5 text-right font-black text-blue-700">{row.checkin.toLocaleString("es-CO")}</td><td className="px-1.5 py-1.5 text-right"><span className="rounded-full bg-orange-100 px-1.5 py-0.5 font-black text-orange-700">+{row.difference.toLocaleString("es-CO")}</span></td></tr>)}</tbody></table>{!rows.length ? <div className="grid h-24 place-items-center p-4 text-center text-[10px] text-slate-400">Sin excesos sobre lo modulado.</div> : null}</div></article>;
}

function AdherenceRankingTable({ rows, onOpen }: { rows: ContractorRefusalPersonRow[]; onOpen: (row: ContractorRefusalPersonRow) => void }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-md shadow-rose-100/60">
      <div className="flex min-h-[76px] items-center justify-between gap-2 border-b border-rose-100 bg-gradient-to-r from-rose-50 to-white px-3 py-2.5">
        <div><p className="text-[8px] font-black uppercase tracking-[.16em] text-rose-600">Oportunidad de mejora</p><h2 className="text-sm font-black text-slate-950">Top 10 peor adherencia</h2><p className="text-[9px] text-slate-500">Menor porcentaje acumulado.</p></div>
        <span className="rounded-full bg-rose-100 px-2 py-1 text-[8px] font-black text-rose-700">Menores</span>
      </div>
      <div className="overflow-hidden">
        <table className="w-full table-fixed text-left text-[10px]">
          <thead className="bg-slate-50 text-[7px] font-black uppercase tracking-wide text-slate-500"><tr><th className="w-7 px-1.5 py-2">#</th><th className="px-1.5 py-2">Persona</th><th className="w-14 px-1 py-2 text-right">Mod.</th><th className="w-14 px-1 py-2 text-right">Trajo</th><th className="w-14 px-1 py-2 text-right">Dif.</th><th className="w-20 px-1.5 py-2 text-right">Adh.</th></tr></thead>
          <tbody>{rows.map((row, index) => <CompactAdherenceRow index={index} key={row.person} onOpen={onOpen} row={row} />)}</tbody>
        </table>
        {!rows.length ? <div className="grid h-28 place-items-center p-5 text-center text-xs text-slate-400">No hay personas con check-in para los filtros seleccionados.</div> : null}
      </div>
    </article>
  );
}

function CompactAdherenceRow({ row, index, onOpen }: { row: ContractorRefusalPersonRow; index: number; onOpen: (row: ContractorRefusalPersonRow) => void }) {
  return <tr className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50" onClick={() => onOpen(row)}><td className="px-1.5 py-1.5 font-black text-slate-400">{index + 1}</td><td className="min-w-0 px-1.5 py-1.5"><p className="truncate font-black text-slate-800" title={row.person}>{row.person}</p><p className="truncate text-[7px] font-bold uppercase text-slate-400">{row.dts.length} DT · {row.dates.length} días · tocar para ver</p></td><td className="px-1 py-1.5 text-right font-black text-violet-700">{row.modulated.toLocaleString("es-CO")}</td><td className="px-1 py-1.5 text-right font-black text-blue-700">{row.checkin.toLocaleString("es-CO")}</td><td className="px-1 py-1.5 text-right"><span className={`rounded-full px-1 py-0.5 font-black ${row.difference > 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>{`${row.difference > 0 ? "+" : ""}${row.difference.toLocaleString("es-CO")}`}</span></td><td className="px-1.5 py-1.5 text-right"><span className={`rounded-full px-1 py-0.5 font-black ${row.adherence === 100 ? "bg-emerald-100 text-emerald-700" : row.adherence !== null && row.adherence >= 90 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>{`${row.adherence?.toLocaleString("es-CO")}%`}</span></td></tr>;
}

function ContractorPersonDetailModal({ row, onClose }: { row: ContractorRefusalPersonRow; onClose: () => void }) {
  return <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={onClose} role="dialog"><article className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-3xl bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><header className="sticky top-0 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4"><div><p className="text-[9px] font-black uppercase tracking-[.18em] text-cyan-700">Detalle de tripulación / RR</p><h2 className="mt-1 text-xl font-black text-slate-950">{row.person}</h2><p className="text-xs text-slate-500">Acumulado completo del rango seleccionado</p></div><button aria-label="Cerrar detalle" className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200" onClick={onClose} type="button"><X size={17} /></button></header><div className="space-y-5 p-5"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><PersonDetailMetric label="Moduló" value={row.modulated} /><PersonDetailMetric label="Trajo" value={row.checkin} /><PersonDetailMetric label="Diferencia" value={row.difference} /><PersonDetailMetric label="Adherencia" value={`${row.adherence?.toLocaleString("es-CO")}%`} /></div><div className="grid gap-4 sm:grid-cols-2"><DetailList items={row.dts.map((item) => `DT ${item}`)} label={`DT trabajados (${row.dts.length})`} /><DetailList items={[...row.dates].sort().reverse()} label={`Días con actividad (${row.dates.length})`} /></div><DetailList items={row.causes} label="Causales registradas" /><p className="rounded-xl bg-cyan-50 p-3 text-[10px] font-semibold text-cyan-900">Adherencia = porcentaje de cajas moduladas que no regresaron en check-in porque fueron reubicadas. El check-in se distribuye proporcionalmente cuando varias personas modularon el mismo DT.</p></div></article></div>;
}

function PersonDetailMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl bg-slate-50 p-3 text-center"><p className="text-xl font-black text-slate-950">{typeof value === "number" ? value.toLocaleString("es-CO") : value}</p><p className="mt-1 text-[8px] font-black uppercase text-slate-400">{label}</p></div>;
}

function DetailList({ label, items }: { label: string; items: string[] }) {
  return <div><p className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p><div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto rounded-xl border border-slate-100 bg-slate-50 p-3">{items.length ? items.map((item) => <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-700 shadow-sm" key={item}>{item}</span>) : <span className="text-xs text-slate-400">Sin información registrada</span>}</div></div>;
}

function buildOperationalOverview(
  rangoReports: RangoOverviewReport[],
  modulationRecords: ModulationOverviewRecord[],
  rtiRecords: RtiRecord[],
  dailyChecklists: DailyChecklistRecord[],
  absenteeismRecords: DailyAbsenteeismRecord[],
  range: { from: string; to: string },
  contractor: string,
) {
  const matchesContractor = (value: string) => contractor === "Todas" || normalizeContractorName(value) === normalizeContractorName(contractor);
  const matchesDate = (value: string) => (!range.from || value >= range.from) && (!range.to || value <= range.to);
  const preferredRangeReports = preferredRangoReports(rangoReports).filter((report) => matchesContractor(report.contractor) && matchesDate(report.operationalDate));
  const rangeTotal = preferredRangeReports.reduce((sum, report) => sum + (report.summary.startedRows || 0), 0);
  const rangeIn = preferredRangeReports.reduce((sum, report) => sum + (report.summary.inRange || 0), 0);
  const rangeOut = preferredRangeReports.reduce((sum, report) => sum + (report.summary.outOfRange || 0), 0);

  const visibleModulations = modulationRecords.filter((record) => {
    const date = (record.fechaDespacho || record.fechaDt || record.createdAt || "").slice(0, 10);
    return matchesContractor(record.contratista) && matchesDate(date);
  });
  const modulationTotal = visibleModulations.reduce((sum, record) => sum + parseMetricNumber(record.totalCajas), 0);
  const modulationManaged = visibleModulations.reduce((sum, record) => sum + parseMetricNumber(record.cajasGestionadas), 0);

  const visibleRti = rtiRecords.filter((record) => matchesContractor(record.carrier) && matchesDate(recordDateKey(record)));
  const rtiOutbound = visibleRti.reduce((sum, record) => sum + (record.outbound || 0), 0);
  const rtiReturned = visibleRti.reduce((sum, record) => sum + (record.returned || 0), 0);
  const visibleChecklists = dailyChecklists.filter((record) => matchesContractor(record.contractor || "") && matchesDate(record.date));
  const visibleAbsenteeism = absenteeismRecords.filter((record) => matchesContractor(record.contractor || "") && matchesDate(record.date));
  const scheduledPeople = visibleAbsenteeism.reduce((sum, record) => sum + (record.scheduled || 0), 0);
  const absentPeople = visibleAbsenteeism.reduce((sum, record) => sum + (record.absent || 0), 0);

  return {
    range: { total: rangeTotal, inRange: rangeIn, outOfRange: rangeOut, percentage: ratioPercentage(rangeIn, rangeTotal) },
    modulation: {
      total: modulationTotal,
      managed: modulationManaged,
      pending: Math.max(modulationTotal - modulationManaged, 0),
      percentage: ratioPercentage(modulationManaged, modulationTotal),
      records: visibleModulations.length,
    },
    rti: {
      outbound: rtiOutbound,
      returned: rtiReturned,
      pending: Math.max(rtiOutbound - rtiReturned, 0),
      percentage: ratioPercentage(rtiReturned, rtiOutbound),
    },
    checklists: {
      departure: checklistPercentage(visibleChecklists, "departure"),
      return: checklistPercentage(visibleChecklists, "return"),
    },
    absenteeism: { scheduled: scheduledPeople, absent: absentPeople, percentage: ratioPercentage(absentPeople, scheduledPeople) },
  };
}

function preferredRangoReports(reports: RangoOverviewReport[]) {
  const preferred = new Map<string, RangoOverviewReport>();
  reports.forEach((report) => {
    const key = `${report.contractor}:${report.operationalDate}`;
    const current = preferred.get(key);
    if (!current || (report.kind === "closure" && current.kind !== "closure") || (report.kind === current.kind && report.updatedAt > current.updatedAt)) {
      preferred.set(key, report);
    }
  });
  return Array.from(preferred.values());
}

function parseMetricNumber(value: string) {
  const normalized = String(value || "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ratioPercentage(value: number, total: number) {
  return total ? Math.round((value / total) * 1_000) / 10 : 0;
}

function buildContractorRefusalHistory(
  vehicleRecords: Vehiculo[],
  modulationRecords: ModulationOverviewRecord[],
  checkins: AdminCheckinRecord[],
  range: { from: string; to: string },
  selectedContractor: string,
  dtSearch: string,
): ContractorRefusalTrend[] {
  const filteredVehicles = filterRecords(vehicleRecords, range, selectedContractor, dtSearch);
  const contractorLabels = new Map<string, string>();
  const vehiclesByGroup = new Map<string, Vehiculo[]>();

  filteredVehicles.forEach((record) => {
    const contractor = record.transportista?.trim() || "Sin contratista";
    const contractorKey = normalizeContractorName(contractor);
    const date = getVehicleDateKey(record);
    if (!contractorKey || !date) return;
    contractorLabels.set(contractorKey, contractor);
    const key = `${contractorKey}:${date}`;
    vehiclesByGroup.set(key, [...(vehiclesByGroup.get(key) || []), record]);
  });

  return Array.from(contractorLabels, ([contractorKey, contractor]) => {
    const dates = new Set<string>();
    vehiclesByGroup.forEach((_, key) => { if (key.startsWith(`${contractorKey}:`)) dates.add(key.slice(contractorKey.length + 1)); });
    const points = Array.from(dates).sort().map((date) => {
      const key = `${contractorKey}:${date}`;
      const dayVehicles = vehiclesByGroup.get(key) || [];
      const dispatchedBoxes = normalizeCajasTotal(dayVehicles.reduce((sum, vehicle) => sum + (Number(vehicle.cajas) || 0), 0));
      const dayModulations = modulationRecords.filter((record) => {
        const recordContractor = normalizeContractorName(record.contratista || "");
        const recordDate = (record.fechaDespacho || record.fechaDt || record.createdAt || "").slice(0, 10);
        return recordContractor === contractorKey && recordDate === date;
      });
      const pendingBoxes = calculateRefusalTotals(dayVehicles, dayModulations as ModulacionRegistro[], checkins, {
        getVehicleDate: () => date,
        getModulationDate: (record) => (record.fechaDespacho || record.fechaDt || record.createdAt || "").slice(0, 10),
      }).pendientes;
      return {
        date,
        pending: pendingBoxes,
        dispatched: dispatchedBoxes,
        percentage: dispatchedBoxes ? Math.round(pendingBoxes / dispatchedBoxes * 10_000) / 100 : 0,
      };
    });
    return { contractor, points };
  }).filter((row) => row.points.some((point) => point.pending > 0)).sort((a, b) => a.contractor.localeCompare(b.contractor, "es"));
}

function OperationalHealthCard({
  detail,
  href,
  icon,
  label,
  loading,
  onOpen,
  percentage,
  tone,
}: {
  detail: string;
  href: string;
  icon: ReactNode;
  label: string;
  loading: boolean;
  onOpen: (href: string) => void;
  percentage: number;
  tone: "emerald" | "violet" | "cyan" | "red";
}) {
  const styles = {
    emerald: { accent: "#10b981", icon: "bg-emerald-100 text-emerald-700", glow: "from-emerald-500/15" },
    violet: { accent: "#8b5cf6", icon: "bg-violet-100 text-violet-700", glow: "from-violet-500/15" },
    cyan: { accent: "#06b6d4", icon: "bg-cyan-100 text-cyan-700", glow: "from-cyan-500/15" },
    red: { accent: "#ef4444", icon: "bg-red-100 text-red-700", glow: "from-red-500/15" },
  }[tone];
  const ringPercentage = Math.max(0, Math.min(percentage, 100));

  return (
    <button
      className={`group relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br ${styles.glow} via-white to-white p-5 text-left shadow-[0_16px_35px_-24px_rgba(15,23,42,.45)] transition duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_22px_45px_-24px_rgba(15,23,42,.55)]`}
      onClick={() => onOpen(href)}
      type="button"
    >
      <div className="flex items-start justify-between gap-4">
        <span className={`grid h-10 w-10 place-items-center rounded-2xl ${styles.icon}`}>{icon}</span>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 transition group-hover:translate-x-0.5 group-hover:text-slate-700"><ChevronRight size={15} /></span>
      </div>
      <div className="mt-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[.13em] text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-black text-slate-950">{loading ? "—" : `${percentage.toLocaleString("es-CO")} %`}</p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-500" title={detail}>{loading ? "Consultando datos…" : detail}</p>
        </div>
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full p-1" style={{ background: `conic-gradient(${styles.accent} ${ringPercentage * 3.6}deg, #e2e8f0 0deg)` }}>
          <span className="grid h-full w-full place-items-center rounded-full bg-white text-[10px] font-black text-slate-500">{Math.round(ringPercentage)}%</span>
        </div>
      </div>
    </button>
  );
}

function SignalStat({ icon, label, tone, value }: { icon: ReactNode; label: string; tone: "red" | "violet" | "amber" | "cyan" | "blue"; value: string }) {
  const styles = {
    red: "border-red-100 bg-red-50/70 text-red-700",
    violet: "border-violet-100 bg-violet-50/70 text-violet-700",
    amber: "border-amber-100 bg-amber-50/70 text-amber-700",
    cyan: "border-cyan-100 bg-cyan-50/70 text-cyan-700",
    blue: "border-blue-100 bg-blue-50/70 text-blue-700",
  }[tone];
  return (
    <article className={`flex items-center gap-3 rounded-2xl border p-3 shadow-sm ${styles}`}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[9px] font-black uppercase tracking-wide opacity-70" title={label}>{label}</p>
        <p className="mt-0.5 text-lg font-black text-slate-950">{value}</p>
      </div>
    </article>
  );
}

type TrendPoint = { date: string; range: number; modulation: number; rti: number; checklist: number };
type BenchmarkRow = { contractor: string; range: number; modulation: number; rti: number; checklist: number; absence: number; score: number };

function buildOperationalTrend(
  rangoReports: RangoOverviewReport[], modulationRecords: ModulationOverviewRecord[], rtiRecords: RtiRecord[], dailyChecklists: DailyChecklistRecord[], absenteeismRecords: DailyAbsenteeismRecord[], range: { from: string; to: string }, contractor: string,
) {
  const dates = new Set<string>();
  rangoReports.forEach((record) => dates.add(record.operationalDate));
  modulationRecords.forEach((record) => dates.add((record.fechaDespacho || record.fechaDt || record.createdAt || "").slice(0, 10)));
  rtiRecords.forEach((record) => dates.add(recordDateKey(record)));
  dailyChecklists.forEach((record) => dates.add(record.date));
  absenteeismRecords.forEach((record) => dates.add(record.date));
  return Array.from(dates).filter((date) => date && date >= range.from && date <= range.to).sort().slice(-14).map((date) => {
    const overview = buildOperationalOverview(rangoReports, modulationRecords, rtiRecords, dailyChecklists, absenteeismRecords, { from: date, to: date }, contractor);
    const checklistValues = [overview.checklists.departure, overview.checklists.return].filter((item) => item.records > 0).map((item) => item.percentage);
    return { date, range: overview.range.percentage, modulation: overview.modulation.percentage, rti: overview.rti.percentage, checklist: checklistValues.length ? checklistValues.reduce((sum, value) => sum + value, 0) / checklistValues.length : 0 };
  });
}

function buildContractorBenchmark(
  rangoReports: RangoOverviewReport[], modulationRecords: ModulationOverviewRecord[], rtiRecords: RtiRecord[], dailyChecklists: DailyChecklistRecord[], absenteeismRecords: DailyAbsenteeismRecord[], range: { from: string; to: string },
) {
  const names = new Set<string>();
  rangoReports.forEach((record) => names.add(record.contractor));
  modulationRecords.forEach((record) => names.add(record.contratista));
  rtiRecords.forEach((record) => names.add(record.carrier));
  dailyChecklists.forEach((record) => record.contractor && names.add(record.contractor));
  absenteeismRecords.forEach((record) => record.contractor && names.add(record.contractor));
  return Array.from(names).filter(Boolean).map((name) => {
    const overview = buildOperationalOverview(rangoReports, modulationRecords, rtiRecords, dailyChecklists, absenteeismRecords, range, name);
    const checklistParts = [overview.checklists.departure, overview.checklists.return].filter((item) => item.records > 0).map((item) => item.percentage);
    const checklist = checklistParts.length ? checklistParts.reduce((sum, value) => sum + value, 0) / checklistParts.length : 0;
    const available = [overview.range.total ? overview.range.percentage : null, overview.modulation.total ? overview.modulation.percentage : null, overview.rti.outbound ? overview.rti.percentage : null, checklistParts.length ? checklist : null, overview.absenteeism.scheduled ? Math.max(100 - overview.absenteeism.percentage, 0) : null].filter((value): value is number => value !== null);
    const score = available.length ? available.reduce((sum, value) => sum + Math.min(value, 100), 0) / available.length : 0;
    return { contractor: name, range: overview.range.percentage, modulation: overview.modulation.percentage, rti: overview.rti.percentage, checklist, absence: overview.absenteeism.percentage, score };
  }).sort((a, b) => b.score - a.score);
}

function ExecutiveTrendChart({ data }: { data: TrendPoint[] }) {
  const series = [
    { key: "range" as const, label: "En rango", color: "#10b981" },
    { key: "modulation" as const, label: "Modulación", color: "#8b5cf6" },
    { key: "rti" as const, label: "RTI", color: "#06b6d4" },
    { key: "checklist" as const, label: "Checklists", color: "#f59e0b" },
  ];
  const width = 760; const height = 270; const left = 36; const right = 18; const top = 18; const bottom = 38;
  const x = (index: number) => left + (index / Math.max(data.length - 1, 1)) * (width - left - right);
  const y = (value: number) => top + (1 - Math.min(Math.max(value, 0), 110) / 110) * (height - top - bottom);
  return <article className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[#07111f] p-5 text-white shadow-[0_25px_60px_-35px_rgba(2,132,199,.65)]"><div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" /><div className="relative flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-cyan-300"><TrendingUp size={14} /> Pulso operativo</p><h3 className="mt-1 text-xl font-black">Evolución de indicadores</h3><p className="mt-1 text-xs text-slate-400">Últimos {data.length} días con información dentro del filtro</p></div><div className="flex flex-wrap gap-3">{series.map((item) => <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300" key={item.key}><i className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color, boxShadow: `0 0 12px ${item.color}` }} />{item.label}</span>)}</div></div>{data.length ? <div className="relative mt-4 overflow-x-auto"><svg aria-label="Tendencia de indicadores" className="min-w-[620px]" role="img" viewBox={`0 0 ${width} ${height}`}>{[0, 25, 50, 75, 100].map((value) => <g key={value}><line stroke="#1e293b" strokeDasharray="4 5" x1={left} x2={width - right} y1={y(value)} y2={y(value)} /><text fill="#64748b" fontSize="9" textAnchor="end" x={left - 7} y={y(value) + 3}>{value}%</text></g>)}<line stroke="#f43f5e" strokeDasharray="5 5" opacity=".55" x1={left} x2={width - right} y1={y(90)} y2={y(90)} />{series.map((item) => { const points = data.map((point, index) => `${x(index)},${y(point[item.key])}`).join(" "); return <g key={item.key}><polyline fill="none" points={points} stroke={item.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />{data.map((point, index) => <circle fill="#07111f" key={`${item.key}-${point.date}`} r="3.5" stroke={item.color} strokeWidth="2" cx={x(index)} cy={y(point[item.key])}><title>{`${item.label}: ${point[item.key].toFixed(1)}% · ${point.date}`}</title></circle>)}</g>; })}{data.map((point, index) => (index === 0 || index === data.length - 1 || index % 3 === 0) ? <text fill="#64748b" fontSize="9" textAnchor="middle" x={x(index)} y={height - 12} key={point.date}>{point.date.slice(5)}</text> : null)}</svg></div> : <div className="mt-5 grid h-64 place-items-center rounded-2xl border border-dashed border-slate-700 text-sm text-slate-500">No hay series para el periodo seleccionado.</div>}</article>;
}

function ContractorBenchmarkTable({ rows }: { rows: BenchmarkRow[] }) {
  return <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,.45)]"><div className="border-b border-slate-100 bg-gradient-to-r from-amber-50 to-white p-5"><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-amber-700"><Trophy size={14} /> Comparativo</p><h3 className="mt-1 text-xl font-black text-slate-950">Desempeño por contratista</h3><p className="mt-1 text-xs text-slate-500">Índice consolidado de los indicadores disponibles</p></div><div className="max-h-[300px] overflow-auto">{rows.length ? rows.map((row, index) => <div className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-0" key={row.contractor}><span className={`grid h-7 w-7 place-items-center rounded-lg text-xs font-black ${index === 0 ? "bg-amber-400 text-slate-950" : "bg-slate-100 text-slate-500"}`}>{index + 1}</span><div className="min-w-0"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-black text-slate-800" title={row.contractor}>{row.contractor}</p><span className="text-xs font-black text-slate-950">{row.score.toFixed(1)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-amber-400" style={{ width: `${Math.min(row.score, 100)}%` }} /></div><div className="mt-1.5 flex gap-2 text-[8px] font-bold uppercase text-slate-400"><span>Rango {row.range.toFixed(0)}</span><span>RTI {row.rti.toFixed(0)}</span><span>Mod. {row.modulation.toFixed(0)}</span><span>Aus. {row.absence.toFixed(1)}</span></div></div><span className={`h-2.5 w-2.5 rounded-full ${row.score >= 95 ? "bg-emerald-500 shadow-[0_0_10px_#10b981]" : row.score >= 85 ? "bg-amber-400 shadow-[0_0_10px_#f59e0b]" : "bg-red-500 shadow-[0_0_10px_#ef4444]"}`} /></div>) : <div className="grid h-56 place-items-center text-sm text-slate-400">Sin contratistas para comparar.</div>}</div></article>;
}

type DeparturePerformance = { average: string; beforeSeven: number; total: number; percentage: number };
type LateArrivalRow = { name: string; contractor: string; role: string; lateDays: number; averageSeconds: number; latestSeconds: number };
type OnTimeContractorRow = { contractor: string; onTime: number; noOnTime: number; unclassified: number; classified: number; percentage: number };
type ModulationTimeBucket = { key: string; label: string; startHour: number; endHour: number };
type ModulationTimingRow = { contractor: string; averageSeconds: number | null; total: number; buckets: Record<string, number> };

const MODULATION_TIME_BUCKETS: ModulationTimeBucket[] = [
  { key: "06-09", label: "6:00–9:00 a. m.", startHour: 6, endHour: 9 },
  { key: "09-12", label: "9:00 a. m.–12:00 m.", startHour: 9, endHour: 12 },
  { key: "12-15", label: "12:00–3:00 p. m.", startHour: 12, endHour: 15 },
  { key: "15-18", label: "3:00–6:00 p. m.", startHour: 15, endHour: 18 },
  { key: "18-24", label: "Después de 6:00 p. m.", startHour: 18, endHour: 24 },
];

function buildModulationTiming(
  records: ModulationOverviewRecord[],
  range: { from: string; to: string },
  selectedContractor: string,
  dtSearch: string,
): ModulationTimingRow[] {
  const contractors = ["Logisticos", "Punto Corona", "Surti Cervezas"];
  const groups = new Map<string, { seconds: number[]; clientsByBucket: Map<string, Set<string>> }>(
    contractors.map((name) => [name, { seconds: [], clientsByBucket: new Map(MODULATION_TIME_BUCKETS.map((bucket) => [bucket.key, new Set<string>()])) }]),
  );
  const normalizedDt = normalizeDt(dtSearch);

  records.forEach((record) => {
    const contractorName = onTimeContractorLabel(record.contratista || "");
    const group = groups.get(contractorName);
    if (!group || (selectedContractor !== "Todas" && onTimeContractorLabel(selectedContractor) !== contractorName)) return;
    const modulationDate = modulationCreatedAtDateKey(record.createdAt);
    if (!modulationDate || (range.from && modulationDate < range.from) || (range.to && modulationDate > range.to)) return;
    if (normalizedDt && !normalizeDt(record.dt).includes(normalizedDt)) return;

    const seconds = modulationCreatedAtSeconds(record.createdAt);
    if (seconds === null) return;
    const bucket = MODULATION_TIME_BUCKETS.find((item) => seconds >= item.startHour * 3600 && seconds < item.endHour * 3600);
    if (!bucket) return;
    const clientKey = `${modulationDate}:${String(record.codigoCliente || record.nombreCliente || record.dt).trim().toLowerCase()}`;
    group.clientsByBucket.get(bucket.key)?.add(clientKey);
    group.seconds.push(seconds);
  });

  return contractors
    .filter((name) => selectedContractor === "Todas" || onTimeContractorLabel(selectedContractor) === name)
    .map((name) => {
      const group = groups.get(name)!;
      const buckets = Object.fromEntries(MODULATION_TIME_BUCKETS.map((bucket) => [bucket.key, group.clientsByBucket.get(bucket.key)?.size || 0]));
      return {
        contractor: name,
        averageSeconds: group.seconds.length ? Math.round(group.seconds.reduce((sum, value) => sum + value, 0) / group.seconds.length) : null,
        total: Object.values(buckets).reduce((sum, value) => sum + value, 0),
        buckets,
      };
    });
}

function modulationCreatedAtSeconds(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/Bogota",
  }).formatToParts(date);
  const readPart = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  const hour = readPart("hour") % 24;
  return hour * 3600 + readPart("minute") * 60 + readPart("second");
}

function modulationCreatedAtDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Bogota",
    year: "numeric",
  }).format(date);
}

function ModulationTimingChart({ data, singleContractor = false }: { data: ModulationTimingRow[]; singleContractor?: boolean }) {
  const colors: Record<string, string> = { Logisticos: "#06b6d4", "Punto Corona": "#8b5cf6", "Surti Cervezas": "#f59e0b" };
  const maximum = Math.max(...data.flatMap((row) => Object.values(row.buckets)), 1);
  const grandTotal = data.reduce((sum, row) => sum + row.total, 0);

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,.45)]">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 via-white to-cyan-50 p-5">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-violet-700"><Clock3 size={14} /> Horario de registro</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">Clientes modulados por franja horaria</h2>
          <p className="mt-1 text-xs text-slate-500">{singleContractor ? "Distribución de mi operación según la hora de creación de la modulación." : "Barras comparativas de las tres contratistas según la hora de creación de la modulación."}</p>
        </div>
        <div className="rounded-2xl bg-slate-950 px-4 py-2 text-right text-white">
          <p className="text-[9px] font-black uppercase text-cyan-300">Clientes modulados</p>
          <p className="text-3xl font-black">{grandTotal.toLocaleString("es-CO")}</p>
        </div>
      </header>

      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
        {data.map((row) => <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4" key={row.contractor}><div className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[row.contractor] }} /><p className="text-xs font-black text-slate-800">{row.contractor}</p></div><p className="mt-3 text-2xl font-black text-slate-950">{row.averageSeconds === null ? "—" : formatClockSeconds(row.averageSeconds)}</p><p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Hora promedio · {row.total} clientes</p></div>)}
      </div>

      <div className="overflow-x-auto p-5">
        <div className="min-w-[720px]">
          <div className="flex h-80 items-end gap-5 border-b border-l border-slate-200 px-5 pt-8">
            {MODULATION_TIME_BUCKETS.map((bucket) => (
              <div className="flex h-full min-w-0 flex-1 items-end justify-center gap-2" key={bucket.key}>
                {data.map((row) => {
                  const value = row.buckets[bucket.key] || 0;
                  const height = value ? Math.max((value / maximum) * 100, 3) : 0;
                  return <div className="flex h-full w-full max-w-12 flex-col justify-end" key={`${bucket.key}-${row.contractor}`} title={`${row.contractor}: ${value} clientes`}><span className="mb-1 text-center text-[10px] font-black text-slate-700">{value}</span><div className="w-full rounded-t-md transition-all" style={{ backgroundColor: colors[row.contractor], height: `${height}%` }} /></div>;
                })}
              </div>
            ))}
          </div>
          <div className="flex gap-5 px-5 pt-3">
            {MODULATION_TIME_BUCKETS.map((bucket) => <p className="min-w-0 flex-1 text-center text-[10px] font-black leading-4 text-slate-600" key={bucket.key}>{bucket.label}</p>)}
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-5 border-t border-slate-100 pt-4">
            {data.map((row) => <span className="flex items-center gap-2 text-[10px] font-bold text-slate-600" key={row.contractor}><i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colors[row.contractor] }} />{row.contractor}</span>)}
          </div>
          {!grandTotal ? <p className="mt-5 text-center text-sm text-slate-400">No hay modulaciones en las franjas seleccionadas.</p> : null}
        </div>
      </div>
    </article>
  );
}

function LegacyModulationTimingChart({ data }: { data: ModulationTimingRow[] }) {
  const colors: Record<string, string> = { Logisticos: "#06b6d4", "Punto Corona": "#8b5cf6", "Surti Cervezas": "#f59e0b" };
  const maximum = Math.max(...data.flatMap((row) => Object.values(row.buckets)), 1);
  const grandTotal = data.reduce((sum, row) => sum + row.total, 0);

  return <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,.45)]"><header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 via-white to-cyan-50 p-5"><div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-violet-700"><Clock3 size={14} /> Horario de registro</p><h2 className="mt-1 text-xl font-black text-slate-950">Clientes modulados por franja horaria</h2><p className="mt-1 text-xs text-slate-500">Comparativo de las tres contratistas según la hora de creación de la modulación.</p></div><div className="rounded-2xl bg-slate-950 px-4 py-2 text-right text-white"><p className="text-[9px] font-black uppercase text-cyan-300">Clientes modulados</p><p className="text-3xl font-black">{grandTotal.toLocaleString("es-CO")}</p></div></header><div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">{data.map((row) => <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4" key={row.contractor}><div className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[row.contractor] }} /><p className="text-xs font-black text-slate-800">{row.contractor}</p></div><p className="mt-3 text-2xl font-black text-slate-950">{row.averageSeconds === null ? "—" : formatClockSeconds(row.averageSeconds)}</p><p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Hora promedio · {row.total} clientes</p></div>)}</div><div className="space-y-6 p-5">{MODULATION_TIME_BUCKETS.map((bucket) => <div key={bucket.key}><p className="mb-2 text-xs font-black text-slate-700">{bucket.label}</p><div className="space-y-2">{data.map((row) => { const value = row.buckets[bucket.key] || 0; return <div className="grid grid-cols-[110px_minmax(0,1fr)_48px] items-center gap-3" key={`${bucket.key}-${row.contractor}`}><span className="truncate text-[10px] font-bold text-slate-500" title={row.contractor}>{row.contractor}</span><div className="h-5 overflow-hidden rounded-full bg-slate-100"><div className="h-full min-w-[2px] rounded-full transition-all" style={{ backgroundColor: colors[row.contractor], width: `${value ? Math.max(value / maximum * 100, 2) : 0}%` }} /></div><span className="text-right text-xs font-black text-slate-800">{value}</span></div>; })}</div></div>)}{!grandTotal ? <div className="grid h-28 place-items-center rounded-2xl border border-dashed border-slate-200 text-center text-sm text-slate-400">No hay modulaciones entre las 6:00 a. m. y el final del día para los filtros seleccionados.</div> : null}</div></article>;
}

void LegacyModulationTimingChart;

function buildOnTimeByContractor(records: Vehiculo[]): OnTimeContractorRow[] {
  const contractorOrder = ["Logisticos", "Punto Corona", "Surti Cervezas"];
  const groups = new Map<string, Omit<OnTimeContractorRow, "classified" | "percentage">>(
    contractorOrder.map((contractor) => [contractor, { contractor, onTime: 0, noOnTime: 0, unclassified: 0 }]),
  );
  records.forEach((record) => {
    const contractor = onTimeContractorLabel(record.transportista);
    const current = groups.get(contractor);
    if (!current) return;
    const classification = normalizeContractorName(record.clasificacionOnTime);
    if (classification === "ontime") current.onTime += 1;
    else if (classification === "noontime") current.noOnTime += 1;
    else current.unclassified += 1;
    groups.set(contractor, current);
  });
  return Array.from(groups.values(), (item) => {
    const classified = item.onTime + item.noOnTime;
    return { ...item, classified, percentage: ratioPercentage(item.onTime, classified) };
  });
}

function onTimeContractorLabel(value: string) {
  const normalized = normalizeContractorName(value);
  if (normalized === "logisticos" || normalized === "logisticosarenosa") return "Logisticos";
  if (["puntocorona", "corona", "puntocoronaarenosa", "coronaarenosa"].includes(normalized)) return "Punto Corona";
  if (normalized === "surticervezas") return "Surti Cervezas";
  return value.trim();
}

function OnTimeContractorCard({ item }: { item: OnTimeContractorRow }) {
  const onTimeDegrees = item.classified ? item.percentage * 3.6 : 0;
  return <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-32px_rgba(15,23,42,.5)]"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-600">Contratista</p><h3 className="mt-1 text-lg font-black text-slate-950">{item.contractor}</h3><p className="mt-1 text-xs text-slate-500">{item.classified} vehiculos clasificados</p></div><div className="grid h-24 w-24 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(#10b981 0deg ${onTimeDegrees}deg, #f43f5e ${onTimeDegrees}deg 360deg)` }}><div className="grid h-[70px] w-[70px] place-items-center rounded-full bg-white text-center shadow-inner"><span className="text-xl font-black text-slate-950">{item.percentage}%</span><span className="-mt-5 text-[8px] font-black uppercase text-slate-400">On Time</span></div></div></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-emerald-50 p-3"><p className="text-[9px] font-black uppercase text-emerald-700">On Time</p><p className="mt-1 text-2xl font-black text-emerald-700">{item.onTime}</p></div><div className="rounded-2xl bg-rose-50 p-3"><p className="text-[9px] font-black uppercase text-rose-700">No On Time</p><p className="mt-1 text-2xl font-black text-rose-700">{item.noOnTime}</p></div></div>{item.unclassified ? <p className="mt-3 text-[10px] font-semibold text-amber-700">{item.unclassified} vehiculos sin clasificacion</p> : null}</article>;
}

function OnTimeComparisonChart({ rows }: { rows: OnTimeContractorRow[] }) {
  const totalOnTime = rows.reduce((sum, row) => sum + row.onTime, 0);
  const totalNoOnTime = rows.reduce((sum, row) => sum + row.noOnTime, 0);
  const consolidated = ratioPercentage(totalOnTime, totalOnTime + totalNoOnTime);
  return <article className="mt-4 overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-[#07111f] via-[#0b1d32] to-[#10283a] p-6 text-white shadow-2xl"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-300">Comparativo consolidado</p><h3 className="mt-1 text-xl font-black">On Time de las tres contratistas</h3><p className="mt-1 text-xs text-slate-400">Porcentaje calculado sobre vehiculos clasificados en seguimiento</p></div><div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-right"><p className="text-[9px] font-black uppercase text-emerald-300">Total On Time</p><p className="text-3xl font-black text-emerald-300">{consolidated}%</p></div></div><div className="mt-6 space-y-5">{rows.map((row) => <div key={row.contractor}><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="font-black">{row.contractor}</span><span className="font-black text-emerald-300">{row.percentage}% <span className="font-semibold text-slate-400">({row.onTime}/{row.classified})</span></span></div><div className="flex h-5 overflow-hidden rounded-full bg-slate-800 ring-1 ring-white/10"><div className="bg-gradient-to-r from-emerald-600 to-emerald-400" style={{ width: `${row.percentage}%` }} title={`${row.onTime} On Time`} /><div className="bg-gradient-to-r from-rose-500 to-red-500" style={{ width: `${100 - row.percentage}%` }} title={`${row.noOnTime} No On Time`} /></div></div>)}{!rows.length ? <div className="grid h-36 place-items-center text-sm text-slate-500">No hay clasificaciones On Time en el periodo.</div> : null}</div><div className="mt-5 flex flex-wrap gap-4 border-t border-white/10 pt-4 text-[10px] font-bold text-slate-300"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />On Time</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" />No On Time</span><span className="ml-auto">{totalOnTime} On Time · {totalNoOnTime} No On Time</span></div></article>;
}

function buildDeparturePerformance(records: Vehiculo[]): DeparturePerformance {
  const times = records.map((record) => parseClockSeconds(record.horaSalida)).filter((value): value is number => value !== null);
  const beforeSeven = times.filter((value) => value < 7 * 3600).length;
  const averageSeconds = times.length ? Math.round(times.reduce((sum, value) => sum + value, 0) / times.length) : 0;
  return { average: times.length ? formatClockSeconds(averageSeconds) : "—", beforeSeven, total: times.length, percentage: ratioPercentage(beforeSeven, times.length) };
}

function buildLateArrivalRanking(snapshots: AttendanceSnapshot[], range: { from: string; to: string }, contractor: string) {
  const grouped = new Map<string, LateArrivalRow & { secondsTotal: number }>();
  snapshots.filter((snapshot) => snapshot.operationalDate >= range.from && snapshot.operationalDate <= range.to).forEach((snapshot) => {
    snapshot.rows.forEach((row) => {
      if (contractor !== "Todas" && normalizeContractorName(row.contratista || "") !== normalizeContractorName(contractor)) return;
      const seconds = parseClockSeconds(row.entrada);
      if (seconds === null || seconds <= 6 * 3600) return;
      const name = String(row.nombreCompleto || "Sin nombre").trim();
      const key = `${normalizeContractorName(row.contratista || "")}:${name.toLocaleLowerCase("es")}`;
      const current = grouped.get(key) || { name, contractor: String(row.contratista || "Sin contratista"), role: String(row.cargo || ""), lateDays: 0, averageSeconds: 0, latestSeconds: 0, secondsTotal: 0 };
      current.lateDays += 1;
      current.secondsTotal += seconds;
      current.latestSeconds = Math.max(current.latestSeconds, seconds);
      current.averageSeconds = Math.round(current.secondsTotal / current.lateDays);
      grouped.set(key, current);
    });
  });
  return Array.from(grouped.values()).sort((a, b) => b.lateDays - a.lateDays || b.averageSeconds - a.averageSeconds).slice(0, 15);
}

function parseClockSeconds(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1 ? Math.round(value) : Math.round(value * 86_400);
  const text = String(value || "").trim();
  const match = text.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i);
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2]); const second = Number(match[3] || 0); const meridiem = String(match[4] || "").toLowerCase();
  if (meridiem.startsWith("p") && hour < 12) hour += 12;
  if (meridiem.startsWith("a") && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return hour * 3600 + minute * 60 + second;
}

function formatClockSeconds(value: number) {
  const hour = Math.floor(value / 3600) % 24; const minute = Math.floor(value % 3600 / 60);
  return new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
}

function DeparturePerformanceCard({ departure }: { departure: DeparturePerformance }) {
  return <article className="relative min-w-0 overflow-hidden rounded-2xl bg-gradient-to-br from-[#07111f] via-[#0b1d32] to-[#112b3c] p-4 text-white shadow-lg"><div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" /><div className="relative flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-300">Salida antes de las 7:00 a. m.</p><p className="mt-2 text-xs font-bold text-slate-400">Hora promedio</p><p className="mt-1 text-3xl font-black">{departure.average}</p><p className="mt-3 text-xs text-slate-300"><strong className="text-emerald-300">{departure.beforeSeven}</strong> de {departure.total} rutas salieron antes de las 7:00 a. m.</p></div><div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-[7px] border-emerald-400/80 bg-slate-950/50 text-center shadow-[0_0_28px_rgba(52,211,153,.18)]"><div><span className="text-2xl font-black">{departure.percentage}%</span><span className="block text-[8px] font-black uppercase text-emerald-300">Antes de las 7</span></div></div></div></article>;
}

function LateArrivalRanking({ rows }: { rows: LateArrivalRow[] }) {
  const maxDays = Math.max(...rows.map((row) => row.lateDays), 1);
  return <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,.45)]"><div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-rose-50 to-white px-3 py-2.5"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-rose-600">GeoVictoria · después de 6:00 a. m.</p><h3 className="mt-1 text-base font-black text-slate-950">Top de llegadas tardías</h3><p className="mt-1 text-xs text-slate-500">Número de días y hora promedio dentro del filtro</p></div><span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-700">{rows.length} personas</span></div><div className="max-h-[220px] overflow-auto">{rows.length ? rows.map((row, index) => <div className="grid grid-cols-[24px_minmax(0,1fr)_80px] items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0" key={`${row.contractor}-${row.name}`}><span className={`grid h-6 w-6 place-items-center rounded-lg text-xs font-black ${index < 3 ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-500"}`}>{index + 1}</span><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800" title={row.name}>{row.name}</p><p className="mt-0.5 truncate text-[9px] font-bold uppercase text-slate-400">{row.contractor}{row.role ? ` · ${row.role}` : ""}</p><div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500" style={{ width: `${row.lateDays / maxDays * 100}%` }} /></div></div><div className="text-right"><p className="text-base font-black text-rose-600">{row.lateDays} <span className="text-[9px] uppercase text-slate-400">días</span></p><p className="text-[10px] font-bold text-slate-500">Prom. {formatClockSeconds(row.averageSeconds)}</p></div></div>) : <div className="grid h-32 place-items-center p-4 text-center text-sm text-slate-400">No hay llegadas posteriores a las 6:00 a. m. en los archivos cargados para este filtro.</div>}</div></article>;
}
