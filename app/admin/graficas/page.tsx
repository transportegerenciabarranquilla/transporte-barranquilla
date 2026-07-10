"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, CalendarDays, MessageSquareText, Search, ShieldAlert, Table2, X } from "lucide-react";
import type { Vehiculo } from "../../seguimiento/types";
import { ChartPanel, Metric, MiniStat, RefusalCausePreventistaBars, RefusalComBars, TopRefusalClientsTable } from "./components";
import type { AdminRefusalComRow } from "./types";
import {
  buildFilteredHref,
  buildGraphTotals,
  buildLateComments,
  buildRefusalByCom,
  buildRefusalByJefeVentas,
  buildRefusalCauseByPreventista,
  buildTopRefusalClients,
  filterRecords,
  filterRefusalRows,
  getActiveDateRange,
  getContractors,
  getInitialGraphFilters,
  normalizeDateRange,
  toDateKey,
} from "./utils";

export default function AdminGraficasPage() {
  const router = useRouter();
  const today = toDateKey(new Date());
  const [initialFilters] = useState(() => getInitialGraphFilters(today));
  const [records, setRecords] = useState<Vehiculo[]>([]);
  const [refusalRows, setRefusalRows] = useState<AdminRefusalComRow[]>([]);
  const [contractor, setContractor] = useState(initialFilters.contractor);
  const [dateRange, setDateRange] = useState(initialFilters.dateRange);
  const [dtSearch, setDtSearch] = useState(initialFilters.dtSearch);
  const [autoDateRange, setAutoDateRange] = useState(initialFilters.autoDateRange);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/seguimiento", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudo cargar graficas admin.");
        setRecords(body.records || []);
        setRefusalRows(body.refusalByComRows || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar graficas admin."))
      .finally(() => setLoading(false));
  }, []);

  const contractors = useMemo(() => getContractors(records), [records]);

  const activeDateRange = useMemo(() => getActiveDateRange(autoDateRange, records, dateRange), [autoDateRange, dateRange, records]);

  const visibleRecords = useMemo(() => filterRecords(records, activeDateRange, contractor, dtSearch), [activeDateRange, contractor, dtSearch, records]);

  const visibleRefusalRows = useMemo(
    () => filterRefusalRows(refusalRows, activeDateRange, contractor, dtSearch),
    [activeDateRange, contractor, dtSearch, refusalRows],
  );

  const refusalByCom = useMemo(() => buildRefusalByCom(visibleRefusalRows), [visibleRefusalRows]);

  const refusalByJefeVentas = useMemo(() => buildRefusalByJefeVentas(visibleRefusalRows), [visibleRefusalRows]);

  const refusalCauseByPreventista = useMemo(() => buildRefusalCauseByPreventista(visibleRefusalRows), [visibleRefusalRows]);

  const topRefusalClients = useMemo(() => buildTopRefusalClients(visibleRefusalRows), [visibleRefusalRows]);

  const lateComments = useMemo(() => buildLateComments(visibleRecords), [visibleRecords]);

  const totals = useMemo(
    () => buildGraphTotals(visibleRecords, visibleRefusalRows, refusalCauseByPreventista, lateComments),
    [lateComments, refusalCauseByPreventista, visibleRecords, visibleRefusalRows],
  );

  function updateDateRange(nextValue: { from: string; to: string }) {
    setAutoDateRange(false);
    setDateRange(normalizeDateRange(nextValue.from, nextValue.to));
  }

  function clearFilters() {
    setContractor("Todas");
    setAutoDateRange(false);
    setDateRange({ from: today, to: today });
    setDtSearch("");
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              aria-label="Volver a admin"
              className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] transition hover:bg-slate-100"
              onClick={() => router.push("/admin")}
              type="button"
            >
              <ArrowLeft size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Graficas admin</p>
              <h1 className="text-2xl font-semibold text-[#10223d]">Refusal por preventista</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
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
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
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
          <div className="mt-3 flex flex-wrap gap-2">
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
          </div>
        </section>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<ShieldAlert size={20} />} label="% refusal" value={`${totals.refusal.toLocaleString("es-CO")}%`} tone="red" />
          <Metric icon={<BarChart3 size={20} />} label="Cajas refusal final" value={totals.refusalFinal.toLocaleString("es-CO")} tone="red" />
          <Metric icon={<MessageSquareText size={20} />} label="Causales" value={totals.causales.toLocaleString("es-CO")} tone="amber" />
          <Metric icon={<Table2 size={20} />} label="Rutas filtradas" value={totals.rutas.toLocaleString("es-CO")} tone="blue" />
        </div>

        <div className="mb-4 grid gap-3 xl:grid-cols-3">
          <ChartPanel icon={<BarChart3 size={16} />} title="Refusal por preventista">
            <RefusalComBars data={refusalByCom.slice(0, 8)} emptyText="Sin datos de refusal por preventista para este filtro." />
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
          <MiniStat label="Gestionadas" value={totals.gestionadas.toLocaleString("es-CO")} tone="green" />
          <MiniStat label="Cajas refusal final" value={totals.refusalFinal.toLocaleString("es-CO")} tone="red" />
        </div>

        <TopRefusalClientsTable data={topRefusalClients.slice(0, 20)} />

      </section>
    </main>
  );
}
