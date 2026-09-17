"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock3, PackageCheck, Route, Truck } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { normalizeContractorName } from "../lib/contractors";
import type { Vehiculo } from "../seguimiento/types";
import { calculateRouteTime, getStatus, toDateKey } from "../seguimiento/utils";
import { ExitTvButton } from "../admin/modo-tv/ExitTvButton";

const LOGISTICOS = "logisticos";
const SURTI = "surticervezas";

export default function RutaSipPage() {
  const router = useRouter();
  const pathname = usePathname();
  const isTvMode = pathname.startsWith("/admin/modo-tv");
  const [today, setToday] = useState(() => dateKey(new Date()));
  const [now, setNow] = useState(() => new Date());
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [vehicles, setVehicles] = useState<Vehiculo[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const loadRoutes = async () => {
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
        if (active) setLoadingRoutes(false);
      }
    };
    void loadRoutes();
    const interval = window.setInterval(() => void loadRoutes(), 30_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    fetch("/api/session/session", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body) => setAllowed(Boolean(body?.session?.isAdmin || normalizeContractorName(body?.session?.contractor) === LOGISTICOS)))
      .catch(() => setAllowed(false));
  }, []);

  const routes = useMemo(() => vehicles
    .filter((vehicle) => toDateKey(vehicle.fechaDespacho || vehicle.date || vehicle.createdAt) === today)
    .filter((vehicle) => [LOGISTICOS, SURTI].includes(normalizeContractorName(vehicle.transportista)))
    .map((vehicle) => toRouteRow(vehicle, now))
    .sort((a, b) => a.contractor.localeCompare(b.contractor) || a.departure.localeCompare(b.departure) || a.dt.localeCompare(b.dt, "es-CO", { numeric: true })), [vehicles, now, today]);

  const logisticosRoutes = routes.filter((route) => route.contractorKey === LOGISTICOS);
  const surtiRoutes = routes.filter((route) => route.contractorKey === SURTI);
  const activeRoutes = routes.filter((route) => route.departure !== "Pendiente");
  const totalBoxes = routes.reduce((sum, route) => sum + route.boxes, 0);
  const totalClients = routes.reduce((sum, route) => sum + route.clients, 0);

  if (allowed === null) return <main className="min-h-screen bg-slate-50" />;
  if (!allowed) return <main className="grid min-h-screen place-items-center bg-slate-50 px-5"><section className="max-w-md rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm"><h1 className="text-xl font-bold text-slate-900">Ruta SIP</h1><p className="mt-2 text-sm text-slate-500">Este módulo está disponible para Logísticos Galapa.</p><button className="mt-5 rounded-xl bg-[#10223d] px-4 py-2 text-sm font-semibold text-white" onClick={() => router.push("/")} type="button">Volver</button></section></main>;

  return (
    <main className={`${isTvMode ? "h-screen overflow-hidden" : "min-h-screen"} bg-[radial-gradient(circle_at_92%_0%,rgba(37,99,235,.12),transparent_24rem),linear-gradient(135deg,#f8fafc,#eff6ff)] text-slate-900`}>
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3"><button aria-label="Volver" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-[#10223d] shadow-sm hover:bg-slate-50" onClick={() => router.push(isTvMode ? "/admin/modo-tv" : "/")} type="button"><ArrowLeft size={19} /></button><span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#0f766e] to-[#2563eb] text-white shadow-lg shadow-blue-200"><Route size={22} /></span><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#0f766e]">{isTvMode ? "Modo TV · Galapa" : "Gestión Central · Logísticos Galapa"}</p><h1 className="text-2xl font-black tracking-tight text-[#10223d]">Ruta SIP</h1></div></div>
          <div className="flex items-center gap-2"><label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm"><CalendarDays size={16} className="text-[#2563eb]" /><span className="sr-only">Fecha</span><input className="bg-transparent outline-none" onChange={(event) => setToday(event.target.value)} type="date" value={today} /></label>{isTvMode ? <ExitTvButton /> : null}</div>
        </div>
      </header>

      <section className={`mx-auto max-w-[1800px] space-y-5 px-5 sm:px-8 ${isTvMode ? "h-[calc(100vh-77px)] overflow-hidden py-4" : "py-6"}`}>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_35px_rgba(15,35,58,.07)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#2563eb]">Jornada laboral</p><h2 className="mt-1 text-lg font-bold text-[#10223d]">Horas de las rutas</h2></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">{activeRoutes.length} rutas en jornada</span></div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <HourMetric icon={<Truck size={18} />} label="Logísticos" value={logisticosRoutes.length} detail="rutas programadas" tone="blue" />
            <HourMetric icon={<Truck size={18} />} label="Surti Cervezas" value={surtiRoutes.length} detail="rutas programadas" tone="teal" />
            <HourMetric icon={<Clock3 size={18} />} label="Mayor jornada" value={longestDuration(activeRoutes)} detail="desde la salida" tone="amber" />
            <HourMetric icon={<PackageCheck size={18} />} label="Envíos del día" value={totalClients.toLocaleString("es-CO")} detail={`${totalBoxes.toLocaleString("es-CO")} cajas`} tone="violet" />
          </div>
        </section>

        {loadError ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{loadError}</p> : null}
        <section className="grid gap-5 xl:grid-cols-[minmax(420px,1.15fr)_minmax(360px,.85fr)]">
          <RouteTable rows={logisticosRoutes} title="Rutas" tone="blue" />
          <ShipmentsTable loading={loadingRoutes} rows={routes} />
        </section>
      </section>
    </main>
  );
}

type RouteRow = { id: string; contractor: string; contractorKey: string; dt: string; plate: string; departure: string; duration: string; status: string; clients: number; visited: number; boxes: number; hl: number; progress: number };

function toRouteRow(vehicle: Vehiculo, now: Date): RouteRow {
  const clients = Number(vehicle.clientes || 0);
  const visited = Number(vehicle.visitados || 0);
  return { id: vehicle.recordId || `${vehicle.transportista}-${vehicle.transporte}-${vehicle.vehiculo}`, contractor: vehicle.transportista || "Sin contratista", contractorKey: normalizeContractorName(vehicle.transportista), dt: vehicle.transporte || "Sin DT", plate: vehicle.vehiculo || "Sin placa", departure: validTime(vehicle.horaSalida) ? vehicle.horaSalida : "Pendiente", duration: calculateRouteTime(vehicle, now), status: getStatus(clients ? Math.round(visited / clients * 100) : 0, vehicle), clients, visited, boxes: Number(vehicle.cajas || 0), hl: Number(vehicle.hl || 0), progress: clients ? Math.min(100, Math.round(visited / clients * 100)) : 0 };
}

function HourMetric({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string | number; detail: string; tone: "blue" | "teal" | "amber" | "violet" }) { const tones = { blue: "bg-blue-50 text-blue-700", teal: "bg-teal-50 text-teal-700", amber: "bg-amber-50 text-amber-700", violet: "bg-violet-50 text-violet-700" }; return <article className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"><span className={`grid h-9 w-9 place-items-center rounded-lg ${tones[tone]}`}>{icon}</span><p className="mt-3 text-xs font-semibold text-slate-500">{label}</p><strong className="mt-1 block text-2xl font-black tabular-nums text-[#10223d]">{value}</strong><p className="mt-1 text-[11px] text-slate-500">{detail}</p></article>; }
function RouteTable({ compact = false, rows, title, tone }: { compact?: boolean; rows: RouteRow[]; title: string; tone: "blue" | "teal" }) {
  const [page, setPage] = useState(0);
  const pageSize = compact ? 6 : 8;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const visibleRows = rows.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const heading = tone === "blue" ? "text-blue-700" : "text-teal-700";

  return <section className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className={`text-base font-bold ${heading}`}>{title}</h2><p className="mt-0.5 text-xs text-slate-500">Horas de Jornada Laboral</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{rows.length}</span></header><div className="min-h-0 flex-1 overflow-x-auto"><table className="w-full min-w-[500px] text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-[.1em] text-slate-500"><tr><th className="px-3 py-2.5 text-left">DT / placa</th><th className="px-2 py-2.5 text-center">Salida</th><th className="px-2 py-2.5 text-center">Jornada</th><th className="px-3 py-2.5 text-right">Estado</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleRows.map((row) => <tr key={row.id}><td className="px-3 py-2.5"><p className="font-bold text-slate-700">{row.plate}</p><p className="text-xs text-slate-500">DT {row.dt}</p></td><td className="px-2 py-2.5 text-center text-xs font-semibold tabular-nums text-slate-700">{row.departure}</td><td className="px-2 py-2.5 text-center text-sm font-black tabular-nums text-[#10223d]">{row.duration}</td><td className="px-3 py-2.5 text-right"><Status value={row.status} /></td></tr>)}{!rows.length && <tr><td className="px-3 py-10 text-center text-sm text-slate-500" colSpan={4}>No hay rutas para esta fecha.</td></tr>}</tbody></table></div><TablePager page={safePage} setPage={setPage} title={title} totalPages={totalPages} /></section>;
}
function ShipmentsTable({ loading, rows }: { loading: boolean; rows: RouteRow[] }) {
  const [page, setPage] = useState(0);
  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const visibleRows = rows.slice(safePage * pageSize, (safePage + 1) * pageSize);

  return <section className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-100 px-4 py-3"><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#0f766e]">Información de envíos</p><h2 className="mt-1 text-base font-bold text-[#10223d]">Carga y atención por ruta</h2></header><div className="min-h-0 flex-1 overflow-x-auto"><table className="w-full min-w-[500px] text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-[.1em] text-slate-500"><tr><th className="px-3 py-2.5 text-left">Ruta</th><th className="px-2 py-2.5 text-center">Envíos</th><th className="px-2 py-2.5 text-center">Cajas</th><th className="px-3 py-2.5 text-right">Avance</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleRows.map((row) => <tr key={row.id}><td className="px-3 py-2.5"><p className="font-bold text-slate-700">DT {row.dt}</p><p className="truncate text-xs text-slate-500">{row.contractor}</p></td><td className="px-2 py-2.5 text-center tabular-nums text-slate-700">{row.visited}/{row.clients}</td><td className="px-2 py-2.5 text-center font-semibold tabular-nums text-slate-700">{row.boxes.toLocaleString("es-CO")}</td><td className="px-3 py-2.5 text-right"><span className="font-bold tabular-nums text-[#0f766e]">{row.progress}%</span><div className="mt-1 ml-auto h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0f766e]" style={{ width: `${row.progress}%` }} /></div></td></tr>)}{!rows.length && <tr><td className="px-3 py-10 text-center text-sm text-slate-500" colSpan={4}>{loading ? "Cargando envíos de las rutas…" : "No hay envíos para esta fecha."}</td></tr>}</tbody></table></div><TablePager page={safePage} setPage={setPage} title="envíos" totalPages={totalPages} /></section>;
}

function TablePager({ page, setPage, title, totalPages }: { page: number; setPage: (page: number) => void; title: string; totalPages: number }) {
  return <footer className="flex min-h-12 shrink-0 items-center justify-between border-t border-slate-100 bg-slate-50 px-3"><span className="text-[11px] text-slate-500">{totalPages > 1 ? `Página ${page + 1} de ${totalPages}` : "Todos los registros visibles"}</span><div className="flex items-center gap-2"><button aria-label={`Página anterior de ${title}`} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35" disabled={page === 0} onClick={() => setPage(page - 1)} type="button"><ChevronLeft size={16} /></button><button aria-label={`Página siguiente de ${title}`} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} type="button"><ChevronRight size={16} /></button></div></footer>;
}
function Status({ value }: { value: string }) { const tone = value === "Finalizado" ? "bg-emerald-50 text-emerald-700" : value === "En ruta" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{value}</span>; }
function validTime(value: string | undefined) { return Boolean(value && /^\d{1,2}:\d{2}/.test(value)); }
function longestDuration(rows: RouteRow[]) { return rows.map((row) => row.duration).filter((value) => /^\d{1,2}:\d{2}:\d{2}$/.test(value)).sort((a, b) => b.localeCompare(a))[0] || "—"; }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
