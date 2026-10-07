"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, Table2, Upload } from "lucide-react";
import { matchRoutePerformance, type PerformanceVehicle, type RoutePerformanceRow, type MatchedRoutePerformance } from "../../lib/routePerformanceImport";
import { ROUTE_PERFORMANCE_CONTRACTORS, routePerformanceContractor } from "../../lib/routePerformanceContractors";
import { buildDriverOffenders } from "../../lib/routePerformanceOffenders";
import { averagePerformance, deliveryPerformance, totalPerformanceMinutes, formatPerformanceDuration, latestPerformanceDate } from "../../lib/routePerformanceMetrics";
import RoutePerformanceCharts from "./RoutePerformanceCharts";
import RoutePerformanceTable from "./RoutePerformanceTable";

export default function DiferenciaKilometros({ records, recordsLoading = false, recordsError = "", contractorOnly = "" }: { records: PerformanceVehicle[]; recordsLoading?: boolean; recordsError?: string; contractorOnly?: string }) {
  const [serverMatchedRows, setServerMatchedRows] = useState<MatchedRoutePerformance[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RoutePerformanceRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [uploadedAt, setUploadedAt] = useState("");
  const [files, setFiles] = useState<Array<{ id: string; fileName: string; rowCount: number }>>([]);
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
    void fetch(contractorOnly ? "/api/cumplimiento-entregas" : "/api/admin/graficas/route-performance", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudo cargar el Excel guardado.");
        if (controller.signal.aborted) return;
        const loadedRows: RoutePerformanceRow[] = Array.isArray(body.rows) ? body.rows : [];
        setRows(loadedRows);
        const latestDate = latestPerformanceDate(loadedRows);
        setDateFrom(latestDate);
        setDateTo(latestDate);
        if (contractorOnly) setServerMatchedRows(Array.isArray(body.rows) ? body.rows : []);
        setFileName(String(body.fileName || ""));
        setUploadedAt(String(body.uploadedAt || ""));
        setFiles(Array.isArray(body.files) ? body.files : []);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "No se pudo cargar el Excel guardado.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingStored(false);
      });
    return () => controller.abort();
  }, [contractorOnly]);

  const matchedRows = useMemo(() => contractorOnly ? serverMatchedRows : matchRoutePerformance(rows, records), [rows, records, contractorOnly, serverMatchedRows]);
  const dateBounds = useMemo(() => {
    if (!rows.length) return { min: "", max: "" };
    return rows.reduce((bounds, row) => ({
      min: row.date < bounds.min ? row.date : bounds.min,
      max: row.date > bounds.max ? row.date : bounds.max,
    }), { min: rows[0].date, max: rows[0].date });
  }, [rows]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return matchedRows.filter((row) => (contractorOnly || ROUTE_PERFORMANCE_CONTRACTORS.some((contractor) => routePerformanceContractor(row.contractor) === contractor)) && (!dateFrom || row.date >= dateFrom) && (!dateTo || row.date <= dateTo) && (matchFilter === "all" || row.match === matchFilter) && (contractorFilter === "all" || routePerformanceContractor(row.contractor) === contractorFilter) && [row.plate, row.originalPlate, row.matchedPlate, row.rr, row.driver, row.contractor, row.date, row.dt].join(" ").toLocaleLowerCase("es").includes(query));
  }, [matchedRows, search, matchFilter, contractorFilter, dateFrom, dateTo, contractorOnly]);
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
      const loadedRows: RoutePerformanceRow[] = Array.isArray(body.rows) ? body.rows : [];
      setRows(loadedRows);
      setFileName(String(body.fileName || file.name));
      setUploadedAt(String(body.uploadedAt || ""));
      setFiles(Array.isArray(body.files) ? body.files : []);
      setSearch("");
      setMatchFilter("all");
      setContractorFilter("all");
      const latestDate = latestPerformanceDate(loadedRows);
      setDateFrom(latestDate);
      setDateTo(latestDate);
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
        ...(contractorOnly ? [contractorOnly] : ROUTE_PERFORMANCE_CONTRACTORS).map((name) => ({ name, trips: filtered.filter((row) => routePerformanceContractor(row.contractor) === name) })),
      ];
      const summarySheet = XLSX.utils.json_to_sheet(summaries.map(({ name, trips }) => {
        const range = deliveryPerformance(trips);
        return {
          Contratista: name,
          Viajes: trips.length,
          "Plan km": trips.reduce((sum, row) => sum + row.plannedKm, 0),
          "Ejecutado km": trips.reduce((sum, row) => sum + row.executedKm, 0),
          "Diferencia acumulada km": trips.reduce((sum, row) => sum + Math.abs(row.differenceKm), 0),
          "Entrega en rango MyGeotab %": range.value ?? "",
          "Adherencia km promedio %": averagePerformance(trips, "adherenceKmPercent").value ?? "",
          "Clientes planeados": range.missing ? "" : range.planned,
          "Clientes visitados": range.missing ? "" : range.visited,
          "Viajes sin datos de clientes": range.missing,
          "Horas planeadas": formatPerformanceDuration(totalPerformanceMinutes(trips, "plannedMinutes")),
          "Horas ejecutadas": formatPerformanceDuration(totalPerformanceMinutes(trips, "executedMinutes")),
          "Adherencia horas promedio %": averagePerformance(trips, "adherenceHoursPercent").value ?? "",
        };
      }));
      summarySheet["!cols"] = [24, 12, 18, 18, 28, 30, 30, 22, 22, 28, 22, 22, 30].map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen");

      const offendersSheet = XLSX.utils.json_to_sheet(buildDriverOffenders(filtered).map((item, index) => ({
        Posición: index + 1,
        Conductor: item.driver,
        Placas: item.plates.join(", "),
        RR: item.rr || "Sin registrar",
        Contratista: item.contractor,
        Viajes: item.trips,
        "ADH_KM promedio %": item.adherenceKmPercent,
        "% entrega en rango": item.rangePercent ?? "",
        "Diferencia acumulada km": item.differenceKm,
      })));
      offendersSheet["!cols"] = [12, 28, 24, 28, 24, 12, 24, 22, 27].map((wch) => ({ wch }));
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
        "Adherencia km %": row.adherenceKmPercent == null ? "" : row.adherenceKmPercent / 100,
        "Entrega en rango MyGeotab %": row.rangePercent == null ? "" : row.rangePercent / 100,
        "Fuera de rango %": row.outsidePercent == null ? "" : row.outsidePercent / 100,
        "Clientes planeados": row.plannedClients ?? "",
        "Clientes visitados": row.visitedClients ?? "",
        "Horas planeadas": formatPerformanceDuration(row.plannedMinutes),
        "Horas ejecutadas": formatPerformanceDuration(row.executedMinutes),
        "Adherencia horas %": row.adherenceHoursPercent == null ? "" : row.adherenceHoursPercent / 100,
        Cruce: row.match === "matched" ? row.matchSource === "archivo" ? "Coincide en archivo" : "Coincide" : row.match === "ambiguous" ? "Varias coincidencias" : "Sin coincidencia",
      })));
      detailSheet["!cols"] = [12, 14, 14, 18, 12, 14, 24, 28, 28, 16, 18, 18, 22, 22, 22, 22, 22, 22, 22, 22, 22].map((wch) => ({ wch }));
      // Native percentage cells preserve values below 1% when imported again.
      for (let row = 1; row <= filtered.length; row++) {
        for (const col of [12, 13, 14, 19]) {
          const cell = detailSheet[XLSX.utils.encode_cell({ r: row, c: col })];
          if (cell?.t === "n") cell.z = "0.00%";
        }
      }
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
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#10283f] text-cyan-300"><Table2 size={19} /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-700">Route Tracking</p><h2 className="mt-0.5 text-base font-bold text-[#10223d]">Kilómetros y cumplimiento de entregas</h2><p className="mt-0.5 text-xs text-slate-500">Indicadores del Excel y tripulación de Seguimiento</p></div></div>
      <div className="flex flex-wrap items-center gap-2">
        {!contractorOnly && <input aria-label="Archivo Excel de viajes" className="sr-only" ref={inputRef} type="file" accept=".xlsx,.xls" disabled={loading || loadingStored} onChange={uploadExcel} />}
        {!contractorOnly && <button className="flex items-center gap-2 rounded-md bg-[#10223d] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={loading || loadingStored} onClick={() => inputRef.current?.click()} type="button"><Upload size={15} /> {loading ? "Guardando Excel…" : "Subir y guardar Excel"}</button>}
        {rows.length > 0 && <button className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50" disabled={loading || exporting || recordsLoading || !filtered.length} onClick={exportExcel} type="button"><Download size={15} /> {exporting ? "Exportando…" : "Exportar Excel"}</button>}
        {rows.length > 0 && <button className="rounded-md border px-3 py-2 text-xs text-slate-600 disabled:opacity-50" disabled={loading} onClick={() => { setSearch(""); setMatchFilter("all"); setContractorFilter("all"); setDateFrom(dateBounds.max); setDateTo(dateBounds.max); }} type="button">Volver al último día</button>}
      </div>
    </header>
    <div className="space-y-4 p-4">
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}{rows.length ? " Se conservan los registros anteriores." : ""}</p>}
      {recordsError && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800" role="alert">No se pudo cargar Seguimiento. El cruce de RR y conductor no está disponible: {recordsError}</p>}
      <p className="text-xs font-semibold text-slate-600" role="status" aria-live="polite">{loadingStored ? "Cargando los viajes guardados…" : loading ? "Validando y guardando Excel…" : fileName ? `${contractorOnly ? "Historial de viajes" : `${files.length} archivos guardados`} · ${rows.length} viajes${uploadedAt ? ` · Última carga: ${new Date(uploadedAt).toLocaleString("es-CO")}` : ""}` : contractorOnly ? "No hay un Excel disponible del administrador." : "Sube un Excel para guardar los viajes y ver las gráficas."}{recordsLoading ? " Cargando Seguimiento para cruzar las placas…" : ""}</p>
      {!contractorOnly && <p className="text-xs text-slate-500">La última carga reemplaza la versión anterior del mismo archivo en el historial visible. Los DT y viajes repetidos se cuentan una sola vez, conservando los datos más recientes.</p>}
      {!contractorOnly && files.length > 0 && <details className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600"><summary className="cursor-pointer font-semibold">Archivos guardados ({files.length})</summary><ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">{files.map((file) => <li key={file.id}>{file.fileName} · {file.rowCount} viajes</li>)}</ul></details>}
      {contractorOnly && !loadingStored && !error && rows.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Todavía no hay viajes identificados de HL Logísticos en el archivo del administrador.</p>}
      {rows.length > 0 && <>
        <div className="grid gap-3 sm:grid-cols-3">
          {[{ label: "Viajes seleccionados", value: filtered.length, tone: "border-slate-200 bg-slate-50 text-[#10223d]" }, { label: "Con coincidencia", value: recordsLoading || recordsError ? "Pendiente" : matchedCount, tone: "border-emerald-200 bg-emerald-50/60 text-emerald-800" }, { label: "Por revisar", value: recordsLoading || recordsError ? "Pendiente" : filtered.length - matchedCount, tone: "border-amber-200 bg-amber-50/60 text-amber-800" }].map(({ label, value, tone }) => <div className={`rounded-xl border p-3 ${tone}`} key={label}><p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p></div>)}
        </div>
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <label className="min-w-[220px] flex-1 text-xs font-semibold text-slate-600">Buscar placa, RR, conductor, fecha o DT<input className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" type="search" placeholder="Buscar en los viajes…" value={search} onChange={(event) => { setSearch(event.target.value); }} /></label>
          <label className="text-xs font-semibold text-slate-600">Cruce con Seguimiento<select className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" value={matchFilter} onChange={(event) => { setMatchFilter(event.target.value); }}><option value="all">Todos</option><option value="matched">Con coincidencia</option><option value="missing">Sin coincidencia</option><option value="ambiguous">Varias coincidencias</option></select></label>
          {!contractorOnly && <label className="text-xs font-semibold text-slate-600">Contratista<select className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" value={contractorFilter} onChange={(event) => { setContractorFilter(event.target.value); }}><option value="all">Todos</option>{ROUTE_PERFORMANCE_CONTRACTORS.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>}
          <label className="text-xs font-semibold text-slate-600">Desde<input className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" type="date" min={dateBounds.min} max={dateTo || dateBounds.max} value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); }} /></label>
          <label className="text-xs font-semibold text-slate-600">Hasta<input className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" type="date" min={dateFrom || dateBounds.min} max={dateBounds.max} value={dateTo} onChange={(event) => { setDateTo(event.target.value); }} /></label>
          {(dateFrom || dateTo) && <button className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100" onClick={() => { setDateFrom(""); setDateTo(""); }} type="button">Ver todas las fechas</button>}
        </div>
        <p className="text-[11px] text-slate-500">Fechas de viaje disponibles: {dateBounds.min.split("-").reverse().join("/")} al {dateBounds.max.split("-").reverse().join("/")}. El rango incluye ambos días.</p>
        <div role="status" aria-label="Período de los indicadores" className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950">
          <p className="font-bold">{dateFrom && dateFrom === dateTo ? `Indicadores del ${dateFrom.split("-").reverse().join("/")}` : !dateFrom && !dateTo ? "Indicadores acumulados de todas las fechas" : `Indicadores del ${(dateFrom || dateBounds.min).split("-").reverse().join("/")} al ${(dateTo || dateBounds.max).split("-").reverse().join("/")}`}</p>
          <p className="mt-1 text-xs">{filtered.length.toLocaleString("es-CO")} viajes seleccionados de {rows.length.toLocaleString("es-CO")} guardados. Todos los indicadores y la exportación usan esta selección.</p>
        </div>
        <RoutePerformanceCharts rows={filtered} contractorOnly={contractorOnly} />
        <RoutePerformanceTable rows={filtered} pending={recordsLoading} error={Boolean(recordsError)} />
      </>}
    </div>
  </section>;
}




    
