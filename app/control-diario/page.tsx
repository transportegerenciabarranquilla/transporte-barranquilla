"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Activity, ArrowLeft, Check, ClipboardCheck, Gauge, LoaderCircle, LogIn, LogOut, MapPinCheck, PackageCheck, Pencil, Save, TrendingUp, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { DailyAbsenteeismRecord } from "../lib/dailyAbsenteeism";
import type { DailyChecklistRecord, DailyChecklistType } from "../lib/dailyChecklist";

function todayBogota() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date()); }

type ModulationRecord = { fechaDespacho?: string; fechaDt?: string; createdAt?: string; totalCajas?: string; cajasGestionadas?: string };
type RangeReport = { operationalDate: string; kind: "current" | "closure"; updatedAt?: string; summary: { startedRows: number; inRange: number; outOfRange: number } };
type TrackingRecord = { horaSalida?: string; fechaDespacho?: string; fechaDt?: string; cajas?: number; cajasReportadas?: number; cajasRefusalFinal?: number; cajasGestionadas?: number };
type AttendanceSnapshot = { operationalDate: string; closedAt?: string | null; rows: Array<{ identificador?: string; nombreCompleto?: string; cargo?: string; contratista?: string; entrada?: string }> };
type DashboardData = { checklists: DailyChecklistRecord[]; absences: DailyAbsenteeismRecord[]; modulations: ModulationRecord[]; ranges: RangeReport[]; tracking: TrackingRecord[]; attendance: AttendanceSnapshot[]; rti: { outboundTotal?: number; returnedTotal?: number; rtiPercentage?: number } };

export default function DailyControlPage() {
  const router = useRouter();
  const [date] = useState(todayBogota);
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
  const savedOperationSummary = useMemo(() => {
    const departureTimes = dashboard.tracking.map((item) => parseClockSeconds(item.horaSalida)).filter((value): value is number => value !== null);
    const beforeSeven = departureTimes.filter((value) => value < 7 * 3600).length;
    const refusalBoxes = dashboard.tracking.reduce((sum, item) => sum + Math.max(Number(item.cajasRefusalFinal) || Math.max((Number(item.cajasReportadas) || 0) - (Number(item.cajasGestionadas) || 0), 0), 0), 0);
    const reportedBoxes = dashboard.tracking.reduce((sum, item) => sum + (Number(item.cajasReportadas) || 0), 0);
    const trackingBoxes = dashboard.tracking.reduce((sum, item) => sum + (Number(item.cajas) || 0), 0);
    return {
      averageDeparture: departureTimes.length ? formatClockSeconds(Math.round(departureTimes.reduce((sum, value) => sum + value, 0) / departureTimes.length)) : "—",
      beforeSeven,
      departureTotal: departureTimes.length,
      beforeSevenPercentage: percent(beforeSeven, departureTimes.length),
      refusalBoxes,
      refusalPercentage: percent(refusalBoxes, trackingBoxes || reportedBoxes),
    };
  }, [dashboard.tracking]);

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
        {loadingDay ? <div className="grid min-h-52 place-items-center rounded-3xl border border-slate-200 bg-white"><LoaderCircle className="animate-spin text-cyan-600" /></div> : dayComplete ? (
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-5 text-white shadow-2xl">
            <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-300 to-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20"><Check size={27} strokeWidth={3} /></span><div><div className="flex flex-wrap items-center gap-2"><p className="text-[9px] font-black uppercase tracking-[.2em] text-emerald-300">Registro completo</p><span className="h-1 w-1 rounded-full bg-slate-600" /><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{new Date(`${date}T12:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}</p></div><h2 className="text-xl font-black sm:text-2xl">Operación del día guardada</h2><p className="text-[11px] text-slate-400">Resumen consolidado listo para consulta y seguimiento.</p></div></div><button className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[.08] px-3 text-[11px] font-black text-white shadow-sm transition hover:border-white/25 hover:bg-white/15" onClick={() => setEditing({ departure: true, return: true, absence: true })} type="button"><Pencil size={13} /> Corregir registros</button></div>
            <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/20 p-3 shadow-inner shadow-black/10"><div className="mb-2 hidden grid-cols-7 gap-2 lg:grid"><div className="col-span-3 flex items-center justify-between rounded-lg bg-cyan-400/[.06] px-3 py-1.5"><p className="text-[9px] font-black uppercase tracking-[.16em] text-cyan-300">Registro del día</p><span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[8px] font-black uppercase text-cyan-200">3 controles</span></div><div className="col-span-4 flex items-center justify-between rounded-lg bg-emerald-400/[.06] px-3 py-1.5"><p className="text-[9px] font-black uppercase tracking-[.16em] text-emerald-300">Resultado operativo</p><span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[8px] font-black uppercase text-emerald-200">Datos consolidados</span></div></div><div className="grid auto-rows-fr grid-cols-2 gap-2 text-center sm:grid-cols-3 lg:grid-cols-7"><DayResult group="Registro" label="Salida" progress={Number(departure)} tone="cyan" value={`${departure}%`} /><DayResult group="Registro" label="Retorno" progress={Number(returnValue)} tone="emerald" value={`${returnValue}%`} /><DayResult group="Registro" label="Ausentismo" progress={absencePercentage} tone="rose" value={`${absencePercentage}%`} /><DayResult group="Operación" label="Promedio salida" tone="amber" value={savedOperationSummary.averageDeparture} /><DayResult group="Operación" label="Antes de 7" progress={savedOperationSummary.beforeSevenPercentage} tone="emerald" value={`${savedOperationSummary.beforeSevenPercentage}%`} detail={`${savedOperationSummary.beforeSeven} de ${savedOperationSummary.departureTotal} rutas`} /><DayResult group="Operación" label="Refusal" progress={savedOperationSummary.refusalPercentage} tone="rose" value={`${savedOperationSummary.refusalPercentage}%`} /><DayResult group="Operación" label="Cajas refusal" tone="violet" value={savedOperationSummary.refusalBoxes.toLocaleString("es-CO")} /></div></div>
          </section>
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
  const currentYear = Number(todayBogota().slice(0, 4));
  const [attendanceFrom, setAttendanceFrom] = useState(`${currentYear}-08-01`);
  const [attendanceTo, setAttendanceTo] = useState(`${currentYear}-08-31`);
  const [selectedAbsent, setSelectedAbsent] = useState<AbsenteeRow | null>(null);
  const filteredAttendance = useMemo(() => data.attendance.filter((snapshot) => (!attendanceFrom || snapshot.operationalDate >= attendanceFrom) && (!attendanceTo || snapshot.operationalDate <= attendanceTo)), [attendanceFrom, attendanceTo, data.attendance]);
  const absenteeism = useMemo(() => buildAbsenteeism(data.attendance, filteredAttendance), [data.attendance, filteredAttendance]);
  useEffect(() => setSelectedAbsent(null), [attendanceFrom, attendanceTo]);
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
    const lateRanking = buildLateRanking(filteredAttendance);
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
  }, [data, filteredAttendance]);
  return <section className="mt-8">
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-cyan-700"><Activity size={15} /> Centro de rendimiento</p><h2 className="mt-1 text-2xl font-black text-slate-950">Así va tu operación</h2><p className="mt-1 text-sm text-slate-500">Información acumulada y visible únicamente para tu compañía.</p></div><span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">Datos actualizados</span></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><DashboardMetric icon={<Gauge />} label="RTI" tone="cyan" value={Number(data.rti.rtiPercentage || 0)} detail={`${Number(data.rti.returnedTotal || 0).toLocaleString("es-CO")} retornados`} /><DashboardMetric icon={<PackageCheck />} label="Modulación" tone="violet" value={summary.modulation} detail={`${summary.modulationManaged.toLocaleString("es-CO")} cajas gestionadas`} /><DashboardMetric icon={<MapPinCheck />} label="Entrega en rango" tone="emerald" value={summary.range} detail={`${summary.rangeTotal.toLocaleString("es-CO")} visitas`} /><DashboardMetric icon={<ClipboardCheck />} label="Checklist salida" tone="amber" value={summary.departure} detail={`${data.checklists.filter((item) => item.type === "departure").length} días registrados`} /><DashboardMetric icon={<Users />} inverse label="Ausentismo" tone="red" value={summary.absence} detail={`${summary.absent} de ${summary.scheduled} personas`} /></div>
    <AttendanceRangeFilter from={attendanceFrom} to={attendanceTo} onFrom={setAttendanceFrom} onTo={setAttendanceTo} onClear={() => { setAttendanceFrom(""); setAttendanceTo(""); }} />
    <div className="mt-4 grid items-stretch gap-4 xl:grid-cols-2"><LateRanking rows={summary.lateRanking} /><AbsenteeismTable rows={absenteeism} selected={selectedAbsent} onSelect={setSelectedAbsent} /></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.65fr]"><DailyPulseChart data={summary.trend} /><AbsenceTrendChart data={summary.absenceTrend} /></div>
    <div className="mt-4"><DailyHistoryTable checklists={data.checklists} absences={data.absences} /></div>
  </section>;
}

type LateRow = { name: string; role: string; days: number; average: number; total: number; details: Array<{ date: string; seconds: number }> };
function buildLateRanking(snapshots: AttendanceSnapshot[]) {
  const groups = new Map<string, LateRow>();
  snapshots.forEach((snapshot) => snapshot.rows.forEach((row) => {
    const seconds = parseClockSeconds(row.entrada);
    if (seconds === null || seconds <= 6 * 3600) return;
    const name = String(row.nombreCompleto || "Sin nombre").trim();
    const key = name.toLocaleLowerCase("es");
    const current = groups.get(key) || { name, role: String(row.cargo || ""), days: 0, average: 0, total: 0, details: [] };
    current.days += 1; current.total += seconds; current.average = Math.round(current.total / current.days); current.details.push({ date: snapshot.operationalDate, seconds }); groups.set(key, current);
  }));
  return Array.from(groups.values()).map((row) => ({ ...row, details: row.details.sort((a, b) => b.date.localeCompare(a.date)) })).sort((a, b) => b.days - a.days || b.average - a.average);
}

type AbsenteeRow = { key: string; name: string; role: string; contractor: string; days: string[] };

function buildAbsenteeism(allSnapshots: AttendanceSnapshot[], filteredSnapshots: AttendanceSnapshot[]) {
  const people = new Map<string, Omit<AbsenteeRow, "days">>();
  allSnapshots.forEach((snapshot) => snapshot.rows.forEach((row) => {
    const key = attendancePersonKey(row);
    if (!key) return;
    const current = people.get(key);
    people.set(key, {
      key,
      name: String(row.nombreCompleto || current?.name || "Sin nombre").trim(),
      role: String(row.cargo || current?.role || "").trim(),
      contractor: String(row.contratista || current?.contractor || "").trim(),
    });
  }));
  const absences = new Map<string, string[]>();
  filteredSnapshots.forEach((snapshot) => {
    const marked = new Set(snapshot.rows.filter((row) => Boolean(String(row.entrada || "").trim())).map(attendancePersonKey).filter(Boolean));
    people.forEach((_, key) => {
      if (!marked.has(key)) absences.set(key, [...(absences.get(key) || []), snapshot.operationalDate]);
    });
  });
  return Array.from(people.values()).map((person) => ({ ...person, days: absences.get(person.key) || [] })).filter((person) => person.days.length).sort((a, b) => b.days.length - a.days.length || a.name.localeCompare(b.name, "es"));
}

function attendancePersonKey(row: AttendanceSnapshot["rows"][number]) {
  const id = String(row.identificador || "").replace(/\D/g, "");
  if (id) return `id:${id}`;
  const name = String(row.nombreCompleto || "").trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return name ? `name:${name}` : "";
}

function AttendanceRangeFilter({ from, onClear, onFrom, onTo, to }: { from: string; to: string; onFrom: (value: string) => void; onTo: (value: string) => void; onClear: () => void }) {
  return <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div><p className="text-[10px] font-black uppercase tracking-[.15em] text-cyan-700">Periodo GeoVictoria</p><p className="mt-1 text-xs text-slate-500">Agosto por defecto. Limpia el rango para consultar todo el histórico.</p></div><label className="ml-auto text-[10px] font-black uppercase text-slate-500">Desde<input className="mt-1 block h-9 rounded-lg border border-slate-300 px-2 text-xs font-semibold text-slate-700" type="date" value={from} onChange={(event) => onFrom(event.target.value)} /></label><label className="text-[10px] font-black uppercase text-slate-500">Hasta<input className="mt-1 block h-9 rounded-lg border border-slate-300 px-2 text-xs font-semibold text-slate-700" type="date" value={to} onChange={(event) => onTo(event.target.value)} /></label><button className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-black text-white" onClick={onClear} type="button">Ver histórico</button></div>;
}

function AbsenteeismTable({ onSelect, rows, selected }: { rows: AbsenteeRow[]; selected: AbsenteeRow | null; onSelect: (row: AbsenteeRow | null) => void }) {
  const [showAll, setShowAll] = useState(false);
  const visibleRows = showAll ? rows : rows.slice(0, 10);
  return <>
    <article className="flex h-[500px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
      <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white px-3 py-2"><div><p className="text-[8px] font-black uppercase tracking-[.12em] text-violet-600">GeoVictoria · sin marcación de entrada</p><h3 className="text-sm font-black">Top 10 de ausentismo</h3><p className="text-[9px] text-slate-500">Presiona una persona para ver el detalle.</p></div><span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700">{rows.length}</span></div>
      <div className={`min-h-0 flex-1 ${showAll ? "overflow-auto" : "overflow-hidden"}`}>{rows.length ? visibleRows.map((row, index) => <button className="grid h-[38px] w-full grid-cols-[24px_1fr_auto] items-center gap-2 border-b border-slate-100 px-3 text-left transition hover:bg-violet-50" key={row.key} onClick={() => onSelect(row)} type="button"><span className="grid h-6 w-6 place-items-center rounded-md bg-slate-100 text-[10px] font-black text-slate-500">{index + 1}</span><span className="min-w-0 leading-none"><span className="block truncate text-[10px] font-black text-slate-800">{row.name}</span><span className="mt-0.5 block truncate text-[7px] font-bold uppercase text-slate-400">{row.contractor}{row.role ? ` · ${row.role}` : ""}</span></span><strong className="text-xs text-violet-700">{row.days.length} <span className="text-[7px] uppercase text-slate-400">días</span></strong></button>) : <div className="grid h-full place-items-center p-6 text-center text-sm text-slate-400">No hay personas sin marcación en este periodo.</div>}</div>
      {rows.length > 10 ? <button className="h-[42px] shrink-0 border-t border-slate-200 bg-white text-xs font-black text-violet-700 hover:bg-violet-50" onClick={() => setShowAll((value) => !value)} type="button">{showAll ? "Ver menos" : `Ver más (${rows.length - 10})`}</button> : null}
    </article>
    {selected ? <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onSelect(null); }} role="dialog"><div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-200 bg-gradient-to-r from-violet-50 to-white p-5"><div><p className="text-[10px] font-black uppercase tracking-wider text-violet-600">Detalle de faltas</p><h4 className="mt-1 text-lg font-black text-slate-900">{selected.name}</h4><p className="text-xs text-slate-500">{selected.role || "Sin cargo"} · {selected.days.length} días sin marcación</p></div><button aria-label="Cerrar detalle" className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-white hover:text-slate-900" onClick={() => onSelect(null)} type="button"><X size={18} /></button></div><div className="max-h-[60vh] overflow-auto p-5"><div className="grid gap-2 sm:grid-cols-2">{selected.days.map((day) => <div className="flex items-center justify-between rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-2" key={day}><span className="text-xs font-bold text-slate-700">{new Date(`${day}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</span><span className="rounded-full bg-violet-100 px-2 py-1 text-[9px] font-black uppercase text-violet-700">Sin marca</span></div>)}</div></div></div></div> : null}
  </>;
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

function LateRanking({ rows }: { rows: LateRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<LateRow | null>(null);
  const visibleRows = showAll ? rows : rows.slice(0, 10);
  return <>
    <article className="flex h-[500px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg"><div className="flex h-[72px] shrink-0 items-center justify-between border-b border-slate-100 bg-gradient-to-r from-rose-50 to-white px-3 py-2"><div><p className="text-[8px] font-black uppercase tracking-[.12em] text-rose-600">GeoVictoria · después de 6:00 a. m.</p><h3 className="text-sm font-black">Top 10 de llegadas tardías</h3><p className="text-[9px] text-slate-500">Presiona una persona para ver días y horas.</p></div><span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black text-rose-700">{rows.length}</span></div><div className={`min-h-0 flex-1 ${showAll ? "overflow-auto" : "overflow-hidden"}`}>{rows.length ? visibleRows.map((row, index) => <button className="grid h-[38px] w-full grid-cols-[24px_1fr_auto] items-center gap-2 border-b border-slate-100 px-3 text-left transition hover:bg-rose-50 last:border-0" key={row.name} onClick={() => setSelected(row)} type="button"><span className={`grid h-6 w-6 place-items-center rounded-md text-[10px] font-black ${index < 3 ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-500"}`}>{index + 1}</span><span className="min-w-0 leading-none"><span className="block truncate text-[10px] font-black text-slate-800">{row.name}</span><span className="mt-0.5 block truncate text-[7px] font-bold uppercase text-slate-400">{row.role || "Sin cargo"}</span></span><span className="text-right"><span className="block text-xs font-black leading-none text-rose-600">{row.days} <span className="text-[7px] uppercase text-slate-400">días</span></span><span className="mt-0.5 block text-[8px] font-bold leading-none text-slate-500">Prom. {formatClockSeconds(row.average)}</span></span></button>) : <div className="grid h-full place-items-center p-6 text-center text-sm text-slate-400">Sin llegadas posteriores a las 6:00 a. m. en GeoVictoria.</div>}</div>{rows.length > 10 ? <button className="h-[42px] shrink-0 border-t border-slate-200 bg-white text-xs font-black text-rose-700 hover:bg-rose-50" onClick={() => setShowAll((value) => !value)} type="button">{showAll ? "Ver menos" : `Ver más (${rows.length - 10})`}</button> : null}</article>
    {selected ? <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }} role="dialog"><div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-200 bg-gradient-to-r from-rose-50 to-white p-5"><div><p className="text-[10px] font-black uppercase tracking-wider text-rose-600">Detalle de llegadas tardías</p><h4 className="mt-1 text-lg font-black text-slate-900">{selected.name}</h4><p className="text-xs text-slate-500">{selected.role || "Sin cargo"} · {selected.days} días · Promedio {formatClockSeconds(selected.average)}</p></div><button aria-label="Cerrar detalle" className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-white hover:text-slate-900" onClick={() => setSelected(null)} type="button"><X size={18} /></button></div><div className="max-h-[60vh] overflow-auto p-5"><div className="space-y-2">{selected.details.map((detail) => <div className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/50 px-3 py-2" key={`${detail.date}-${detail.seconds}`}><span className="text-xs font-bold capitalize text-slate-700">{new Date(`${detail.date}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</span><span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-700">{formatClockSeconds(detail.seconds)}</span></div>)}</div></div></div></div> : null}
  </>;
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

function DayResult({ detail, group, label, progress, tone = "cyan", value }: { detail?: string; group?: string; label: string; progress?: number; tone?: "cyan" | "emerald" | "rose" | "amber" | "violet"; value: string }) { const styles = { cyan: ["border-t-cyan-400 text-cyan-100", "bg-cyan-400"], emerald: ["border-t-emerald-400 text-emerald-100", "bg-emerald-400"], rose: ["border-t-rose-400 text-rose-100", "bg-rose-400"], amber: ["border-t-amber-400 text-amber-100", "bg-amber-400"], violet: ["border-t-violet-400 text-violet-100", "bg-violet-400"] }[tone]; const safeProgress = Math.min(Math.max(Number(progress) || 0, 0), 100); return <div className={`relative flex min-h-[104px] min-w-0 flex-col overflow-hidden rounded-xl border border-white/10 border-t-2 bg-white/[.07] px-2 py-2.5 transition hover:-translate-y-0.5 hover:bg-white/10 ${styles[0]}`}>{group ? <p className="mb-1 truncate text-[7px] font-black uppercase tracking-wider text-slate-500 lg:hidden">{group}</p> : null}<p className="truncate text-[8px] font-black uppercase tracking-wider text-slate-400" title={label}>{label}</p><p className="mt-1 truncate text-lg font-black sm:text-xl" title={value}>{value}</p>{detail ? <p className="mt-0.5 truncate text-[7px] font-bold text-slate-400" title={detail}>{detail}</p> : null}{progress !== undefined ? <div className="mt-auto h-1 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${styles[1]}`} style={{ width: `${safeProgress}%` }} /></div> : <div className="mt-auto h-1" />}</div>; }
function SavedCard({ label, onEdit, tone, value }: { label: string; onEdit: () => void; tone: "cyan" | "emerald" | "violet"; value: string }) { const color = { cyan: "from-cyan-500 to-blue-600", emerald: "from-emerald-400 to-teal-600", violet: "from-violet-500 to-fuchsia-600" }[tone]; return <article className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl"><div className={`absolute -right-12 -top-12 h-36 w-36 rounded-full bg-gradient-to-br ${color} opacity-30 blur-2xl`} /><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-400 text-slate-950"><Check strokeWidth={3} /></span><p className="mt-5 text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-5xl font-black">{value}</p><p className="mt-2 text-xs font-bold text-emerald-300">Guardado para esta fecha</p><button className="mt-5 inline-flex items-center gap-2 text-xs font-black text-white/75 hover:text-white" onClick={onEdit} type="button"><Pencil size={13} /> Corregir</button></article>; }
function PercentageForm({ color, icon, label, loading, onSubmit, onValue, value }: { color: "cyan" | "emerald"; icon: ReactNode; label: string; loading: boolean; onSubmit: (event: FormEvent) => void; onValue: (value: string) => void; value: string }) { return <form className={`rounded-3xl border bg-white p-6 shadow-lg shadow-slate-200/60 ${color === "cyan" ? "border-cyan-200" : "border-emerald-200"}`} onSubmit={onSubmit}><CardTitle color={color} icon={icon} label={label} /><Field label="Porcentaje final"><div className="relative"><input className="field pr-12 text-3xl font-black" max="100" min="0" onChange={(event) => onValue(event.target.value)} placeholder="0" required step="0.1" type="number" value={value} /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-400">%</span></div></Field><div className={`mt-4 h-3 overflow-hidden rounded-full ${color === "cyan" ? "bg-cyan-100" : "bg-emerald-100"}`}><div className={`h-full rounded-full transition-all ${color === "cyan" ? "bg-cyan-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(0, Math.min(Number(value) || 0, 100))}%` }} /></div><SaveButton loading={loading} label={`Guardar ${label.toLowerCase()}`} /></form>; }
function CardTitle({ color, icon, label }: { color: "cyan" | "emerald" | "violet"; icon: ReactNode; label: string }) { const style = { cyan: "bg-cyan-100 text-cyan-700", emerald: "bg-emerald-100 text-emerald-700", violet: "bg-violet-100 text-violet-700" }[color]; return <div className="flex items-center gap-3"><span className={`grid h-11 w-11 place-items-center rounded-xl ${style}`}>{icon}</span><h2 className="text-lg font-black">{label}</h2></div>; }
function SaveButton({ label, loading }: { label: string; loading: boolean }) { return <button className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-black text-white disabled:opacity-50" disabled={loading} type="submit">{loading ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}{label}</button>; }
function Field({ children, label }: { children: ReactNode; label: string }) { return <label className="mt-4 block text-xs font-black uppercase tracking-wide text-slate-500"><span className="mb-1.5 block">{label}</span>{children}</label>; }
