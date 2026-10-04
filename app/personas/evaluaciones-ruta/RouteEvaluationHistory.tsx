"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle, Pencil, RefreshCw, Save, Search, X } from "lucide-react";
import type { EvaluationAnswer } from "../../lib/peopleRouteEvaluation";
import type { RouteEvaluationRecord } from "../../lib/peopleRouteAnalytics";

const dateFormatter = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });
export default function RouteEvaluationHistory({ onEditingChange }: { onEditingChange: (editing: boolean) => void }) {
  const [cc, setCc] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const query = new URLSearchParams({ view: "history", cc: search, offset: String(offset) }).toString();
  const key = `${query}:${refresh}`;
  const [resource, setResource] = useState<{ key: string; records?: RouteEvaluationRecord[]; hasMore?: boolean; error?: string }>({ key: "" });
  const [editing, setEditing] = useState<RouteEvaluationRecord | null>(null);
  const [answers, setAnswers] = useState<Record<string, EvaluationAnswer>>({});
  const [saving, setSaving] = useState(false);
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
    setEditing(record); onEditingChange(true); setAnswers(Object.fromEntries(record.answers.map(item => [item.id, item.answer]))); setError(""); setMessage("");
  }
  const changed = Boolean(editing?.answers.some(item => answers[item.id] !== item.answer));
  async function save() {
    if (!editing || saving || !changed) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/people/evaluaciones-ruta", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, answers, previousAnswers: editing.answers }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudieron guardar los cambios.");
      setEditing(null); onEditingChange(false); setMessage("Respuestas actualizadas. El Excel y las gráficas reflejarán estos cambios."); setRefresh(value => value + 1);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudieron guardar los cambios."); }
    finally { setSaving(false); }
  }

  if (editing) return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-200 bg-[#10213b] p-6 text-white"><p className="text-xs font-bold uppercase tracking-widest text-teal-300">Editar evaluación guardada</p><h1 className="mt-2 text-2xl font-bold">{editing.nombre}</h1><p className="mt-2 text-sm text-slate-300">CC {editing.cc} · {editing.cargo} · {editing.contractor}</p><p className="mt-2 text-xs text-slate-400">{dateFormatter.format(new Date(editing.created_at))}</p></div>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      {editing.answers.map((item, index) => <fieldset key={item.id} disabled={saving} className="grid gap-4 border-b border-slate-100 p-5 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center"><legend className="sr-only">Pregunta {index + 1}: {item.question}</legend><p className="text-sm font-medium leading-6"><span className="mr-3 text-xs font-bold text-slate-400">{String(index + 1).padStart(2, "0")}</span>{item.question}</p><div className="grid grid-cols-3 gap-2">{([{ value: "si", label: "Sí", color: "border-teal-500 bg-teal-50 text-teal-800" }, { value: "no", label: "No", color: "border-rose-500 bg-rose-50 text-rose-800" }, { value: "na", label: "N/A", color: "border-slate-500 bg-slate-100 text-slate-800" }] as const).map(choice => <label key={choice.value} className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-bold focus-within:ring-2 focus-within:ring-violet-400 ${answers[item.id] === choice.value ? choice.color : "border-slate-200 text-slate-500"}`}><input type="radio" required name={item.id} checked={answers[item.id] === choice.value} onChange={() => setAnswers(current => ({ ...current, [item.id]: choice.value }))} className="accent-violet-700" />{choice.label}</label>)}</div></fieldset>)}
      {error && <p role="alert" className="bg-red-50 p-5 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-5"><button type="button" disabled={saving} onClick={() => { setEditing(null); onEditingChange(false); setError(""); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold disabled:opacity-50"><X size={16} />Cancelar</button><button type="submit" disabled={saving || !changed} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}{saving ? "Guardando..." : "Guardar cambios"}</button></div>
    </form>
  </section>;

  return <section className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-widest text-violet-600">Historial operativo</p><h1 className="mt-2 text-3xl font-black tracking-tight">Evaluaciones guardadas</h1><p className="mt-2 text-sm text-slate-500">Consulta cada registro y corrige las respuestas que necesites.</p></div><button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Actualizar</button></div>
    <form className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4" onSubmit={event => { event.preventDefault(); setSearch(cc); setOffset(0); setRefresh(value => value + 1); }}><label className="min-w-0 flex-1 text-xs font-bold text-slate-500">Buscar por cédula<input type="text" inputMode="numeric" pattern="[0-9]{5,15}" maxLength={15} value={cc} onChange={event => setCc(event.target.value.replace(/\D/g, ""))} placeholder="Todas las personas" className="mt-2 block w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-medium outline-none focus:border-violet-500" /></label><button type="submit" className="mt-auto inline-flex items-center gap-2 rounded-xl bg-[#10213b] px-5 py-3 text-sm font-bold text-white"><Search size={16} />Buscar</button>{search && <button type="button" className="mt-auto px-3 py-3 text-sm font-bold text-violet-700" onClick={() => { setCc(""); setSearch(""); setOffset(0); }}>Ver todos</button>}</form>
    {message && <p role="status" className="flex items-center gap-2 rounded-xl bg-teal-50 p-4 text-sm font-semibold text-teal-800"><CheckCircle2 size={18} />{message}</p>}
    {loading ? <p role="status" className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500">Cargando evaluaciones...</p> : resource.error ? <p role="alert" className="rounded-xl bg-red-50 p-5 text-sm text-red-700">{resource.error}</p> : <>
      {!resource.records?.length && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No hay evaluaciones para esta búsqueda.</p>}
      <div className="space-y-3">{resource.records?.map(record => <article key={record.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5"><div className="min-w-0 flex-1"><p className="text-xs text-slate-400">{dateFormatter.format(new Date(record.created_at))}</p><h2 className="mt-1 font-bold">{record.nombre}</h2><p className="mt-1 text-sm text-slate-500">CC {record.cc} · {record.cargo} · {record.contractor}</p><div className="mt-3 flex gap-3 text-xs font-bold"><span className="text-teal-700">Sí: {record.answers.filter(item => item.answer === "si").length}</span><span className="text-rose-600">No: {record.answers.filter(item => item.answer === "no").length}</span><span className="text-slate-400">N/A: {record.answers.filter(item => item.answer === "na").length}</span></div></div><button type="button" onClick={() => edit(record)} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 hover:bg-violet-100"><Pencil size={16} />Editar respuestas</button></article>)}</div>
      <div className="flex items-center justify-between gap-3 pt-2"><button type="button" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - 25))} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-30"><ChevronLeft size={16} />Anterior</button><span className="text-xs text-slate-500">Página {offset / 25 + 1}</span><button type="button" disabled={!resource.hasMore} onClick={() => setOffset(value => value + 25)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-30">Siguiente<ChevronRight size={16} /></button></div>
    </>}
  </section>;
}
