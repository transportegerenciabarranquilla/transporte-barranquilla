"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, Boxes, MapPinCheck, Maximize, RefreshCw, Route, ShieldAlert, Truck, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTvData } from "./TvDataCache";
import type { Vehiculo } from "../../seguimiento/types";
import { getProgress, getStatus, normalizeCajasTotal } from "../../seguimiento/utils";

type Summary = { contractor: string; rutas: number; cajas: number; clientes: number; visitados: number };
type ModulationRow = { contractor: string; date: string; modulationBoxes: number };
const GALAPA = ["Logisticos", "Surti Cervezas"];

export default function AdminModoTvPage() {
  const router = useRouter();
  const { data, updated: cachedUpdated, loading, error, load } = useTvData().seguimiento;
  const operationalDate = data.today;
  const updated = formatBogotaTime(cachedUpdated);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

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
  const delayed = records.filter((record) => getProgress(record) < 50 && getStatus(getProgress(record), record) === "En ruta").length;
  const totalModules = normalizeCajasTotal(modules.reduce((sum, row) => sum + Number(row.modulationBoxes || 0), 0));

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }

  return (
    <main className="h-screen overflow-hidden bg-white text-[#10213b]" data-tv-light>
      <TvLightTheme />
      <section className="relative flex h-screen w-full flex-col overflow-hidden bg-[radial-gradient(circle_at_72%_7%,rgba(20,84,153,.22),transparent_26%),linear-gradient(145deg,#081a31,#061326_62%,#071a2f)]">
        <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(rgba(62,112,163,.13) 1px,transparent 1px),linear-gradient(90deg,rgba(62,112,163,.13) 1px,transparent 1px)", backgroundSize: "36px 36px" }} />

        <header className="relative z-10 flex min-h-20 items-center justify-between border-b border-[#193451] bg-[#07172b]/92 px-5 py-3 lg:px-7 2xl:min-h-24 2xl:px-9">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[.3em] text-emerald-600 lg:text-[10px] 2xl:text-xs">Analítica diaria</p>
            <h1 className="text-2xl font-black tracking-tight lg:text-3xl 2xl:text-4xl">Seguimiento Galapa</h1>
          </div>

          <div className="flex items-center gap-3 lg:gap-5">
            <span className="hidden items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-2 md:inline-flex">
              <i className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" />
              <strong className="text-[9px] font-black uppercase text-emerald-700 2xl:text-[10px]">En vivo</strong>
            </span>
            <div className="hidden rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right sm:block"><p className="text-[7px] font-bold uppercase text-slate-400">Hoy · última actualización</p><p className="text-[10px] font-black tabular-nums text-slate-700 2xl:text-xs">{formatShortDate(today)} · {updated}</p></div>
            <button className="tv-refusal-button inline-flex h-10 items-center gap-2 rounded-lg border border-red-600 bg-red-600 px-3 text-xs font-bold text-white shadow-md shadow-red-500/20 hover:bg-red-700 2xl:text-sm" onClick={() => router.push("/admin/modo-tv/refusal")} type="button"><ShieldAlert size={17} />Refusal TV</button>
            <button className="tv-refusal-com-button inline-flex h-10 items-center gap-2 rounded-lg border border-orange-500 bg-orange-500 px-3 text-xs font-bold text-white shadow-md shadow-orange-500/20 hover:bg-orange-600 2xl:text-sm" onClick={() => router.push("/admin/modo-tv/refusal-com")} type="button"><ShieldAlert size={17} />Refusal por COM</button>
            <button className="tv-range-button inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-3 text-xs font-bold text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-700 2xl:text-sm" onClick={() => router.push("/admin/modo-tv/rango")} type="button"><MapPinCheck size={17} />Rango TV</button>
            <button className="tv-sip-button inline-flex h-10 items-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-3 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 2xl:text-sm" onClick={() => router.push("/admin/modo-tv/ruta-sip")} type="button"><Route size={17} />Ruta SIP</button>
            <button aria-label="Actualizar" className="grid h-10 w-10 place-items-center rounded-lg border border-[#294765] bg-[#0a203b] text-cyan-200 hover:bg-[#102b4d]" onClick={() => void load()} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={17} /></button>
            <button aria-label="Pantalla completa" className="grid h-10 w-10 place-items-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20" onClick={() => void toggleFullscreen()} type="button">{fullscreen ? <X size={18} /> : <Maximize size={18} />}</button>
          </div>
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 p-4 lg:gap-4 lg:p-5">
          {error && <p className="rounded-lg border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm font-bold text-red-200">{error}</p>}

          <section className="hidden">
            <div className="absolute inset-y-0 right-0 w-[48%] opacity-50">
              <OperationsScene />
            </div>
            <div className="relative z-10 grid h-full grid-cols-[145px_1fr] items-center gap-5 px-6 py-2 lg:grid-cols-[175px_1fr] lg:px-8 2xl:grid-cols-[200px_1fr] 2xl:gap-7">
              <ProgressDonut value={progress} />
              <div className="max-w-md 2xl:max-w-xl">
                <p className="text-base font-extrabold 2xl:text-xl">Avance general</p>
                <p className="mt-2 text-xs text-cyan-100/75 2xl:text-sm">{total.clientes.toLocaleString("es-CO")} clientes</p>
                <p className="text-xs font-bold text-emerald-300 2xl:text-sm">{total.visitados.toLocaleString("es-CO")} completados</p>
                <div className="mt-4 h-3 max-w-sm overflow-hidden rounded-full bg-[#0a4f8e] 2xl:h-4 2xl:max-w-lg">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-cyan-300 shadow-[0_0_15px_rgba(52,211,153,.55)]" style={{ width: `${Math.min(100, progress)}%` }} />
                </div>
              </div>
            </div>
            <div className="absolute bottom-8 right-8 z-10 hidden max-w-[180px] text-xs leading-5 text-cyan-50/80 xl:block 2xl:right-14 2xl:max-w-[230px] 2xl:text-sm">
              Personas que<br />mueven posibilidades
              <i className="mt-2 block h-0.5 w-12 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,.55)]" />
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4 2xl:gap-5">
            <DashboardMetric color="green" detail="Rutas del día" icon={<Truck />} label="Vehículos" value={total.rutas.toLocaleString("es-CO")} />
            <DashboardMetric color="green" detail={`${progress.toFixed(1)}% visitados`} icon={<Users />} label="Clientes" value={`${total.visitados.toLocaleString("es-CO")}/${total.clientes.toLocaleString("es-CO")}`} />
            <DashboardMetric color="red" detail={`${total.rutas ? ((delayed / total.rutas) * 100).toFixed(1) : "0.0"}% de rutas`} icon={<ShieldAlert />} label="Retrasados" value={delayed.toLocaleString("es-CO")} />
            <DashboardMetric color="violet" detail={`${totalModules.toLocaleString("es-CO")} moduladas`} icon={<Boxes />} label="Cajas" value={total.cajas.toLocaleString("es-CO")} />
            <DashboardMetric color="blue" detail="Seguimiento Galapa" icon={<Activity />} label="Avance global" value={`${progress.toFixed(1)}%`} />
          </section>

          <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[0.86fr_1.14fr] 2xl:gap-5">
            <DailyProgressPanel summaries={summaries} total={total} />
            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#1d4165] bg-[#071a32]/95 shadow-[0_14px_35px_rgba(0,0,0,.22)]">
              <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#1c3f61] px-5 text-lg font-extrabold 2xl:h-16 2xl:text-xl"><Truck className="text-cyan-600" size={23} />Estado de las contratistas · Galapa</header>
              <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 p-3 2xl:gap-5 2xl:p-4">
                {summaries.map((summary) => (
                  <ContractorCard
                    key={summary.contractor}
                    modules={modules.filter((row) => row.contractor === summary.contractor)}
                    records={records.filter((record) => record.transportista === summary.contractor)}
                    summary={summary}
                  />
                ))}
              </div>
            </section>
          </section>
        </div>
      </section>
    </main>
  );
}

function TvLightTheme() {
  return <style jsx global>{`
    [data-tv-light] > section { background: #f4f8fb !important; color: #10213b !important; }
    [data-tv-light] section > header { background: rgba(255,255,255,.97) !important; color: #10213b !important; border-color: #dbe5ef !important; }
    [data-tv-light] > section > header button { background: #f8fafc !important; color: #087d9c !important; border-color: #dbe5ef !important; }
    [data-tv-light] > section > header button.tv-refusal-button { background: #dc2626 !important; color: #fff !important; border-color: #dc2626 !important; }
    [data-tv-light] > section > header button.tv-range-button { background: #059669 !important; color: #fff !important; border-color: #059669 !important; }
    [data-tv-light] > section > header button.tv-sip-button { background: #2563eb !important; color: #fff !important; border-color: #2563eb !important; }
    [data-tv-light] section[class*="rounded"], [data-tv-light] article { background: #fff !important; color: #10213b !important; border-color: #dbe5ef !important; box-shadow: 0 10px 28px rgba(15,39,68,.09) !important; }
    [data-tv-light] div[class*="bg-[#0a274a]"], [data-tv-light] div[class*="bg-[#092644]"], [data-tv-light] div[class*="bg-[#071d38]"] { background: #fff !important; }
    [data-tv-light] [class*="text-cyan-100"], [data-tv-light] [class*="text-cyan-50"] { color: #64748b !important; }
    [data-tv-light] [class*="text-cyan-200"], [data-tv-light] [class*="text-cyan-300"] { color: #087d9c !important; }
    [data-tv-light] section[class*="rounded"] strong[class*="text-white"] { color: #10213b !important; }
    [data-tv-light] .tv-operation-scene { background: transparent !important; }
  `}</style>;
}

function DailyProgressPanel({ summaries, total }: { summaries: Summary[]; total: { rutas: number; cajas: number; clientes: number; visitados: number } }) {
  const circles = [
    ...summaries,
    { contractor: "General", ...total },
  ];

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#1d4165] bg-[#071a32]/95 shadow-[0_14px_35px_rgba(0,0,0,.22)]">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1c3f61] px-5 text-base font-extrabold 2xl:h-14 2xl:text-lg"><Activity className="text-cyan-600" size={20} />Avance diario</header>
      <div className="grid min-h-0 flex-1 grid-cols-3 items-center gap-3 px-4 py-3 2xl:gap-5 2xl:px-6">
        {circles.map((item, index) => <DailyProgressBubble accent={index === 0 ? "#22d3ee" : index === 1 ? "#3b82f6" : "#d4a017"} item={item} key={item.contractor} />)}
      </div>
      <footer className="grid h-16 shrink-0 grid-cols-3 items-center border-t border-slate-200 bg-slate-50/70 text-center 2xl:h-20">
        <ProgressMini label="Rutas" value={total.rutas.toLocaleString("es-CO")} />
        <ProgressMini label="Clientes" value={`${total.visitados.toLocaleString("es-CO")}/${total.clientes.toLocaleString("es-CO")}`} />
        <ProgressMini label="Cajas" value={total.cajas.toLocaleString("es-CO")} />
      </footer>
    </section>
  );
}

function DailyProgressBubble({ item, accent }: { item: Summary; accent: string }) {
  const value = item.clientes ? (item.visitados / item.clientes) * 100 : 0;
  return <div className="flex min-w-0 flex-col items-center gap-2"><div className="grid aspect-square w-[clamp(155px,11vw,205px)] place-items-center rounded-full p-3.5" style={{ background: `conic-gradient(from -90deg,${accent} ${Math.min(100, value)}%,#dbe7f1 0)`, boxShadow: `0 10px 30px ${accent}24` }}><div className="grid h-full w-full place-items-center rounded-full bg-white text-center shadow-inner"><div><strong className={`block text-[clamp(1.8rem,2.7vw,2.8rem)] font-black tabular-nums ${item.contractor === "General" ? "text-amber-600" : "text-[#10213b]"}`}>{value.toFixed(1)}%</strong><span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 2xl:text-[11px]">{item.visitados}/{item.clientes}</span></div></div></div><span className={`truncate rounded-full border px-3 py-1 text-[11px] font-extrabold 2xl:text-sm ${item.contractor === "General" ? "border-amber-200 bg-amber-50 text-amber-700" : item.contractor === "Logisticos" ? "border-cyan-200 bg-cyan-50 text-cyan-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>{item.contractor}</span></div>;
}

function ProgressMini({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 2xl:text-xs">{label}</p><p className="mt-0.5 text-2xl font-black tabular-nums text-[#10213b] 2xl:text-3xl">{value}</p></div>;
}

function ProgressDonut({ value }: { value: number }) {
  const safe = Math.min(100, Math.max(0, value));
  return <div className="grid aspect-square w-[clamp(135px,18vh,190px)] place-items-center rounded-full p-[clamp(12px,1.5vh,17px)]" style={{ background: `conic-gradient(from -90deg,#34d399 ${safe}%,#174a7a 0)`, boxShadow: "0 0 35px rgba(16,185,129,.14)" }}><div className="grid h-full w-full place-items-center rounded-full bg-[#0a274a] shadow-inner"><strong className="text-[clamp(1.9rem,4vh,3rem)] font-black tabular-nums">{safe.toFixed(1)}%</strong></div></div>;
}

function DashboardMetric({ icon, label, value, detail, color }: { icon: ReactNode; label: string; value: string; detail: string; color: "green" | "red" | "violet" | "blue" }) {
  const tones = { green: { icon: "from-emerald-500 to-emerald-700 shadow-emerald-500/20", line: "bg-emerald-500" }, red: { icon: "from-rose-500 to-red-700 shadow-red-500/20", line: "bg-rose-500" }, violet: { icon: "from-violet-500 to-blue-700 shadow-violet-500/20", line: "bg-violet-500" }, blue: { icon: "from-blue-500 to-cyan-600 shadow-blue-500/20", line: "bg-blue-500" } };
  return <article className="relative overflow-hidden rounded-lg border border-[#1e456e] bg-gradient-to-br from-[#0b2b51] to-[#071d38] px-4 py-3 shadow-[0_10px_25px_rgba(0,0,0,.18)] 2xl:px-5 2xl:py-4"><i className={`absolute left-0 right-0 top-0 h-1 ${tones[color].line}`} /><i className="absolute right-4 top-5 h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_9px_rgba(16,185,129,.55)]" /><div className="flex items-start gap-3 pt-1"><span className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white shadow-lg 2xl:h-14 2xl:w-14 ${tones[color].icon}`}>{icon}</span><div className="min-w-0"><p className="text-sm font-bold text-slate-600 2xl:text-base">{label}</p><strong className="block truncate text-[clamp(1.75rem,2.45vw,2.65rem)] font-black tabular-nums leading-none tracking-tight text-[#10213b]">{value}</strong><p className="mt-1 text-[10px] font-medium text-slate-500 2xl:text-xs">{detail}</p></div></div></article>;
}

function ContractorCard({ summary, records, modules }: { summary: Summary; records: Vehiculo[]; modules: ModulationRow[] }) {
  const statuses = records.map((record) => getStatus(getProgress(record), record));
  const inRoute = statuses.filter((status) => status === "En ruta").length;
  const completed = statuses.filter((status) => status === "Finalizado").length;
  const delayed = records.filter((record) => getProgress(record) < 50 && getStatus(getProgress(record), record) === "En ruta").length;
  const boxes = normalizeCajasTotal(modules.reduce((sum, row) => sum + Number(row.modulationBoxes || 0), 0));
  const logisticos = summary.contractor === "Logisticos";

  return <article className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-0 shadow-[0_10px_28px_rgba(15,39,68,.10)]"><header className={`flex h-[72px] shrink-0 items-center justify-between px-5 text-white 2xl:h-20 ${logisticos ? "bg-gradient-to-r from-emerald-700 to-teal-600" : "bg-gradient-to-r from-[#102f67] to-blue-600"}`}><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-white/75 2xl:text-xs">Contratista · En vivo</p><h3 className="mt-1 text-lg font-extrabold 2xl:text-xl">{summary.contractor}</h3></div><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_10px_#6ee7b7]" /><Truck size={24} /></span></header><div className="grid min-h-0 flex-1 grid-cols-3 items-center gap-2 px-3 py-4 2xl:px-4"><StatusOrb color="emerald" label="En ruta" value={inRoute} /><StatusOrb color="rose" label="Retrasados" value={delayed} /><StatusOrb color="blue" label="Finalizados" value={completed} /></div><footer className="grid h-[72px] shrink-0 grid-cols-3 items-center border-t border-slate-200 bg-slate-50/70 text-center 2xl:h-20"><ContractorDatum label="Clientes" value={`${summary.visitados}/${summary.clientes}`} /><ContractorDatum label="Cajas" value={summary.cajas.toLocaleString("es-CO")} /><ContractorDatum label="Moduladas" value={boxes.toLocaleString("es-CO")} /></footer></article>;
}

function StatusOrb({ label, value, color }: { label: string; value: number; color: "emerald" | "rose" | "blue" }) {
  const tones = { emerald: "border-emerald-200 bg-emerald-50 text-emerald-700", rose: "border-rose-200 bg-rose-50 text-rose-600", blue: "border-blue-200 bg-blue-50 text-blue-700" };
  return <div className={`mx-auto grid aspect-square w-[clamp(112px,8.5vw,145px)] place-items-center rounded-full border-2 text-center shadow-md ${tones[color]}`}><div><strong className="block text-[clamp(2.1rem,3.1vw,3rem)] font-black tabular-nums">{value}</strong><span className="text-[10px] font-black uppercase tracking-wide 2xl:text-xs">{label}</span></div></div>;
}

function ContractorDatum({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 2xl:text-xs">{label}</p><strong className="block truncate px-1 text-base font-black tabular-nums text-[#10213b] 2xl:text-xl">{value}</strong></div>;
}

function OperationsScene() {
  return <div className="tv-operation-scene relative h-full w-full overflow-hidden bg-[linear-gradient(90deg,rgba(6,26,53,0),rgba(5,21,42,.72))]"><div className="absolute bottom-7 right-12 h-24 w-[54%] border border-blue-300/10 bg-[#17395b]/35 [clip-path:polygon(12%_20%,100%_0,100%_100%,0_100%,0_42%)]" /><div className="absolute bottom-7 right-[37%] h-16 w-20 border border-cyan-200/10 bg-[#1b456e]/35" /><Truck className="absolute bottom-8 right-[23%] text-cyan-100/15" size={86} strokeWidth={1} /><div className="absolute bottom-7 left-0 right-0 h-px bg-cyan-200/15" /><div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_48%,rgba(59,130,246,.20),transparent_24%)]" /></div>;
}

function summaryFor(contractor: string, records: Vehiculo[]): Summary {
  return { contractor, rutas: records.length, cajas: normalizeCajasTotal(records.reduce((sum, record) => sum + Number(record.cajas || 0), 0)), clientes: records.reduce((sum, record) => sum + Number(record.clientes || 0), 0), visitados: records.reduce((sum, record) => sum + Number(record.visitados || 0), 0) };
}
function bogotaToday() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function recordDate(record: Vehiculo) { const raw = record.fechaDespacho || record.fechaDt || record.date || record.createdAt || ""; if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10); const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/); if (!match) return ""; return `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`; }
function formatBogotaTime(value: string | undefined) { return value ? new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—"; }
function formatShortDate(value: string) { return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
