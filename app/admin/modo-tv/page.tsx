"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, BarChart3, Boxes, Maximize, RefreshCw, ShieldAlert, Truck, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Vehiculo } from "../../seguimiento/types";
import { getProgress, getStatus, normalizeCajasTotal } from "../../seguimiento/utils";

type Summary = { contractor: string; rutas: number; cajas: number; clientes: number; visitados: number };
type ModulationRow = { contractor: string; dt: string; date: string; modulationBoxes: number };
type TvData = { summaries: Summary[]; records: Vehiculo[]; modulationRacocimi2: ModulationRow[] };
const GALAPA = ["Logisticos", "Surti Cervezas"];

export default function AdminModoTvPage() {
  const router = useRouter();
  const [data, setData] = useState<TvData>({ summaries: [], records: [], modulationRacocimi2: [] });
  const [operationalDate, setOperationalDate] = useState("");
  const [updated, setUpdated] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/seguimiento", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo cargar el seguimiento.");
      setData({ summaries: body.summaries || [], records: body.records || [], modulationRacocimi2: body.modulationRacocimi2 || [] });
      setOperationalDate(body.today || "");
      setUpdated(new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cargar el seguimiento.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [load]);

  const today = operationalDate || bogotaToday();
  const records = data.records.filter((record) => GALAPA.includes(record.transportista) && recordDate(record) === today);
  const modules = data.modulationRacocimi2.filter((row) => GALAPA.includes(row.contractor) && row.date === today);
  const summaries = useMemo(
    () => GALAPA.map((contractor) => summaryFor(contractor, records.filter((record) => record.transportista === contractor))),
    [records],
  );
  const total = summaries.reduce(
    (acc, item) => ({ rutas: acc.rutas + item.rutas, cajas: acc.cajas + item.cajas, clientes: acc.clientes + item.clientes, visitados: acc.visitados + item.visitados }),
    { rutas: 0, cajas: 0, clientes: 0, visitados: 0 },
  );
  const progress = total.clientes ? (total.visitados / total.clientes) * 100 : 0;
  const status = records.map((record) => getStatus(getProgress(record), record));
  const inRoute = status.filter((value) => value === "En ruta").length;
  const finished = status.filter((value) => value === "Finalizado").length;
  const delayed = records.filter((record) => getProgress(record) < 50 && getStatus(getProgress(record), record) === "En ruta").length;
  const modulated = normalizeCajasTotal(modules.reduce((sum, row) => sum + Number(row.modulationBoxes || 0), 0));
  const progressItems = [
    ...summaries.map((summary) => ({ label: summary.contractor, value: summary.clientes ? (summary.visitados / summary.clientes) * 100 : 0 })),
    { label: "General", value: progress },
  ];

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }

  return (
    <main className="tech-grid min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,.10),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(15,124,88,.08),transparent_30%),#f4f7fb] text-[#10223d]">
      <header className="border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur-xl">
        <div className="flex items-center justify-between gap-4 px-6 py-5 lg:px-10 2xl:px-14 2xl:py-7">
          <div className="flex items-center gap-4">
            <button aria-label="Volver al admin" className="grid h-12 w-12 place-items-center rounded-md hover:bg-slate-100" onClick={() => router.push("/admin")} type="button"><ArrowLeft size={25} /></button>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[.18em] text-[#0f7c58] 2xl:text-base">Analítica diaria</p>
              <h1 className="text-3xl font-bold lg:text-4xl 2xl:text-5xl">Seguimiento Galapa</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold uppercase tracking-wider text-emerald-700 lg:inline-flex"><i className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,.14)]" />En vivo</span>
            <div className="hidden rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right lg:block">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Hoy · última actualización</p>
              <p className="text-sm font-bold text-slate-700">{formatDate(today)} · {updated || "—"}</p>
            </div>
            <button className="inline-flex h-12 items-center gap-2 rounded-md bg-red-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-red-700 2xl:text-base" onClick={() => router.push("/admin/modo-tv/refusal")} type="button"><ShieldAlert size={20} />Refusal TV</button>
            <button aria-label="Actualizar" className="grid h-12 w-12 place-items-center rounded-md border border-slate-200 bg-white hover:bg-slate-50" onClick={() => void load()} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={21} /></button>
            <button aria-label="Pantalla completa" className="grid h-12 w-12 place-items-center rounded-md bg-[#0f7c58] text-white hover:bg-[#0b684a]" onClick={() => void toggleFullscreen()} type="button">{fullscreen ? <X size={22} /> : <Maximize size={22} />}</button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1920px] px-6 py-7 lg:px-10 lg:py-10 2xl:px-14 2xl:py-12">
        {error && <p className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 font-semibold text-red-700">{error}</p>}
        <div className="mb-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-5 2xl:gap-7">
          <Kpi icon={<Truck />} label="Vehículos" value={total.rutas} detail="Rutas del día" />
          <Kpi icon={<Users />} label="Clientes" value={`${total.visitados}/${total.clientes}`} detail={`${progress.toFixed(1)}% visitados`} />
          <Kpi icon={<ShieldAlert />} label="Retrasados" value={delayed} detail={`${total.rutas ? ((delayed / total.rutas) * 100).toFixed(1) : "0.0"}% de rutas`} />
          <Kpi icon={<Boxes />} label="Cajas" value={total.cajas.toLocaleString("es-CO")} detail={`${modulated.toLocaleString("es-CO")} moduladas`} />
          <Kpi icon={<BarChart3 />} label="Avance global" value={`${progress.toFixed(1)}%`} detail="Seguimiento Galapa" />
        </div>
        <div className="grid gap-7 xl:grid-cols-[1.25fr_1.75fr] 2xl:gap-9">
          <section className="rounded-xl border border-slate-200 bg-white p-7 shadow-sm 2xl:p-9">
            <Title icon={<BarChart3 />} text="Avance diario" />
            <div className="mt-8 grid grid-cols-3 gap-3 sm:gap-5 2xl:gap-8">
              {progressItems.map((item, index) => <ProgressBubble accent={index === 0 ? "#06b6d4" : index === 1 ? "#2563eb" : "#d4a017"} key={item.label} label={item.label} value={item.value} />)}
            </div>
            <div className="mt-9 grid grid-cols-3 gap-3 border-t border-slate-100 pt-6 text-center 2xl:mt-12 2xl:pt-8">
              <Mini color="text-emerald-700" label="En ruta" value={inRoute} />
              <Mini color="text-blue-700" label="Finalizadas" value={finished} />
              <Mini color="text-violet-700" label="Moduladas" value={modulated.toLocaleString("es-CO")} />
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-7 shadow-sm 2xl:p-9">
            <Title icon={<Truck />} text="Estado de las contratistas · Galapa" />
            <div className="grid gap-6 md:grid-cols-2 2xl:gap-8">
              {summaries.map((summary) => <Contractor key={summary.contractor} modules={modules.filter((row) => row.contractor === summary.contractor)} records={records.filter((record) => record.transportista === summary.contractor)} summary={summary} />)}
            </div>
            {!summaries.some((summary) => summary.rutas > 0) && <p className="py-12 text-center text-slate-500">No hay información de hoy para Logisticos o Surti Cervezas.</p>}
          </section>
        </div>
      </section>
    </main>
  );
}

function summaryFor(contractor: string, records: Vehiculo[]): Summary {
  return { contractor, rutas: records.length, cajas: normalizeCajasTotal(records.reduce((sum, record) => sum + Number(record.cajas || 0), 0)), clientes: records.reduce((sum, record) => sum + Number(record.clientes || 0), 0), visitados: records.reduce((sum, record) => sum + Number(record.visitados || 0), 0) };
}
function bogotaToday() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function recordDate(record: Vehiculo) { const raw = record.fechaDespacho || record.fechaDt || record.date || record.createdAt || ""; if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10); const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/); if (!match) return ""; return `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`; }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString("es-CO"); }
function Kpi({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string | number; detail: string }) {
  const accent = label === "Retrasados" ? "bg-red-500" : label === "Cajas" ? "bg-violet-500" : label === "Avance global" ? "bg-blue-500" : "bg-emerald-500";
  return <article className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/70 p-6 shadow-[0_10px_30px_rgba(15,35,55,.08)] 2xl:p-7"><i className={`absolute inset-x-0 top-0 h-1 ${accent}`} /><div className="flex items-center justify-between"><span className="grid h-12 w-12 place-items-center rounded-lg bg-[#0f7c58] text-white shadow-lg shadow-emerald-700/15 2xl:h-14 2xl:w-14">{icon}</span><i className="h-3 w-3 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,.15)]" /></div><p className="mt-6 text-base font-semibold text-slate-500 2xl:text-lg">{label}</p><strong className="mt-1 block text-4xl font-bold tabular-nums 2xl:text-5xl">{value}</strong><p className="mt-1 text-base text-slate-400 2xl:text-lg">{detail}</p></article>;
}
function Contractor({ summary, records, modules }: { summary: Summary; records: Vehiculo[]; modules: ModulationRow[] }) {
  const statuses = records.map((record) => getStatus(getProgress(record), record));
  const route = statuses.filter((status) => status === "En ruta").length;
  const done = statuses.filter((status) => status === "Finalizado").length;
  const delayed = records.filter((record) => getProgress(record) < 50 && getStatus(getProgress(record), record) === "En ruta").length;
  const boxes = normalizeCajasTotal(modules.reduce((sum, row) => sum + Number(row.modulationBoxes || 0), 0));
  const isLogisticos = summary.contractor === "Logisticos";
  return <article className={`overflow-hidden rounded-xl border bg-white shadow-[0_12px_30px_rgba(15,35,55,.08)] ${isLogisticos ? "border-cyan-200" : "border-blue-200"}`}><header className={`relative flex items-center justify-between overflow-hidden px-5 py-4 text-white ${isLogisticos ? "bg-gradient-to-r from-[#10223d] to-[#0f7c58]" : "bg-gradient-to-r from-[#10223d] to-[#2563eb]"}`}><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-cyan-100">Contratista · en vivo</p><h3 className="mt-1 text-xl font-bold">{summary.contractor}</h3></div><div className="flex items-center gap-3"><i className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_0_4px_rgba(110,231,183,.14)]" /><Truck size={26} /></div></header><div className="grid grid-cols-3 gap-2 bg-slate-50 p-4"><Circle color="text-emerald-700 border-emerald-200 bg-emerald-50" label="En ruta" value={route} /><Circle alert={delayed > 0} color="text-red-700 border-red-200 bg-red-50" label="Retrasados" value={delayed} /><Circle color="text-blue-700 border-blue-200 bg-blue-50" label="Finalizados" value={done} /></div><div className="grid grid-cols-3 gap-3 border-t border-slate-100 p-4 text-center"><Mini color="text-[#10223d]" label="Clientes" value={`${summary.visitados}/${summary.clientes}`} /><Mini color="text-[#10223d]" label="Cajas" value={summary.cajas.toLocaleString("es-CO")} /><Mini color="text-violet-700" label="Moduladas" value={boxes.toLocaleString("es-CO")} /></div></article>;
}
function Circle({ label, value, color, alert = false }: { label: string; value: number; color: string; alert?: boolean }) { return <div className={`relative flex aspect-square flex-col items-center justify-center rounded-full border-2 shadow-sm ${color}`}>{alert && <i className="absolute right-2 top-2 h-3 w-3 animate-pulse rounded-full bg-red-600 shadow-[0_0_0_4px_rgba(220,38,38,.14)]" />}<strong className="text-3xl font-bold tabular-nums lg:text-5xl 2xl:text-6xl">{value}</strong><span className="mt-1 text-center text-[10px] font-bold uppercase tracking-wider lg:text-xs 2xl:text-sm">{label}</span></div>; }
function ProgressBubble({ label, value, accent }: { label: string; value: number; accent: string }) {
  const safe = Math.min(100, Math.max(0, value));
  const isGeneral = label === "General";
  const status = safe >= 80 ? { label: "Avance alto", tone: "text-emerald-700", dot: "bg-emerald-500" } : safe >= 50 ? { label: "En progreso", tone: "text-blue-700", dot: "bg-blue-500" } : { label: "Avance inicial", tone: "text-amber-700", dot: "bg-amber-500" };
  return <div className="flex flex-col items-center gap-2"><div className={`grid aspect-square w-full max-w-[210px] place-items-center rounded-full p-3 2xl:max-w-[270px] ${isGeneral ? "ring-4 ring-amber-100" : ""}`} style={{ background: `conic-gradient(from -90deg, ${accent} ${safe}%, #e2e8f0 0)`, boxShadow: isGeneral ? "0 14px 32px rgba(212,160,23,.24)" : `0 14px 30px ${accent}25` }}><div className="grid h-full w-full place-items-center rounded-full bg-white text-center shadow-inner"><strong className={`text-3xl font-bold tabular-nums 2xl:text-5xl ${isGeneral ? "text-amber-700" : "text-[#10223d]"}`}>{safe.toFixed(1)}%</strong><span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 2xl:text-xs">avance</span></div></div><span className={`rounded-full px-3 py-1 text-center text-sm font-bold 2xl:text-lg ${isGeneral ? "bg-amber-50 text-amber-800" : label === "Logisticos" ? "bg-cyan-50 text-cyan-800" : "bg-blue-50 text-blue-800"}`}>{label}</span><span className={`inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider ${status.tone}`}><i className={`h-2 w-2 rounded-full ${status.dot}`} />{status.label}</span></div>;
}
function Title({ icon, text }: { icon: ReactNode; text: string }) { return <h2 className="flex items-center gap-2 text-xl font-bold"><span className="text-[#0f7c58]">{icon}</span>{text}</h2>; }
function Mini({ label, value, color }: { label: string; value: string | number; color: string }) { return <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className={`mt-1 text-lg font-bold tabular-nums ${color}`}>{value}</p></div>; }
