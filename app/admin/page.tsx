"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Boxes, CalendarDays, History, PackageCheck, Search, ShieldAlert, Truck, Users, X } from "lucide-react";
import type { Vehiculo } from "../seguimiento/types";
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

type AdminRefusalComRow = {
  contractor: string;
  com: string;
  date: string;
  dt: string;
  reportadas: number;
  gestionadas: number;
  refusalFinal: number;
};

type RefusalComSummary = {
  contractor: string;
  com: string;
  reportadas: number;
  gestionadas: number;
  refusalFinal: number;
  registros: number;
  refusal: number;
};

export default function AdminPage() {
  const router = useRouter();
  const canEditResponsibleManual = useStorageSnapshot<boolean>(
    [MANUAL_RESPONSABLE_EDIT_ENABLED_KEY],
    isManualResponsibleEditEnabled,
    false,
  );
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [records, setRecords] = useState<Vehiculo[]>([]);
  const [refusalComRows, setRefusalComRows] = useState<AdminRefusalComRow[]>([]);
  const [peopleGroups, setPeopleGroups] = useState<PeopleGroup[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<Vehiculo | null>(null);
  const [selectedContractor, setSelectedContractor] = useState("Todas");
  const [selectedDate, setSelectedDate] = useState("");
  const [dtSearch, setDtSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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
        setRefusalComRows(adminBody.refusalByComRows || []);

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
      const cajas = contractorRecords.reduce((total, record) => total + Number(record.cajas || 0), 0);
      const refusalFinal = contractorRecords.reduce((total, record) => total + Number(record.cajasRefusalFinal || 0), 0);

      return {
        contractor: summary.contractor,
        rutas: contractorRecords.length,
        cajas,
        clientes: contractorRecords.reduce((total, record) => total + Number(record.clientes || 0), 0),
        visitados: contractorRecords.reduce((total, record) => total + Number(record.visitados || 0), 0),
        rechazadas: contractorRecords.reduce((total, record) => total + Number(record.cajasRechazadas || 0), 0),
        gestionadas: contractorRecords.reduce((total, record) => total + Number(record.cajasGestionadas || 0), 0),
        refusalFinal,
        refusal: cajas ? Number(((refusalFinal / cajas) * 100).toFixed(2)) : 0,
      };
    });
  }, [dateRecords, summaries]);

  const totals = useMemo(() => {
    const values = dateRecords.reduce(
      (acc, record) => ({
        cajas: acc.cajas + Number(record.cajas || 0),
        clientes: acc.clientes + Number(record.clientes || 0),
        refusalFinal: acc.refusalFinal + Number(record.cajasRefusalFinal || 0),
      }),
      { cajas: 0, clientes: 0, refusalFinal: 0 },
    );

    return {
      ...values,
      refusal: values.cajas ? Number(((values.refusalFinal / values.cajas) * 100).toFixed(2)) : 0,
    };
  }, [dateRecords]);

  const filteredRecords = useMemo(() => {
    if (selectedContractor === "Todas") return dateRecords;
    return dateRecords.filter((record) => record.transportista === selectedContractor);
  }, [dateRecords, selectedContractor]);
  const refusalComSummaries = useMemo(() => {
    const targetDt = normalizeDt(dtSearch);
    const source = refusalComRows.filter((row) => {
      const matchesDate = !selectedDate || row.date === selectedDate;
      const matchesDt = !targetDt || normalizeDt(row.dt).includes(targetDt);
      return matchesDate && matchesDt;
    });
    const groups = new Map<string, RefusalComSummary>();

    source.forEach((row) => {
      const key = `${row.contractor}:${row.com}`;
      const current = groups.get(key) || {
        contractor: row.contractor,
        com: row.com || "Sin asignacion",
        reportadas: 0,
        gestionadas: 0,
        refusalFinal: 0,
        registros: 0,
        refusal: 0,
      };

      current.reportadas += Number(row.reportadas || 0);
      current.gestionadas += Number(row.gestionadas || 0);
      current.refusalFinal += Number(row.refusalFinal || 0);
      current.registros += 1;
      current.refusal = current.reportadas ? Number(((current.refusalFinal / current.reportadas) * 100).toFixed(2)) : 0;
      groups.set(key, current);
    });

    return Array.from(groups.values()).sort((a, b) => b.refusalFinal - a.refusalFinal);
  }, [dtSearch, refusalComRows, selectedDate]);
  const refusalComTotals = useMemo(() => {
    const values = refusalComSummaries.reduce(
      (acc, row) => ({
        reportadas: acc.reportadas + row.reportadas,
        gestionadas: acc.gestionadas + row.gestionadas,
        refusalFinal: acc.refusalFinal + row.refusalFinal,
        registros: acc.registros + row.registros,
      }),
      { reportadas: 0, gestionadas: 0, refusalFinal: 0, registros: 0 },
    );

    return {
      ...values,
      refusal: values.reportadas ? Number(((values.refusalFinal / values.reportadas) * 100).toFixed(2)) : 0,
    };
  }, [refusalComSummaries]);
  const allPeople = useMemo(() => peopleGroups.flatMap((group) => group.people), [peopleGroups]);
  const selectedVehiclePeople = useMemo(() => (selectedRecord ? getVehiclePeople(selectedRecord, allPeople) : []), [allPeople, selectedRecord]);

  function toggleResponsibleManualEdit() {
    const nextValue = !canEditResponsibleManual;
    const confirmationText = nextValue
      ? "Confirmas habilitar la edicion manual de Responsable en el detalle del vehiculo?"
      : "Confirmas bloquear la edicion manual de Responsable en el detalle del vehiculo?";
    if (!window.confirm(confirmationText)) return;
    setManualResponsibleEditEnabled(nextValue);
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <button
            className="flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[#10223d] transition hover:bg-slate-100"
            onClick={() => router.push("/")}
            type="button"
          >
            <ArrowLeft size={18} />
            Portal
          </button>
          <span className="rounded-md bg-[#10223d] px-3 py-2 text-sm font-semibold text-white">Administrador</span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-10">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Vista global</p>
          <h1 className="mt-2 text-3xl font-semibold text-[#10223d]">Seguimiento de transportistas</h1>
          <p className="mt-2 text-sm text-slate-500">Total general e información individual de Logisticos, Punto Corona y Surti Cervezas.</p>
        </div>

        {error ? <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
        {loading ? <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">Cargando panel...</div> : null}

        <div className="mb-5 flex justify-end">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-[#10223d] shadow-sm transition hover:bg-slate-50"
            onClick={() => router.push("/admin/auditoria")}
            type="button"
          >
            <History size={16} />
            Ver auditoria
          </button>
        </div>

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <label className="min-w-[220px] flex-1 text-sm font-semibold text-[#10223d]">
            <span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
              <CalendarDays size={16} />
              Filtrar por día
            </span>
            <input
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
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
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
              inputMode="numeric"
              onChange={(event) => setDtSearch(event.target.value)}
              placeholder="Ej: 123456"
              type="search"
              value={dtSearch}
            />
          </label>
          <button
            className="flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!selectedDate && !dtSearch && selectedContractor === "Todas"}
            onClick={() => {
              setSelectedDate("");
              setDtSearch("");
              setSelectedContractor("Todas");
            }}
            type="button"
          >
            <X size={16} />
            Limpiar filtros
          </button>
        </div>

        <section className="mb-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Control admin</p>
              <p className="mt-1 text-sm font-semibold text-[#10223d]">Edicion manual de responsable (detalle de vehiculo)</p>
            </div>
            <button
              className={`h-10 rounded-md px-4 text-sm font-semibold text-white transition ${
                canEditResponsibleManual ? "bg-red-600 hover:bg-red-700" : "bg-[#0f7c58] hover:bg-[#0b684a]"
              }`}
              onClick={toggleResponsibleManualEdit}
              type="button"
            >
              {canEditResponsibleManual ? "Bloquear edicion manual" : "Habilitar con OK"}
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Estado actual:{" "}
            <span className={`font-semibold ${canEditResponsibleManual ? "text-[#0f7c58]" : "text-red-700"}`}>
              {canEditResponsibleManual ? "Habilitado por admin" : "Bloqueado"}
            </span>
          </p>
        </section>

        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<Boxes size={21} />} label="Cajas totales" value={totals.cajas.toLocaleString("es-CO")} />
          <Metric icon={<PackageCheck size={21} />} label="Refusal final" value={`${totals.refusalFinal.toLocaleString("es-CO")} cajas`} />
          <Metric icon={<Truck size={21} />} label="% refusal total" value={`${totals.refusal.toLocaleString("es-CO")}%`} />
          <Metric icon={<Users size={21} />} label="Clientes" value={totals.clientes.toLocaleString("es-CO")} />
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          {visibleSummaries.map((summary) => (
            <button
              className={`rounded-lg border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 ${
                selectedContractor === summary.contractor ? "border-[#f5bd19] ring-2 ring-[#f5bd19]/25" : "border-slate-200"
              }`}
              key={summary.contractor}
              onClick={() => setSelectedContractor(summary.contractor)}
              type="button"
            >
              <p className="text-sm font-semibold text-[#10223d]">{summary.contractor}</p>
              <p className="mt-2 text-2xl font-semibold text-[#0f7c58]">{summary.cajas.toLocaleString("es-CO")}</p>
              <p className="mt-2 text-xs font-semibold text-red-700">
                Refusal: {summary.refusalFinal.toLocaleString("es-CO")} cajas - {summary.refusal.toLocaleString("es-CO")}%
              </p>
              <p className="mt-1 text-xs text-slate-500">cajas · {summary.rutas} rutas · {summary.visitados}/{summary.clientes} clientes</p>
            </button>
          ))}
        </div>

        <section className="mb-5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-red-50 text-red-700">
                <ShieldAlert size={19} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Graficas admin</p>
                <h2 className="text-lg font-semibold text-[#10223d]">Refusal por COM - tres contratistas</h2>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <MiniMetric label="% refusal" value={`${refusalComTotals.refusal.toLocaleString("es-CO")}%`} tone="green" />
              <MiniMetric label="Reportadas" value={refusalComTotals.reportadas.toLocaleString("es-CO")} />
              <MiniMetric label="Gestionadas" value={refusalComTotals.gestionadas.toLocaleString("es-CO")} />
              <MiniMetric label="Final" value={refusalComTotals.refusalFinal.toLocaleString("es-CO")} tone="red" />
            </div>
          </div>

          <div className="grid gap-4 p-4 lg:grid-cols-[1.1fr_1.4fr]">
            <AdminChartPanel icon={<BarChart3 size={16} />} title="Top COM por cajas refusal final">
              <RefusalComBars data={refusalComSummaries.slice(0, 10)} />
            </AdminChartPanel>

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="border-b border-slate-200 bg-white px-3 py-2">
                <h3 className="text-sm font-semibold text-[#10223d]">Detalle por contratista y COM</h3>
              </div>
              <div className="max-h-80 overflow-auto">
                <table className="w-full min-w-[680px]">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Contratista</th>
                      <th className="px-3 py-2 text-left">COM</th>
                      <th className="px-3 py-2 text-right">Reportadas</th>
                      <th className="px-3 py-2 text-right">Gestionadas</th>
                      <th className="px-3 py-2 text-right">Refusal final</th>
                      <th className="px-3 py-2 text-right">% Refusal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {refusalComSummaries.length ? (
                      refusalComSummaries.map((row) => (
                        <tr key={`${row.contractor}-${row.com}`} className="hover:bg-red-50/45">
                          <td className="whitespace-nowrap px-3 py-2 font-semibold text-[#10223d]">{row.contractor}</td>
                          <td className="px-3 py-2 font-semibold text-slate-700">{row.com}</td>
                          <td className="px-3 py-2 text-right">{row.reportadas.toLocaleString("es-CO")}</td>
                          <td className="px-3 py-2 text-right text-emerald-700">{row.gestionadas.toLocaleString("es-CO")}</td>
                          <td className="px-3 py-2 text-right font-semibold text-red-700">{row.refusalFinal.toLocaleString("es-CO")}</td>
                          <td className="px-3 py-2 text-right font-semibold">{row.refusal.toLocaleString("es-CO")}%</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={6}>
                          No hay refusal por COM para este filtro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#10223d]">Seguimiento individual ({filteredRecords.length})</h2>
          <button
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            onClick={() => setSelectedContractor("Todas")}
            type="button"
          >
            Ver todas
          </button>
        </div>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[62vh] overflow-auto">
            <table className="w-full min-w-[1120px]">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] uppercase tracking-[0.08em] text-slate-500 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                <tr>
                  <th className="px-3 py-2 text-left">Transportista</th>
                  <th className="px-3 py-2 text-left">DT</th>
                  <th className="px-3 py-2 text-left">Vehículo</th>
                  <th className="px-3 py-2 text-left">Responsable</th>
                  <th className="px-3 py-2 text-center">Cajas</th>
                  <th className="px-3 py-2 text-center">Refusal final</th>
                  <th className="px-3 py-2 text-center">% Refusal</th>
                  <th className="px-3 py-2 text-center">Clientes</th>
                  <th className="px-3 py-2 text-center">Visitados</th>
                  <th className="px-3 py-2 text-left">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((record, index) => (
                  <tr
                    className="cursor-pointer text-xs transition hover:bg-[#f5f3ff]"
                    key={`${record.transportista}-${record.transporte}-${record.recordId || index}`}
                    onClick={() => setSelectedRecord(record)}
                    tabIndex={0}
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-[#10223d]">{record.transportista}</td>
                    <td className="whitespace-nowrap px-3 py-2">DT {record.transporte}</td>
                    <td className="whitespace-nowrap px-3 py-2">{record.vehiculo}</td>
                    <td className="max-w-[190px] truncate px-3 py-2" title={record.responsable}>{record.responsable}</td>
                    <td className="px-3 py-2 text-center font-semibold">{record.cajas}</td>
                    <td className="px-3 py-2 text-center font-semibold text-red-700">{record.cajasRefusalFinal || 0}</td>
                    <td className="px-3 py-2 text-center">{record.refusal || 0}%</td>
                    <td className="px-3 py-2 text-center">{record.clientes}</td>
                    <td className="px-3 py-2 text-center">{record.visitados}</td>
                    <td className="whitespace-nowrap px-3 py-2">{record.fechaDespacho || record.fechaDt || record.date || "-"}</td>
                  </tr>
                ))}
                {!filteredRecords.length ? (
                  <tr>
                    <td className="px-5 py-10 text-center text-sm text-slate-500" colSpan={10}>
                      No hay seguimiento para este filtro.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
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

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 inline-grid h-10 w-10 place-items-center rounded-md bg-[#e9f3ff] text-[#10223d]">{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "green" | "red" }) {
  const toneClass = {
    slate: "text-[#10223d]",
    green: "text-[#0f7c58]",
    red: "text-red-700",
  }[tone];

  return (
    <div className="min-w-28 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function AdminChartPanel({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 text-[#10223d]">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-[#10223d] text-white">{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function RefusalComBars({ data }: { data: RefusalComSummary[] }) {
  const max = Math.max(...data.map((item) => item.refusalFinal), 1);
  if (!data.length) {
    return (
      <div className="grid min-h-52 place-items-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-sm text-slate-500">
        Sin datos de refusal por COM para mostrar.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((item, index) => (
        <div className="grid grid-cols-[132px_1fr_56px] items-center gap-2" key={`${item.contractor}-${item.com}`}>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[#10223d]" title={item.com}>{item.com}</p>
            <p className="truncate text-[10px] text-slate-500" title={item.contractor}>{item.contractor}</p>
          </div>
          <div className="h-6 overflow-hidden rounded-sm bg-slate-100">
            <div
              className={index === 0 ? "h-6 rounded-sm bg-gradient-to-r from-red-600 to-orange-400" : "h-6 rounded-sm bg-red-500/65"}
              style={{ width: `${Math.max(7, (item.refusalFinal / max) * 100)}%` }}
            />
          </div>
          <span className="text-right text-xs font-bold text-red-700">{item.refusalFinal.toLocaleString("es-CO")}</span>
        </div>
      ))}
    </div>
  );
}

function VehiclePeopleModal({ vehicle, people, onClose }: { vehicle: Vehiculo; people: VehiclePerson[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#10223d]/45 px-4 py-6 backdrop-blur-sm">
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
                    <SmallStat label="Rutas" value={person.stats.rutas} />
                    <SmallStat label="Mod" value={person.stats.modulaciones} />
                    <SmallStat label="Reub" value={person.stats.reubicaciones} />
                    <SmallStat label="Tiempo" value={person.stats.tiempoPromedioRuta || "Sin dato"} />
                  </div>

                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Modulaciones / reubicaciones</p>
                    {person.history.filter((item) => item.type !== "Ruta").length ? (
                      person.history.filter((item) => item.type !== "Ruta").slice(0, 2).map((item, index) => (
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2" key={`${item.type}-${item.title}-${index}`}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-semibold text-[#10223d]" title={item.title}>{item.title}</p>
                            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-500">{item.type}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{item.date || "Sin fecha"}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-600" title={item.detail}>{item.detail}</p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-500">Sin modulaciones o reubicaciones.</p>
                    )}
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
