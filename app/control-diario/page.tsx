"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Activity, ArrowLeft, Check, ClipboardCheck, Gauge, LoaderCircle, LogIn, LogOut, MapPinCheck, PackageCheck, Pencil, Save, TrendingUp, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import type { DailyAbsenteeismRecord } from "../lib/dailyAbsenteeism";
import type { DailyChecklistRecord, DailyChecklistType } from "../lib/dailyChecklist";

function todayBogota() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date()); }

type ModulationRecord = { fechaDespacho?: string; fechaDt?: string; createdAt?: string; totalCajas?: string; cajasGestionadas?: string };
type RangeReport = { operationalDate: string; kind: "current" | "closure"; updatedAt?: string; summary: { startedRows: number; inRange: number; outOfRange: number } };
type TrackingRecord = { horaSalida?: string; fechaDespacho?: string; fechaDt?: string; cajas?: number; cajasReportadas?: number; cajasRefusalFinal?: number; cajasGestionadas?: number };
type AttendanceSnapshot = { operationalDate: string; rows: Array<{ nombreCompleto?: string; cargo?: string; contratista?: string; entrada?: string }> };
type DashboardData = { checklists: DailyChecklistRecord[]; absences: DailyAbsenteeismRecord[]; modulations: ModulationRecord[]; ranges: RangeReport[]; tracking: TrackingRecord[]; attendance: AttendanceSnapshot[]; rti: { outboundTotal?: number; returnedTotal?: number; rtiPercentage?: number } };

export default function DailyControlPage() {
  const router = useRouter();
  const [date, setDate] = useState(todayBogota);
  const [departure, setDeparture] = useState("");
  const [returnValue, setReturnValue] = useState("");
  const [checklistObservations, setChecklistObservations] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [absent, setAbsent] = useState("");
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState("");
  const [loadingDay, setLoadingDay] = useState(true);
  const [completed, setCompleted] = useState({ departure: false, return: false, absence: false });
  const [editing, setEditing] = useState({ departure: false, return: false, absence: false });
  const [dashboard, setDashboard] = useState<DashboardData>({ checklists: [], absences: [], modulations: [], ranges: [], tracking: [], attendance: [], rti: {} });
  const absencePercentage = useMemo(() => Number(scheduled) ? Math.round((Number(absent) / Number(scheduled)) * 1_000) / 10 : 0, [absent, scheduled]);
  const dayComplete = completed.departure && completed.return && completed.absence && !Object.values(editing).some(Boolean);

  useEffect(() => {
    let active = true;
    setLoadingDay(true);
    Promise.all([
      fetch("/api/daily-checklists", { cache: "no-store" }).then(async (response) => response.ok ? response.json() : { records: [] }),
      fetch("/api/daily-absenteeism", { cache: "no-store" }).then(async (response) => response.ok ? response.json() : { records: [] }),
      fetch("/api/modulaciones", { cache: "no-store" }).then(async (response) => response.ok ? response.json() : { records: [] }),
      fetch("/api/punto-corona-routes", { cache: "no-store" }).then(async (response) => response.ok ? response.json() : { records: [] }),
      fetch("/api/people/rti", { cache: "no-store" }).then(async (response) => response.ok ? response.json() : { summary: {} }),
      fetch("/api/seguimiento", { cache: "no-store" }).then(async (response) => response.ok ? response.json() : { records: [] }),
      fetch("/api/people/attendance-snapshots", { cache: "no-store" }).then(async (response) => response.ok ? response.json() : { snapshots: [] }),
    ]).then(([checklistBody, absenceBody, modulationBody, rangeBody, rtiBody, trackingBody, attendanceBody]) => {
      if (!active) return;
      const checklists = (checklistBody.records || []) as DailyChecklistRecord[];
      const absences = (absenceBody.records || []) as DailyAbsenteeismRecord[];
      const departureRecord = checklists.find((record) => record.date === date && record.type === "departure");
      const returnRecord = checklists.find((record) => record.date === date && record.type === "return");
      const absenceRecord = absences.find((record) => record.date === date);
      setDeparture(departureRecord ? String(departureRecord.percentage) : "");
      setReturnValue(returnRecord ? String(returnRecord.percentage) : "");
      setScheduled(absenceRecord ? String(absenceRecord.scheduled) : "");
      setAbsent(absenceRecord ? String(absenceRecord.absent) : "");
      setCompleted({ departure: Boolean(departureRecord), return: Boolean(returnRecord), absence: Boolean(absenceRecord) });
      setEditing({ departure: false, return: false, absence: false });
      setDashboard({ checklists, absences, modulations: modulationBody.records || [], ranges: rangeBody.records || [], tracking: trackingBody.records || [], attendance: attendanceBody.snapshots || [], rti: rtiBody.summary || {} });
    }).finally(() => active && setLoadingDay(false));
    return () => { active = false; };
  }, [date]);

  async function saveChecklist(event: FormEvent, type: DailyChecklistType) {
    event.preventDefault();
    const percentage = Number(type === "departure" ? departure : returnValue);
    setSaving(type); setMessage("");
    try {
      const response = await fetch("/api/daily-checklists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, date, percentage, observations: checklistObservations }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo guardar.");
      setCompleted((current) => ({ ...current, [type]: true }));
      setEditing((current) => ({ ...current, [type]: false }));
      setMessage(`Checklist de ${type === "departure" ? "salida" : "retorno"} guardado en ${percentage}%.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar."); }
    finally { setSaving(""); }
  }

  async function saveAbsenteeism(event: FormEvent) {
    event.preventDefault(); setSaving("absence"); setMessage("");
    try {
      const response = await fetch("/api/daily-absenteeism", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, scheduled: Number(scheduled), absent: Number(absent), observations: "" }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo guardar.");
      setCompleted((current) => ({ ...current, absence: true }));
      setEditing((current) => ({ ...current, absence: false }));
      setMessage(`Ausentismo diario guardado: ${absencePercentage}%.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar."); }
    finally { setSaving(""); }
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-sm"><div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4"><button aria-label="Volver" className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100" onClick={() => router.push("/")} type="button"><ArrowLeft size={19} /></button><span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-cyan-300"><ClipboardCheck /></span><div><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-700">Registro operativo</p><h1 className="text-2xl font-black">Control diario</h1></div></div></header>
      <section className="mx-auto max-w-6xl px-5 py-6">
        <div className="mb-5 max-w-sm"><Field label="Fecha del registro"><input className="field" onChange={(event) => setDate(event.target.value)} required type="date" value={date} /></Field></div>
        {loadingDay ? <div className="grid min-h-52 place-items-center rounded-3xl border border-slate-200 bg-white"><LoaderCircle className="animate-spin text-cyan-600" /></div> : dayComplete ? (
          <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-7 text-white shadow-2xl"><div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-center gap-4"><span className="grid h-16 w-16 place-items-center rounded-2xl bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20"><Check size={34} strokeWidth={3} /></span><div><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-300">Registro completo</p><h2 className="mt-1 text-3xl font-black">Operación del día guardada</h2><p className="mt-1 text-sm text-slate-300">Los datos ya están disponibles en las gráficas administrativas.</p></div></div><div className="grid grid-cols-3 gap-2 text-center"><DayResult label="Salida" value={`${departure}%`} /><DayResult label="Retorno" value={`${returnValue}%`} /><DayResult label="Ausentismo" value={`${absencePercentage}%`} /></div></div><button className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-black text-white hover:bg-white/15" onClick={() => setEditing({ departure: true, return: true, absence: true })} type="button"><Pencil size={14} /> Corregir registros del día</button></section>
        ) : <div className="grid gap-5 lg:grid-cols-3">
          {completed.departure && !editing.departure ? <SavedCard label="Checklist de salida" onEdit={() => setEditing((current) => ({ ...current, departure: true }))} tone="cyan" value={`${departure}%`} /> : <PercentageForm color="cyan" icon={<LogOut />} label="Checklist de salida" loading={saving === "departure"} onSubmit={(event) => void saveChecklist(event, "departure")} onValue={setDeparture} value={departure} />}
          {completed.return && !editing.return ? <SavedCard label="Checklist de retorno" onEdit={() => setEditing((current) => ({ ...current, return: true }))} tone="emerald" value={`${returnValue}%`} /> : <PercentageForm color="emerald" icon={<LogIn />} label="Checklist de retorno" loading={saving === "return"} onSubmit={(event) => void saveChecklist(event, "return")} onValue={setReturnValue} value={returnValue} />}
          {completed.absence && !editing.absence ? <SavedCard label="Ausentismo diario" onEdit={() => setEditing((current) => ({ ...current, absence: true }))} tone="violet" value={`${absencePercentage}%`} /> : <form className="rounded-3xl border border-violet-200 bg-white p-6 shadow-lg shadow-slate-200/60" onSubmit={saveAbsenteeism}><CardTitle color="violet" icon={<Users />} label="Ausentismo diario" /><Field label="Personal programado"><input className="field" min="1" onChange={(event) => setScheduled(event.target.value)} required type="number" value={scheduled} /></Field><Field label="Personas ausentes"><input className="field" max={scheduled || undefined} min="0" onChange={(event) => setAbsent(event.target.value)} required type="number" value={absent} /></Field><div className="mt-4 rounded-2xl bg-violet-50 p-4 text-center"><p className="text-[10px] font-black uppercase text-violet-600">Resultado</p><p className="text-4xl font-black text-violet-800">{absencePercentage}%</p></div><SaveButton loading={saving === "absence"} label="Guardar ausentismo" /></form>}
        </div>}
        {!dayComplete && !loadingDay && (!completed.departure || editing.departure || !completed.return || editing.return) ? <Field label="Observación opcional para los checklists"><textarea className="field mt-1 min-h-24" onChange={(event) => setChecklistObservations(event.target.value)} value={checklistObservations} /></Field> : null}
        {message ? <p className="mt-5 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm font-bold text-cyan-800">{message}</p> : null}
        {!loadingDay ? <ContractorDashboard data={dashboard} /> : null}
      </section>
    </main>
  );
}

function ContractorDashboard({ data }: { data: DashboardData }) {
  const summary = useMemo(() => {
    const ranges = preferredRangeReports(data.ranges);
    const rangeTotal = ranges.reduce((sum, item) => sum + (item.summary.startedRows || 0), 0);
    const rangeIn = ranges.reduce((sum, item) => sum + (item.summary.inRange || 0), 0);
    const modulationTotal = data.modulations.reduce((sum, item) => sum + parseAmount(item.totalCajas), 0);
    const modulationManaged = data.modulations.reduce((sum, item) => sum + parseAmount(item.cajasGestionadas), 0);
    const departure = average(data.checklists.filter((item) => item.type === "departure").map((item) => item.percentage));
    const returns = average(data.checklists.filter((item) => item.type === "return").map((item) => item.percentage));
    const scheduled = data.absences.reduce((sum, item) => sum + item.scheduled, 0);
    const absent = data.absences.reduce((sum, item) => sum + item.absent, 0);
    const dates = Array.from(new Set([...ranges.map((item) => item.operationalDate), ...data.checklists.map((item) => item.date), ...data.absences.map((item) => item.date)])).sort().slice(-10);
    const departureTimes = data.tracking.map((item) => parseClockSeconds(item.horaSalida)).filter((value): value is number => value !== null);
    const beforeSeven = departureTimes.filter((value) => value < 7 * 3600).length;
    const averageDeparture = departureTimes.length ? formatClockSeconds(Math.round(departureTimes.reduce((sum, value) => sum + value, 0) / departureTimes.length)) : "—";
    const refusalBoxes = data.tracking.reduce((sum, item) => sum + Math.max(Number(item.cajasRefusalFinal) || Math.max((Number(item.cajasReportadas) || 0) - (Number(item.cajasGestionadas) || 0), 0), 0), 0);
    const reportedBoxes = data.tracking.reduce((sum, item) => sum + (Number(item.cajasReportadas) || 0), 0);
    const trackingBoxes = data.tracking.reduce((sum, item) => sum + (Number(item.cajas) || 0), 0);
    const lateRanking = buildLateRanking(data.attendance);
    const absenceTrend = [...data.absences].sort((a, b) => a.date.localeCompare(b.date)).slice(-10).map((item) => ({ date: item.date, scheduled: item.scheduled, absent: item.absent, percentage: percent(item.absent, item.scheduled) }));
    const trend = dates.map((trendDate) => {
      const dayRanges = ranges.filter((item) => item.operationalDate === trendDate);
      const dayTotal = dayRanges.reduce((sum, item) => sum + item.summary.startedRows, 0);
      const dayIn = dayRanges.reduce((sum, item) => sum + item.summary.inRange, 0);
      const dayChecks = data.checklists.filter((item) => item.date === trendDate);
      const dayAbsence = data.absences.find((item) => item.date === trendDate);
      return { date: trendDate, range: percent(dayIn, dayTotal), checklist: average(dayChecks.map((item) => item.percentage)), attendance: dayAbsence ? 100 - percent(dayAbsence.absent, dayAbsence.scheduled) : 0 };
    });
    return { range: percent(rangeIn, rangeTotal), rangeTotal, modulation: percent(modulationManaged, modulationTotal), modulationTotal, modulationManaged, departure, returns, absence: percent(absent, scheduled), scheduled, absent, trend, absenceTrend, beforeSeven, departureTotal: departureTimes.length, beforeSevenPercentage: percent(beforeSeven, departureTimes.length), averageDeparture, refusalBoxes, refusalPercentage: percent(refusalBoxes, trackingBoxes || reportedBoxes), lateRanking };
  }, [data]);
  return <section className="mt-8"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-cyan-700"><Activity size={15} /> Centro de rendimiento</p><h2 className="mt-1 text-2xl font-black text-slate-950">Así va tu operación</h2><p className="mt-1 text-sm text-slate-500">Información acumulada y visible únicamente para tu compañía.</p></div><span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">Datos actualizados</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><DashboardMetric icon={<Gauge />} label="RTI" tone="cyan" value={Number(data.rti.rtiPercentage || 0)} detail={`${Number(data.rti.returnedTotal || 0).toLocaleString("es-CO")} retornados`} /><DashboardMetric icon={<PackageCheck />} label="Modulación" tone="violet" value={summary.modulation} detail={`${summary.modulationManaged.toLocaleString("es-CO")} cajas gestionadas`} /><DashboardMetric icon={<MapPinCheck />} label="Entrega en rango" tone="emerald" value={summary.range} detail={`${summary.rangeTotal.toLocaleString("es-CO")} visitas`} /><DashboardMetric icon={<ClipboardCheck />} label="Checklist salida" tone="amber" value={summary.departure} detail={`${data.checklists.filter((item) => item.type === "departure").length} días registrados`} /><DashboardMetric icon={<Users />} inverse label="Ausentismo" tone="red" value={summary.absence} detail={`${summary.absent} de ${summary.scheduled} personas`} /></div><div className="mt-4 grid gap-4 xl:grid-cols-[.8fr_1.2fr]"><DepartureAndRefusal summary={summary} /><LateRanking rows={summary.lateRanking} /></div><div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.65fr]"><DailyPulseChart data={summary.trend} /><AbsenceTrendChart data={summary.absenceTrend} /></div><div className="mt-4"><DailyHistoryTable checklists={data.checklists} absences={data.absences} /></div></section>;
}

type LateRow = { name: string; role: string; days: number; average: number; total: number };
function buildLateRanking(snapshots: AttendanceSnapshot[]) {
  const groups = new Map<string, LateRow>();
  snapshots.forEach((snapshot) => snapshot.rows.forEach((row) => {
    const seconds = parseClockSeconds(row.entrada);
    if (seconds === null || seconds <= 6 * 3600) return;
    const name = String(row.nombreCompleto || "Sin nombre").trim();
    const key = name.toLocaleLowerCase("es");
    const current = groups.get(key) || { name, role: String(row.cargo || ""), days: 0, average: 0, total: 0 };
    current.days += 1; current.total += seconds; current.average = Math.round(current.total / current.days); groups.set(key, current);
  }));
  return Array.from(groups.values()).sort((a, b) => b.days - a.days || b.average - a.average).slice(0, 10);
}

function parseClockSeconds(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const fraction = ((value % 1) + 1) % 1;
    return Math.round(fraction * 86_400) % 86_400;
  }
  const text = String(value || "").trim();
  const numeric = Number(text.replace(",", "."));
  if (/^\d+[.,]\d+$/.test(text) && Number.isFinite(numeric)) return Math.round((((numeric % 1) + 1) % 1) * 86_400) % 86_400;
  const matches = Array.from(text.matchAll(/(\d{1,2})[:.](\d{2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/gi));
  const match = matches.at(-1);
  if (!match) return null;
  let hour = Number(match[1]); const minute = Number(match[2]); const second = Number(match[3] || 0); const meridiem = String(match[4] || "").toLowerCase();
  if (meridiem.startsWith("p") && hour < 12) hour += 12; if (meridiem.startsWith("a") && hour === 12) hour = 0;
  return hour <= 23 && minute <= 59 ? hour * 3600 + minute * 60 + second : null;
}
function formatClockSeconds(value: number) { const hour = Math.floor(value / 3600) % 24; const minute = Math.floor(value % 3600 / 60); return new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, hour, minute))); }

function DepartureAndRefusal({ summary }: { summary: { averageDeparture: string; beforeSeven: number; departureTotal: number; beforeSevenPercentage: number; refusalBoxes: number; refusalPercentage: number } }) {
  return <article className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-2xl"><div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-emerald-400/10 blur-3xl" /><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-300">Salida y refusal</p><div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-xs font-bold text-slate-400">Promedio de salida</p><p className="mt-1 text-4xl font-black">{summary.averageDeparture}</p></div><div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-center"><p className="text-2xl font-black text-emerald-300">{summary.beforeSevenPercentage}%</p><p className="text-[9px] font-black uppercase text-slate-400">Antes de 7</p></div></div><p className="mt-3 text-xs text-slate-300">{summary.beforeSeven} de {summary.departureTotal} rutas antes de las 7:00 a. m.</p><div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-5"><div className="rounded-2xl bg-white/5 p-3"><p className="text-[9px] font-black uppercase text-rose-300">Refusal</p><p className="mt-1 text-2xl font-black">{summary.refusalPercentage}%</p></div><div className="rounded-2xl bg-white/5 p-3"><p className="text-[9px] font-black uppercase text-rose-300">Cajas refusal</p><p className="mt-1 text-2xl font-black">{summary.refusalBoxes.toLocaleString("es-CO")}</p></div></div></article>;
}

function LateRanking({ rows }: { rows: LateRow[] }) {
  return <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg"><div className="flex items-end justify-between border-b border-slate-100 bg-gradient-to-r from-rose-50 to-white px-4 py-3"><div><p className="text-[9px] font-black uppercase tracking-[.14em] text-rose-600">GeoVictoria · después de 6:00 a. m.</p><h3 className="mt-0.5 text-base font-black">Top de llegadas tardías</h3></div><span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-black text-rose-700">{rows.length}</span></div><div>{rows.length ? rows.map((row, index) => <div className="grid grid-cols-[26px_1fr_auto] items-center gap-2 border-b border-slate-100 px-4 py-1.5 last:border-0" key={row.name}><span className={`grid h-6 w-6 place-items-center rounded-md text-[10px] font-black ${index < 3 ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-500"}`}>{index + 1}</span><div className="min-w-0"><p className="truncate text-[11px] font-black leading-tight text-slate-800">{row.name}</p><p className="truncate text-[8px] font-bold uppercase leading-tight text-slate-400">{row.role || "Sin cargo"}</p></div><div className="text-right"><p className="text-sm font-black leading-tight text-rose-600">{row.days} <span className="text-[8px] uppercase text-slate-400">días</span></p><p className="text-[9px] font-bold leading-tight text-slate-500">Prom. {formatClockSeconds(row.average)}</p></div></div>) : <div className="grid h-48 place-items-center p-6 text-center text-sm text-slate-400">Sin llegadas posteriores a las 6:00 a. m. en GeoVictoria.</div>}</div></article>;
}

function DashboardMetric({ detail, icon, inverse, label, tone, value }: { detail: string; icon: ReactNode; inverse?: boolean; label: string; tone: "cyan" | "violet" | "emerald" | "amber" | "red"; value: number }) {
  const colors = { cyan: ["#06b6d4", "bg-cyan-100 text-cyan-700"], violet: ["#8b5cf6", "bg-violet-100 text-violet-700"], emerald: ["#10b981", "bg-emerald-100 text-emerald-700"], amber: ["#f59e0b", "bg-amber-100 text-amber-700"], red: ["#ef4444", "bg-red-100 text-red-700"] }[tone];
  const ring = Math.min(Math.max(inverse ? 100 - value : value, 0), 100);
  return <article className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_16px_35px_-26px_rgba(15,23,42,.5)]"><div className="flex items-start justify-between"><span className={`grid h-10 w-10 place-items-center rounded-2xl ${colors[1]}`}>{icon}</span><div className="grid h-14 w-14 place-items-center rounded-full p-1" style={{ background: `conic-gradient(${colors[0]} ${ring * 3.6}deg,#e2e8f0 0)` }}><span className="grid h-full w-full place-items-center rounded-full bg-white text-[9px] font-black text-slate-500">{Math.round(value)}%</span></div></div><p className="mt-4 text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-3xl font-black text-slate-950">{value.toFixed(1)}%</p><p className="mt-1 truncate text-[11px] font-semibold text-slate-400" title={detail}>{detail}</p></article>;
}

function DailyPulseChart({ data }: { data: Array<{ date: string; range: number; checklist: number; attendance: number }> }) {
  const series = [{ key: "range" as const, label: "En rango", color: "#34d399" }, { key: "checklist" as const, label: "Checklist", color: "#22d3ee" }, { key: "attendance" as const, label: "Asistencia", color: "#fbbf24" }];
  const width = 700; const height = 250; const x = (index: number) => 35 + index / Math.max(data.length - 1, 1) * 645; const y = (value: number) => 15 + (100 - Math.min(Math.max(value, 0), 100)) * 1.9;
  return <article className="overflow-hidden rounded-3xl bg-slate-950 p-5 text-white shadow-2xl"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-cyan-300"><TrendingUp size={14} /> Evolución</p><h3 className="mt-1 text-lg font-black">Pulso de los últimos días</h3></div><div className="flex gap-3">{series.map((item) => <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400" key={item.key}><i className="h-2 w-2 rounded-full" style={{ background: item.color }} />{item.label}</span>)}</div></div>{data.length ? <svg className="mt-4 w-full" viewBox={`0 0 ${width} ${height}`}>{[0, 25, 50, 75, 100].map((value) => <g key={value}><line stroke="#1e293b" strokeDasharray="4 5" x1="35" x2="680" y1={y(value)} y2={y(value)} /><text fill="#64748b" fontSize="9" textAnchor="end" x="29" y={y(value) + 3}>{value}</text></g>)}{series.map((item) => <polyline fill="none" key={item.key} points={data.map((point, index) => `${x(index)},${y(point[item.key])}`).join(" ")} stroke={item.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />)}{data.map((point, index) => <text fill="#64748b" fontSize="9" textAnchor="middle" x={x(index)} y="235" key={point.date}>{point.date.slice(5)}</text>)}</svg> : <div className="mt-4 grid h-48 place-items-center rounded-2xl border border-dashed border-slate-700 text-sm text-slate-500">La tendencia aparecerá al registrar más días.</div>}</article>;
}

function AbsenceTrendChart({ data }: { data: Array<{ date: string; scheduled: number; absent: number; percentage: number }> }) {
  const maxScheduled = Math.max(...data.map((item) => item.scheduled), 1);
  const totalAbsent = data.reduce((sum, item) => sum + item.absent, 0);
  return <article className="overflow-hidden rounded-3xl border border-rose-100 bg-gradient-to-br from-white via-rose-50/40 to-orange-50 p-5 shadow-lg"><div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-rose-600"><Users size={14} /> Ausentismo</p><h3 className="mt-1 text-lg font-black text-slate-950">Personal Ausente</h3><p className="mt-1 text-xs text-slate-500">Programados frente a ausentes</p></div><div className="rounded-2xl bg-rose-100 px-3 py-2 text-center text-rose-700"><p className="text-2xl font-black leading-none">{totalAbsent}</p><p className="mt-1 text-[8px] font-black uppercase">Personas</p></div></div>{data.length ? <div className="mt-6 flex h-48 items-end gap-2 border-b border-slate-200 px-1">{data.map((item) => <div className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end" key={item.date}><div className="relative flex w-full max-w-10 flex-1 items-end justify-center"><div className="absolute bottom-0 w-full rounded-t-lg bg-slate-200" style={{ height: `${Math.max(item.scheduled / maxScheduled * 100, 3)}%` }} /><div className="absolute bottom-0 z-10 w-3/5 rounded-t-lg bg-gradient-to-t from-rose-600 to-orange-400 shadow-[0_0_14px_rgba(244,63,94,.25)]" style={{ height: `${Math.max(item.absent / maxScheduled * 100, item.absent ? 5 : 0)}%` }}><span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-black text-rose-600">{item.absent}</span></div><span className="pointer-events-none absolute -top-12 z-20 hidden whitespace-nowrap rounded-lg bg-slate-950 px-2 py-1 text-[9px] font-bold text-white shadow-lg group-hover:block">{item.absent} de {item.scheduled} · {item.percentage}%</span></div><span className="mt-2 text-[8px] font-bold text-slate-400">{item.date.slice(5)}</span></div>)}</div> : <div className="mt-5 grid h-48 place-items-center rounded-2xl border border-dashed border-rose-200 text-center text-sm text-slate-400">Registra ausentismo diario para construir la gráfica.</div>}<div className="mt-3 flex gap-4 text-[9px] font-bold text-slate-500"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-slate-300" /> Programados</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-rose-500" /> Ausentes</span></div></article>;
}

function DailyHistoryTable({ absences, checklists }: { absences: DailyAbsenteeismRecord[]; checklists: DailyChecklistRecord[] }) {
  const dates = Array.from(new Set([...checklists.map((item) => item.date), ...absences.map((item) => item.date)])).sort().reverse().slice(0, 8);
  return <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg"><div className="border-b border-slate-100 p-5"><p className="text-[10px] font-black uppercase tracking-[.16em] text-violet-600">Trazabilidad</p><h3 className="mt-1 text-lg font-black">Historial diario</h3></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-3 py-3">Salida</th><th className="px-3 py-3">Retorno</th><th className="px-3 py-3">Aus.</th></tr></thead><tbody>{dates.map((historyDate) => { const departure = checklists.find((item) => item.date === historyDate && item.type === "departure")?.percentage; const returns = checklists.find((item) => item.date === historyDate && item.type === "return")?.percentage; const absence = absences.find((item) => item.date === historyDate); return <tr className="border-t border-slate-100" key={historyDate}><td className="px-4 py-3 font-black text-slate-700">{historyDate}</td><td className="px-3 py-3 font-bold text-cyan-700">{departure ?? "—"}%</td><td className="px-3 py-3 font-bold text-emerald-700">{returns ?? "—"}%</td><td className="px-3 py-3 font-bold text-red-600">{absence ? percent(absence.absent, absence.scheduled) : "—"}%</td></tr>; })}</tbody></table>{!dates.length ? <p className="p-8 text-center text-sm text-slate-400">Sin historial todavía.</p> : null}</div></article>;
}

function preferredRangeReports(reports: RangeReport[]) { const map = new Map<string, RangeReport>(); reports.forEach((item) => { const current = map.get(item.operationalDate); if (!current || (item.kind === "closure" && current.kind !== "closure") || String(item.updatedAt) > String(current.updatedAt)) map.set(item.operationalDate, item); }); return Array.from(map.values()); }
function parseAmount(value?: string) { const parsed = Number(String(value || "").replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".")); return Number.isFinite(parsed) ? parsed : 0; }
function percent(value: number, total: number) { return total ? Math.round(value / total * 1_000) / 10 : 0; }
function average(values: number[]) { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : 0; }

function DayResult({ label, value }: { label: string; value: string }) { return <div className="min-w-24 rounded-2xl border border-white/10 bg-white/10 px-3 py-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-xl font-black">{value}</p></div>; }
function SavedCard({ label, onEdit, tone, value }: { label: string; onEdit: () => void; tone: "cyan" | "emerald" | "violet"; value: string }) { const color = { cyan: "from-cyan-500 to-blue-600", emerald: "from-emerald-400 to-teal-600", violet: "from-violet-500 to-fuchsia-600" }[tone]; return <article className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl"><div className={`absolute -right-12 -top-12 h-36 w-36 rounded-full bg-gradient-to-br ${color} opacity-30 blur-2xl`} /><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-400 text-slate-950"><Check strokeWidth={3} /></span><p className="mt-5 text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-5xl font-black">{value}</p><p className="mt-2 text-xs font-bold text-emerald-300">Guardado para esta fecha</p><button className="mt-5 inline-flex items-center gap-2 text-xs font-black text-white/75 hover:text-white" onClick={onEdit} type="button"><Pencil size={13} /> Corregir</button></article>; }
function PercentageForm({ color, icon, label, loading, onSubmit, onValue, value }: { color: "cyan" | "emerald"; icon: ReactNode; label: string; loading: boolean; onSubmit: (event: FormEvent) => void; onValue: (value: string) => void; value: string }) { return <form className={`rounded-3xl border bg-white p-6 shadow-lg shadow-slate-200/60 ${color === "cyan" ? "border-cyan-200" : "border-emerald-200"}`} onSubmit={onSubmit}><CardTitle color={color} icon={icon} label={label} /><Field label="Porcentaje final"><div className="relative"><input className="field pr-12 text-3xl font-black" max="100" min="0" onChange={(event) => onValue(event.target.value)} placeholder="0" required step="0.1" type="number" value={value} /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-400">%</span></div></Field><div className={`mt-4 h-3 overflow-hidden rounded-full ${color === "cyan" ? "bg-cyan-100" : "bg-emerald-100"}`}><div className={`h-full rounded-full transition-all ${color === "cyan" ? "bg-cyan-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(0, Math.min(Number(value) || 0, 100))}%` }} /></div><SaveButton loading={loading} label={`Guardar ${label.toLowerCase()}`} /></form>; }
function CardTitle({ color, icon, label }: { color: "cyan" | "emerald" | "violet"; icon: ReactNode; label: string }) { const style = { cyan: "bg-cyan-100 text-cyan-700", emerald: "bg-emerald-100 text-emerald-700", violet: "bg-violet-100 text-violet-700" }[color]; return <div className="flex items-center gap-3"><span className={`grid h-11 w-11 place-items-center rounded-xl ${style}`}>{icon}</span><h2 className="text-lg font-black">{label}</h2></div>; }
function SaveButton({ label, loading }: { label: string; loading: boolean }) { return <button className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-black text-white disabled:opacity-50" disabled={loading} type="submit">{loading ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}{label}</button>; }
function Field({ children, label }: { children: ReactNode; label: string }) { return <label className="mt-4 block text-xs font-black uppercase tracking-wide text-slate-500"><span className="mb-1.5 block">{label}</span>{children}</label>; }
