"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, Mic, MicOff, Send } from "lucide-react";
import { SkinetVoice, type SkinetRecognition, type SkinetStatus } from "../lib/skinetVoice";
import { startSkinetReports } from "../lib/skinetReports";

const statusLabels: Record<SkinetStatus, string> = {
  off: "Micrófono apagado", wake: "Di «hola Skainet»", question: "Te escucho, haz tu pregunta",
  thinking: "Consultando la operación…", speaking: "Skainet está respondiendo",
};
type RecognitionWindow = Window & { SpeechRecognition?: new () => SkinetRecognition; webkitSpeechRecognition?: new () => SkinetRecognition };
type PolicyDocument = Document & { permissionsPolicy?: { allowsFeature: (name: string) => boolean }; featurePolicy?: { allowsFeature: (name: string) => boolean } };

export function SkinetAssistant({ onAsk, onReport, onListeningChange }: {
  onAsk: (question: string) => Promise<string>;
  onReport?: () => Promise<string>;
  onListeningChange: (enabled: boolean) => void;
}) {
  const [status, setStatus] = useState<SkinetStatus>("off");
  const [listening, setListening] = useState(false);
  const [input, setInput] = useState("");
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [reportsEnabled, setReportsEnabled] = useState(true);
  const [lastReportAt, setLastReportAt] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState("");
  const selectedVoice = useRef("");
  const statusRef = useRef<SkinetStatus>("off");
  const controller = useRef<SkinetVoice | null>(null);
  const activeUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const requestVersion = useRef(0);
  const automaticListening = useRef(true);
  const callbacks = useRef({ onAsk, onReport, onListeningChange });
  useEffect(() => { callbacks.current = { onAsk, onReport, onListeningChange }; }, [onAsk, onReport, onListeningChange]);
  const updateStatus = useCallback((value: SkinetStatus) => { statusRef.current = value; setStatus(value); }, []);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices().filter(voice => /^es\b/i.test(voice.lang)));
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);
  const speak = useCallback((text: string, done: () => void) => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) { done(); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    activeUtterance.current = utterance;
    utterance.lang = "es-CO";
    const emphatic = /^¡Yo soy Skainet!/.test(text);
    utterance.volume = 1;
    utterance.rate = emphatic ? 0.85 : 0.95;
    utterance.pitch = emphatic ? 1 : 1.1;
    const available = window.speechSynthesis.getVoices();
    utterance.voice = available.find(voice => voice.voiceURI === selectedVoice.current)
      || available.find(voice => /^es[-_]CO$/i.test(voice.lang))
      || available.find(voice => /^es\b/i.test(voice.lang) && !voice.localService)
      || available.find(voice => /^es\b/i.test(voice.lang)) || null;
    utterance.onend = () => { activeUtterance.current = null; done(); };
    utterance.onerror = event => {
      if (event.error === "canceled" || event.error === "interrupted") return;
      activeUtterance.current = null;
      setError("No pude reproducir la voz. La respuesta está en pantalla.");
      done();
    };
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  }, []);

  const startListening = useCallback(() => {
    if (document.visibilityState === "hidden") return;
    setError("");
    const browser = window as RecognitionWindow;
    const Recognition = browser.SpeechRecognition || browser.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Este navegador no admite reconocimiento de voz. Puedes escribir tu pregunta.");
      return;
    }
    if (!window.isSecureContext) {
      setError("El micrófono necesita HTTPS o localhost. Puedes escribir tu pregunta.");
      return;
    }
    const page = document as PolicyDocument;
    const policy = page.permissionsPolicy || page.featurePolicy;
    if (policy && !policy.allowsFeature("microphone")) {
      setError("Esta pantalla se cargó con el micrófono bloqueado. Recarga el admin para aplicar el permiso de Skainet.");
      return;
    }
    controller.current?.stop();
    controller.current = new SkinetVoice(new Recognition(), {
      answer: text => callbacks.current.onAsk(text), question: setQuestion, reply: setReply,
      status: updateStatus,
      error: message => { automaticListening.current = false; setError(message); setListening(false); callbacks.current.onListeningChange(false); },
      cancelSpeech: () => { window.speechSynthesis?.cancel(); activeUtterance.current = null; },
      speak,
    });
    setListening(true);
    callbacks.current.onListeningChange(true);
    controller.current.start();
  }, [speak, updateStatus]);

  useEffect(() => {
    const requests = requestVersion;
    const auto = automaticListening;
    const stop = () => {
      requests.current++;
      controller.current?.stop();
      window.speechSynthesis?.cancel();
      updateStatus("off");
      setListening(false);
      callbacks.current.onListeningChange(false);
    };
    const sessionEnded = () => { auto.current = false; stop(); };
    const visibility = () => {
      if (document.visibilityState === "hidden") stop();
      else if (auto.current) startListening();
    };
    const timer = window.setTimeout(() => { if (auto.current) startListening(); }, 0);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("bavaria-session-invalid", sessionEnded);
    window.addEventListener("bavaria-session-reset", sessionEnded);
    return () => {
      window.clearTimeout(timer);
      requests.current++;
      controller.current?.stop();
      window.speechSynthesis?.cancel();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("bavaria-session-invalid", sessionEnded);
      window.removeEventListener("bavaria-session-reset", sessionEnded);
    };
  }, [startListening, updateStatus]);

  useEffect(() => {
    if (!reportsEnabled || !callbacks.current.onReport) return;
    const reports = startSkinetReports({
      now: Date.now,
      visible: () => document.visibilityState !== "hidden" && navigator.onLine !== false,
      busy: () => ["thinking", "speaking", "question"].includes(statusRef.current),
      load: () => callbacks.current.onReport!(),
      deliver: report => {
        if (controller.current) {
          if (!controller.current.announce(report)) return false;
        } else {
          updateStatus("speaking");
          setReply(report);
          speak(report, () => updateStatus("off"));
        }
        setQuestion("");
        setLastReportAt(new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }).format(new Date()));
        return true;
      },
      error: () => setError("No pude consultar el informe de operación. Reintentaré en un minuto."),
      setTimer: (task, delay) => window.setTimeout(task, delay), clearTimer: timer => window.clearTimeout(timer),
    });
    const check = () => reports.check();
    const stop = () => reports.stop();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    window.addEventListener("bavaria-session-invalid", stop);
    window.addEventListener("bavaria-session-reset", stop);
    return () => {
      reports.stop();
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
      window.removeEventListener("bavaria-session-invalid", stop);
      window.removeEventListener("bavaria-session-reset", stop);
    };
  }, [reportsEnabled, speak, updateStatus]);

  function toggle() {
    if (listening) {
      automaticListening.current = false;
      controller.current?.stop();
      setListening(false);
      callbacks.current.onListeningChange(false);
    } else {
      automaticListening.current = true;
      startListening();
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || status === "thinking") return;
    setInput("");
    setError("");
    if (controller.current && listening) { await controller.current.ask(text); return; }
    const version = ++requestVersion.current;
    setQuestion(text);
    updateStatus("thinking");
    try {
      const answer = await callbacks.current.onAsk(text);
      if (version === requestVersion.current) setReply(answer);
    } catch { if (version === requestVersion.current) setError("No pude consultar los datos. Intenta nuevamente."); }
    finally { if (version === requestVersion.current) updateStatus("off"); }
  }

  return <section aria-label="Asistente Skainet" className="mb-5 rounded-xl border border-cyan-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-50 text-cyan-800"><Bot aria-hidden="true" /></span>
        <div><h2 className="font-semibold text-[#10223d]">Skainet</h2><p className="text-sm text-slate-500">Tu asistente de operación · Solo administrador</p></div>
      </div>
      <button type="button" aria-pressed={listening} onClick={toggle} className="inline-flex items-center gap-2 rounded-md bg-[#10223d] px-4 py-2 text-sm font-semibold text-white">
        {listening ? <MicOff size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}{listening ? "Pausar escucha" : "Reanudar escucha"}
      </button>
    </div>
    <p role="status" className="mt-3 text-sm font-medium text-cyan-800">{statusLabels[status]}</p>
    <p className="mt-1 text-sm text-slate-500">Skainet escucha automáticamente al entrar. Di «Skainet» o pregunta directamente «¿cuántas cajas le han modulado a HL?». Si el navegador pide permiso para el micrófono, pulsa Permitir. También puedes escribir.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
      <label className="flex items-center gap-2">Voz
        <select value={voiceUri} onChange={event => { selectedVoice.current = event.target.value; setVoiceUri(event.target.value); }} className="max-w-64 rounded-md border border-slate-200 bg-white px-2 py-1">
          <option value="">Automática</option>
          {voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
        </select>
      </label>
      <button type="button" disabled={status === "question" || status === "thinking" || status === "speaking"} onClick={() => {
        const sample = "Soy Skainet. Estoy disponible para consultar la operación.";
        if (controller.current) controller.current.announce(sample);
        else { updateStatus("speaking"); speak(sample, () => updateStatus("off")); }
      }} className="rounded-md border border-cyan-200 px-3 py-1 text-cyan-800 disabled:opacity-50">Probar voz</button>
      <span className="text-xs">Volumen al máximo · Si se oye bajo, sube el volumen del equipo o del navegador.</span>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
      <label className="flex items-center gap-2"><input type="checkbox" checked={reportsEnabled} onChange={event => setReportsEnabled(event.target.checked)} className="accent-cyan-700" />Resumen hablado cada 20 minutos</label>
      <span className="text-xs text-slate-500">{lastReportAt ? `Último informe: ${lastReportAt}` : "Mientras tengas el admin abierto; al volver, lee el informe pendiente."}</span>
    </div>
    {question && <p className="mt-3 text-sm text-slate-600"><b>Tú:</b> {question}</p>}
    {reply && <p aria-live="polite" className="mt-2 whitespace-pre-line rounded-lg bg-cyan-50 p-3 text-sm leading-6 text-slate-800"><b>Skainet:</b> {reply}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    <form onSubmit={submit} className="mt-3 flex gap-2">
      <input aria-label="Pregunta para Skainet" maxLength={500} value={input} onChange={event => setInput(event.target.value)} placeholder="¿Cómo va la entrega en rango de Logísticos Galapa?" className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800" />
      <button type="submit" aria-label="Enviar pregunta" disabled={!input.trim() || status === "thinking"} className="rounded-md bg-cyan-700 px-3 py-2 text-white disabled:opacity-50"><Send size={18} /></button>
    </form>
  </section>;
}
