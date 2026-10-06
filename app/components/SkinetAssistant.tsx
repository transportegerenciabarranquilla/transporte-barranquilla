"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Mic, MicOff, Send } from "lucide-react";
import { SkinetVoice, type SkinetRecognition, type SkinetStatus } from "../lib/skinetVoice";
import { startSkinetReports } from "../lib/skinetReports";
import { openSkinetMicrophone } from "../lib/skinetMicrophone";

const statusLabels: Record<SkinetStatus, string> = {
  off: "Micrófono apagado", wake: "Di «hola Zora»", question: "Te escucho, haz tu pregunta",
  thinking: "Consultando la operación…", speaking: "Zora está respondiendo",
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
  const [heard, setHeard] = useState("");
  const [microphoneName, setMicrophoneName] = useState("");
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [microphoneId, setMicrophoneId] = useState("");
  const selectedMicrophone = useRef("");
  const microphoneCleanup = useRef<(() => void) | undefined>(undefined);
  const microphoneVersion = useRef(0);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [reportsEnabled, setReportsEnabled] = useState(true);
  const [open, setOpen] = useState(false);
  const [lastReportAt, setLastReportAt] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceUri, setVoiceUri] = useState("");
  const selectedVoice = useRef("");
  const statusRef = useRef<SkinetStatus>("off");
  const controller = useRef<SkinetVoice | null>(null);
  const activeUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const speechStartTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const replyAudio = useRef<HTMLAudioElement | null>(null);
  const playbackVersion = useRef(0);
  const requestVersion = useRef(0);
  const automaticListening = useRef(false);
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
    const version = ++playbackVersion.current;
    const playMp3 = () => {
      if (version !== playbackVersion.current) return;
      clearTimeout(speechStartTimer.current);
      activeUtterance.current = null;
      const player = replyAudio.current;
      if (!player) { setError("No pude iniciar el audio. La respuesta está en pantalla."); done(); return; }
      const parts = text.match(/[\s\S]{1,650}(?:\s|$)|[\s\S]{1,650}/g) || [text];
      let index = 0;
      const playPart = () => {
        if (version !== playbackVersion.current) return;
        if (index >= parts.length) { done(); return; }
        player.src = `/api/admin/skinet-audio?${new URLSearchParams({ text: parts[index++] })}`;
        player.volume = 1;
        const fail = () => {
          if (version !== playbackVersion.current) return;
          playbackVersion.current++;
          setError("No pude reproducir el audio. Pulsa Probar voz y vuelve a preguntar.");
          done();
        };
        player.onended = playPart;
        player.onerror = fail;
        try { const promise = player.play(); if (promise) void promise.catch(fail); } catch { fail(); }
      };
      playPart();
    };
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) { playMp3(); return; }
    clearTimeout(speechStartTimer.current);
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
      || available.find(voice => /^es\b/i.test(voice.lang) && voice.localService)
      || available.find(voice => /^es\b/i.test(voice.lang)) || null;
    const finish = () => {
      if (activeUtterance.current !== utterance) return;
      clearTimeout(speechStartTimer.current);
      activeUtterance.current = null;
      done();
    };
    utterance.onstart = () => {
      clearTimeout(speechStartTimer.current);
      speechStartTimer.current = setTimeout(() => {
        if (activeUtterance.current !== utterance) return;
        utterance.onend = null;
        utterance.onerror = null;
        window.speechSynthesis.cancel();
        finish();
      }, Math.max(6000, text.length * 130 + 5000));
    };
    utterance.onend = finish;
    utterance.onerror = event => {
      if (activeUtterance.current !== utterance) return;
      if (event.error !== "canceled" && event.error !== "interrupted") { playMp3(); return; }
      finish();
    };
    speechStartTimer.current = setTimeout(() => {
      if (activeUtterance.current !== utterance) return;
      utterance.onend = null;
      utterance.onerror = null;
      window.speechSynthesis.cancel();
      playMp3();
    }, 5000);
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  }, []);

  const startListening = useCallback(async () => {
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
    microphoneCleanup.current?.();
    microphoneCleanup.current = undefined;
    const version = ++microphoneVersion.current;
    setHeard("");
    setMicrophoneName("Abriendo micrófono…");
    let audioTrack: MediaStreamTrack | undefined;
    try {
      if (typeof navigator.mediaDevices?.getUserMedia === "function") {
        const microphone = await openSkinetMicrophone((name, level) => {
          if (version !== microphoneVersion.current) return;
          setMicrophoneName(name);
          setMicrophoneLevel(level);
        }, selectedMicrophone.current);
        if (version !== microphoneVersion.current) { microphone.stop(); return; }
        microphoneCleanup.current = microphone.stop;
        // Chrome de escritorio permite reconocer la misma entrada comprobada.
        const chromeVersion = Number(navigator.userAgent.match(/(?:Chrome|Chromium|Edg)\/(\d+)/)?.[1] || 0);
        if (chromeVersion >= 135 && !/Android/i.test(navigator.userAgent)) audioTrack = microphone.track;
        if (typeof navigator.mediaDevices.enumerateDevices === "function") {
          void navigator.mediaDevices.enumerateDevices().then(devices => {
            if (version === microphoneVersion.current) setMicrophones(devices.filter(device => device.kind === "audioinput"));
          }).catch(() => {});
        }
      }
    } catch (error) {
      if (version !== microphoneVersion.current) return;
      microphoneCleanup.current?.();
      microphoneCleanup.current = undefined;
      setMicrophoneName("");
      setError(error instanceof Error && error.name === "NotAllowedError" ? "Permite el micrófono para preguntar por voz." : "No pude abrir el micrófono. Comprueba que esté conectado y disponible.");
      automaticListening.current = false;
      return;
    }
    controller.current = new SkinetVoice(new Recognition(), {
      answer: text => callbacks.current.onAsk(text), question: setQuestion, reply: setReply, transcript: setHeard,
      status: updateStatus,
      error: message => { automaticListening.current = false; microphoneCleanup.current?.(); microphoneCleanup.current = undefined; setError(message); setListening(false); callbacks.current.onListeningChange(false); },
      cancelSpeech: () => { playbackVersion.current++; replyAudio.current?.pause(); clearTimeout(speechStartTimer.current); activeUtterance.current = null; window.speechSynthesis?.cancel(); },
      speak,
    }, { audioTrack });
    setListening(true);
    callbacks.current.onListeningChange(true);
    controller.current.start();
  }, [speak, updateStatus]);

  useEffect(() => {
    const requests = requestVersion;
    const auto = automaticListening;
    const audioGeneration = playbackVersion;
    const microphoneGeneration = microphoneVersion;
    const player = replyAudio.current;
    const stop = () => {
      microphoneVersion.current++;
      microphoneCleanup.current?.();
      microphoneCleanup.current = undefined;
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
      audioGeneration.current++;
      player?.pause();
      microphoneGeneration.current++;
      microphoneCleanup.current?.();
      microphoneCleanup.current = undefined;
      window.clearTimeout(timer);
      clearTimeout(speechStartTimer.current);
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
      microphoneVersion.current++;
      microphoneCleanup.current?.();
      microphoneCleanup.current = undefined;
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
      if (version === requestVersion.current) {
        setReply(answer);
        window.speechSynthesis?.cancel();
        updateStatus("speaking");
        speak(answer, () => { if (version === requestVersion.current) updateStatus("off"); });
      }
    } catch {
      if (version === requestVersion.current) {
        setError("No pude consultar los datos. Intenta nuevamente.");
        updateStatus("off");
      }
    }
  }

  return <>
    <button type="button" aria-label={open ? "Cerrar Zora" : "Abrir Zora"} aria-expanded={open} onClick={() => setOpen(value => !value)} className="fixed bottom-5 right-5 z-50 h-16 w-16 overflow-hidden rounded-full border-0 bg-transparent shadow-xl shadow-slate-900/25 transition hover:scale-105 focus:outline-none focus:ring-4 focus:ring-cyan-300">
      <img src="/brand/zora-icon.png" alt="Zora" className="h-full w-full object-contain" />
    </button>
    <section aria-label="Asistente Zora" className="mb-5 rounded-xl border border-cyan-200 bg-white p-4 shadow-sm">
    <audio ref={replyAudio} preload="none" aria-label="Respuesta hablada de Zora" />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-[#10223d]"><img src="/brand/zora-icon.png" alt="" className="h-full w-full object-cover" /></span>
        <div><h2 className="font-semibold text-[#10223d]">Zora</h2><p className="text-sm text-slate-500">Tu asistente de operación · Solo administrador</p></div>
      </div>
      <button type="button" aria-pressed={listening} onClick={toggle} className="inline-flex items-center gap-2 rounded-md bg-[#10223d] px-4 py-2 text-sm font-semibold text-white">
        {listening ? <MicOff size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}{listening ? "Pausar escucha" : "Reanudar escucha"}
      </button>
    </div>
    <p role="status" className="mt-3 text-sm font-medium text-cyan-800">{statusLabels[status]}</p>
    {heard && <p className="mt-1 text-sm text-slate-600">Último texto escuchado: {heard}</p>}
    {listening && microphoneName && <div className="mt-2 text-xs text-slate-600"><p>{microphoneName} · {microphoneLevel > 3 ? "Recibiendo sonido" : "Habla y comprueba que la barra se mueva"}</p><meter aria-label="Nivel de entrada del micrófono" min={0} max={100} value={microphoneLevel} className="mt-1 h-3 w-full max-w-xs" /></div>}
    {microphones.length > 0 && <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">Micrófono<select aria-label="Micrófono para Zora" value={microphoneId} onChange={event => {
      selectedMicrophone.current = event.target.value;
      setMicrophoneId(event.target.value);
      if (listening) void startListening();
    }} className="max-w-80 rounded-md border border-slate-200 px-2 py-1"><option value="">Predeterminado del equipo</option>{microphones.filter(device => device.deviceId !== "default").map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || "Micrófono disponible"}</option>)}</select></label>}
    <p className="mt-1 text-sm text-slate-500">Pulsa Reanudar escucha para preguntar por voz y di «hola Zora». El micrófono solo se utiliza para escuchar preguntas. Puedes escribir y escuchar respuestas sin activar el micrófono.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
      <label className="flex items-center gap-2">Voz
        <select value={voiceUri} onChange={event => { selectedVoice.current = event.target.value; setVoiceUri(event.target.value); }} className="max-w-64 rounded-md border border-slate-200 bg-white px-2 py-1">
          <option value="">Automática</option>
          {voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
        </select>
      </label>
      <button type="button" disabled={status === "question" || status === "thinking" || status === "speaking"} onClick={() => {
        const sample = "Soy Zora. Estoy disponible para consultar la operación.";
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
    {reply && <p aria-live="polite" className="mt-2 whitespace-pre-line rounded-lg bg-cyan-50 p-3 text-sm leading-6 text-slate-800"><b>Zora:</b> {reply}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    <form onSubmit={submit} className="mt-3 flex gap-2">
      <input aria-label="Pregunta para Zora" maxLength={500} value={input} onChange={event => setInput(event.target.value)} placeholder="¿Cómo va la entrega en rango de Logísticos Galapa?" className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800" />
      <button type="submit" aria-label="Enviar pregunta" disabled={!input.trim() || status === "thinking"} className="rounded-md bg-cyan-700 px-3 py-2 text-white disabled:opacity-50"><Send size={18} /></button>
    </form>
    </section>
    {open && <div aria-label="Preguntar a Zora" className="fixed bottom-24 right-5 z-50 w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-cyan-200 bg-white p-4 shadow-2xl">
      <div className="mb-3 flex items-center gap-2"><img src="/brand/zora-icon.png" alt="" className="h-9 w-9 object-contain" /><div><p className="font-bold text-[#10223d]">Zora</p><p className="text-xs text-slate-500">Pregunta sobre la operación</p></div></div>
      {reply && <p className="mb-3 max-h-32 overflow-y-auto whitespace-pre-line rounded-lg bg-cyan-50 p-3 text-sm leading-5 text-slate-800"><b>Zora:</b> {reply}</p>}
      <form onSubmit={submit} className="flex gap-2">
        <input aria-label="Pregunta rápida para Zora" autoFocus maxLength={500} value={input} onChange={event => setInput(event.target.value)} placeholder="Escribe tu pregunta…" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800" />
        <button type="submit" aria-label="Enviar pregunta a Zora" disabled={!input.trim() || status === "thinking"} className="rounded-lg bg-cyan-700 px-3 py-2 text-white disabled:opacity-50"><Send size={18} /></button>
      </form>
    </div>}
  </>;
}
