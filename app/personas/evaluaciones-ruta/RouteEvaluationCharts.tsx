"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, BarChart3, CheckCheck, ClipboardCheck, RefreshCw, Users, AlertTriangle } from "lucide-react";
import type { AnswerCounts, RouteAnalytics } from "../../lib/peopleRouteAnalytics";

const percent = (value: number | null) => value === null ? "—" : `${value.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;
const count = (value: number) => value.toLocaleString("es-CO");
const monthLabel = (month: string) => new Intl.DateTimeFormat("es-CO", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));

export default function RouteEvaluationCharts() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [contractor, setContractor] = useState("");
  const [role, setRole] = useState("");
  const [refresh, setRefresh] = useState(0);
  const query = new URLSearchParams({ view: "analytics", from, to, contractor, role }).toString();
  const key = `${query}:${refresh}`;
  const [resource, setResource] = useState<{ key: string; data?: RouteAnalytics; error?: string }>({ key: "" });
  const [options, setOptions] = useState<string[]>([]);
  const invalidRange = Boolean(from && to && from > to);
  const loading = resource.key !== key && !invalidRange;
  const data = resource.key === key ? resource.data : undefined;

  useEffect(() => {
    if (invalidRange) return;
    const controller = new AbortController();
    fetch(`/api/people/evaluaciones-ruta?${query}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudieron cargar las gráficas.");
      if (!controller.signal.aborted) { setResource({ key, data: body }); setOptions(body.contractors); }
    }).catch(error => { if (!controller.signal.aborted) setResource({ key, error: error instanceof Error ? error.message : "No se pudieron cargar las gráficas." }); });
    return () => controller.abort();
  }, [key, query, invalidRange]);

  const fieldClass = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100";
  return <section className="space-y-5" aria-label="Gráficas de evaluaciones">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-[11px] font-bold uppercase tracking-[.22em] text-violet-600">People / Inteligencia operativa</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">El pulso de tu operación<span className="text-violet-600">.</span></h1><p className="mt-2 text-sm text-slate-500">Encuentra fortalezas y decide dónde actuar primero.</p></div>
      <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Actualizar</button>
    </div>
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-bold text-slate-500">Desde<input type="date" value={from} onChange={event => setFrom(event.target.value)} className={fieldClass} /></label>
      <label className="text-xs font-bold text-slate-500">Hasta<input type="date" value={to} onChange={event => setTo(event.target.value)} className={fieldClass} /></label>
      <label className="text-xs font-bold text-slate-500">Contratista<select value={contractor} onChange={event => setContractor(event.target.value)} className={fieldClass}><option value="">Todos los contratistas</option>{options.map(option => <option key={option}>{option}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-500">Cargo<select value={role} onChange={event => setRole(event.target.value)} className={fieldClass}><option value="">Todos los cargos</option><option value="conductor">Conductor</option><option value="responsable">Responsable de ruta</option><option value="auxiliar">Auxiliar de reparto</option></select></label>
    </div>
    {invalidRange && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">La fecha inicial debe ser anterior o igual a la final.</p>}
    {loading && <div role="status" className="grid min-h-80 place-items-center rounded-2xl border border-slate-200 bg-white"><div className="text-center"><Activity className="mx-auto animate-pulse text-violet-500" size={36} /><p className="mt-4 text-sm font-semibold text-slate-500">Preparando tus indicadores...</p></div></div>}
    {resource.key === key && resource.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{resource.error}</p>}
    {data && !invalidRange && (data.evaluations === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center"><BarChart3 size={40} className="mx-auto text-violet-400" /><h2 className="mt-4 text-xl font-bold">Todavía no hay resultados en este periodo</h2><p className="mt-2 text-sm text-slate-500">Guarda una evaluación o amplía los filtros para ver las gráficas.</p></div> : <>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="relative overflow-hidden rounded-3xl bg-[#10213b] p-6 text-white sm:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-64"><span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-teal-300"><Activity size={16} />Cumplimiento general</span><h2 className="mt-4 text-2xl font-bold tracking-tight">Cada respuesta cuenta.</h2><p className="mt-3 text-sm leading-6 text-slate-300">Porcentaje de respuestas «Sí» sobre las preguntas que aplican.</p><p className="mt-4 inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-300">N/A se excluye del cumplimiento</p></div>
            <div className="relative h-44 w-44 shrink-0" role="img" aria-label={`Cumplimiento general: ${percent(data.score)}`}>
              <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90" aria-hidden="true"><circle cx="90" cy="90" r="76" fill="none" stroke="#263956" strokeWidth="12" /><circle cx="90" cy="90" r="76" fill="none" stroke="#5eead4" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(data.score ?? 0) / 100 * 477.52} 477.52`} /></svg>
              <div className="absolute inset-0 grid place-content-center text-center"><strong className="text-4xl font-black tracking-tighter">{percent(data.score)}</strong><span className="mt-1 text-xs text-slate-400">{count(data.counts.si + data.counts.no)} respuestas aplicables</span></div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Metric label="Evaluaciones" value={count(data.evaluations)} icon={<ClipboardCheck size={18} />} tone="violet" />
          <Metric label="Personas evaluadas" value={count(data.people)} icon={<Users size={18} />} tone="blue" />
          <Metric label="Respuestas Sí" value={count(data.counts.si)} icon={<CheckCheck size={18} />} tone="teal" />
          <Metric label="Respuestas No" value={count(data.counts.no)} icon={<AlertTriangle size={18} />} tone="rose" />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><CardTitle eyebrow="EVOLUCIÓN" title="Cumplimiento en el tiempo" /><Trend data={data.trend} /></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><CardTitle eyebrow="POR CARGO" title="Así responde tu equipo" /><div className="mt-6 space-y-6">{data.byRole.map(group => <div key={group.label}><div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><strong>{group.label}</strong><span className="text-slate-500">{group.evaluations} evaluaciones · {percent(group.score)}</span></div><AnswerBar counts={group} /><div className="mt-2 flex gap-4 text-xs text-slate-500"><span>Sí {group.si}</span><span>No {group.no}</span><span>N/A {group.na}</span></div></div>)}</div><Legend /></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><CardTitle eyebrow="CONTRATISTAS" title="Mapa de cumplimiento" /><p className="mt-2 text-xs text-slate-500">Selecciona un contratista para explorar sus resultados.</p><div className="mt-5 max-h-96 space-y-4 overflow-y-auto">{data.byContractor.map((group, index) => <button key={group.label} type="button" onClick={() => setContractor(group.label)} className="group block w-full rounded-xl p-2 text-left outline-none hover:bg-violet-50 focus-visible:ring-2 focus-visible:ring-violet-500"><div className="mb-2 flex items-start justify-between gap-3"><span className="flex min-w-0 items-start gap-3 text-sm font-bold"><span className="text-xs tabular-nums text-slate-400">{String(index + 1).padStart(2, "0")}</span>{group.label}</span><strong className="shrink-0 text-sm text-violet-700">{percent(group.score)}</strong></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-400" style={{ width: `${group.score ?? 0}%` }} /></div><div className="mt-2 flex items-center justify-between text-xs text-slate-400"><span>{count(group.evaluations)} evaluaciones · {count(group.si + group.no)} respuestas aplicables</span><ArrowUpRight size={14} /></div></button>)}</div></article>
        <article className="rounded-2xl border border-rose-100 bg-white p-5 sm:p-6"><CardTitle eyebrow="FOCO DE MEJORA" title="Dónde actuar primero" /><p className="mt-2 text-xs text-slate-500">Las 5 preguntas con más respuestas «No».</p>{!data.questions.length ? <div className="grid min-h-48 place-content-center text-center"><CheckCheck size={32} className="mx-auto text-teal-500" /><p className="mt-3 text-sm font-semibold text-teal-700">Sin respuestas «No» en esta selección.</p></div> : <div className="mt-4 divide-y divide-slate-100">{data.questions.map((question, index) => <details key={question.key} className="group py-3"><summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-violet-500"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rose-50 text-xs font-black text-rose-600">{index + 1}</span><div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{question.role}</p><p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 group-open:line-clamp-none">{question.text}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rose-50"><div className="h-full rounded-full bg-rose-400" style={{ width: `${question.rate}%` }} /></div></div><span className="shrink-0 text-right"><strong className="text-lg text-rose-600">{question.no}</strong><span className="block text-[10px] text-slate-400">respuestas No</span></span></summary><p className="ml-10 mt-2 text-xs text-slate-500">{percent(question.rate)} de respuestas aplicables son «No» · Sí: {question.si} · N/A: {question.na}</p></details>)}</div>}</article>
      </div>
      <p className="pb-2 text-xs text-slate-500">Cumplimiento = Sí ÷ (Sí + No). Cada respuesta tiene el mismo peso. Fechas en hora de Colombia; las evaluaciones repetidas cuentan como registros separados.</p>
    </>)}
  </section>;
}

function Metric({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: "violet" | "blue" | "teal" | "rose" }) {
  const colors = { violet: "bg-violet-50 text-violet-600", blue: "bg-blue-50 text-blue-600", teal: "bg-teal-50 text-teal-600", rose: "bg-rose-50 text-rose-600" };
  return <div className="rounded-2xl border border-slate-200 bg-white p-5"><span className={`inline-flex rounded-xl p-2.5 ${colors[tone]}`}>{icon}</span><p className="mt-3 text-3xl font-black tracking-tight">{value}</p><p className="mt-1 text-xs font-medium text-slate-500">{label}</p></div>;
}
function CardTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <><p className="text-[10px] font-bold tracking-[.18em] text-violet-500">{eyebrow}</p><h2 className="mt-1 text-lg font-bold tracking-tight">{title}</h2></>;
}
function AnswerBar({ counts }: { counts: AnswerCounts }) {
  const total = counts.si + counts.no + counts.na;
  return <div className="flex h-4 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Sí: ${counts.si}, No: ${counts.no}, N/A: ${counts.na}`}>
    {(["si", "no", "na"] as const).map((key, index) => <div key={key} className={["bg-teal-400", "bg-rose-400", "bg-slate-300"][index]} style={{ width: `${total ? counts[key] / total * 100 : 0}%` }} title={`${key === "si" ? "Sí" : key === "no" ? "No" : "N/A"}: ${counts[key]}`} />)}
  </div>;
}
function Legend() {
  return <div className="mt-6 flex gap-5 border-t border-slate-100 pt-4 text-xs text-slate-500">{["Sí", "No", "N/A"].map((label, index) => <span key={label} className="inline-flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${["bg-teal-400", "bg-rose-400", "bg-slate-300"][index]}`} />{label}</span>)}</div>;
}
function Trend({ data }: { data: RouteAnalytics["trend"] }) {
  const start = Date.parse(`${data[0].month}-01T00:00:00Z`);
  const end = Date.parse(`${data.at(-1)!.month}-01T00:00:00Z`);
  const point = (month: string, score: number) => ({ x: end === start ? 280 : 48 + (Date.parse(`${month}-01T00:00:00Z`) - start) / (end - start) * 464, y: 190 - score / 100 * 150 });
  const valid = data.filter(row => row.score !== null);
  // Separate segments across months without applicable responses or without evaluations.
  const segments: string[][] = [];
  let previousMonth = -1;
  for (const row of data) {
    const [year, month] = row.month.split("-").map(Number);
    const monthIndex = year * 12 + month;
    if (row.score === null) { previousMonth = -1; continue; }
    const p = point(row.month, row.score);
    if (monthIndex !== previousMonth + 1) segments.push([]);
    segments.at(-1)!.push(`${p.x},${p.y}`); previousMonth = monthIndex;
  }
  return <><div className="mt-4 overflow-hidden"><svg viewBox="0 0 560 235" className="w-full" role="img" aria-label="Cumplimiento mensual de cero a cien por ciento"><defs><linearGradient id="route-trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity=".22" /><stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient></defs>{[0, 25, 50, 75, 100].map(tick => <g key={tick}><line x1="48" x2="512" y1={190 - tick * 1.5} y2={190 - tick * 1.5} stroke="#eef2f6" strokeDasharray="4 5" /><text x="34" y={194 - tick * 1.5} textAnchor="end" fontSize="10" fill="#94a3b8">{tick}%</text></g>)}{segments.map((segment, index) => <g key={index}>{segment.length > 1 && <polygon points={`${segment[0].split(",")[0]},190 ${segment.join(" ")} ${segment.at(-1)!.split(",")[0]},190`} fill="url(#route-trend-fill)" />}<polyline points={segment.join(" ")} fill="none" stroke="#8b5cf6" strokeWidth="3" strokeLinejoin="round" /></g>)}{valid.map(row => { const p = point(row.month, row.score!); return <g key={row.month}><circle cx={p.x} cy={p.y} r="5" fill="#8b5cf6" stroke="white" strokeWidth="2"><title>{monthLabel(row.month)}: {percent(row.score)} · {row.evaluations} evaluaciones</title></circle>{data.length <= 6 && <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize="11" fontWeight="700" fill="#7c3aed">{percent(row.score)}</text>}</g>; })}{(data.length === 1 ? [data[0]] : [data[0], data.at(-1)!]).map(row => <text key={row.month} x={point(row.month, 0).x} y="222" textAnchor="middle" fontSize="11" fill="#64748b">{monthLabel(row.month)}</text>)}</svg></div><details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer font-semibold text-violet-700">Ver cifras por mes</summary><div className="mt-3 max-h-44 overflow-y-auto"><table className="w-full text-left"><thead><tr><th className="py-2">Mes</th><th>Evaluaciones</th><th>Cumplimiento</th></tr></thead><tbody>{data.map(row => <tr key={row.month} className="border-t border-slate-100"><td className="py-2">{monthLabel(row.month)}</td><td>{row.evaluations}</td><td>{percent(row.score)}</td></tr>)}</tbody></table></div></details></>;
}
