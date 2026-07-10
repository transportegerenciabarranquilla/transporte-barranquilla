"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Boxes, CalendarDays, History, MapPinCheck, PackageCheck, Search, ShieldAlert, Truck, Users, X } from "lucide-react";
import type { Vehiculo } from "../seguimiento/types";
import { getProgress, getStatus, isLateDepartureTime, normalizeCajasTotal } from "../seguimiento/utils";
import { isManualResponsibleEditEnabled, MANUAL_RESPONSABLE_EDIT_ENABLED_KEY, setManualResponsibleEditEnabled } from "../lib/adminSettings";
import { useStorageSnapshot } from "../lib/storageEvents";

type Summary = {
  contractor: string;
  rutas: number;
  cajas: number;
  clientes: number;
  visitados: number;
  rechazadas: number;
  gestionadas: number;
  refusalFinal: number;
  refusal: number;
};

type PersonHistory = {
  type: string;
  date: string;
  title: string;
  detail: string;
};

type PersonSummary = {
  cc: string;
  nombre: string;
  cargo: string;
  contratista: string;
  stats: {
    rutas: number;
    modulaciones: number;
    reubicaciones: number;
    gestionadas?: number;
    hectolitros?: number;
    visitasRango?: number;
    enRango?: number;
    fueraRango?: number;
    porcentajeRango?: number;
    tiempoPromedioRuta: string;
    ultimoDt: string;
  };
  history: PersonHistory[];
};

type PeopleGroup = {
  name: string;
  people: PersonSummary[];
};

type VehiclePerson = PersonSummary & {
  role: string;
};

type AdminTab = "resumen" | "detalle" | "errores" | "exportar";
type AdminIssueKind = "sin-responsable" | "sin-asistencia" | "salida-tardia" | "bajo-avance" | "modulacion-pendiente" | "sin-fecha" | "sin-salida";

export default function AdminPage() {
  const router = useRouter();
  const canEditResponsibleManual = useStorageSnapshot<boolean>(
    [MANUAL_RESPONSABLE_EDIT_ENABLED_KEY],
    isManualResponsibleEditEnabled,
    false,
  );
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [records, setRecords] = useState<Vehiculo[]>([]);
  const [peopleGroups, setPeopleGroups] = useState<PeopleGroup[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<Vehiculo | null>(null);
  const [selectedContractor, setSelectedContractor] = useState("Todas");
  const [selectedDate, setSelectedDate] = useState("");
  const [dtSearch, setDtSearch] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("resumen");
  const [activeIssueFilter, setActiveIssueFilter] = useState<AdminIssueKind | "">("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const tab = searchParams.get("tab");
    const date = searchParams.get("fecha") || searchParams.get("date") || "";
    const dt = searchParams.get("dt") || searchParams.get("q") || "";
    const contractor = searchParams.get("contratista") || "";
    const issue = searchParams.get("alerta") || "";

    if (!tab && !date && !dt && !contractor && !issue) return;

    const timeout = window.setTimeout(() => {
      if (isAdminTab(tab)) setActiveTab(tab);
      if (date) setSelectedDate(date);
      if (dt) setDtSearch(dt);
      if (contractor) setSelectedContractor(contractor);
      if (isAdminIssueKind(issue)) {
        setActiveIssueFilter(issue);
        setActiveTab("errores");
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/seguimiento", { cache: "no-store" }),
      fetch("/api/people/summary", { cache: "no-store" }),
    ])
      .then(async ([adminResponse, peopleResponse]) => {
        const adminBody = await adminResponse.json().catch(() => ({}));
        if (!adminResponse.ok) throw new Error(adminBody.error || "No se pudo cargar el panel admin.");
        setSummaries(adminBody.summaries || []);
        setRecords(adminBody.records || []);

        if (peopleResponse.ok) {
          const peopleBody = await peopleResponse.json().catch(() => ({}));
          setPeopleGroups(peopleBody.contractors || []);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar el panel admin."))
      .finally(() => setLoading(false));
  }, []);

  const dateRecords = useMemo(() => {
    const targetDt = normalizeDt(dtSearch);

    return records.filter((record) => {
      const matchesDate = !selectedDate || getRecordDate(record) === selectedDate;
      const matchesDt = !targetDt || normalizeDt(record.transporte).includes(targetDt);
      return matchesDate && matchesDt;
    });
  }, [dtSearch, records, selectedDate]);

  const visibleSummaries = useMemo(() => {
    return summaries.map((summary) => {
      const contractorRecords = dateRecords.filter((record) => record.transportista === summary.contractor);
      const cajas = normalizeCajasTotal(contractorRecords.reduce((total, record) => total + readNumber(record.cajas), 0));
      const refusalFinal = contractorRecords.reduce((total, record) => total + readNumber(record.cajasRefusalFinal), 0);

      return {
        contractor: summary.contractor,
        rutas: contractorRecords.length,
        cajas,
        clientes: contractorRecords.reduce((total, record) => total + readNumber(record.clientes), 0),
        visitados: contractorRecords.reduce((total, record) => total + readNumber(record.visitados), 0),
        rechazadas: contractorRecords.reduce((total, record) => total + readNumber(record.cajasRechazadas), 0),
        gestionadas: contractorRecords.reduce((total, record) => total + readNumber(record.cajasGestionadas), 0),
        refusalFinal,
        refusal: cajas ? Number(((refusalFinal / cajas) * 100).toFixed(2)) : 0,
      };
    });
  }, [dateRecords, summaries]);

  const totals = useMemo(() => {
    const values = dateRecords.reduce(
      (acc, record) => ({
        cajas: acc.cajas + readNumber(record.cajas),
        clientes: acc.clientes + readNumber(record.clientes),
        refusalFinal: acc.refusalFinal + readNumber(record.cajasRefusalFinal),
      }),
      { cajas: 0, clientes: 0, refusalFinal: 0 },
    );

    const roundedCajas = normalizeCajasTotal(values.cajas);

    return {
      ...values,
      cajas: roundedCajas,
      refusal: roundedCajas ? Number(((values.refusalFinal / roundedCajas) * 100).toFixed(2)) : 0,
    };
  }, [dateRecords]);

  const filteredRecords = useMemo(() => {
    if (selectedContractor === "Todas") return dateRecords;
    return dateRecords.filter((record) => record.transportista === selectedContractor);
  }, [dateRecords, selectedContractor]);
  const allPeople = useMemo(() => peopleGroups.flatMap((group) => group.people), [peopleGroups]);
  const selectedVehiclePeople = useMemo(() => (selectedRecord ? getVehiclePeople(selectedRecord, allPeople) : []), [allPeople, selectedRecord]);
  const allAdminIssues = useMemo(() => buildAdminIssues(filteredRecords), [filteredRecords]);
  const adminIssues = useMemo(
    () => (activeIssueFilter ? allAdminIssues.filter((issue) => issue.kind === activeIssueFilter) : allAdminIssues),
    [activeIssueFilter, allAdminIssues],
  );

  function toggleResponsibleManualEdit() {
    const nextValue = !canEditResponsibleManual;
    const confirmationText = nextValue
      ? "Confirmas habilitar la edicion manual de Responsable en el detalle del vehiculo?"
      : "Confirmas bloquear la edicion manual de Responsable en el detalle del vehiculo?";
    if (!window.confirm(confirmationText)) return;
    setManualResponsibleEditEnabled(nextValue);
  }

  function goToAdminGraficas() {
    const params = new URLSearchParams();
    if (selectedDate) {
      params.set("desde", selectedDate);
      params.set("hasta", selectedDate);
    }
    if (dtSearch) params.set("dt", dtSearch);
    if (selectedContractor !== "Todas") params.set("contratista", selectedContractor);
    const query = params.toString();
    router.push(query ? `/admin/graficas?${query}` : "/admin/graficas");
  }

  return (
    <main className="tech-grid min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-white/60 bg-white/82 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-[#10223d] shadow-sm transition hover:bg-slate-50"
            onClick={() => router.push("/")}
            type="button"
          >
            <ArrowLeft size={18} />
            Portal
          </button>
          <span className="rounded-md bg-[#10223d] px-3 py-2 text-sm font-semibold text-white shadow-sm">Administrador</span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
        <section className="mb-5 overflow-hidden rounded-lg bg-[#091525] text-white shadow-[0_28px_90px_rgba(9,21,37,0.24)]">
          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_420px] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f5bd19]">Vista global</p>
              <h1 className="mt-2 text-3xl font-semibold leading-tight">Seguimiento de transportistas</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/68">
                Control operativo de rutas, refusal, alertas y tripulacion para Logisticos, Punto Corona y Surti Cervezas.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0f7c58] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b684a]"
                  onClick={goToAdminGraficas}
                  type="button"
                >
                  <BarChart3 size={16} />
                  Graficas
                </button>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                  onClick={() => router.push("/admin/rango")}
                  type="button"
                >
                  <MapPinCheck size={16} />
                  Entrega en rango
                </button>
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/15"
                  onClick={() => router.push("/admin/auditoria")}
                  type="button"
                >
                  <History size={16} />
                  Auditoria
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <HeroStat label="Registros" value={filteredRecords.length.toLocaleString("es-CO")} />
              <HeroStat label="Alertas" tone={adminIssues.length ? "amber" : "green"} value={adminIssues.length.toLocaleString("es-CO")} />
              <HeroStat label="Cajas" value={totals.cajas.toLocaleString("es-CO")} />
              <HeroStat label="Refusal" tone={totals.refusal ? "red" : "green"} value={`${totals.refusal.toLocaleString("es-CO")}%`} />
            </div>
          </div>
          <div className="border-t border-white/10 bg-white/[0.04] px-5 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-white/58">
              <span className="rounded-md bg-white/10 px-2.5 py-1 text-white">Filtro {selectedDate || "Todas las fechas"}</span>
              <span>{selectedContractor === "Todas" ? "Todos los transportistas" : selectedContractor}</span>
              {dtSearch ? <span>DT contiene {dtSearch}</span> : null}
            </div>
          </div>
        </section>

        {error ? <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
        {loading ? <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Cargando panel...</div> : null}

        <div className="mb-5 grid gap-3 rounded-lg border border-slate-200 bg-white/92 p-3 shadow-[0_14px_36px_rgba(15,23,42,0.07)] backdrop-blur lg:grid-cols-[1fr_1fr_240px_auto] lg:items-end">
          <label className="min-w-[220px] flex-1 text-sm font-semibold text-[#10223d]">
            <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
              <CalendarDays size={16} />
              Filtrar por dia
            </span>
            <input
              className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
              onChange={(event) => setSelectedDate(event.target.value)}
              type="date"
              value={selectedDate}
            />
          </label>
          <label className="min-w-[220px] flex-1 text-sm font-semibold text-[#10223d]">
            <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
              <Search size={16} />
              Buscar por DT
            </span>
            <input
              className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
              inputMode="numeric"
              onChange={(event) => setDtSearch(event.target.value)}
              placeholder="Ej: 123456"
              type="search"
              value={dtSearch}
            />
          </label>
          <label className="min-w-[220px] flex-1 text-sm font-semibold text-[#10223d]">
            <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
              <Truck size={16} />
              Transportista
            </span>
            <select
              className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
              onChange={(event) => setSelectedContractor(event.target.value)}
              value={selectedContractor}
            >
              <option value="Todas">Todas</option>
              {visibleSummaries.map((summary) => (
                <option key={summary.contractor} value={summary.contractor}>
                  {summary.contractor}
                </option>
              ))}
            </select>
          </label>
          <button
            className="flex h-11 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!selectedDate && !dtSearch && selectedContractor === "Todas" && !activeIssueFilter}
            onClick={() => {
              setSelectedDate("");
              setDtSearch("");
              setSelectedContractor("Todas");
              setActiveIssueFilter("");
            }}
            type="button"
          >
            <X size={16} />
            Limpiar filtros
          </button>
        </div>

        <AdminTabs
          activeTab={activeTab}
          issueCount={adminIssues.length}
          onChange={setActiveTab}
          recordCount={filteredRecords.length}
        />

        {activeTab === "resumen" ? (
          <>
        <section className="mb-5 rounded-lg border border-slate-200 bg-white/92 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-md ${canEditResponsibleManual ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "bg-red-50 text-red-700 ring-1 ring-red-100"}`}>
                <ShieldAlert size={20} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Control admin</p>
                <p className="mt-1 text-sm font-semibold text-[#10223d]">Edicion manual de responsable</p>
                <p className="mt-1 text-sm text-slate-600">
                  Estado actual:{" "}
                  <span className={`font-semibold ${canEditResponsibleManual ? "text-[#0f7c58]" : "text-red-700"}`}>
                    {canEditResponsibleManual ? "Habilitado por admin" : "Bloqueado"}
                  </span>
                </p>
              </div>
            </div>
            <button
              className={`h-10 rounded-md px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                canEditResponsibleManual ? "bg-red-600 hover:bg-red-700" : "bg-[#0f7c58] hover:bg-[#0b684a]"
              }`}
              onClick={toggleResponsibleManualEdit}
              type="button"
            >
              {canEditResponsibleManual ? "Bloquear edicion manual" : "Habilitar con OK"}
            </button>
          </div>
        </section>

        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<Boxes size={21} />} label="Cajas totales" tone="blue" value={totals.cajas.toLocaleString("es-CO")} />
          <Metric icon={<PackageCheck size={21} />} label="Refusal final" tone="red" value={`${totals.refusalFinal.toLocaleString("es-CO")} cajas`} />
          <Metric icon={<Truck size={21} />} label="% refusal total" tone="amber" value={`${totals.refusal.toLocaleString("es-CO")}%`} />
          <Metric icon={<Users size={21} />} label="Clientes" tone="green" value={totals.clientes.toLocaleString("es-CO")} />
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          {visibleSummaries.map((summary) => (
            <button
              className={`group rounded-lg border bg-white/94 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(15,23,42,0.1)] ${
                selectedContractor === summary.contractor ? "border-[#f5bd19] ring-2 ring-[#f5bd19]/25" : "border-slate-200 hover:border-slate-300"
              }`}
              key={summary.contractor}
              onClick={() => setSelectedContractor(summary.contractor)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#10223d]">{summary.contractor}</p>
                  <p className="mt-2 text-3xl font-semibold leading-none text-[#0f7c58]">{summary.cajas.toLocaleString("es-CO")}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">cajas</p>
                </div>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600 transition group-hover:bg-white">{summary.rutas} rutas</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <span className="rounded-md bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700">
                  {summary.refusalFinal.toLocaleString("es-CO")} cajas refusal
                </span>
                <span className="rounded-md bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700">
                  {summary.refusal.toLocaleString("es-CO")}% final
                </span>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Clientes visitados</span>
                  <span>{summary.visitados}/{summary.clientes}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#0f7c58]" style={{ width: `${summary.clientes ? Math.min(100, (summary.visitados / summary.clientes) * 100) : 0}%` }} />
                </div>
              </div>
            </button>
          ))}
        </div>
          </>
        ) : null}

        {activeTab === "detalle" ? (
          <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Tabla operativa</p>
            <h2 className="mt-1 text-lg font-semibold text-[#10223d]">Seguimiento individual ({filteredRecords.length})</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-cyan-100 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-[#07556b]">
              {selectedContractor === "Todas" ? "Todos" : selectedContractor}
            </span>
            <button
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              onClick={() => setSelectedContractor("Todas")}
              type="button"
            >
              Ver todas
            </button>
          </div>
        </div>

        <section className="data-shell rounded-lg">
          <div className="max-h-[62vh] overflow-auto">
            <table className="data-table w-full min-w-[1240px]">
              <thead className="sticky top-0 z-10 text-[10px] uppercase tracking-[0.08em]">
                <tr>
                  <th className="w-44 px-3 py-2 text-left">Transportista</th>
                  <th className="px-3 py-2 text-left">DT</th>
                  <th className="px-3 py-2 text-left">Vehiculo</th>
                  <th className="px-3 py-2 text-left">Responsable</th>
                  <th className="px-3 py-2 text-center">Cajas</th>
                  <th className="px-3 py-2 text-center">Refusal final</th>
                  <th className="px-3 py-2 text-center">% Refusal</th>
                  <th className="px-3 py-2 text-center">Clientes</th>
                  <th className="px-3 py-2 text-center">Visitados</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-left">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((record, index) => {
                  const progress = getProgress(record);
                  const status = getStatus(progress, record);

                  return (
                    <tr
                      className="cursor-pointer text-xs"
                      key={`${record.transportista}-${record.transporte}-${record.recordId || index}`}
                      onClick={() => setSelectedRecord(record)}
                      tabIndex={0}
                    >
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className="rounded-md border border-slate-200 bg-white/80 px-2 py-1 font-semibold text-[#10223d]">{record.transportista || "-"}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold text-[#10223d]">DT {record.transporte}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold">{record.vehiculo}</td>
                      <td className="max-w-[190px] truncate px-3 py-2" title={record.responsable}>{record.responsable || "Sin responsable"}</td>
                      <td className="px-3 py-2 text-center font-semibold">{record.cajas}</td>
                      <td className="px-3 py-2 text-center font-semibold text-red-700">{record.cajasRefusalFinal || 0}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="number-pill">{record.refusal || 0}%</span>
                      </td>
                      <td className="px-3 py-2 text-center">{record.clientes}</td>
                      <td className="px-3 py-2">
                        <div className="mx-auto flex max-w-28 items-center gap-2">
                          <span className="w-10 text-right font-semibold text-[#10223d]">{record.visitados}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                            <div className="h-full rounded-full bg-[#0f7c58]" style={{ width: `${Math.min(100, progress)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <StatusChip status={status} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{record.fechaDespacho || record.fechaDt || record.date || "-"}</td>
                    </tr>
                  );
                })}
                {!filteredRecords.length ? (
                  <tr>
                    <td className="px-5 py-10 text-center text-sm text-slate-500" colSpan={11}>
                      No hay seguimiento para este filtro.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
          </>
        ) : null}

        {activeTab === "errores" ? (
          <AdminIssuesPanel
            activeIssueFilter={activeIssueFilter}
            issues={adminIssues}
            onClearIssueFilter={() => setActiveIssueFilter("")}
            onSelectRecord={setSelectedRecord}
          />
        ) : null}

        {activeTab === "exportar" ? (
          <section className="tech-card rounded-lg p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Exportar y revisar</p>
            <h2 className="mt-1 text-xl font-semibold text-[#10223d]">Salidas de informacion</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Usa los filtros actuales para abrir graficas o auditoria con el mismo contexto operativo.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                className="inline-flex h-11 items-center gap-2 rounded-md bg-[#0f7c58] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b684a]"
                onClick={goToAdminGraficas}
                type="button"
              >
                <BarChart3 size={16} />
                Abrir graficas filtradas
              </button>
              <button
                className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-[#10223d] shadow-sm transition hover:bg-slate-50"
                onClick={() => router.push("/admin/auditoria")}
                type="button"
              >
                <History size={16} />
                Ver auditoria
              </button>
            </div>
          </section>
        ) : null}
      </section>

      {selectedRecord ? (
        <VehiclePeopleModal
          onClose={() => setSelectedRecord(null)}
          people={selectedVehiclePeople}
          vehicle={selectedRecord}
        />
      ) : null}
    </main>
  );
}

function HeroStat({ label, tone = "blue", value }: { label: string; tone?: "amber" | "blue" | "green" | "red"; value: string }) {
  const styles = {
    amber: "bg-amber-400/14 text-amber-100 ring-amber-200/20",
    blue: "bg-white/10 text-white ring-white/10",
    green: "bg-emerald-400/14 text-emerald-100 ring-emerald-200/20",
    red: "bg-red-400/14 text-red-100 ring-red-200/20",
  };

  return (
    <div className={`rounded-lg px-3 py-3 ring-1 ${styles[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-none">{value}</p>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    "Cambio de fecha": "border-orange-100 bg-orange-50 text-orange-700",
    Cargando: "border-amber-100 bg-amber-50 text-amber-700",
    "En ruta": "border-emerald-100 bg-emerald-50 text-emerald-700",
    Finalizado: "border-green-100 bg-green-50 text-green-700",
    "Pendiente por salir": "border-slate-200 bg-slate-50 text-slate-600",
    Pernoctado: "border-violet-100 bg-violet-50 text-violet-700",
    Recargue: "border-sky-100 bg-sky-50 text-sky-700",
    Retornando: "border-indigo-100 bg-indigo-50 text-indigo-700",
  };

  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${styles[status] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
      {status}
    </span>
  );
}

function AdminTabs({
  activeTab,
  issueCount,
  onChange,
  recordCount,
}: {
  activeTab: AdminTab;
  issueCount: number;
  onChange: (tab: AdminTab) => void;
  recordCount: number;
}) {
  const tabs: Array<{ id: AdminTab; label: string; detail: string }> = [
    { id: "resumen", label: "Resumen", detail: "Totales y contratistas" },
    { id: "detalle", label: "Detalle", detail: `${recordCount} registros` },
    { id: "errores", label: "Errores", detail: `${issueCount} alertas` },
    { id: "exportar", label: "Exportar", detail: "Graficas y auditoria" },
  ];

  return (
    <div className="mb-5 grid gap-2 rounded-lg border border-slate-200 bg-white/92 p-2 shadow-sm backdrop-blur sm:grid-cols-4">
      {tabs.map((tab) => (
        <button
          className={`rounded-md px-3 py-2 text-left transition ${
            activeTab === tab.id ? "bg-[#10223d] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-[#10223d]"
          }`}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          type="button"
        >
          <span className="block text-sm font-semibold">{tab.label}</span>
          <span className={`mt-0.5 block text-[11px] ${activeTab === tab.id ? "text-white/70" : "text-slate-400"}`}>{tab.detail}</span>
        </button>
      ))}
    </div>
  );
}

type AdminIssue = {
  detail: string;
  kind: AdminIssueKind;
  record: Vehiculo;
  title: string;
  tone: "amber" | "red" | "slate";
};

function AdminIssuesPanel({
  activeIssueFilter,
  issues,
  onClearIssueFilter,
  onSelectRecord,
}: {
  activeIssueFilter: AdminIssueKind | "";
  issues: AdminIssue[];
  onClearIssueFilter: () => void;
  onSelectRecord: (record: Vehiculo) => void;
}) {
  return (
    <section className="data-shell rounded-lg">
      <div className="flex flex-col gap-3 border-b border-slate-200/70 bg-white/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Errores operativos</p>
          <h2 className="mt-1 text-lg font-semibold text-[#10223d]">{issues.length} alerta{issues.length === 1 ? "" : "s"} en el filtro actual</h2>
        </div>
        {activeIssueFilter ? (
          <button
            className="inline-flex h-9 items-center gap-2 self-start rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 sm:self-auto"
            onClick={onClearIssueFilter}
            type="button"
          >
            {issueLabel(activeIssueFilter)}
            <X size={15} />
          </button>
        ) : null}
      </div>
      {issues.length ? (
        <div className="divide-y divide-slate-100">
          {issues.map((issue, index) => (
            <button
              className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition hover:bg-cyan-50/50"
              key={`${issue.record.recordId || issue.record.transporte}-${issue.title}-${index}`}
              onClick={() => onSelectRecord(issue.record)}
              type="button"
            >
              <div>
                <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${issueToneClass(issue.tone)}`}>{issue.title}</span>
                <p className="mt-2 text-sm font-semibold text-[#10223d]">DT {issue.record.transporte || "-"} · {issue.record.vehiculo || "Sin vehiculo"}</p>
                <p className="mt-0.5 text-xs text-slate-500">{issue.detail}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-slate-400">{issue.record.transportista || "-"}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="px-4 py-10 text-center text-sm font-medium text-slate-500">No hay errores para este filtro.</div>
      )}
    </section>
  );
}

function issueToneClass(tone: AdminIssue["tone"]) {
  if (tone === "red") return "bg-red-50 text-red-700";
  if (tone === "amber") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function buildAdminIssues(records: Vehiculo[]): AdminIssue[] {
  return records.flatMap((record) => {
    const issues: AdminIssue[] = [];
    const responsible = String(record.responsable || record.nombreResponsable || "").trim();
    const date = getRecordDate(record);
    const salida = String(record.horaSalida || "").trim().toLowerCase();
    const progress = getProgress(record);
    const status = getStatus(progress, record);
    const rejectedBoxes = Math.max(Number(record.cajasRechazadas || 0), Number(record.cajasRefusalFinal || 0));
    const managedBoxes = Number(record.cajasGestionadas || 0);

    if (!responsible || ["-", "pendiente", "sin responsable"].includes(responsible.toLowerCase())) {
      issues.push({ detail: "El vehiculo no tiene responsable claro para auditoria y People.", kind: "sin-responsable", record, title: "Sin responsable", tone: "red" });
    }
    if (!record.cedulaResponsable?.trim() && !record.nombreResponsable?.trim()) {
      issues.push({ detail: "No se encontro asistencia asociada con cedula o nombre del responsable.", kind: "sin-asistencia", record, title: "Sin asistencia", tone: "amber" });
    }
    if (!date) {
      issues.push({ detail: "No se encontro fecha de despacho, fecha DT ni fecha de carga.", kind: "sin-fecha", record, title: "Sin fecha", tone: "red" });
    }
    if (!salida || salida === "-" || salida === "pendiente") {
      issues.push({ detail: "La ruta no tiene hora de salida registrada.", kind: "sin-salida", record, title: "Sin salida", tone: "amber" });
    }
    if (record.causalSalidaTardia || isLateDepartureTime(record.horaSalida)) {
      issues.push({ detail: "La ruta registra salida tardia o una causal asociada.", kind: "salida-tardia", record, title: "Salida tardia", tone: "amber" });
    }
    if (!["Finalizado", "Pernoctado", "Cambio de fecha"].includes(status) && progress < 50) {
      issues.push({ detail: `La ruta esta en ${progress}% de avance y continua activa.`, kind: "bajo-avance", record, title: "Bajo avance", tone: "amber" });
    }
    if (rejectedBoxes > managedBoxes) {
      issues.push({ detail: "Tiene cajas rechazadas pendientes de gestion completa.", kind: "modulacion-pendiente", record, title: "Modulacion pendiente", tone: "amber" });
    }

    return issues;
  });
}

function issueLabel(kind: AdminIssueKind) {
  const labels: Record<AdminIssueKind, string> = {
    "bajo-avance": "Bajo avance",
    "modulacion-pendiente": "Modulacion pendiente",
    "salida-tardia": "Salida tardia",
    "sin-asistencia": "Sin asistencia",
    "sin-fecha": "Sin fecha",
    "sin-responsable": "Sin responsable",
    "sin-salida": "Sin salida",
  };

  return labels[kind];
}

function isAdminTab(value: string | null): value is AdminTab {
  return value === "resumen" || value === "detalle" || value === "errores" || value === "exportar";
}

function isAdminIssueKind(value: string | null): value is AdminIssueKind {
  return (
    value === "sin-responsable" ||
    value === "sin-asistencia" ||
    value === "salida-tardia" ||
    value === "bajo-avance" ||
    value === "modulacion-pendiente" ||
    value === "sin-fecha" ||
    value === "sin-salida"
  );
}

function getRecordDate(record: Vehiculo) {
  const rawDate = record.fechaDespacho || record.fechaDt || record.date || record.createdAt;
  if (!rawDate) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) return rawDate.slice(0, 10);

  const match = rawDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const [, day, month, year] = match;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function Metric({ icon, label, tone = "blue", value }: { icon: ReactNode; label: string; tone?: "amber" | "blue" | "green" | "red"; value: string }) {
  const styles = {
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    blue: "bg-[#e9f3ff] text-[#10223d] ring-blue-100",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    red: "bg-red-50 text-red-700 ring-red-100",
  };

  return (
    <div className="tech-card rounded-lg p-4 transition hover:-translate-y-0.5">
      <div className={`mb-3 inline-grid h-10 w-10 place-items-center rounded-md ring-1 ${styles[tone]}`}>{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold leading-none text-[#10223d]">{value}</p>
    </div>
  );
}

function VehiclePeopleModal({ vehicle, people, onClose }: { vehicle: Vehiculo; people: VehiclePerson[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#10223d]/45 px-4 py-6 backdrop-blur-sm">
      <section className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-lg border border-white/70 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.26)]">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c3aed]">Tripulacion</p>
            <h2 className="mt-1 text-xl font-semibold text-[#10223d]">DT {vehicle.transporte || "-"} · {vehicle.vehiculo || "Sin vehiculo"}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {vehicle.transportista || "-"} · {vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || "Sin fecha"} · {vehicle.status || "Sin estado"}
            </p>
          </div>
          <button className="grid h-10 w-10 place-items-center rounded-md text-slate-500 transition hover:bg-white hover:text-[#10223d]" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </header>

        <div className="max-h-[calc(90vh-92px)] overflow-auto px-4 py-4">
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <RouteStat label="Cajas" value={vehicle.cajas || 0} />
            <RouteStat label="Clientes" value={`${vehicle.visitados || 0}/${vehicle.clientes || 0}`} />
            <RouteStat label="Refusal" value={`${vehicle.refusal || 0}%`} />
          </div>

          {vehicle.causalSalidaTardia || vehicle.comentarioSalidaTardia ? (
            <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="mb-3 flex items-center gap-2 text-amber-900">
                <ShieldAlert size={18} />
                <h3 className="text-sm font-semibold">Salida despues de 7:00</h3>
              </div>
              <div className="grid gap-3 md:grid-cols-[220px_1fr]">
                <RouteStat label="Causal" value={vehicle.causalSalidaTardia || "Sin causal"} />
                <div className="rounded-lg border border-amber-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Comentario</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-5 text-[#10223d]">
                    {vehicle.comentarioSalidaTardia || "Sin comentario"}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Personas en el carro</h3>
          {people.length ? (
            <div className="grid gap-3 lg:grid-cols-3">
              {people.map((person) => (
                <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm" key={`${person.role}-${person.contratista}-${person.cc}-${person.nombre}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="rounded-md bg-[#f5f3ff] px-2 py-1 text-xs font-semibold text-[#5b21b6]">{person.role}</span>
                      <h4 className="mt-2 truncate text-sm font-semibold text-[#10223d]" title={person.nombre || "Sin nombre"}>
                        {person.nombre || "Sin nombre"}
                      </h4>
                      <p className="truncate text-xs text-slate-500" title={`CC ${person.cc || "Sin cedula"} · ${person.cargo || "Sin cargo"}`}>
                        CC {person.cc || "Sin cedula"} · {person.cargo || "Sin cargo"}
                      </p>
                    </div>
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#10223d] to-[#7c3aed] text-xs font-semibold text-white">
                      {initials(person.nombre)}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-1.5 text-center sm:grid-cols-4">
                    <SmallStat label="HL" value={formatHl(hlMoved(person))} />
                    <SmallStat label="En rango" value={person.stats.enRango || 0} />
                    <SmallStat label="Rutas" value={person.stats.rutas} />
                    <SmallStat label="% rango" value={formatPercent(person.stats.porcentajeRango)} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
              No se encontraron personas cruzadas por cedula o nombre para este carro.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function RouteStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-2">
      <p className="text-sm font-semibold text-[#10223d]">{value}</p>
      <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">{label}</p>
    </div>
  );
}

function hlMoved(person: PersonSummary) {
  return Number(person.stats.hectolitros || 0);
}

function formatHl(value: number) {
  return Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 1 });
}

function formatPercent(value: number | undefined) {
  return `${Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })}%`;
}

function getVehiclePeople(vehicle: Vehiculo, people: PersonSummary[]): VehiclePerson[] {
  const candidates = [
    { role: "Responsable", cc: vehicle.cedulaResponsable, name: vehicle.nombreResponsable || vehicle.responsable },
    { role: "Auxiliar 1", cc: vehicle.cedulaAuxiliar1, name: vehicle.nombreAuxiliar1 },
    { role: "Auxiliar 2", cc: vehicle.cedulaAuxiliar2, name: vehicle.nombreAuxiliar2 },
  ].filter((candidate) => candidate.cc || candidate.name);

  const used = new Set<string>();

  return candidates
    .map((candidate) => {
      const person = findPersonForCandidate(candidate, vehicle.transportista, people);
      const fallback = person || createFallbackPerson(candidate, vehicle);
      const key = `${normalizeId(fallback.cc)}:${normalizeText(fallback.nombre)}:${candidate.role}`;
      if (used.has(key)) return null;
      used.add(key);
      return { ...fallback, role: candidate.role };
    })
    .filter(Boolean) as VehiclePerson[];
}

function findPersonForCandidate(candidate: { cc?: string; name?: string }, contractor: string, people: PersonSummary[]) {
  const targetCc = normalizeId(candidate.cc);
  const targetName = normalizeText(candidate.name || "");
  const targetContractor = normalizeText(contractor);

  return people.find((person) => {
    if (normalizeText(person.contratista) !== targetContractor) return false;
    if (targetCc && normalizeId(person.cc) === targetCc) return true;
    const personName = normalizeText(person.nombre);
    return Boolean(targetName && personName && (personName.includes(targetName) || targetName.includes(personName)));
  });
}

function createFallbackPerson(candidate: { cc?: string; name?: string }, vehicle: Vehiculo): PersonSummary {
  return {
    cc: String(candidate.cc || ""),
    nombre: String(candidate.name || "Sin nombre"),
    cargo: "Tripulacion",
    contratista: vehicle.transportista || "",
    stats: {
      rutas: 1,
      modulaciones: 0,
      reubicaciones: 0,
      hectolitros: vehicle.hl || 0,
      visitasRango: 0,
      enRango: 0,
      fueraRango: 0,
      porcentajeRango: 0,
      tiempoPromedioRuta: vehicle.tiempoRuta || "Sin dato",
      ultimoDt: vehicle.transporte || "",
    },
    history: [
      {
        type: "Ruta",
        date: vehicle.fechaDespacho || vehicle.fechaDt || vehicle.date || "",
        title: `DT ${vehicle.transporte || "-"}`,
        detail: `${vehicle.vehiculo || "Sin vehiculo"} · ${vehicle.status || "Sin estado"} · ${vehicle.tiempoRuta || "Sin tiempo"}`,
      },
    ],
  };
}

function normalizeId(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeDt(value: unknown) {
  return String(value || "")
    .replace(/^DT-?/i, "")
    .replace(/\D/g, "");
}

function readNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = String(value ?? "").trim();
  if (!text) return 0;

  const normalized = normalizeNumberText(text);
  const parsed = Number(normalized.replace(/[^\d.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeNumberText(value: string) {
  const clean = value.replace(/\s/g, "");
  if (clean.includes(",") && clean.includes(".")) return clean.replace(/\./g, "").replace(",", ".");
  if (/^-?\d{1,3}(\.\d{3})+$/.test(clean)) return clean.replace(/\./g, "");
  return clean.replace(",", ".");
}

function normalizeText(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function initials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "P"
  );
}
