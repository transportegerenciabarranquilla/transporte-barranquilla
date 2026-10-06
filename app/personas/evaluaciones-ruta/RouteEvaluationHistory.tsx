"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle, Pencil, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import { MAX_ROUTE_EVALUATION_QUESTIONS, type EvaluationAnswer, type EvaluationQuestion } from "../../lib/peopleRouteEvaluation";
import type { RouteEvaluationRecord } from "../../lib/peopleRouteAnalytics";

const dateFormatter = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });
export default function RouteEvaluationHistory({ onEditingChange, initialCc = "" }: { onEditingChange: (editing: boolean) => void; initialCc?: string }) {
  const [cc, setCc] = useState(initialCc);
  const [search, setSearch] = useState(initialCc);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const query = new URLSearchParams({ view: "history", cc: search, offset: String(offset) }).toString();
  const key = `${query}:${refresh}`;
  const [resource, setResource] = useState<{ key: string; records?: RouteEvaluationRecord[]; hasMore?: boolean; error?: string }>({ key: "" });
  const [editing, setEditing] = useState<RouteEvaluationRecord | null>(null);
  const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, EvaluationAnswer>>({});
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionDraft, setQuestionDraft] = useState("");
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [newQuestionDraft, setNewQuestionDraft] = useState("");
  const [confirmQuestionId, setConfirmQuestionId] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const loading = resource.key !== key;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/people/evaluaciones-ruta?${query}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudieron consultar los registros.");
      if (!controller.signal.aborted) setResource({ key, records: body.records, hasMore: body.hasMore });
    }).catch(error => { if (!controller.signal.aborted) setResource({ key, error: error instanceof Error ? error.message : "No se pudieron consultar los registros." }); });
    return () => controller.abort();
  }, [key, query]);

  function edit(record: RouteEvaluationRecord) {
    setEditing(record); onEditingChange(true);
    setQuestions(record.answers.map(item => ({ id: item.id, text: item.question })));
    setAnswers(Object.fromEntries(record.answers.map(item => [item.id, item.answer])));
    setEditingQuestionId(null); setQuestionDraft(""); setAddingQuestion(false); setNewQuestionDraft(""); setConfirmQuestionId("");
    setError(""); setMessage("");
  }

  function updateQuestion(id: string) {
    const text = questionDraft.trim();
    if (!text) { setError("La pregunta no puede quedar vacía."); return; }
    setQuestions(current => current.map(question => question.id === id ? { ...question, text } : question));
    if (questions.find(question => question.id === id)?.text !== text) {
      setAnswers(current => { const next = { ...current }; delete next[id]; return next; });
    }
    setEditingQuestionId(null); setQuestionDraft(""); setError("");
  }

  function removeQuestion(id: string) {
    if (questions.length <= 1) { setError("La evaluación debe conservar al menos una pregunta."); return; }
    setQuestions(current => current.filter(question => question.id !== id));
    setAnswers(current => { const next = { ...current }; delete next[id]; return next; });
    setConfirmQuestionId(""); setError("");
  }

  function addQuestion() {
    const text = newQuestionDraft.trim();
    if (!text) { setError("Escribe el texto de la nueva pregunta."); return; }
    if (questions.length >= MAX_ROUTE_EVALUATION_QUESTIONS) { setError("La evaluación admite hasta 50 preguntas."); return; }
    setQuestions(current => [...current, { id: `adicional-${crypto.randomUUID()}`, text }]);
    setAddingQuestion(false); setNewQuestionDraft(""); setError("");
  }

  const changed = Boolean(editing && (questions.length !== editing.answers.length || questions.some((question, index) => question.id !== editing.answers[index]?.id || question.text !== editing.answers[index]?.question || answers[question.id] !== editing.answers[index]?.answer)));
  const incomplete = questions.some(question => !answers[question.id]);
  async function save() {
    if (!editing || saving || !changed || editingQuestionId || addingQuestion || confirmQuestionId) return;
    if (incomplete) { setError("Responde todas las preguntas visibles antes de guardar los cambios."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/people/evaluaciones-ruta", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, questions, answers, previousAnswers: editing.answers }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudieron guardar los cambios.");
      setEditing(null); onEditingChange(false); setMessage("Evaluación actualizada. El Excel y las gráficas reflejarán estos cambios."); setRefresh(value => value + 1);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudieron guardar los cambios."); }
    finally { setSaving(false); }
  }

  async function remove(record: RouteEvaluationRecord) {
    if (deletingId) return;
    setDeletingId(record.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/people/evaluaciones-ruta", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: record.id, previousAnswers: record.answers }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo eliminar la evaluación.");
      setConfirmDeleteId(""); setMessage("Evaluación eliminada. Las gráficas y el Excel reflejarán este cambio."); setRefresh(value => value + 1);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo eliminar la evaluación."); }
    finally { setDeletingId(""); }
  }

  if (editing) return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-200 bg-[#10213b] p-6 text-white"><p className="text-xs font-bold uppercase tracking-widest text-teal-300">Editar evaluación guardada</p><h1 className="mt-2 text-2xl font-bold">{editing.nombre}</h1><p className="mt-2 text-sm text-slate-300">CC {editing.cc} · {editing.cargo} · {editing.contractor}</p><p className="mt-2 text-xs text-slate-400">{dateFormatter.format(new Date(editing.created_at))}</p></div>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <p className="border-b border-slate-100 px-5 py-3 text-sm text-slate-600">Puedes cambiar respuestas, editar preguntas o quitarlas. Pulsa «Guardar cambios» para que queden registradas.</p>
      {questions.map((item, index) => <fieldset key={item.id} disabled={saving} className="grid gap-4 border-b border-slate-100 p-5 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center">
        <legend className="sr-only">Pregunta {index + 1}: {item.text}</legend>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-6"><span className="mr-3 text-xs font-bold text-slate-400">{String(index + 1).padStart(2, "0")}</span>{item.text}</p>
          {editingQuestionId === item.id ? <div className="mt-3"><label htmlFor={`history-edit-${item.id}`} className="text-xs font-semibold">Texto de la pregunta</label><textarea id={`history-edit-${item.id}`} autoFocus maxLength={1000} rows={2} value={questionDraft} onChange={event => setQuestionDraft(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm" /><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => updateQuestion(item.id)} className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white">Actualizar pregunta</button><button type="button" onClick={() => { setEditingQuestionId(null); setQuestionDraft(""); setError(""); }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold">Cancelar</button></div></div> : confirmQuestionId === item.id ? <div className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800"><p>¿Quitar esta pregunta y su respuesta de la evaluación?</p><div className="mt-2 flex gap-2"><button type="button" onClick={() => removeQuestion(item.id)} className="rounded-lg bg-rose-700 px-3 py-2 font-bold text-white">Sí, quitar</button><button type="button" onClick={() => setConfirmQuestionId("")} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold">Cancelar</button></div></div> : <div className="mt-2 flex gap-3"><button type="button" disabled={Boolean(editingQuestionId || confirmQuestionId || addingQuestion)} onClick={() => { setEditingQuestionId(item.id); setQuestionDraft(item.text); setError(""); }} className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 disabled:opacity-50"><Pencil size={13} />Editar pregunta</button><button type="button" disabled={questions.length <= 1 || Boolean(editingQuestionId || confirmQuestionId || addingQuestion)} onClick={() => setConfirmQuestionId(item.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 disabled:opacity-50"><Trash2 size={13} />Eliminar pregunta</button></div>}
        </div>
        <div className="grid grid-cols-3 gap-2">{([{ value: "si", label: "Sí", color: "border-teal-500 bg-teal-50 text-teal-800" }, { value: "no", label: "No", color: "border-rose-500 bg-rose-50 text-rose-800" }, { value: "na", label: "N/A", color: "border-slate-500 bg-slate-100 text-slate-800" }] as const).map(choice => <label key={choice.value} className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-bold focus-within:ring-2 focus-within:ring-violet-400 ${answers[item.id] === choice.value ? choice.color : "border-slate-200 text-slate-500"}`}><input type="radio" name={item.id} checked={answers[item.id] === choice.value} onChange={() => setAnswers(current => ({ ...current, [item.id]: choice.value }))} className="accent-violet-700" />{choice.label}</label>)}</div>
      </fieldset>)}
      <div className="border-b border-slate-100 p-5">{addingQuestion ? <div className="rounded-lg border border-violet-200 bg-violet-50 p-4"><label htmlFor="history-new-question" className="text-sm font-semibold">Nueva pregunta</label><textarea id="history-new-question" autoFocus maxLength={1000} rows={2} value={newQuestionDraft} onChange={event => setNewQuestionDraft(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" /><div className="mt-2 flex gap-2"><button type="button" onClick={addQuestion} className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white">Añadir al formulario</button><button type="button" onClick={() => { setAddingQuestion(false); setNewQuestionDraft(""); setError(""); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold">Cancelar</button></div></div> : <button type="button" disabled={saving || questions.length >= MAX_ROUTE_EVALUATION_QUESTIONS || Boolean(editingQuestionId || confirmQuestionId)} onClick={() => { setAddingQuestion(true); setError(""); }} className="inline-flex items-center gap-2 rounded-lg border border-violet-300 px-4 py-2 text-sm font-bold text-violet-700 disabled:opacity-50"><Plus size={16} />Añadir pregunta</button>}</div>
      {changed && <p role="status" className="bg-violet-50 px-5 py-3 text-sm font-semibold text-violet-800">Cambios pendientes. {incomplete ? "Responde todas las preguntas y después guarda los cambios." : "Pulsa «Guardar cambios» para conservarlos."}</p>}
      {error && <p role="alert" className="bg-red-50 p-5 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-5"><button type="button" disabled={saving} onClick={() => { setEditing(null); onEditingChange(false); setError(""); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold disabled:opacity-50"><X size={16} />Cancelar</button><button type="submit" disabled={saving || !changed || Boolean(editingQuestionId || addingQuestion || confirmQuestionId)} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}{saving ? "Guardando..." : "Guardar cambios"}</button></div>
    </form>
  </section>;

  return <section className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-widest text-violet-600">Historial operativo</p><h1 className="mt-2 text-3xl font-black tracking-tight">Evaluaciones guardadas</h1><p className="mt-2 text-sm text-slate-500">Consulta cada registro y corrige las respuestas que necesites.</p></div><button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Actualizar</button></div>
    <form className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4" onSubmit={event => { event.preventDefault(); setSearch(cc); setOffset(0); setRefresh(value => value + 1); }}><label className="min-w-0 flex-1 text-xs font-bold text-slate-500">Buscar por cédula<input type="text" inputMode="numeric" pattern="[0-9]{5,15}" maxLength={15} value={cc} onChange={event => setCc(event.target.value.replace(/\D/g, ""))} placeholder="Todas las personas" className="mt-2 block w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium outline-none focus:border-violet-500" /></label><button type="submit" className="mt-auto inline-flex items-center gap-2 rounded-xl bg-[#10213b] px-5 py-3 text-sm font-bold text-white"><Search size={16} />Buscar</button>{search && <button type="button" className="mt-auto px-3 py-3 text-sm font-bold text-violet-700" onClick={() => { setCc(""); setSearch(""); setOffset(0); }}>Ver todos</button>}</form>
    {message && <p role="status" className="flex items-center gap-2 rounded-xl bg-teal-50 p-4 text-sm font-semibold text-teal-800"><CheckCircle2 size={18} />{message}</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {loading ? <p role="status" className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Cargando evaluaciones...</p> : resource.error ? <p role="alert" className="rounded-xl bg-red-50 p-5 text-sm text-red-700">{resource.error}</p> : <>
      {!resource.records?.length && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No hay evaluaciones para esta búsqueda.</p>}
      <div className="space-y-3">{resource.records?.map(record => <article key={record.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5"><div className="min-w-0 flex-1"><p className="text-xs text-slate-400">{dateFormatter.format(new Date(record.created_at))}</p><h2 className="mt-1 font-bold">{record.nombre}</h2><p className="mt-1 text-sm text-slate-500">CC {record.cc} · {record.cargo} · {record.contractor}</p><div className="mt-3 flex gap-3 text-xs font-bold"><span className="text-teal-700">Sí: {record.answers.filter(item => item.answer === "si").length}</span><span className="text-rose-600">No: {record.answers.filter(item => item.answer === "no").length}</span><span className="text-slate-400">N/A: {record.answers.filter(item => item.answer === "na").length}</span></div></div><div className="flex flex-wrap gap-2"><button type="button" disabled={Boolean(deletingId)} onClick={() => edit(record)} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50"><Pencil size={16} />Actualizar</button>{confirmDeleteId === record.id ? <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2"><span className="text-xs font-semibold text-rose-800">¿Eliminar esta evaluación?</span><button type="button" disabled={Boolean(deletingId)} onClick={() => void remove(record)} className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{deletingId === record.id ? "Eliminando..." : "Sí, eliminar"}</button><button type="button" disabled={Boolean(deletingId)} onClick={() => setConfirmDeleteId("")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">Cancelar</button></div> : <button type="button" disabled={Boolean(deletingId)} onClick={() => { setConfirmDeleteId(record.id); setError(""); }} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"><Trash2 size={16} />Eliminar</button>}</div></article>)}</div>
      <div className="flex items-center justify-between gap-3 pt-2"><button type="button" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 25))} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-30"><ChevronLeft size={16} />Anterior</button><span className="text-xs text-slate-500">Página {offset / 25 + 1}</span><button type="button" disabled={!resource.hasMore} onClick={() => setOffset(value => value + 25)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-30">Siguiente<ChevronRight size={16} /></button></div>
    </>}
  </section>;
}
