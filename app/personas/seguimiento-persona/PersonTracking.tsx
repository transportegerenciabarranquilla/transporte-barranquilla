"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, Search, UserRound, ClipboardCheck, Truck, LoaderCircle, ChevronDown, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type Person = Record<string, unknown> & { CC?: string | number; NOMBRE?: string; CARGO?: string; CONTRATISTA?: string };
type RouteRecord = Record<string, unknown>;
type Evaluation = { id: string; created_at: string; cc: string; nombre: string; cargo: string; contractor: string; survey_role: string; questionnaire_version: number; answers: Array<{ id: string; question: string; answer: string }> };
type Result = { people: Person[]; seguimiento: RouteRecord[]; evaluaciones: Evaluation[] };
const date = (value: unknown) => { const d = new Date(String(value || "")); return Number.isNaN(d.getTime()) ? String(value || "Sin fecha") : new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }).format(d); };
const dateOnly = (value: unknown) => { const d = new Date(String(value || "")); return Number.isNaN(d.getTime()) ? String(value || "Sin fecha") : new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "America/Bogota" }).format(d); };
const label = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
const displayValue = (v: unknown) => v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);
const answerLabel = (v: string) => ({ si: "Sí", no: "No", na: "N/A" }[v] || v);
const hiddenPersonFields = new Set(["CC", "NOMBRE", "CARGO", "CONTRATISTA"]);
const PAGE_SIZE = 10;

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return <nav aria-label="Paginación de registros" className="flex items-center justify-center gap-3 border-t border-slate-100 px-4 py-3">
    <button type="button" aria-label="Página anterior" disabled={page <= 0} onClick={() => onChange(page - 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={18}/></button>
    <span className="min-w-24 text-center text-xs font-medium text-slate-500">{page + 1} / {pages} <span className="text-slate-400">· {total} registros</span></span>
    <button type="button" aria-label="Página siguiente" disabled={page >= pages - 1} onClick={() => onChange(page + 1)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={18}/></button>
  </nav>;
}

export default function PersonTracking() {
  const [cc, setCc] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [routePage, setRoutePage] = useState(0);
  const [evaluationPage, setEvaluationPage] = useState(0);

  async function search(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/people/seguimiento-persona?" + new URLSearchParams({ cc }), { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se encontró la persona.");
      setResult(body);
      setRoutePage(0); setEvaluationPage(0);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo consultar."); }
    finally { setLoading(false); }
  }

  const person = result?.people[0];
  const name = String(person?.NOMBRE || "Persona encontrada");
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const evaluationRows = result?.evaluaciones.flatMap(evaluation => evaluation.answers.map((answer, answerIndex) => ({ evaluation, answer, answerIndex }))) || [];

  return <main className="min-h-screen bg-[#f2f5fb] pb-12 text-[#142344]">
    <header className="border-b border-white/70 bg-white/80"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-blue-700"><ArrowLeft size={17}/>Volver a People</Link>
      <span className="inline-flex items-center gap-2 text-sm font-bold text-[#20355d]"><UserRound size={18} className="text-blue-600"/>Seguimiento de persona</span>
    </div></header>
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6 lg:px-8">
      <section className="rounded-[26px] border border-white bg-white/90 p-6 shadow-[0_12px_36px_rgba(31,50,88,0.09)] sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-[#1d2e50] sm:text-[30px]">Historial completo por cédula</h1>
        <p className="mt-2 text-sm text-slate-500 sm:text-base">Consulta la información del personal, su participación en rutas y todas sus evaluaciones en ruta.</p>
        <form onSubmit={search} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="person-cc">Cédula</label>
          <input id="person-cc" required pattern="[0-9]{5,15}" maxLength={15} inputMode="numeric" autoComplete="off" value={cc} onChange={e => setCc(e.target.value.replace(/\D/g, ""))} placeholder="Escribe el número de cédula" className="h-14 min-w-0 flex-1 rounded-xl border border-[#dce2ef] bg-white px-5 text-base text-[#142344] outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"/>
          <button disabled={loading || !/^\d{5,15}$/.test(cc)} className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-[#3264f5] px-7 font-semibold text-white shadow-[0_7px_18px_rgba(50,100,245,0.2)] transition hover:bg-blue-700 disabled:opacity-50">{loading ? <LoaderCircle className="animate-spin" size={19}/> : <Search size={19}/>}Buscar</button>
        </form>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      </section>

      {result && <div className="grid items-start gap-6 lg:grid-cols-[minmax(350px,0.95fr)_minmax(0,1.25fr)]">
        <div className="space-y-6">
          <section className="rounded-[26px] border border-white bg-white p-6 shadow-[0_12px_36px_rgba(31,50,88,0.09)] sm:p-8">
            <div className="flex items-start gap-5">
              <div className="grid h-[88px] w-[88px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 text-2xl font-bold text-blue-700 ring-4 ring-blue-50">{initials || <UserRound size={34}/>}</div>
              <div className="min-w-0 flex-1 space-y-3 pt-1">
                <div><p className="text-xs font-medium text-slate-500">Cédula</p><p className="text-xl font-bold text-[#142344]">{displayValue(person?.CC || cc)}</p></div>
                <div><p className="text-xs font-medium text-slate-500">Nombre</p><p className="break-words font-semibold text-[#142344]">{name}</p></div>
                <div><p className="text-xs font-medium text-slate-500">Cargo</p><p className="font-medium">{displayValue(person?.CARGO)}</p></div>
                <div><p className="text-xs font-medium text-slate-500">Contratista</p><p className="font-medium">{displayValue(person?.CONTRATISTA)}</p></div>
              </div>
            </div>
            {person && Object.entries(person).filter(([key]) => !hiddenPersonFields.has(key)).length > 0 && <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Más información</p>
              <div className="grid gap-x-4 sm:grid-cols-2">{Object.entries(person).filter(([key]) => !hiddenPersonFields.has(key)).map(([key, val]) => <div key={key} className="border-b border-slate-100 py-2.5"><span className="block text-xs text-slate-500">{label(key)}</span><span className="break-all text-sm font-semibold">{displayValue(val)}</span></div>)}</div>
            </div>}
          </section>

          <section className="overflow-hidden rounded-[26px] border border-white bg-white shadow-[0_12px_36px_rgba(31,50,88,0.09)]">
            <div className="flex items-center justify-between border-b border-[#e6eaf2] px-6 py-5 sm:px-7"><h2 className="flex items-center gap-2 text-lg font-semibold"><Truck size={20} className="text-blue-600"/>Seguimiento en ruta</h2><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{result.seguimiento.length}</span></div>
            {!result.seguimiento.length ? <p className="px-6 py-7 text-sm text-slate-500">No hay rutas asociadas a esta cédula.</p> : <><div className="divide-y divide-slate-100">{result.seguimiento.slice(routePage * PAGE_SIZE, (routePage + 1) * PAGE_SIZE).map((route, i) => <details key={String(route.recordId || routePage * PAGE_SIZE + i)} className="group px-6 py-4 sm:px-7"><summary className="flex cursor-pointer list-none items-center gap-3 text-sm"><span className="h-8 w-1 shrink-0 rounded-full bg-blue-500"/><span className="min-w-0 flex-1"><strong>{dateOnly(route.fechaDespacho || route.fechaDt)}</strong><span className="text-slate-500"> · DT {displayValue(route.transporte)} · VH {displayValue(route.vehiculo)}</span></span><ChevronDown size={17} className="shrink-0 text-slate-400 transition group-open:rotate-180"/></summary><div className="ml-4 mt-4 grid gap-x-4 rounded-xl bg-[#f7f9fc] p-4 sm:grid-cols-2">{Object.entries(route).filter(([key]) => !["recordId", "updatedAt"].includes(key)).map(([key, val]) => <div key={key} className="border-b border-slate-200/70 py-2"><span className="block text-[11px] text-slate-500">{label(key)}</span><span className="break-all text-sm font-medium">{displayValue(val)}</span></div>)}</div></details>)}</div><Pagination page={routePage} total={result.seguimiento.length} onChange={setRoutePage}/></>}
          </section>
        </div>

        <section className="overflow-hidden rounded-[26px] border border-white bg-white shadow-[0_12px_36px_rgba(31,50,88,0.09)]">
          <div className="flex items-center justify-between border-b border-[#e6eaf2] px-6 py-5 sm:px-7"><h2 className="flex items-center gap-2 text-lg font-semibold"><ClipboardCheck size={20} className="text-blue-600"/>Evaluaciones en ruta</h2><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{evaluationRows.length}</span></div>
          {!evaluationRows.length ? <p className="px-6 py-7 text-sm text-slate-500">No hay evaluaciones en ruta para esta cédula.</p> : <><div className="divide-y divide-slate-100">{evaluationRows.slice(evaluationPage * PAGE_SIZE, (evaluationPage + 1) * PAGE_SIZE).map(({ evaluation, answer, answerIndex }, index) => <article key={`${evaluation.id}-${answer.id}-${answerIndex}`} className="px-5 py-3.5 sm:px-7">
            {(answerIndex === 0 || index === 0 || evaluationRows[evaluationPage * PAGE_SIZE + index - 1]?.evaluation.id !== evaluation.id) && <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500"><CalendarDays size={14} className="text-blue-600"/><span>{date(evaluation.created_at)} · {evaluation.contractor} · {evaluation.cargo} · {evaluation.survey_role}</span></div>}
            <div className="flex items-start justify-between gap-4 rounded-xl bg-[#f5f7fb] px-4 py-3"><span className="text-sm leading-5 text-[#263653]">{answer.question}</span><strong className={`shrink-0 text-sm ${answer.answer === "no" ? "text-red-600" : answer.answer === "na" ? "text-slate-500" : "text-emerald-600"}`}>{answerLabel(answer.answer)}</strong></div>
          </article>)}</div><Pagination page={evaluationPage} total={evaluationRows.length} onChange={setEvaluationPage}/></>}
        </section>
      </div>}
    </div>
  </main>;
}
