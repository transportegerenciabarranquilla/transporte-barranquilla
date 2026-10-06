"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, ClipboardCheck, Download, LoaderCircle, Pencil, Plus, Search, Trash2, UserRound } from "lucide-react";
import { PEOPLE_ROUTE_QUESTIONS } from "../../lib/peopleRouteQuestions";
import { MAX_ROUTE_EVALUATION_QUESTIONS, type EvaluationAnswer, type EvaluationPerson, type EvaluationQuestion, type EvaluationResult } from "../../lib/peopleRouteEvaluation";
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
  const [historyCc, setHistoryCc] = useState("");
  const [editingHistory, setEditingHistory] = useState(false);
  const [cc, setCc] = useState("");
  const [people, setPeople] = useState<EvaluationPerson[]>([]);
  const [person, setPerson] = useState<EvaluationPerson | null>(null);
  const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
  const [questionRevision, setQuestionRevision] = useState<string | null>(null);
  const [questionsReady, setQuestionsReady] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionDraft, setQuestionDraft] = useState("");
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [newQuestionDraft, setNewQuestionDraft] = useState("");
  const [answers, setAnswers] = useState<Record<string, EvaluationAnswer>>({});
  const [busy, setBusy] = useState<"lookup" | "save" | "questions" | null>(null);
  const busyRef = useRef(false);
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const [exportError, setExportError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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

  async function choosePerson(value: EvaluationPerson) {
    setPerson(value);
    setQuestions([]); setQuestionsReady(false); setQuestionRevision(null);
    setEditingQuestionId(null); setDeletingQuestionId(null); setQuestionDraft(""); setAddingQuestion(false); setNewQuestionDraft("");
    setAnswers({}); setResult(null); setError(""); setNotice(""); submissionId.current = crypto.randomUUID();
    if (!value.role) return;
    busyRef.current = true; setBusy("lookup");
    try {
      const response = await fetch("/api/people/evaluaciones-ruta/preguntas?" + new URLSearchParams({ role: value.role }), { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudieron cargar las preguntas guardadas.");
      setQuestions(body.questions); setQuestionRevision(body.revision); setQuestionsReady(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudieron cargar las preguntas."); }
    finally { busyRef.current = false; setBusy(null); }
  }

  async function persistQuestions(next: EvaluationQuestion[]) {
    if (!person?.role || !questionsReady || busyRef.current) return false;
    busyRef.current = true; setBusy("questions"); setError(""); setNotice("");
    try {
      const response = await fetch("/api/people/evaluaciones-ruta/preguntas", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: person.role, questions: next, revision: questionRevision }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se guardaron las preguntas.");
      setQuestions(body.questions); setQuestionRevision(body.revision);
      setNotice("Preguntas guardadas en la base de datos para este cargo. Se conservarán al recargar.");
      return true;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se guardaron las preguntas. Intenta nuevamente."); return false; }
    finally { busyRef.current = false; setBusy(null); }
  }

  async function saveQuestion(id: string) {
    const text = questionDraft.trim();
    if (!text) { setError("La pregunta no puede quedar vacía."); return; }
    const changed = questions.find(question => question.id === id)?.text !== text;
    if (!await persistQuestions(questions.map(question => question.id === id ? { ...question, text } : question))) return;
    if (changed) {
      setAnswers(current => { const next = { ...current }; delete next[id]; return next; });
    }
    setEditingQuestionId(null); setQuestionDraft("");
  }

  async function deleteQuestion(id: string) {
    if (questions.length <= 1) { setError("La evaluación debe conservar al menos una pregunta."); return; }
    if (!await persistQuestions(questions.filter(question => question.id !== id))) return;
    setAnswers(current => { const next = { ...current }; delete next[id]; return next; });
    setDeletingQuestionId(null);
  }

  async function addQuestion() {
    const text = newQuestionDraft.trim();
    if (!text) { setError("Escribe el texto de la nueva pregunta."); return; }
    if (questions.length >= MAX_ROUTE_EVALUATION_QUESTIONS) { setError("La evaluación admite hasta 50 preguntas."); return; }
    if (!await persistQuestions([...questions, { id: `adicional-${crypto.randomUUID()}`, text }])) return;
    setAddingQuestion(false); setNewQuestionDraft("");
  }

  async function lookup(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true; setBusy("lookup"); setError(""); setNotice(""); setPeople([]); setPerson(null); setQuestions([]); setEditingQuestionId(null); setDeletingQuestionId(null); setAddingQuestion(false); setNewQuestionDraft(""); setAnswers({}); setResult(null);
    try {
      const response = await fetch(`/api/people/evaluaciones-ruta?${new URLSearchParams({ cc })}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo buscar la persona.");
      const found: EvaluationPerson[] = body.people;
      setPeople(found);
      if (found.length === 1) await choosePerson(found[0]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo buscar la persona."); }
    finally { busyRef.current = false; setBusy(null); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!person?.role || busyRef.current || result || editingQuestionId || deletingQuestionId || addingQuestion) return;
    if (!questions.length || questions.some(question => !answers[question.id])) { setError("Responde todas las preguntas visibles antes de guardar la evaluación."); return; }
    busyRef.current = true; setBusy("save"); setError("");
    try {
      const response = await fetch("/api/people/evaluaciones-ruta", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: submissionId.current, cc: person.cc, personKey: person.key, questions, answers }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo guardar la evaluación.");
      setResult(body); setNotice("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar. Tus respuestas siguen disponibles."); }
    finally { busyRef.current = false; setBusy(null); }
  }

  function reset() { setCc(""); setPerson(null); setPeople([]); setQuestions([]); setEditingQuestionId(null); setDeletingQuestionId(null); setAddingQuestion(false); setNewQuestionDraft(""); setAnswers({}); setResult(null); setError(""); setNotice(""); submissionId.current = ""; }

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
  const answered = questions.filter(question => answers[question.id]).length;
  const total = questions.length;

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
      {view === "history" && <RouteEvaluationHistory key={historyCc} initialCc={historyCc} onEditingChange={setEditingHistory} />}
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
        {!person && people.length > 1 && <div className="mt-5 space-y-2"><p className="text-sm font-semibold">Esta cédula tiene varios registros. Selecciona el que vas a evaluar:</p>{people.map(item => <button key={item.key} type="button" disabled={busy !== null} onClick={() => void choosePerson(item)} className="block w-full rounded-lg border border-slate-200 p-4 text-left hover:border-violet-400 hover:bg-violet-50"><strong>{item.nombre}</strong><span className="mt-1 block text-sm text-slate-500">{item.cargo || "Sin cargo"} · {item.contratista}</span></button>)}</div>}
        {person && <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-sm font-bold text-violet-800"><UserRound size={18} />Persona encontrada</span><button disabled={busy !== null} type="button" onClick={reset} className="text-sm font-semibold text-violet-700 underline disabled:opacity-50">{result ? "Nueva evaluación" : "Cambiar persona"}</button></div>
          <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Nombre</dt><dd className="font-semibold">{person.nombre}</dd></div><div><dt className="text-xs text-slate-500">Cédula</dt><dd className="font-semibold">{person.cc}</dd></div><div><dt className="text-xs text-slate-500">Cargo</dt><dd className="font-semibold">{person.cargo || "Sin cargo registrado"}</dd></div><div><dt className="text-xs text-slate-500">Contratista</dt><dd className="font-semibold">{person.contratista}</dd></div></dl>
        </div>}
      </section>
      {error && <p role="alert" className="border-b border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">{error}</p>}
      {notice && !result && <p role="status" className="border-b border-violet-100 bg-violet-50 p-5 text-sm font-semibold text-violet-800">{notice}</p>}
      {person && !questionnaire && <p role="alert" className="bg-amber-50 p-5 text-sm text-amber-800">El cargo registrado no corresponde a Conductor, Responsable de ruta o Auxiliar de reparto. Actualiza el cargo en People y vuelve a buscar la cédula.</p>}
      {result && <section role="status" className="border-b border-emerald-200 bg-emerald-50 p-5 text-emerald-900"><h2 className="flex items-center gap-2 font-bold"><CheckCircle2 size={20} />Evaluación guardada</h2><p className="mt-2 text-sm">{person?.nombre} · {new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(result.createdAt))}</p><p className="mt-1 break-all text-xs">Registro: {result.id}</p><button type="button" onClick={() => { setHistoryCc(person?.cc || ""); setView("history"); }} className="mt-3 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100">Actualizar o eliminar esta evaluación</button></section>}
      {questionnaire && questionsReady && <form onSubmit={save}>
        <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-5 sm:px-7"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">Formulario: {questionnaire.label}</h2><span className="text-sm font-semibold text-violet-700">{answered} de {total} respondidas</span></div><p className="mt-1 text-xs text-slate-500">Selecciona una respuesta por pregunta. N/A significa «No aplica». Añadir, editar o eliminar una pregunta guarda la plantilla de este cargo en la base de datos. Las evaluaciones anteriores no cambian. Guarda la evaluación para conservar las respuestas de esta persona.</p><div role="progressbar" aria-label="Preguntas respondidas" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered} className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-violet-600 transition-[width] motion-reduce:transition-none" style={{ width: `${total ? answered / total * 100 : 0}%` }} /></div></div>
        {!result && <div className="border-b border-slate-200 px-5 py-4 sm:px-7">
          {!addingQuestion ? <button type="button" disabled={busy !== null || Boolean(editingQuestionId || deletingQuestionId) || total >= MAX_ROUTE_EVALUATION_QUESTIONS} onClick={() => { setAddingQuestion(true); setNewQuestionDraft(""); setError(""); }} className="inline-flex items-center gap-2 rounded-lg border border-violet-300 px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50"><Plus size={17} />Añadir pregunta</button> : <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-4"><label htmlFor="new-route-question" className="text-sm font-semibold">Nueva pregunta</label><textarea id="new-route-question" autoFocus maxLength={1000} rows={2} value={newQuestionDraft} onChange={event => setNewQuestionDraft(event.target.value)} placeholder="Escribe la pregunta que deseas añadir" className="mt-2 block w-full rounded-md border border-slate-300 bg-white p-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100" /><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy !== null} onClick={() => void addQuestion()} className="rounded-md bg-violet-700 px-4 py-2 text-sm font-bold text-white">Guardar nueva pregunta</button><button type="button" disabled={busy !== null} onClick={() => { setAddingQuestion(false); setNewQuestionDraft(""); setError(""); }} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">Cancelar</button></div></div>}
        </div>}
        <div className="hidden grid-cols-[minmax(0,1fr)_240px] gap-6 border-b border-slate-200 px-7 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:grid" aria-hidden="true"><span>Criterio de evaluación</span><span className="text-center">Respuesta</span></div>
        {questions.map((question, index) => <fieldset key={question.id} aria-labelledby={`question-${question.id}`} disabled={busy !== null || Boolean(result)} className="grid min-w-0 gap-4 border-0 border-b border-slate-200 px-5 py-5 last:border-b-0 hover:bg-slate-50/60 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center sm:gap-6 sm:px-7">
          <div className="min-w-0">
            <p id={`question-${question.id}`} className="flex gap-3 text-sm leading-relaxed"><span className="shrink-0 pt-0.5 text-xs font-bold tabular-nums text-slate-400">{String(index + 1).padStart(2, "0")}</span><span className="font-medium">{question.text}</span></p>
            {!result && editingQuestionId === question.id && <div className="mt-3 pl-7"><label htmlFor={`edit-${question.id}`} className="text-xs font-semibold text-slate-600">Texto de la pregunta</label><textarea id={`edit-${question.id}`} autoFocus maxLength={1000} rows={2} value={questionDraft} onChange={event => setQuestionDraft(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 p-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100" /><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => saveQuestion(question.id)} className="rounded-md bg-violet-700 px-3 py-1.5 text-xs font-bold text-white">Guardar pregunta</button><button type="button" onClick={() => { setEditingQuestionId(null); setQuestionDraft(""); setError(""); }} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold">Cancelar</button></div></div>}
            {!result && deletingQuestionId === question.id && <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800"><p>¿Eliminar esta pregunta de la plantilla de este cargo? No se modificarán evaluaciones anteriores.</p><div className="mt-2 flex gap-2"><button type="button" onClick={() => deleteQuestion(question.id)} className="rounded-md bg-red-700 px-3 py-1.5 font-bold text-white">Sí, quitar</button><button type="button" onClick={() => setDeletingQuestionId(null)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700">Cancelar</button></div></div>}
            {!result && editingQuestionId !== question.id && deletingQuestionId !== question.id && <div className="mt-2 flex flex-wrap gap-3 pl-7"><button type="button" disabled={Boolean(editingQuestionId || deletingQuestionId || addingQuestion)} onClick={() => { setEditingQuestionId(question.id); setQuestionDraft(question.text); setError(""); }} className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline disabled:opacity-50"><Pencil size={13} />Editar pregunta</button><button type="button" disabled={questions.length <= 1 || Boolean(editingQuestionId || deletingQuestionId || addingQuestion)} onClick={() => setDeletingQuestionId(question.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline disabled:opacity-50"><Trash2 size={13} />Eliminar pregunta</button></div>}
          </div>
          <div className="grid grid-cols-3 gap-2">{choices.map(choice => <label key={choice.value} className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-2 py-2 text-sm font-semibold focus-within:ring-2 focus-within:ring-violet-400 ${answers[question.id] === choice.value ? choice.active : "border-slate-200 text-slate-600"}`}>
            <input type="radio" name={question.id} value={choice.value} checked={answers[question.id] === choice.value} onChange={() => { setAnswers(current => ({ ...current, [question.id]: choice.value })); setError(""); }} className="h-4 w-4 accent-violet-700" />{choice.label}
          </label>)}</div>
        </fieldset>)}
        {!result && <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50/70 p-5 sm:px-7"><p className={`text-sm ${error ? "font-semibold text-red-700" : "text-slate-500"}`}>{error || (answered === total ? "Todas las preguntas están respondidas. Puedes guardar la evaluación." : `Faltan ${total - answered} preguntas por responder.`)}</p><button type="submit" disabled={busy !== null || Boolean(editingQuestionId || deletingQuestionId || addingQuestion)} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-6 py-3 font-bold text-white disabled:opacity-50">{busy === "save" && <LoaderCircle size={18} className="animate-spin" />}{busy === "save" ? "Guardando…" : "Guardar evaluación"}</button></div>}
      </form>}
      </div>
      </div>
    </div>
  </main>;
}
