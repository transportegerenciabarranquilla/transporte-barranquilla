"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, RefreshCw, TriangleAlert, XCircle } from "lucide-react";
import { buildModulationAdherence, MODULATION_ADHERENCE_CONTRACTORS, summarizeModulationAdherence, type DailyModulationAdherence, type ModulationAdherenceDetail } from "../../lib/modulationAdherence";
import type { ModulacionRegistro } from "../../lib/modulacionStorage";
import type { PuntoCoronaRouteReport } from "../../lib/puntoCoronaRoutesStorage";

type DateRange = { from: string; to: string };
const COLORS: Record<string, string> = { "Surti Cervezas": "#7c3aed", Logisticos: "#0f8398", "HL Logisticos": "#c68c2e" };

export default function AdminAdherenciaPage() {
  const router = useRouter();
  const [initialRange] = useState(defaultDateRange);
  const [range, setRange] = useState<DateRange>(initialRange);
  const [appliedRange, setAppliedRange] = useState<DateRange>(initialRange);
  const [reports, setReports] = useState<PuntoCoronaRouteReport[]>([]);
  const [modulations, setModulations] = useState<ModulacionRegistro[]>([]);
  const [contractor, setContractor] = useState("Todas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ adherencia: "1", desde: appliedRange.from, hasta: appliedRange.to });
    setLoading(true);
    setError("");
    Promise.all([
      fetch(`/api/admin/rango?${params}`, { cache: "no-store", signal: controller.signal }),
      fetch("/api/modulaciones", { cache: "no-store", signal: controller.signal }),
    ])
      .then(async ([rangeResponse, modulationResponse]) => {
        const [rangeBody, modulationBody] = await Promise.all([safeJson(rangeResponse), safeJson(modulationResponse)]);
        if (!rangeResponse.ok) throw new Error(rangeBody.error || "No se pudieron consultar los archivos BEES.");
        if (!modulationResponse.ok) throw new Error(modulationBody.error || "No se pudieron consultar las modulaciones.");
        setReports(rangeBody.reports || []);
        setModulations(modulationBody.records || []);
      })
      .catch((caught) => {
        if ((caught as Error).name !== "AbortError") setError(caught instanceof Error ? caught.message : "No se pudo calcular la adherencia.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [appliedRange.from, appliedRange.to, refreshKey]);

  const adherence = useMemo(() => buildModulationAdherence(reports, modulations), [modulations, reports]);
  const scopedDaily = useMemo(() => contractor === "Todas" ? adherence.daily : adherence.daily.filter((row) => row.contractor === contractor), [adherence.daily, contractor]);
  const summaries = useMemo(() => summarizeModulationAdherence(scopedDaily).filter((row) => contractor === "Todas" || row.contractor === contractor), [contractor, scopedDaily]);
  const measuredDays = scopedDaily.filter((row) => row.percentage !== null);
  const globalAverage = measuredDays.length ? measuredDays.reduce((sum, row) => sum + Number(row.percentage), 0) / measuredDays.length : null;
  const totals = summaries.reduce((result, row) => ({ rejected: result.rejected + row.rejected, modulated: result.modulated + row.modulated, pending: result.pending + row.pending }), { rejected: 0, modulated: 0, pending: 0 });

  function applyRange() {
    if (range.from > range.to) return setError("La fecha inicial no puede superar la fecha final.");
    setAppliedRange({ ...range });
    setRefreshKey((value) => value + 1);
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-5 py-4 sm:px-8">
          <button aria-label="Volver al panel admin" className="grid h-10 w-10 place-items-center rounded-lg text-[#10223d] hover:bg-slate-100" onClick={() => router.push("/admin")} type="button"><ArrowLeft size={19} /></button>
          <div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7c3aed]">Módulo admin</p><h1 className="truncate text-2xl font-semibold text-[#10223d]">Adherencia a la modulación</h1></div>
          <button aria-label="Actualizar datos" className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)} type="button"><RefreshCw className={loading ? "animate-spin" : ""} size={17} /></button>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8">
        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto] xl:items-end">
            <DateInput label="Desde" max={range.to} onChange={(from) => setRange({ ...range, from })} value={range.from} />
            <DateInput label="Hasta" min={range.from} onChange={(to) => setRange({ ...range, to })} value={range.to} />
            <label className="text-sm font-semibold text-[#10223d]"><span className="mb-1 block text-xs uppercase tracking-[0.12em] text-slate-500">Contratista</span><select className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-[#7c3aed] focus:ring-2 focus:ring-violet-100" onChange={(event) => setContractor(event.target.value)} value={contractor}><option value="Todas">Todas las contratistas</option>{MODULATION_ADHERENCE_CONTRACTORS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <button className="h-11 rounded-lg bg-[#10223d] px-6 text-sm font-semibold text-white hover:bg-[#183657] disabled:opacity-60" disabled={loading} onClick={applyRange} type="button">{loading ? "Calculando..." : "Aplicar fechas"}</button>
          </div>
          <p className="mt-3 text-xs text-slate-500">Se evalúan únicamente clientes rechazados en BEES. Si existe una modulación del mismo día, contratista, DT y cliente, cumple; de lo contrario queda pendiente.</p>
        </section>

        {error ? <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"><TriangleAlert size={18} />{error}</div> : null}

        <section className={`mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 ${loading ? "animate-pulse opacity-50" : ""}`}>
          <Metric icon={<ClipboardCheck size={20} />} label="Promedio diario" tone="violet" value={formatPercentage(globalAverage)} />
          <Metric icon={<CheckCircle2 size={20} />} label="Modulados" tone="green" value={totals.modulated.toLocaleString("es-CO")} />
          <Metric icon={<XCircle size={20} />} label="Pendientes" tone="amber" value={totals.pending.toLocaleString("es-CO")} />
          <Metric icon={<TriangleAlert size={20} />} label="Rechazados BEES" tone="blue" value={totals.rejected.toLocaleString("es-CO")} />
        </section>

        <div className="space-y-7">{summaries.map((summary) => <ContractorSection daily={scopedDaily.filter((row) => row.contractor === summary.contractor)} details={adherence.details.filter((row) => row.contractor === summary.contractor)} key={summary.contractor} summary={summary} />)}</div>

      </div>
    </main>
  );
}

function ContractorSection({ daily, details, summary }: { daily: DailyModulationAdherence[]; details: ModulationAdherenceDetail[]; summary: ReturnType<typeof summarizeModulationAdherence>[number] }) {
  const color = COLORS[summary.contractor];
  const weekly = buildWeeklyAdherence(daily);
  return <section><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Contratista</p><h2 className="text-xl font-semibold text-[#10223d]">{summary.contractor}</h2></div><p className="text-xs font-semibold text-slate-500">{summary.daysWithCases ? `${summary.daysWithCases} días con casos` : "Sin casos"}</p></div><div className="mb-3 grid gap-3 sm:grid-cols-3"><SmallMetric label="Promedio diario" value={formatPercentage(summary.dailyAverage)} color={color} /><SmallMetric label="Modulados" value={summary.modulated.toLocaleString("es-CO")} color="#059669" /><SmallMetric label="Pendientes" value={summary.pending.toLocaleString("es-CO")} color="#a16207" /></div><div className="grid gap-4 xl:grid-cols-2"><AdherenceChart color={color} emptyText="No hay archivos BEES de esta contratista en el período." points={daily.map((row) => ({ key: row.date, label: formatShortDate(row.date), percentage: row.percentage, modulated: row.modulated, rejected: row.rejected }))} title="Adherencia diaria" /><AdherenceChart color={color} emptyText="No hay semanas con datos para esta contratista." points={weekly} title="Adherencia semanal" /></div><OperationalRanking details={details} /></section>;
}

type ChartPoint = { key: string; label: string; percentage: number | null; modulated: number; rejected: number };

function AdherenceChart({ color, emptyText, points, title }: { color: string; emptyText: string; points: ChartPoint[]; title: string }) {
  return <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-semibold text-[#10223d]">{title}</h3>{points.length ? <div className="mt-5 overflow-x-auto pb-1"><div className="flex h-60 min-w-max items-end gap-4 border-b border-slate-200 bg-[linear-gradient(to_top,rgba(148,163,184,.20)_1px,transparent_1px)] bg-[size:100%_33.333%] px-4">{points.map((point) => <div className="flex h-full w-20 shrink-0 flex-col items-center justify-end" key={point.key}><div className="flex h-[190px] w-full flex-col items-center justify-end"><span className="mb-2 whitespace-nowrap text-[11px] font-bold text-[#10223d]">{formatPercentage(point.percentage)}</span>{point.percentage === null ? <span className="mb-1 text-[9px] font-semibold text-slate-500">Sin casos</span> : <div className="w-14 shrink-0 rounded-t-md transition-opacity hover:opacity-80" style={{ backgroundColor: color, height: `${Math.max(point.percentage, 2) * 1.5}px` }} title={`${point.modulated} modulados de ${point.rejected} rechazados`} />}</div><span className="my-2 text-[11px] font-medium text-slate-500">{point.label}</span></div>)}</div></div> : <div className="mt-4 grid h-60 place-items-center rounded-xl border border-dashed border-slate-200 px-6 text-center text-sm text-slate-500">{emptyText}</div>}</div>;
}

function OperationalRanking({ details }: { details: ModulationAdherenceDetail[] }) {
  const [expanded, setExpanded] = useState("");
  const rows = buildOperationalRanking(details).slice(0, 5);
  return <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[#10223d]">Ranking operativo</h3><span className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-500">Top 5</span></div><div className="mt-3 grid grid-cols-2 gap-1"><div className="rounded-full bg-[#eee5fb] px-4 py-2 text-center text-xs font-semibold text-[#5b3b8d]">Clientes pendientes</div><div className="rounded-full bg-[#e8edf5] px-4 py-2 text-center text-xs font-semibold text-slate-500">Retorno después del check-in</div></div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="border-b border-slate-200 text-[9px] uppercase tracking-wider text-slate-400"><tr><th className="w-12 py-3">#</th><th className="py-3">Responsable</th><th className="w-40 py-3 text-center">Pendientes</th><th className="w-40 py-3 text-center">Adherencia</th><th className="w-10 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => { const isExpanded = expanded === row.key; return <Fragment key={row.key}><tr className="cursor-pointer hover:bg-slate-50" onClick={() => setExpanded(isExpanded ? "" : row.key)}><td className="py-3 text-slate-500">{index + 1}</td><td className="py-3 font-semibold text-[#10223d]">{row.rr}</td><td className="py-3 text-center text-base font-bold text-[#0f8398]">{row.pending}</td><td className="py-3 text-center font-medium text-slate-600">{formatPercentage(row.percentage)}</td><td className="py-3 text-slate-400">{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td></tr>{isExpanded ? <tr><td className="bg-slate-50 px-3 py-3" colSpan={5}><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{row.clients.map((client) => <div className="rounded-lg border border-red-100 bg-white px-3 py-2" key={`${client.date}:${client.dt}:${client.clientCode}`}><p className="truncate font-semibold text-[#10223d]">{client.clientName}</p><p className="mt-0.5 text-[10px] text-slate-500">{formatShortDate(client.date)} · DT {client.dt || "—"} · {client.clientCode || "Sin código"}</p></div>)}</div></td></tr> : null}</Fragment>; })}{!rows.length ? <tr><td className="py-10 text-center text-sm text-slate-500" colSpan={5}>No hay clientes pendientes para esta contratista.</td></tr> : null}</tbody></table></div></div>;
}

function Metric({ icon, label, tone, value }: { icon: React.ReactNode; label: string; tone: "violet" | "green" | "amber" | "blue"; value: string }) { const tones = { violet: "bg-violet-50 text-violet-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", blue: "bg-cyan-50 text-cyan-700" }; return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`grid h-9 w-9 place-items-center rounded-lg ${tones[tone]}`}>{icon}</div><p className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-[#10223d]">{value}</p></article>; }
function SmallMetric({ color, label, value }: { color: string; label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-[#e9eef7] px-4 py-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold" style={{ color }}>{value}</p></div>; }
function DateInput({ label, max, min, onChange, value }: { label: string; max?: string; min?: string; onChange: (value: string) => void; value: string }) { return <label className="text-sm font-semibold text-[#10223d]"><span className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-slate-500"><CalendarDays size={15} />{label}</span><input className="h-11 w-full rounded-lg border border-slate-200 px-3 outline-none focus:border-[#7c3aed] focus:ring-2 focus:ring-violet-100" max={max} min={min} onChange={(event) => onChange(event.target.value)} type="date" value={value} /></label>; }

async function safeJson(response: Response) { return response.json().catch(() => ({})); }
function buildOperationalRanking(details: ModulationAdherenceDetail[]) {
  const groups = new Map<string, { key: string; rr: string; rejected: number; modulated: number; pending: number; percentage: number | null; clients: ModulationAdherenceDetail[] }>();
  details.forEach((detail) => {
    const key = normalize(detail.rr) || "sin-responsable";
    const current = groups.get(key) || { key, rr: detail.rr || "Sin responsable", rejected: 0, modulated: 0, pending: 0, percentage: null, clients: [] };
    current.rejected += 1;
    if (detail.modulated) current.modulated += 1;
    else { current.pending += 1; current.clients.push(detail); }
    current.percentage = current.rejected ? Number((current.modulated / current.rejected * 100).toFixed(2)) : null;
    groups.set(key, current);
  });
  return [...groups.values()].filter((row) => row.pending > 0).sort((left, right) => right.pending - left.pending || Number(left.percentage) - Number(right.percentage) || left.rr.localeCompare(right.rr, "es-CO"));
}
function buildWeeklyAdherence(rows: DailyModulationAdherence[]): ChartPoint[] {
  const weeks = new Map<string, { label: string; modulated: number; rejected: number }>();
  rows.forEach((row) => {
    const week = isoWeek(row.date);
    const current = weeks.get(week.key) || { label: `S${week.week}`, modulated: 0, rejected: 0 };
    current.modulated += row.modulated;
    current.rejected += row.rejected;
    weeks.set(week.key, current);
  });
  return [...weeks.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, row]) => ({
    key,
    label: row.label,
    modulated: row.modulated,
    rejected: row.rejected,
    percentage: row.rejected ? Number((row.modulated / row.rejected * 100).toFixed(2)) : null,
  }));
}
function isoWeek(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const firstDay = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((date.getTime() - firstDay.getTime()) / 86_400_000) + 1) / 7);
  return { key: `${year}-${String(week).padStart(2, "0")}`, week };
}
function normalize(value: string) { return value.toLocaleLowerCase("es-CO").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }
function formatPercentage(value: number | null | undefined) { return value == null ? "Sin casos" : `${value.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`; }
function formatShortDate(value: string) { const [, month, day] = value.split("-"); return `${day}/${month}`; }
function bogotaDateKey(date: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); }
function defaultDateRange(): DateRange { const to = bogotaDateKey(new Date()); const fromDate = new Date(`${to}T12:00:00-05:00`); fromDate.setDate(fromDate.getDate() - 29); return { from: bogotaDateKey(fromDate), to }; }
