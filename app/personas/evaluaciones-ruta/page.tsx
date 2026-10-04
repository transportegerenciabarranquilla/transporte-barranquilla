"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Download, LoaderCircle, Search, UserRound } from "lucide-react";
import { PEOPLE_ROUTE_QUESTIONS } from "../../lib/peopleRouteQuestions";
import type { EvaluationAnswer, EvaluationPerson, EvaluationResult } from "../../lib/peopleRouteEvaluation";
import dynamic from "next/dynamic";
const RouteEvaluationCharts = dynamic(() => import("./RouteEvaluationCharts"), { loading: () => <p role="status" className="p-6 text-sm text-slate-500">Cargando gráficas...</p> });
const RouteEvaluationHistory = dynamic(() => import("./RouteEvaluationHistory"), { loading: () => <p role="status" className="p-6 text-sm text-slate-500">Cargando registros...</p> });

const choices: Array<{ value: EvaluationAnswer; label: string; active: string }> = [
  { value: "si", label: "Sí", active: "border-emerald-600 bg-emerald-50 text-emerald-800" },
  { value: "no", label: "No", active: "border-red-600 bg-red-50 text-red-800" },
  { value: "na", label: "N/A", active: "border-slate-600 bg-slate-100 text-slate-800" },
];

export default function RouteEvaluationPage() {
  const [access, setAccess] = useState<"checking" | "allowed" | "denied" | "error">("checking");
  const [view, setView] = useState<"evaluate" | "charts" | "history">("evaluate");
  const [editingHistory, setEditingHistory] = useState(false);
  const [cc, setCc] = useState("");
  const [people, setPeople] = useState<EvaluationPerson[]>([]);
  const [person, setPerson] = useState<EvaluationPerson | null>(null);
  const [answers, setAnswers] = useState<Record<string, EvaluationAnswer>>({});
  const [busy, setBusy] = useState<"lookup" | "save" | null>(null);
  const busyRef = useRef(false);
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const [exportError, setExportError] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const submissionId = useRef("");

  useEffect(() => {
    let active = true;
    fetch("/api/session/session", { cache: "no-store" }).then(async response => {
      const body = await response.json();
      if (active) setAccess(response.ok && (body.session?.isPeople || body.session?.isAdmin) ? "allowed" : "denied");
    }).catch(() => { if (active) setAccess("error"); });
    return () => { active = false; };
  }, []);

  function choosePerson(value: EvaluationPerson) {
    setPerson(value); setAnswers({}); setResult(null); setError(""); submissionId.current = crypto.randomUUID();
  }

  async function lookup(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true; setBusy("lookup"); setError(""); setPeople([]); setPerson(null); setAnswers({}); setResult(null);
    try {
      const response = await fetch(`/api/people/evaluaciones-ruta?${new URLSearchParams({ cc })}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo buscar la persona.");
      const found: EvaluationPerson[] = body.people;
      setPeople(found);
      if (found.length === 1) choosePerson(found[0]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo buscar la persona."); }
    finally { busyRef.current = false; setBusy(null); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!person?.role || busyRef.current || result) return;
    busyRef.current = true; setBusy("save"); setError("");
    try {
      const response = await fetch("/api/people/evaluaciones-ruta", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submissionId.current, cc: person.cc, personKey: person.key, answers }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo guardar la evaluación.");
      setResult(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar. Tus respuestas siguen disponibles."); }
    finally { busyRef.current = false; setBusy(null); }
  }

  function reset() { setCc(""); setPerson(null); setPeople([]); setAnswers({}); setResult(null); setError(""); submissionId.current = ""; }

  async function exportExcel() {
    if (exportingRef.current || busyRef.current) return;
    exportingRef.current = true; setExporting(true); setExportError("");
    try {
      const response = await fetch("/api/people/evaluaciones-ruta?export=excel", { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "No se pudo exportar el Excel.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = "evaluaciones-en-ruta.xlsx";
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setExportError(caught instanceof Error ? caught.message : "No se pudo exportar el Excel.");
    } finally { exportingRef.current = false; setExporting(false); }
  }

  const questionnaire = person?.role ? PEOPLE_ROUTE_QUESTIONS[person.role] : null;
  const answered = questionnaire?.questions.filter(question => answers[question.id]).length || 0;
  const total = questionnaire?.questions.length || 0;

  if (access !== "allowed") return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="text-center">
    <h1 className="text-xl font-bold text-[#10223d]">{access === "checking" ? "Comprobando acceso…" : access === "error" ? "No se pudo comprobar la sesión" : "Módulo exclusivo de People y administración"}</h1>
    <Link href="/" className="mt-4 inline-block text-violet-700 underline">Volver al portal</Link>
  </section></main>;

  return <main className="min-h-screen bg-[#eef2f5] pb-12 text-[#10223d]">
    <header className="bg-[#0b2235] text-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-5">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={18} />Volver a People</Link>
      <span className="inline-flex items-center gap-2 font-bold"><ClipboardCheck size={20} />Evaluación en ruta</span>
    </div></header>
    <div className={`mx-auto px-4 pt-6 sm:px-6 ${view === "charts" ? "max-w-7xl" : "max-w-5xl"}`}>
      <nav aria-label="Secciones de evaluación" className="mb-5 flex w-fit max-w-full gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {([{ id: "evaluate", label: "Evaluar" }, { id: "charts", label: "Gráficas" }, { id: "history", label: "Registros" }] as const).map(tab => <button key={tab.id} type="button" aria-current={view === tab.id ? "page" : undefined} disabled={busy !== null || editingHistory} onClick={() => setView(tab.id)} className={`rounded-lg px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${view === tab.id ? "bg-[#10213b] text-white" : "text-slate-500 hover:bg-slate-50"}`}>{tab.label}</button>)}
      </nav>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Descarga todas las evaluaciones guardadas.</p>
        <button type="button" onClick={() => void exportExcel()} disabled={exporting || busy !== null} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
          {exporting ? <LoaderCircle size={18} className="animate-spin" /> : <Download size={18} />}
          {exporting ? "Generando Excel..." : "Exportar Excel"}
        </button>
      </div>
      {exportError && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{exportError}</p>}
      {view === "charts" && <RouteEvaluationCharts />}
      {view === "history" && <RouteEvaluationHistory onEditingChange={setEditingHistory} />}
      <div hidden={view !== "evaluate"}>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <section className="border-b border-slate-200 p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-widest text-violet-700">People · Verificación operativa</p>
        <h1 className="mt-2 text-2xl font-bold">{person ? "Evaluación en ruta" : "Identifica a la persona para comenzar"}</h1>
        <p className="mt-2 text-sm text-slate-500">{person ? "Registro de verificación operativa por cargo." : "Consulta su cédula para obtener el nombre, cargo y contratista. Después responde las preguntas correspondientes a su cargo."}</p>
        {!person && <form onSubmit={lookup} className="mt-5 flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 text-sm font-semibold">Cédula<input autoFocus required pattern="[0-9]{5,15}" maxLength={15} inputMode="numeric" autoComplete="off" value={cc} disabled={busy !== null} onChange={event => { setCc(event.target.value.replace(/\D/g, "")); setPeople([]); setError(""); }} placeholder="Escribe la cédula" className="mt-2 block w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" /></label>
          <button type="submit" disabled={busy !== null || !/^\d{5,15}$/.test(cc)} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy === "lookup" ? <LoaderCircle size={18} className="animate-spin" /> : <Search size={18} />}{busy === "lookup" ? "Buscando…" : "Buscar persona"}</button>
        </form>}
        {!person && people.length > 1 && <div className="mt-5 space-y-2"><p className="text-sm font-semibold">Esta cédula tiene varios registros. Selecciona el que vas a evaluar:</p>{people.map(item => <button key={item.key} type="button" onClick={() => choosePerson(item)} className="block w-full rounded-lg border border-slate-200 p-4 text-left hover:border-violet-400 hover:bg-violet-50"><strong>{item.nombre}</strong><span className="mt-1 block text-sm text-slate-500">{item.cargo || "Sin cargo"} · {item.contratista}</span></button>)}</div>}
        {person && <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-sm font-bold text-violet-800"><UserRound size={18} />Persona encontrada</span><button disabled={busy !== null} type="button" onClick={reset} className="text-sm font-semibold text-violet-700 underline disabled:opacity-50">{result ? "Nueva evaluación" : "Cambiar persona"}</button></div>
          <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Nombre</dt><dd className="font-semibold">{person.nombre}</dd></div><div><dt className="text-xs text-slate-500">Cédula</dt><dd className="font-semibold">{person.cc}</dd></div><div><dt className="text-xs text-slate-500">Cargo</dt><dd className="font-semibold">{person.cargo || "Sin cargo registrado"}</dd></div><div><dt className="text-xs text-slate-500">Contratista</dt><dd className="font-semibold">{person.contratista}</dd></div></dl>
        </div>}
      </section>
      {error && <p role="alert" className="border-b border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">{error}</p>}
      {person && !questionnaire && <p role="alert" className="bg-amber-50 p-5 text-sm text-amber-800">El cargo registrado no corresponde a Conductor, Responsable de ruta o Auxiliar de reparto. Actualiza el cargo en People y vuelve a buscar la cédula.</p>}
      {result && <section role="status" className="border-b border-emerald-200 bg-emerald-50 p-5 text-emerald-900"><h2 className="flex items-center gap-2 font-bold"><CheckCircle2 size={20} />Evaluación guardada</h2><p className="mt-2 text-sm">{person?.nombre} · {new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(result.createdAt))}</p><p className="mt-1 break-all text-xs">Registro: {result.id}</p></section>}
      {questionnaire && <form onSubmit={save}>
        <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-5 sm:px-7"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">Formulario: {questionnaire.label}</h2><span className="text-sm font-semibold text-violet-700">{answered} de {total} respondidas</span></div><p className="mt-1 text-xs text-slate-500">Selecciona una respuesta por pregunta. N/A significa «No aplica».</p><div role="progressbar" aria-label="Preguntas respondidas" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered} className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-violet-600 transition-[width] motion-reduce:transition-none" style={{ width: `${total ? answered / total * 100 : 0}%` }} /></div></div>
        <div className="hidden grid-cols-[minmax(0,1fr)_240px] gap-6 border-b border-slate-200 px-7 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:grid" aria-hidden="true"><span>Criterio de evaluación</span><span className="text-center">Respuesta</span></div>
        {questionnaire.questions.map((question, index) => <fieldset key={question.id} aria-labelledby={`question-${question.id}`} disabled={busy === "save" || Boolean(result)} className="grid min-w-0 gap-4 border-0 border-b border-slate-200 px-5 py-5 last:border-b-0 hover:bg-slate-50/60 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center sm:gap-6 sm:px-7">
          <p id={`question-${question.id}`} className="flex gap-3 text-sm leading-relaxed"><span className="shrink-0 pt-0.5 text-xs font-bold tabular-nums text-slate-400">{String(index + 1).padStart(2, "0")}</span><span className="font-medium">{question.text}</span></p>
          <div className="grid grid-cols-3 gap-2">{choices.map(choice => <label key={choice.value} className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-2 py-2 text-sm font-semibold focus-within:ring-2 focus-within:ring-violet-400 ${answers[question.id] === choice.value ? choice.active : "border-slate-200 text-slate-600"}`}>
            <input required type="radio" name={question.id} value={choice.value} checked={answers[question.id] === choice.value} onChange={() => setAnswers(current => ({ ...current, [question.id]: choice.value }))} className="h-4 w-4 accent-violet-700" />{choice.label}
          </label>)}</div>
        </fieldset>)}
        {!result && <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50/70 p-5 sm:px-7"><p className="text-sm text-slate-500">{answered === total ? "Todas las preguntas están respondidas. Puedes guardar la evaluación." : `Faltan ${total - answered} preguntas por responder.`}</p><button type="submit" disabled={busy !== null || answered !== total} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-6 py-3 font-bold text-white disabled:opacity-50">{busy === "save" && <LoaderCircle size={18} className="animate-spin" />}{busy === "save" ? "Guardando…" : "Guardar evaluación"}</button></div>}
      </form>}
      </div>
      </div>
    </div>
  </main>;
}
