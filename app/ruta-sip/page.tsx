"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock3, Maximize, Minimize, PackageCheck, Route, Truck } from "lucide-react";
import styles from "./page.module.css";
import { usePathname, useRouter } from "next/navigation";
import { normalizeContractorName } from "../lib/contractors";
import type { Vehiculo } from "../seguimiento/types";
import { calculateRouteTime, getStatus, parseDurationToSeconds, toDateKey } from "../seguimiento/utils";
import { ExitTvButton } from "../admin/modo-tv/ExitTvButton";
import { useOptionalTvData } from "../admin/modo-tv/TvDataCache";

const LOGISTICOS = "logisticos";
const SURTI = "surticervezas";

export default function RutaSipPage() {
  const router = useRouter();
  const pathname = usePathname();
  const isTvMode = pathname.startsWith("/admin/modo-tv");
  const tvData = useOptionalTvData();
  const tvSeguimiento = tvData?.seguimiento;
  const refreshTvRoutes = tvSeguimiento?.load;
  const [today, setToday] = useState(() => dateKey(new Date()));
  const [now, setNow] = useState(() => new Date());
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [vehicles, setVehicles] = useState<Vehiculo[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    syncFullscreen();
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setFullscreenError("");
    } catch {
      setFullscreenError("No se pudo cambiar a pantalla completa. Intenta nuevamente con el botón de expandir.");
    }
  }

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    const timer = window.setInterval(updateClock, 1_000);
    const onVisible = () => { if (!document.hidden) updateClock(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (isTvMode && refreshTvRoutes) return;

    let active = true;
    let pending = false;
    const loadRoutes = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/ruta-sip", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudieron cargar las rutas.");
        if (active) {
          setVehicles(Array.isArray(body.records) ? body.records : []);
          setLoadError("");
        }
      } catch (caught) {
        if (active) setLoadError(caught instanceof Error ? caught.message : "No se pudieron cargar las rutas.");
      } finally {
        pending = false;
        if (active) setLoadingRoutes(false);
      }
    };
    void loadRoutes();
    const refresh = () => { if (!document.hidden) void loadRoutes(); };
    const interval = window.setInterval(refresh, 10_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [isTvMode, refreshTvRoutes]);

  useEffect(() => {
    if (isTvMode) {
      setAllowed(true);
      return;
    }

    fetch("/api/session/session", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body) => setAllowed(Boolean(body?.session?.isAdmin || normalizeContractorName(body?.session?.contractor) === LOGISTICOS)))
      .catch(() => setAllowed(false));
  }, [isTvMode]);

  useEffect(() => {
    if (isTvMode && tvSeguimiento?.data.today) setToday(tvSeguimiento.data.today);
  }, [isTvMode, tvSeguimiento?.data.today]);

  const sourceVehicles = isTvMode && tvSeguimiento ? tvSeguimiento.data.records : vehicles;
  const routesLoading = isTvMode && tvSeguimiento ? tvSeguimiento.loading : loadingRoutes;
  const routesError = isTvMode && tvSeguimiento ? tvSeguimiento.error : loadError;

  const routes = useMemo(() => sourceVehicles
    .filter((vehicle) => toDateKey(vehicle.fechaDespacho || vehicle.date || vehicle.createdAt) === today)
    .filter((vehicle) => [LOGISTICOS, SURTI].includes(normalizeContractorName(vehicle.transportista)))
    .map((vehicle) => toRouteRow(vehicle, now))
    .sort((a, b) => a.contractor.localeCompare(b.contractor) || a.departure.localeCompare(b.departure) || a.dt.localeCompare(b.dt, "es-CO", { numeric: true })), [sourceVehicles, now, today]);

  const logisticosRoutes = routes.filter((route) => route.contractorKey === LOGISTICOS);
  const surtiRoutes = routes.filter((route) => route.contractorKey === SURTI);
  const activeRoutes = routes.filter((route) => route.departure !== "Pendiente");
  const durationBuckets = [
    { label: "De 9:00 a 10:00", start: 9, end: 10, inclusive: false },
    { label: "De 10:00 a 12:00", start: 10, end: 12, inclusive: false },
    { label: "De 12:00 a 14:00", start: 12, end: 14, inclusive: true },
  ].map((bucket) => ({
    ...bucket,
    count: activeRoutes.filter((route) => {
      const seconds = parseDurationToSeconds(route.duration);
      return seconds !== null && seconds >= bucket.start * 3600
        && (bucket.inclusive ? seconds <= bucket.end * 3600 : seconds < bucket.end * 3600);
    }).length,
  }));
  const totalBoxes = routes.reduce((sum, route) => sum + route.boxes, 0);
  const totalClients = routes.reduce((sum, route) => sum + route.clients, 0);
  const totalVisited = routes.reduce((sum, route) => sum + route.visited, 0);

  if (allowed === null) return <main className="min-h-screen bg-slate-50" />;
  if (!allowed) return <main className="grid min-h-screen place-items-center bg-slate-50 px-5"><section className="max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm"><h1 className="text-xl font-bold text-slate-900">Ruta SIF</h1><p className="mt-2 text-sm text-slate-500">Este módulo está disponible para Logísticos Galapa.</p><button className="mt-5 rounded-xl bg-[#10223d] px-4 py-2 text-sm font-semibold text-white" onClick={() => router.push("/")} type="button">Volver</button></section></main>;

  return (
    <main className={`${styles.page} min-h-dvh bg-[radial-gradient(circle_at_92%_0%,rgba(37,99,235,.12),transparent_24rem),linear-gradient(135deg,#f8fafc,#eff6ff)] text-slate-900`}>
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3"><button aria-label="Volver" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-[#10223d] shadow-sm hover:bg-slate-50" onClick={() => router.push(isTvMode ? "/admin/modo-tv" : "/")} type="button"><ArrowLeft size={19} /></button><span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#0f766e] to-[#2563eb] text-white shadow-lg shadow-blue-200"><Route size={22} /></span><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#0f766e]">{isTvMode ? "Modo TV · Galapa" : "Gestión Central · Logísticos Galapa"}</p><h1 className="text-2xl font-black tracking-tight text-[#10223d]">Ruta SIF</h1></div></div>
          <div className="flex items-center gap-2"><label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm"><CalendarDays size={16} className="text-[#2563eb]" /><span className="sr-only">Fecha</span><input className="bg-transparent outline-none" onChange={(event) => setToday(event.target.value)} type="date" value={today} /></label><button aria-label={fullscreen ? "Salir de pantalla completa" : "Expandir pantalla"} title={fullscreen ? "Salir de pantalla completa" : "Expandir pantalla"} aria-pressed={fullscreen} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100" onClick={() => void toggleFullscreen()} type="button">{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button>{isTvMode ? <ExitTvButton /> : null}</div>
        </div>
      </header>

      <section className={`${styles.content} mx-auto w-full space-y-4 px-4 py-4`}>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_35px_rgba(15,35,58,.07)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#2563eb]">Jornada laboral</p><h2 className="mt-1 text-lg font-bold text-[#10223d]">Horas de las rutas</h2></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">{activeRoutes.length} rutas en jornada</span></div>
          <div className="grid gap-3 p-4 sm:grid-cols-3 xl:grid-cols-6">
            <HourMetric icon={<Truck size={18} />} label="Logísticos y Surti" value={routes.length} detail={`${logisticosRoutes.length} Logísticos · ${surtiRoutes.length} Surti`} tone="blue" />
            {durationBuckets.map((bucket) => <HourMetric key={bucket.start} icon={<Clock3 size={18} />} label={bucket.label} value={bucket.count} detail="rutas por horas en ruta" tone="teal" />)}
            <HourMetric icon={<Clock3 size={18} />} label="Mayor jornada" value={longestDuration(activeRoutes)} detail="desde la salida" tone="amber" />
            <HourMetric icon={<PackageCheck size={18} />} label="Producción del día" value={totalClients.toLocaleString("es-CO")} detail={`${totalBoxes.toLocaleString("es-CO", { maximumFractionDigits: 0 })} cajas`} tone="violet" />
          </div>
        </section>

        {routesError ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{routesError}</p> : null}
        {fullscreenError ? <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{fullscreenError}</p> : null}
        <section className={styles.panels}>
          <aside aria-label="Avance diario" className={`${styles.dailyProgress} min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm`}>
            <h2 className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 text-xl font-black text-[#10223d]"><Activity size={22} className="text-cyan-600" />Avance diario</h2>
            <div className="grid grid-cols-1 gap-3 px-3 py-6 min-[400px]:grid-cols-3">
              <RouteIndicator title="Logísticos" rows={logisticosRoutes} tone="cyan" loading={routesLoading} />
              <RouteIndicator title="Surti Cervezas" rows={surtiRoutes} tone="blue" loading={routesLoading} />
              <RouteIndicator title="General" rows={routes} tone="amber" loading={routesLoading} />
            </div>
            <dl className="grid grid-cols-3 gap-2 border-t border-slate-200 bg-slate-50/70 px-3 py-4 text-center">
              {[{ label: "Rutas", value: routes.length.toLocaleString("es-CO") }, { label: "Clientes", value: `${totalVisited.toLocaleString("es-CO")}/${totalClients.toLocaleString("es-CO")}` }, { label: "Cajas", value: totalBoxes.toLocaleString("es-CO", { maximumFractionDigits: 0 }) }].map(({ label, value }) => <div key={label}><dt className="text-xs font-bold uppercase text-slate-500">{label}</dt><dd className="mt-1 break-words text-2xl font-black tabular-nums text-[#10223d]">{routesLoading ? "—" : value}</dd></div>)}
            </dl>
          </aside>
          <RouteTable key={today} loading={routesLoading} rows={routes} />
        </section>
      </section>
    </main>
  );
}

type RouteRow = { id: string; contractor: string; contractorKey: string; crew: { role: string; name: string }[]; dt: string; plate: string; departure: string; duration: string; status: string; clients: number; visited: number; boxes: number; hl: number; progress: number };

function toRouteRow(vehicle: Vehiculo, now: Date): RouteRow {
  const clients = Number(vehicle.clientes || 0);
  const visited = Number(vehicle.visitados || 0);
  const crew = [
    { role: "Responsable", name: vehicle.nombreResponsable || vehicle.responsable || "" },
    { role: "Conductor / auxiliar 1", name: vehicle.nombreAuxiliar1 || "" },
    { role: "Auxiliar 2", name: vehicle.nombreAuxiliar2 || "" },
  ].filter((member) => member.name.trim());
  return { crew, id: vehicle.recordId || `${vehicle.transportista}-${vehicle.transporte}-${vehicle.vehiculo}`, contractor: vehicle.transportista || "Sin contratista", contractorKey: normalizeContractorName(vehicle.transportista), dt: vehicle.transporte || "Sin DT", plate: vehicle.vehiculo || "Sin placa", departure: validTime(vehicle.horaSalida) ? vehicle.horaSalida : "Pendiente", duration: calculateRouteTime(vehicle, now), status: getStatus(clients ? Math.round(visited / clients * 100) : 0, vehicle), clients, visited, boxes: Number(vehicle.cajas || 0), hl: Number(vehicle.hl || 0), progress: clients ? Math.min(100, Math.round(visited / clients * 100)) : 0 };
}

function HourMetric({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string | number; detail: string; tone: "blue" | "teal" | "amber" | "violet" }) { const tones = { blue: "bg-blue-50 text-blue-700", teal: "bg-teal-50 text-teal-700", amber: "bg-amber-50 text-amber-700", violet: "bg-violet-50 text-violet-700" }; return <article className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"><span className={`grid h-9 w-9 place-items-center rounded-lg ${tones[tone]}`}>{icon}</span><p className="mt-3 text-xs font-semibold text-slate-500">{label}</p><strong className="mt-1 block text-2xl font-black tabular-nums text-[#10223d]">{value}</strong><p className="mt-1 text-[11px] text-slate-500">{detail}</p></article>; }
function RouteTable({ loading, rows }: { loading: boolean; rows: RouteRow[] }) {
  const [page, setPage] = useState(0);
  const pageSize = 7;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const visibleRows = rows.slice(safePage * pageSize, (safePage + 1) * pageSize);

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div><h2 className="text-base font-bold text-[#10223d]">Rutas e información de envíos</h2><p className="mt-0.5 text-xs text-slate-500">Logísticos y Surti · Jornada laboral, carga y atención por ruta</p></div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{rows.length}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-x-auto">
        <table className={`${styles.routeTable} w-full text-sm`}>
          <thead className="bg-slate-50 text-[10px] uppercase tracking-[.1em] text-slate-500"><tr>
            <th className="px-3 py-2.5 text-left">DT / placa</th><th className="px-3 py-2.5 text-left">Empresa</th><th className="px-2 py-2.5 text-center">Salida</th><th className="px-2 py-2.5 text-center">Jornada</th><th className="px-3 py-2.5 text-left">Estado</th><th className="px-3 py-2.5 text-left">Tripulación</th><th className="px-2 py-2.5 text-center">Envíos</th><th className="px-2 py-2.5 text-center">Cajas</th><th className="px-3 py-2.5 text-right">Avance</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.map((row) => <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-3 py-2.5"><p className="font-bold text-slate-700">{row.plate}</p><p className="text-xs text-slate-500">DT {row.dt}</p></td>
              <td className="px-3 py-2.5 text-xs font-semibold text-slate-600">{row.contractor}</td>
              <td className="px-2 py-2.5 text-center text-xs font-semibold tabular-nums text-slate-700">{row.departure}</td>
              <td className="px-2 py-2.5 text-center font-black tabular-nums text-[#10223d]">{row.duration}</td>
              <td className="px-3 py-2.5"><Status value={row.status} /></td>
              <td className="px-3 py-2.5 text-xs text-slate-600">
                {row.crew.length ? <ul className="mt-1 space-y-0.5 text-[10px] leading-tight text-slate-500">{row.crew.map((member) => <li key={member.role} title={`${member.role}: ${member.name}`}><span className="sr-only">{member.role}: </span>{member.name}</li>)}</ul> : <p className="mt-1 text-[10px] text-slate-400">Sin tripulación registrada</p>}
              </td>
              <td className="px-2 py-2.5 text-center tabular-nums text-slate-700">{row.visited}/{row.clients}</td>
              <td className="px-2 py-2.5 text-center font-semibold tabular-nums text-slate-700">{row.boxes.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</td>
              <td className="px-3 py-2.5 text-right"><span className="font-bold tabular-nums text-[#0f766e]">{row.progress}%</span><div className="mt-1 ml-auto h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0f766e]" style={{ width: `${row.progress}%` }} /></div></td>
            </tr>)}
            {!rows.length && <tr><td className="px-3 py-10 text-center text-sm text-slate-500" colSpan={9}>{loading ? "Cargando rutas y envíos…" : "No hay rutas ni envíos para esta fecha."}</td></tr>}
          </tbody>
        </table>
      </div>
      <TablePager page={safePage} setPage={setPage} title="rutas y envíos" totalPages={totalPages} />
    </section>
  );
}

function RouteIndicator({ title, rows, tone, loading }: { title: string; rows: RouteRow[]; tone: "cyan" | "blue" | "amber"; loading: boolean }) {
  const clients = rows.reduce((sum, row) => sum + row.clients, 0);
  const visited = rows.reduce((sum, row) => sum + row.visited, 0);
  const progress = clients ? Math.max(0, Math.min(100, visited / clients * 100)) : 0;
  const tones = { cyan: { badge: "border-cyan-200 bg-cyan-50 text-cyan-700", stroke: "#06b6d4" }, blue: { badge: "border-blue-200 bg-blue-50 text-blue-700", stroke: "#2563eb" }, amber: { badge: "border-amber-200 bg-amber-50 text-amber-700", stroke: "#ea7900" } };

  return <article className="flex min-w-0 flex-col items-center text-center">
    <div className="relative isolate aspect-square w-full max-w-[230px] [container-type:inline-size]" role="img" aria-label={loading ? `${title}: cargando` : `${title}: ${progress.toFixed(1)}%, ${visited} de ${clients} clientes atendidos`}>
      <svg aria-hidden="true" viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r="54" fill="white" stroke="#dae7f1" strokeWidth="10" />
        <circle cx="60" cy="60" r="54" fill="none" stroke={tones[tone].stroke} strokeWidth="10" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - (loading ? 0 : progress)} className="transition-all duration-500" />
      </svg>
      <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <strong className={`text-[22cqw] font-black leading-none tabular-nums ${tone === "amber" ? "text-amber-600" : "text-[#10223d]"}`}>{loading ? "—" : `${progress.toFixed(1)}%`}</strong>
        <span className="text-[8cqw] font-bold tabular-nums text-slate-500">{loading ? "—" : `${visited.toLocaleString("es-CO")}/${clients.toLocaleString("es-CO")}`}</span>
      </div>
    </div>
    <h3 className={`mt-3 rounded-full border px-3 py-1 text-xs font-extrabold ${tones[tone].badge}`}>{title}</h3>
  </article>;
}

function TablePager({ page, setPage, title, totalPages }: { page: number; setPage: (page: number) => void; title: string; totalPages: number }) {
  return <footer className="flex min-h-12 shrink-0 items-center justify-between border-t border-slate-100 bg-slate-50 px-3"><span className="text-[11px] text-slate-500">{totalPages > 1 ? `Página ${page + 1} de ${totalPages}` : "Todos los registros visibles"}</span><div className="flex items-center gap-2"><button aria-label={`Página anterior de ${title}`} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35" disabled={page === 0} onClick={() => setPage(page - 1)} type="button"><ChevronLeft size={16} /></button><button aria-label={`Página siguiente de ${title}`} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} type="button"><ChevronRight size={16} /></button></div></footer>;
}
function Status({ value }: { value: string }) { const tone = value === "Finalizado" ? "bg-emerald-50 text-emerald-700" : value === "En ruta" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{value}</span>; }
function validTime(value: string | undefined) { return Boolean(value && /^\d{1,2}:\d{2}/.test(value)); }
function longestDuration(rows: RouteRow[]) { return rows.map((row) => row.duration).filter((value) => /^\d{1,2}:\d{2}:\d{2}$/.test(value)).sort((a, b) => b.localeCompare(a))[0] || "—"; }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
