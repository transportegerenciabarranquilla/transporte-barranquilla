"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Table2, Upload } from "lucide-react";
import { matchRoutePerformance, parseRoutePerformanceRows, type PerformanceVehicle, type RoutePerformanceRow } from "../../lib/routePerformanceImport";
import RoutePerformanceCharts from "./RoutePerformanceCharts";
import RoutePerformanceTable from "./RoutePerformanceTable";

const PAGE_SIZE = 50;

export default function DiferenciaKilometros({ records, recordsLoading = false, recordsError = "" }: { records: PerformanceVehicle[]; recordsLoading?: boolean; recordsError?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RoutePerformanceRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const matchedRows = useMemo(() => matchRoutePerformance(rows, records), [rows, records]);
  const dateBounds = useMemo(() => {
    if (!rows.length) return { min: "", max: "" };
    return rows.reduce((bounds, row) => ({
      min: row.date < bounds.min ? row.date : bounds.min,
      max: row.date > bounds.max ? row.date : bounds.max,
    }), { min: rows[0].date, max: rows[0].date });
  }, [rows]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return matchedRows.filter((row) => (!dateFrom || row.date >= dateFrom) && (!dateTo || row.date <= dateTo) && (matchFilter === "all" || row.match === matchFilter) && [row.plate, row.originalPlate, row.matchedPlate, row.rr, row.driver, row.contractor, row.date, row.dt].join(" ").toLocaleLowerCase("es").includes(query));
  }, [matchedRows, search, matchFilter, dateFrom, dateTo]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const matchedCount = filtered.filter((row) => row.match === "matched").length;

  async function uploadExcel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setLoading(true);
    try {
      if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("Selecciona un archivo Excel .xlsx o .xls.");
      if (file.size > 10 * 1024 * 1024) throw new Error("El archivo debe pesar como máximo 10 MB.");
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("El archivo no contiene una hoja para leer.");
      const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: true });
      setRows(parseRoutePerformanceRows(data));
      setFileName(file.name);
      setPage(0);
      setSearch("");
      setMatchFilter("all");
      setDateFrom("");
      setDateTo("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo leer el Excel.");
    } finally {
      setLoading(false);
    }
  }

  return <section aria-label="Kilómetros y entrega en rango del Excel" className="mb-5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-[#10223d]"><Table2 size={18} /> Kilómetros y entrega en rango por RR y conductor</h2>
      <div className="flex items-center gap-2">
        <input aria-label="Archivo Excel de viajes" className="sr-only" ref={inputRef} type="file" accept=".xlsx,.xls" disabled={loading} onChange={uploadExcel} />
        <button className="flex items-center gap-2 rounded-md bg-[#10223d] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={loading} onClick={() => inputRef.current?.click()} type="button"><Upload size={15} /> {loading ? "Leyendo Excel…" : "Subir Excel"}</button>
        {rows.length > 0 && <button className="rounded-md border px-3 py-2 text-xs text-slate-600 disabled:opacity-50" disabled={loading} onClick={() => { setRows([]); setFileName(""); setError(""); setPage(0); setSearch(""); setMatchFilter("all"); setDateFrom(""); setDateTo(""); }} type="button">Limpiar</button>}
      </div>
    </header>
    <div className="space-y-4 p-4">
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}{rows.length ? " Se conserva el archivo anterior." : ""}</p>}
      {recordsError && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800" role="alert">No se pudo cargar Seguimiento. El cruce de RR y conductor no está disponible: {recordsError}</p>}
      <p className="text-xs font-semibold text-slate-600" role="status" aria-live="polite">{loading ? "Procesando Excel…" : fileName ? `${fileName} · ${rows.length} viajes cargados` : "Selecciona el Excel para ver la tabla y las gráficas."}{recordsLoading ? " Cargando Seguimiento para cruzar las placas…" : ""}</p>
      {rows.length > 0 && <>
        <div className="grid gap-3 sm:grid-cols-3">
          {[{ label: "Viajes seleccionados", value: filtered.length, tone: "border-slate-200 bg-slate-50 text-[#10223d]" }, { label: "Con coincidencia", value: recordsLoading || recordsError ? "Pendiente" : matchedCount, tone: "border-emerald-200 bg-emerald-50/60 text-emerald-800" }, { label: "Por revisar", value: recordsLoading || recordsError ? "Pendiente" : filtered.length - matchedCount, tone: "border-amber-200 bg-amber-50/60 text-amber-800" }].map(({ label, value, tone }) => <div className={`rounded-xl border p-3 ${tone}`} key={label}><p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p></div>)}
        </div>
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <label className="min-w-[220px] flex-1 text-xs font-semibold text-slate-600">Buscar placa, RR, conductor, fecha o DT<input className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" type="search" placeholder="Buscar en los viajes…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></label>
          <label className="text-xs font-semibold text-slate-600">Cruce con Seguimiento<select className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" value={matchFilter} onChange={(event) => { setMatchFilter(event.target.value); setPage(0); }}><option value="all">Todos</option><option value="matched">Con coincidencia</option><option value="missing">Sin coincidencia</option><option value="ambiguous">Varias coincidencias</option></select></label>
          <label className="text-xs font-semibold text-slate-600">Desde<input className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" type="date" min={dateBounds.min} max={dateTo || dateBounds.max} value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(0); }} /></label>
          <label className="text-xs font-semibold text-slate-600">Hasta<input className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" type="date" min={dateFrom || dateBounds.min} max={dateBounds.max} value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(0); }} /></label>
          {(dateFrom || dateTo) && <button className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100" onClick={() => { setDateFrom(""); setDateTo(""); setPage(0); }} type="button">Quitar fechas</button>}
        </div>
        <p className="text-[11px] text-slate-500">Fechas de viaje disponibles: {dateBounds.min.split("-").reverse().join("/")} al {dateBounds.max.split("-").reverse().join("/")}. El rango incluye ambos días.</p>
        <RoutePerformanceCharts rows={filtered} />
        <RoutePerformanceTable rows={filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)} pending={recordsLoading} error={Boolean(recordsError)} />
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-slate-600"><span className="tabular-nums">{filtered.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} de ${filtered.length}` : "0 viajes"}</span>{pages > 1 && <div className="flex items-center gap-3"><button className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} type="button">Anterior</button><span className="font-semibold tabular-nums">{currentPage + 1} / {pages}</span><button className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)} type="button">Siguiente</button></div>}</div>
      </>}
    </div>
  </section>;
}




    
