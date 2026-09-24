"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Download, MapPinned, Maximize, Minimize, RefreshCw, Search, Trash2, Users, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { coordinatesCsv, filterCoordinateRecords, readCoordinateRecord, type CoordinateRecord } from "../../lib/coordinateRecords";
import CoordinateHeatMap from "./CoordinateHeatMap";
import CoordinateCharts from "./CoordinateCharts";

const PAGE_SIZE = 8;
const dateFormat = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
function formatDate(value: string) { return value && !Number.isNaN(Date.parse(value)) ? dateFormat.format(new Date(value)) : "Sin fecha"; }

export default function AdminCoordinatesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CoordinateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [updated, setUpdated] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [showDates, setShowDates] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const pendingLoad = useRef<AbortController | null>(null);

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setError("No se pudo cambiar a pantalla completa."); }
  }

  const loadCoordinates = useCallback(async () => {
    if (pendingLoad.current) return;
    const controller = new AbortController();
    pendingLoad.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    setLoading(true);
    try {
      const response = await fetch("/api/public/critical-routes?scope=coordinates", { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudieron cargar las coordenadas.");
      if (!Array.isArray(body.hazards)) throw new Error("La respuesta de ubicaciones no es válida.");
      const records = (body.hazards as Record<string, unknown>[]).map(readCoordinateRecord).filter((row) => row.activo && Number.isFinite(row.latitud) && Number.isFinite(row.longitud) && Math.abs(row.latitud) <= 90 && Math.abs(row.longitud) <= 180);
      if (pendingLoad.current !== controller) return;
      setRows((current) => JSON.stringify(current) === JSON.stringify(records) ? current : records);
      setWarning(String(body.warning || ""));
      setUpdated(new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }));
      setError("");
    } catch (caught) {
      if (pendingLoad.current !== controller) return;
      setError(controller.signal.aborted ? "La consulta tardó demasiado. Se conservan los últimos registros cargados." : caught instanceof Error ? caught.message : "No se pudieron cargar las coordenadas.");
    } finally {
      window.clearTimeout(timeout);
      if (pendingLoad.current === controller) { pendingLoad.current = null; setLoading(false); }
    }
  }, []);

  async function deleteCoordinate(id: number) {
    if (deleting !== null) return;
    setDeleting(id);
    try {
      const response = await fetch(`/api/people/critical-routes/hazards?id=${id}`, { method: "DELETE", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo eliminar la coordenada.");
      pendingLoad.current?.abort();
      pendingLoad.current = null;
      setRows((current) => current.filter((row) => row.id !== id));
      if (selectedId === id) setSelectedId(null);
      await loadCoordinates();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo eliminar la coordenada."); }
    finally { setDeleting(null); }
  }

  useEffect(() => {
    void loadCoordinates();
    const refresh = () => { if (!document.hidden) void loadCoordinates(); };
    const interval = window.setInterval(refresh, 10_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh); pendingLoad.current?.abort(); pendingLoad.current = null; };
  }, [loadCoordinates]);

  const invalidRange = Boolean(from && to && from > to);
  const filtered = useMemo(() => filterCoordinateRecords(rows, search, from, to), [rows, search, from, to]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visibleRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const contractors = new Set(filtered.map((row) => row.contratista).filter(Boolean)).size;
  const clients = new Set(filtered.map((row) => row.codigoCliente || row.ruta)).size;

  function downloadRecords() {
    const url = URL.createObjectURL(new Blob([coordinatesCsv(filtered)], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `ubicaciones-${from || "inicio"}-${to || "hasta-hoy"}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main className="min-h-dvh bg-[radial-gradient(ellipse_at_top_right,#e0e7ff,transparent_50%),linear-gradient(135deg,#f8fafc,#eef4f8)] pb-14 text-[#10213b]">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-4 shadow-sm">
      <div className="flex items-center gap-3"><button aria-label="Volver a seguimiento de transportistas" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-violet-700" onClick={() => router.push("/admin")} type="button"><ArrowLeft size={20} /></button><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-violet-700">Centro de control · Ubicaciones</p><h1 className="text-2xl font-black tracking-tight">Vista general del mapa</h1></div></div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-2 hidden text-right text-[10px] text-slate-500 2xl:block">Actualización cada 10 s<strong className="block text-sm text-slate-700">{updated || "Pendiente"}</strong></span>
        <button type="button" aria-expanded={showDates} aria-controls="coordinate-date-filters" onClick={() => setShowDates((current) => !current)} className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-bold ${from || to ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white"}`}><CalendarDays size={16} />Filtrar fechas{from || to ? " · Activo" : ""}</button>
        <button type="button" onClick={downloadRecords} disabled={!filtered.length || invalidRange} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#10213b] px-3 text-xs font-bold text-white disabled:opacity-40"><Download size={16} />Descargar registros</button>
        <button aria-label="Actualizar registros" title="Actualizar registros" onClick={() => void loadCoordinates()} disabled={loading} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-violet-700 disabled:opacity-50" type="button"><RefreshCw size={17} className={loading ? "animate-spin" : ""} /></button>
        <button aria-label={fullscreen ? "Salir de pantalla completa" : "Expandir pantalla"} title="Pantalla completa" onClick={() => void toggleFullscreen()} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-violet-700" type="button">{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button>
      </div>
    </header>
    <section className="mx-auto max-w-[2400px] space-y-4 p-4 lg:px-6">
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {warning ? <p className="rounded-xl bg-amber-50 px-4 py-2 text-xs text-amber-800">{warning}</p> : null}
      {showDates ? <section id="coordinate-date-filters" className="flex flex-wrap items-end gap-4 rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
        <label className="text-xs font-bold text-slate-500">Desde<input type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setPage(0); }} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-800" /></label>
        <label className="text-xs font-bold text-slate-500">Hasta<input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(0); }} className="mt-1 block h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-800" /></label>
        <button type="button" onClick={() => { setFrom(""); setTo(""); setPage(0); }} className="h-10 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-600">Limpiar fechas</button>
        <p className={`pb-2 text-xs ${invalidRange ? "text-red-600" : "text-slate-500"}`} role={invalidRange ? "alert" : undefined}>{invalidRange ? "La fecha inicial no puede ser posterior a la final." : "Fecha de registro · hora de Bogotá · ambos días incluidos"}</p>
      </section> : null}
      <div className="grid gap-3 sm:grid-cols-3">{[{ label: "Ubicaciones filtradas", value: filtered.length, icon: <MapPinned size={21} />, tone: "bg-violet-100 text-violet-700" }, { label: "Clientes", value: clients, icon: <Users size={21} />, tone: "bg-blue-100 text-blue-700" }, { label: "Contratistas", value: contractors, icon: <Truck size={21} />, tone: "bg-emerald-100 text-emerald-700" }].map((metric) => <article key={metric.label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm"><span className={`grid h-11 w-11 place-items-center rounded-xl ${metric.tone}`}>{metric.icon}</span><div><p className="text-xs font-semibold text-slate-500">{metric.label}</p><strong className="text-2xl font-black tabular-nums">{loading && !rows.length ? "—" : metric.value}</strong></div></article>)}</div>
      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3"><div><h2 className="font-bold">Registros de ubicación</h2><p className="mt-1 text-xs text-slate-500">Selecciona un cliente para verlo en el mapa.</p></div><label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"><Search size={16} className="text-slate-400" /><input aria-label="Buscar por cliente, RR o contratista" placeholder="Cliente, RR o contratista" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} className="w-44 bg-transparent text-xs outline-none" /></label></header>
          <div className="min-h-[390px] flex-1 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>{["Fecha", "Contratista", "RR", "Cliente / código", "Coordenadas", ""].map((label) => <th key={label} scope="col" className="px-3 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">
            {visibleRows.map((row) => <tr key={row.id} className={row.id === selectedId ? "bg-violet-50" : "hover:bg-slate-50"}>
              <td className="px-3 py-3 text-[11px] tabular-nums text-slate-500">{formatDate(row.createdAt)}</td>
              <td className="px-3 py-3 font-semibold">{row.contratista || "Sin información"}</td>
              <td className="px-3 py-3"><p className="font-semibold">{row.nombreRr || "Sin nombre"}</p><p className="mt-1 text-[10px] text-slate-500">{/^\d+$/.test(row.tipo) ? `CC ${row.tipo}` : "Sin cédula RR"}</p></td>
              <td className="px-3 py-3"><button type="button" onClick={() => setSelectedId(row.id)} className="text-left font-bold text-violet-700 underline-offset-2 hover:underline" title="Ubicar cliente en el mapa">{row.ruta}</button><p className="mt-1 text-[10px] text-slate-500">{row.codigoCliente || "Sin código"}</p></td>
              <td className="px-3 py-3 font-mono text-[10px] tabular-nums">
                <button
                  type="button"
                  onClick={() => { setSelectedId(row.id); setFocusRequest((current) => current + 1); }}
                  title="Ubicar en el mapa de al lado"
                  aria-label={`Ubicar a ${row.ruta} en el mapa de al lado`}
                  className="inline-block rounded text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-600"
                >
                  <span className="block">{row.latitud.toFixed(6)}</span>
                  <span className="block">{row.longitud.toFixed(6)}</span>
                </button>
              </td>
              <td className="px-2 py-3"><button type="button" aria-label={`Eliminar ubicación de ${row.ruta}`} title="Eliminar ubicación" disabled={deleting !== null} onClick={() => void deleteCoordinate(row.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 size={15} /></button></td>
            </tr>)}
            {!visibleRows.length ? <tr><td colSpan={6} className="px-4 py-16 text-center text-slate-500">{loading && !rows.length ? "Cargando registros..." : invalidRange ? "Corrige el rango de fechas." : "No hay ubicaciones para estos filtros."}</td></tr> : null}
          </tbody></table></div>
          <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3"><p className="text-[11px] text-slate-500">{filtered.length ? `${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} de ${filtered.length}` : "0 registros"}</p><div className="flex items-center gap-3"><button type="button" aria-label="Página anterior" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="rounded-lg border p-2 disabled:opacity-30"><ChevronLeft size={15} /></button><span className="text-xs font-bold">{safePage + 1} / {totalPages}</span><button type="button" aria-label="Página siguiente" disabled={safePage === totalPages - 1} onClick={() => setPage(safePage + 1)} className="rounded-lg border p-2 disabled:opacity-30"><ChevronRight size={15} /></button></div></footer>
        </section>
        <CoordinateHeatMap rows={filtered} selectedId={selectedId} focusRequest={focusRequest} />
      </div>
      <CoordinateCharts rows={filtered} loading={loading && !rows.length} />
      <p className="text-[10px] text-slate-500">La descarga CSV incluye todos los resultados filtrados y se puede abrir en Excel. Los registros antiguos pueden no tener código de cliente.</p>
    </section>
  </main>;
}
