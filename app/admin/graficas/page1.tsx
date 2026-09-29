"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, Table2, Upload } from "lucide-react";
import { matchRoutePerformance, type PerformanceVehicle, type RoutePerformanceRow } from "../../lib/routePerformanceImport";
import { ROUTE_PERFORMANCE_CONTRACTORS, routePerformanceContractor } from "../../lib/routePerformanceContractors";
import { buildDriverOffenders } from "../../lib/routePerformanceOffenders";
import RoutePerformanceCharts from "./RoutePerformanceCharts";
import RoutePerformanceTable from "./RoutePerformanceTable";

export default function DiferenciaKilometros({ records, recordsLoading = false, recordsError = "" }: { records: PerformanceVehicle[]; recordsLoading?: boolean; recordsError?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RoutePerformanceRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [uploadedAt, setUploadedAt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStored, setLoadingStored] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [matchFilter, setMatchFilter] = useState("all");
  const [contractorFilter, setContractorFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/graficas/route-performance", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudo cargar el Excel guardado.");
        if (controller.signal.aborted) return;
        setRows(Array.isArray(body.rows) ? body.rows : []);
        setFileName(String(body.fileName || ""));
        setUploadedAt(String(body.uploadedAt || ""));
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "No se pudo cargar el Excel guardado.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingStored(false);
      });
    return () => controller.abort();
  }, []);

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
    return matchedRows.filter((row) => (!dateFrom || row.date >= dateFrom) && (!dateTo || row.date <= dateTo) && (matchFilter === "all" || row.match === matchFilter) && (contractorFilter === "all" || routePerformanceContractor(row.contractor) === contractorFilter) && [row.plate, row.originalPlate, row.matchedPlate, row.rr, row.driver, row.contractor, row.date, row.dt].join(" ").toLocaleLowerCase("es").includes(query));
  }, [matchedRows, search, matchFilter, contractorFilter, dateFrom, dateTo]);
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
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/graficas/route-performance", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo guardar el Excel en Supabase.");
      setRows(Array.isArray(body.rows) ? body.rows : []);
      setFileName(String(body.fileName || file.name));
      setUploadedAt(String(body.uploadedAt || ""));
      setSearch("");
      setMatchFilter("all");
      setContractorFilter("all");
      setDateFrom("");
      setDateTo("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo leer el Excel.");
    } finally {
      setLoading(false);
    }
  }

  async function exportExcel() {
    if (!filtered.length || exporting || recordsLoading) return;
    setError("");
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const summaries = [
        { name: "General", trips: filtered },
        ...ROUTE_PERFORMANCE_CONTRACTORS.map((name) => ({ name, trips: filtered.filter((row) => routePerformanceContractor(row.contractor) === name) })),
      ];
      const summarySheet = XLSX.utils.json_to_sheet(summaries.map(({ name, trips }) => {
        const withRange = trips.filter((row) => row.rangePercent !== null);
        const withAdherence = trips.filter((row) => row.adherenceKmPercent !== null);
        return {
          Contratista: name,
          Viajes: trips.length,
          "Plan km": trips.reduce((sum, row) => sum + row.plannedKm, 0),
          "Ejecutado km": trips.reduce((sum, row) => sum + row.executedKm, 0),
          "Diferencia acumulada km": trips.reduce((sum, row) => sum + Math.abs(row.differenceKm), 0),
          "Entrega en rango MyGeotab promedio %": withRange.length ? withRange.reduce((sum, row) => sum + (row.rangePercent ?? 0), 0) / withRange.length : "",
          "Adherencia km promedio %": withAdherence.length ? withAdherence.reduce((sum, row) => sum + (row.adherenceKmPercent ?? 0), 0) / withAdherence.length : "",
        };
      }));
      summarySheet["!cols"] = [24, 12, 18, 18, 28, 30, 30].map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen");

      const offendersSheet = XLSX.utils.json_to_sheet(buildDriverOffenders(filtered).map((item, index) => ({
        Posición: index + 1,
        Conductor: item.driver,
        RR: item.rr || "Sin registrar",
        Contratista: item.contractor,
        Viajes: item.trips,
        "ADH_KM promedio %": item.adherenceKmPercent,
        "Diferencia acumulada km": item.differenceKm,
      })));
      offendersSheet["!cols"] = [12, 28, 28, 24, 12, 24, 27].map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(workbook, offendersSheet, "Top conductores");

      const detailSheet = XLSX.utils.json_to_sheet(filtered.map((row) => ({
        "Fila Excel": row.fila,
        Fecha: row.date,
        Placa: row.plate,
        "Placa original": row.originalPlate,
        Viaje: row.trip,
        DT: row.dt,
        Contratista: row.contractor || "Sin identificar",
        RR: row.rr,
        Conductor: row.driver,
        "Plan km": row.plannedKm,
        "Ejecutado km": row.executedKm,
        "Diferencia km": row.differenceKm,
        "Adherencia km %": row.adherenceKmPercent ?? "",
        "Entrega en rango MyGeotab %": row.rangePercent ?? "",
        "Fuera de rango %": row.outsidePercent ?? "",
        Cruce: row.match === "matched" ? row.matchSource === "archivo" ? "Coincide en archivo" : "Coincide" : row.match === "ambiguous" ? "Varias coincidencias" : "Sin coincidencia",
      })));
      detailSheet["!cols"] = [12, 14, 14, 18, 12, 14, 24, 28, 28, 16, 18, 18, 22, 22, 22, 22].map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(workbook, detailSheet, "Viajes");
      XLSX.writeFile(workbook, `kilometros-y-rango-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo exportar el Excel.");
    } finally {
      setExporting(false);
    }
  }

  return <section aria-label="Kilómetros, entrega en rango MyGeotab y adherencia del Excel" className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/60">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-[#f8fafc] px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#10283f] text-cyan-300"><Table2 size={19} /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-700">Análisis de rutas</p><h2 className="mt-0.5 text-base font-bold text-[#10223d]">Kilómetros y cumplimiento de entregas</h2><p className="mt-0.5 text-xs text-slate-500">Indicadores del Excel y tripulación de Seguimiento</p></div></div>
      <div className="flex items-center gap-2">
        <input aria-label="Archivo Excel de viajes" className="sr-only" ref={inputRef} type="file" accept=".xlsx,.xls" disabled={loading || loadingStored} onChange={uploadExcel} />
        <button className="flex items-center gap-2 rounded-md bg-[#10223d] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={loading || loadingStored} onClick={() => inputRef.current?.click()} type="button"><Upload size={15} /> {loading ? "Guardando Excel…" : "Subir y guardar Excel"}</button>
        {rows.length > 0 && <button className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50" disabled={loading || exporting || recordsLoading || !filtered.length} onClick={exportExcel} type="button"><Download size={15} /> {exporting ? "Exportando…" : "Exportar Excel"}</button>}
        {rows.length > 0 && <button className="rounded-md border px-3 py-2 text-xs text-slate-600 disabled:opacity-50" disabled={loading} onClick={() => { setSearch(""); setMatchFilter("all"); setContractorFilter("all"); setDateFrom(""); setDateTo(""); }} type="button">Quitar filtros</button>}
      </div>
    </header>
    <div className="space-y-4 p-4">
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}{rows.length ? " Se conserva el archivo anterior." : ""}</p>}
      {recordsError && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800" role="alert">No se pudo cargar Seguimiento. El cruce de RR y conductor no está disponible: {recordsError}</p>}
      <p className="text-xs font-semibold text-slate-600" role="status" aria-live="polite">{loadingStored ? "Cargando el último Excel guardado en Supabase…" : loading ? "Validando y guardando Excel en Supabase…" : fileName ? `${fileName} · ${rows.length} viajes guardados${uploadedAt ? ` · ${new Date(uploadedAt).toLocaleString("es-CO")}` : ""}` : "Sube un Excel para guardar los viajes en Supabase y ver las gráficas."}{recordsLoading ? " Cargando Seguimiento para cruzar las placas…" : ""}</p>
      {rows.length > 0 && <>
        <div className="grid gap-3 sm:grid-cols-3">
          {[{ label: "Viajes seleccionados", value: filtered.length, tone: "border-slate-200 bg-slate-50 text-[#10223d]" }, { label: "Con coincidencia", value: recordsLoading || recordsError ? "Pendiente" : matchedCount, tone: "border-emerald-200 bg-emerald-50/60 text-emerald-800" }, { label: "Por revisar", value: recordsLoading || recordsError ? "Pendiente" : filtered.length - matchedCount, tone: "border-amber-200 bg-amber-50/60 text-amber-800" }].map(({ label, value, tone }) => <div className={`rounded-xl border p-3 ${tone}`} key={label}><p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p></div>)}
        </div>
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <label className="min-w-[220px] flex-1 text-xs font-semibold text-slate-600">Buscar placa, RR, conductor, fecha o DT<input className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" type="search" placeholder="Buscar en los viajes…" value={search} onChange={(event) => { setSearch(event.target.value); }} /></label>
          <label className="text-xs font-semibold text-slate-600">Cruce con Seguimiento<select className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" value={matchFilter} onChange={(event) => { setMatchFilter(event.target.value); }}><option value="all">Todos</option><option value="matched">Con coincidencia</option><option value="missing">Sin coincidencia</option><option value="ambiguous">Varias coincidencias</option></select></label>
          <label className="text-xs font-semibold text-slate-600">Contratista<select className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" value={contractorFilter} onChange={(event) => { setContractorFilter(event.target.value); }}><option value="all">Todos</option>{ROUTE_PERFORMANCE_CONTRACTORS.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600">Desde<input className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" type="date" min={dateBounds.min} max={dateTo || dateBounds.max} value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); }} /></label>
          <label className="text-xs font-semibold text-slate-600">Hasta<input className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" type="date" min={dateFrom || dateBounds.min} max={dateBounds.max} value={dateTo} onChange={(event) => { setDateTo(event.target.value); }} /></label>
          {(dateFrom || dateTo) && <button className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100" onClick={() => { setDateFrom(""); setDateTo(""); }} type="button">Quitar fechas</button>}
        </div>
        <p className="text-[11px] text-slate-500">Fechas de viaje disponibles: {dateBounds.min.split("-").reverse().join("/")} al {dateBounds.max.split("-").reverse().join("/")}. El rango incluye ambos días.</p>
        <RoutePerformanceCharts rows={filtered} />
        <RoutePerformanceTable rows={filtered} pending={recordsLoading} error={Boolean(recordsError)} />
      </>}
    </div>
  </section>;
}




    
