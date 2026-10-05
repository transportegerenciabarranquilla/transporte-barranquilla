"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ModulacionRegistro } from "../../lib/modulacionStorage";
import { createModulationTracker, modulationAnnouncement } from "../../lib/skinetModulations";

const AUDIO_SETTING_KEY = "tv-skainet-audio-enabled";

export function TvModulationAnnouncements({ records, ready }: { records: ModulacionRegistro[]; ready: boolean }) {
  const tracker = useRef<ReturnType<typeof createModulationTracker> | null>(null);
  const utterances = useRef(new Set<SpeechSynthesisUtterance>());
  const queue = useRef<string[]>([]);
  const speaking = useRef(false);
  const speakNextRef = useRef<() => void>(() => {});
  const mutedRef = useRef(false);
  const audioEnabledRef = useRef(true);
  const userUnlockedRef = useRef(false);
  const startTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [unsupported, setUnsupported] = useState(false);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const speakNext = useCallback(() => {
    if (speaking.current || mutedRef.current || !audioEnabledRef.current) return;
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setUnsupported(true);
      return;
    }
    const text = queue.current.shift();
    if (!text) return;

    speaking.current = true;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-CO";
    utterance.volume = 1;
    utterance.rate = 0.95;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find(voice => /^es[-_]CO$/i.test(voice.lang)) || voices.find(voice => /^es\b/i.test(voice.lang)) || null;
    utterances.current.add(utterance);
    utterance.onend = () => {
      clearTimeout(startTimer.current);
      utterances.current.delete(utterance);
      speaking.current = false;
      speakNextRef.current();
    };
    utterance.onstart = () => { clearTimeout(startTimer.current); setBlocked(false); };
    utterance.onerror = event => {
      clearTimeout(startTimer.current);
      utterances.current.delete(utterance);
      speaking.current = false;
      if (event.error !== "canceled" && event.error !== "interrupted") {
        queue.current.unshift(text);
        setBlocked(true);
      }
    };
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
    startTimer.current = setTimeout(() => {
      // Algunos televisores no emiten onerror cuando bloquean la voz.
      utterance.onend = null;
      utterance.onerror = null;
      utterance.onstart = null;
      window.speechSynthesis.cancel();
      utterances.current.delete(utterance);
      speaking.current = false;
      queue.current.unshift(text);
      setBlocked(true);
    }, 5000);
  }, []);

  useEffect(() => {
    speakNextRef.current = speakNext;
  }, [speakNext]);

  const enqueueSpeech = useCallback((texts: string[]) => {
    if (!texts.length || mutedRef.current || !audioEnabledRef.current) return;
    queue.current.push(...texts);
    speakNext();
  }, [speakNext]);

  const enableAudio = useCallback((announce = false) => {
    mutedRef.current = false;
    audioEnabledRef.current = true;
    setBlocked(false);
    setMuted(false);
    setAudioEnabled(true);
    try { window.localStorage.setItem(AUDIO_SETTING_KEY, "1"); } catch { /* Storage can be unavailable in private TV browsers. */ }
    if (announce) enqueueSpeech(["Skainet. Avisos de nuevas modulaciones activados."]);
    else speakNext();
  }, [enqueueSpeech, speakNext]);

  useEffect(() => {
    const loadVoices = () => { window.speechSynthesis?.getVoices(); };
    window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
    loadVoices();
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    let stored = "";
    try { stored = window.localStorage.getItem(AUDIO_SETTING_KEY) || ""; } catch { /* Ignore storage failures. */ }
    if (stored !== "0") enableAudio(false);
    else {
      mutedRef.current = true;
      setMuted(true);
    }
  }, [enableAudio]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    audioEnabledRef.current = audioEnabled;
  }, [audioEnabled]);

  useEffect(() => {
    // Los navegadores de Smart TV suelen bloquear speechSynthesis hasta una
    // interacción. Usamos la primera tecla o toque del control remoto para
    // desbloquearlo y hacemos una prueba hablada en ese mismo gesto.
    const unlock = (event: Event) => {
      if (mutedRef.current || (event.target instanceof Element && event.target.closest("[data-skainet-audio]"))) return;
      if (userUnlockedRef.current) return;
      userUnlockedRef.current = true;
      enableAudio(true);
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      clearTimeout(startTimer.current);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [enableAudio]);

  useEffect(() => {
    if (!ready) return;
    tracker.current ??= createModulationTracker();
    const fresh = tracker.current(records);
    enqueueSpeech(fresh.map(record => modulationAnnouncement(record)));
  }, [records, ready, enqueueSpeech]);

  useEffect(() => {
    const active = utterances.current;
    return () => {
      clearTimeout(startTimer.current);
      queue.current = [];
      speaking.current = false;
      active.forEach(utterance => { utterance.onend = null; utterance.onerror = null; });
      active.clear();
      window.speechSynthesis?.cancel();
    };
  }, []);

  return <div data-skainet-audio className="fixed bottom-2 right-3 z-50 max-w-sm rounded-lg border border-cyan-200 bg-white p-3 text-xs text-slate-800 shadow">
    <p role="status" className="mb-2">{unsupported ? "Este navegador del televisor no admite voz. Abre el modo TV desde Chrome en un equipo conectado por HDMI." : blocked ? "El televisor bloqueó la voz. Pulsa Probar voz con el control remoto." : "Alertas de Skainet · No requieren micrófono"}</p>
    <button type="button" className="mr-2 rounded border border-cyan-200 px-3 py-2 font-semibold" onClick={() => enableAudio(true)}>Probar voz</button>
    <button type="button" className="rounded border border-cyan-200 px-3 py-2 font-semibold" onClick={() => {
    if (blocked || muted || !audioEnabled) {
      enableAudio(true);
    } else {
      mutedRef.current = true;
      setMuted(true);
      try { window.localStorage.setItem(AUDIO_SETTING_KEY, "0"); } catch { /* Ignore storage failures. */ }
      queue.current = [];
      clearTimeout(startTimer.current);
      speaking.current = false;
      window.speechSynthesis?.cancel();
    }
  }}>{blocked ? "Desbloquear audio de Skainet" : !audioEnabled || muted ? "Activar avisos de Skainet" : "Silenciar avisos de Skainet"}</button></div>;
}
