"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, BadgeCheck, BellRing, Coffee, LoaderCircle, Search, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";

type Result = { person: { document: string; name: string; role: string; contractor: string }; allowedAt: string; allowed: boolean };

export default function EffectiveRestAccessPage() {
  const router = useRouter();
  const timer = useRef<number | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const [document, setDocument] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [alertVisible, setAlertVisible] = useState(false);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    void audio.current?.close();
  }, []);

  async function search(event: FormEvent) {
    event.preventDefault();
    const id = document.replace(/\D/g, "");
    if (!id) { setError("Ingresa un número de cédula válido."); return; }
    setLoading(true); setError(""); setResult(null); setAlertVisible(false);
    try {
      const response = await fetch(`/api/people/effective-rest?document=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo consultar el descanso efectivo.");
      setResult(body as Result);
      if (!body.allowed) startAlarm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo realizar la consulta.");
    } finally { setLoading(false); }
  }

  function startAlarm() {
    setAlertVisible(true);
    if (timer.current) window.clearTimeout(timer.current);
    const AudioClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioClass) {
      const context = new AudioClass(); audio.current = context;
      const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.type = "square"; oscillator.frequency.value = 760; gain.gain.setValueAtTime(0.0001, context.currentTime);
      for (let offset = 0; offset < 5; offset += 0.5) { gain.gain.setValueAtTime(0.16, context.currentTime + offset); gain.gain.setValueAtTime(0.0001, context.currentTime + offset + 0.28); }
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 5);
      oscillator.onended = () => { void context.close(); if (audio.current === context) audio.current = null; };
    }
    timer.current = window.setTimeout(() => setAlertVisible(false), 5000);
  }

  const allowedAt = result ? formatBogota(result.allowedAt) : "";
  return <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,.18),transparent_30rem),linear-gradient(145deg,#f8fafc,#ecfdf5)] text-slate-900">
    <header className="border-b border-white/70 bg-white/85 backdrop-blur-xl"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4"><button aria-label="Volver" className="grid h-11 w-11 place-items-center rounded-xl hover:bg-slate-100" onClick={() => router.push("/")} type="button"><ArrowLeft size={21} /></button><div className="text-right"><p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-600">People Transporte</p><h1 className="text-xl font-black">Control de descanso efectivo</h1></div></div></header>
    <section className="mx-auto grid max-w-5xl gap-6 px-5 py-10 lg:grid-cols-2">
      <Intro />
      <div className="rounded-3xl border border-white bg-white/95 p-7 shadow-xl"><form onSubmit={search}><label className="text-xs font-black uppercase text-slate-500" htmlFor="document">Número de cédula</label><div className="mt-2 flex gap-2"><div className="relative flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} /><input autoComplete="off" autoFocus className="h-14 w-full rounded-2xl border border-slate-300 pl-12 pr-4 text-lg font-bold outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100" id="document" inputMode="numeric" onChange={(event) => setDocument(event.target.value.replace(/\D/g, ""))} placeholder="Número de cédula" value={document} /></div><button aria-label="Consultar" className="grid h-14 min-w-14 place-items-center rounded-2xl bg-emerald-600 px-5 font-black text-white disabled:opacity-60" disabled={loading} type="submit">{loading ? <LoaderCircle className="animate-spin" /> : "Consultar"}</button></div></form>
        {error ? <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">{error}</p> : null}
        {result ? <ResultCard allowedAt={allowedAt} result={result} /> : null}
      </div>
    </section>
    {alertVisible && result && !result.allowed ? <Alarm allowedAt={allowedAt} /> : null}
  </main>;
}

function Intro() {
  return <div className="rounded-3xl bg-[#0b2235] p-7 text-white shadow-2xl"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-400 text-slate-950"><Coffee size={28} /></span><p className="mt-8 text-xs font-black uppercase tracking-[.18em] text-emerald-300">Consulta de ingreso</p><h2 className="mt-2 text-3xl font-black">Valida si la persona ya cumplió su descanso.</h2><p className="mt-4 text-sm leading-6 text-slate-300">Usa el archivo de Ausentismo y descanso. El ingreso se habilita al completar 10 horas y 10 minutos desde la salida.</p></div>;
}

function ResultCard({ allowedAt, result }: { allowedAt: string; result: Result }) {
  const allowed = result.allowed;
  return <article className={`mt-6 overflow-hidden rounded-3xl border ${allowed ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}><div className="flex gap-4 p-5">{allowed ? <BadgeCheck className="text-emerald-600" size={38} /> : <ShieldAlert className="text-red-600" size={38} />}<div><p className={`text-xs font-black uppercase ${allowed ? "text-emerald-700" : "text-red-700"}`}>{allowed ? "Ingreso autorizado" : "Ingreso no autorizado"}</p><h3 className="mt-1 text-xl font-black">{result.person.name || `CC ${result.person.document}`}</h3><p className="text-xs font-semibold text-slate-500">{[result.person.role, result.person.contractor].filter(Boolean).join(" · ")}</p></div></div><div className="border-t border-current/10 bg-white/55 p-5"><p className="text-xs font-black uppercase text-slate-500">Hora habilitada de ingreso</p><p className={`mt-1 text-3xl font-black ${allowed ? "text-emerald-700" : "text-red-700"}`}>{allowedAt}</p><p className="mt-2 text-sm font-semibold">{allowed ? "Ya cumplió el descanso efectivo. Puede ingresar." : `Aún no puedes ingresar. Tu hora de ingreso es ${allowedAt}.`}</p></div></article>;
}

function Alarm({ allowedAt }: { allowedAt: string }) {
  return <div aria-live="assertive" className="fixed inset-x-4 bottom-5 z-50 mx-auto flex max-w-xl items-center gap-4 rounded-2xl bg-red-600 p-5 text-white shadow-2xl" role="alert"><BellRing className="animate-pulse shrink-0" size={30} /><div><p className="font-black uppercase">Aún no puedes ingresar</p><p className="text-sm font-semibold">Tu hora de ingreso es {allowedAt}. Esta alerta durará 5 segundos.</p></div></div>;
}

function formatBogota(value: string) {
  return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "short", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value));
}
