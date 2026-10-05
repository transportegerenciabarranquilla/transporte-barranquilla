"use client";

import { useEffect, useRef, useState } from "react";
import type { ModulacionRegistro } from "../../lib/modulacionStorage";
import { createModulationTracker, modulationAnnouncement } from "../../lib/skinetModulations";

export function TvModulationAnnouncements({ records, ready }: { records: ModulacionRegistro[]; ready: boolean }) {
  const tracker = useRef<ReturnType<typeof createModulationTracker> | null>(null);
  const utterances = useRef(new Set<SpeechSynthesisUtterance>());
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);

  function speak(text: string) {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-CO";
    utterance.volume = 1;
    utterance.rate = 0.95;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find(voice => /^es[-_]CO$/i.test(voice.lang)) || voices.find(voice => /^es\b/i.test(voice.lang)) || null;
    utterances.current.add(utterance);
    utterance.onend = () => utterances.current.delete(utterance);
    utterance.onerror = event => {
      utterances.current.delete(utterance);
      if (event.error !== "canceled" && event.error !== "interrupted") setBlocked(true);
    };
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  }

  useEffect(() => {
    if (!ready) return;
    tracker.current ??= createModulationTracker();
    const fresh = tracker.current(records);
    if (audioEnabled && !muted) fresh.forEach(record => speak(modulationAnnouncement(record)));
  }, [records, ready, muted, audioEnabled]);

  useEffect(() => {
    const active = utterances.current;
    return () => {
      active.forEach(utterance => { utterance.onend = null; utterance.onerror = null; });
      active.clear();
      window.speechSynthesis?.cancel();
    };
  }, []);

  return <button type="button" className="fixed bottom-2 right-3 z-50 rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow" onClick={() => {
    if (blocked || muted || !audioEnabled) {
      setBlocked(false);
      setMuted(false);
      setAudioEnabled(true);
      speak("Skainet. Avisos de nuevas modulaciones activados.");
    } else {
      setMuted(true);
      window.speechSynthesis?.cancel();
    }
  }}>{blocked || !audioEnabled ? "Activar audio de Skainet" : muted ? "Activar avisos de Skainet" : "Silenciar avisos de Skainet"}</button>;
}
