"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ModulacionRegistro } from "../../lib/modulacionStorage";
import { createModulationTracker, modulationAnnouncement } from "../../lib/skinetModulations";

const AUDIO_SETTING_KEY = "tv-skainet-audio-enabled";
const TEST_MESSAGE = "Skainet. El sonido del televisor está funcionando. Avisos de nuevas modulaciones activados.";

export function TvModulationAnnouncements({ records, ready }: { records: ModulacionRegistro[]; ready: boolean }) {
  const tracker = useRef<ReturnType<typeof createModulationTracker> | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const queue = useRef<string[]>([]);
  const current = useRef("");
  const mutedRef = useRef(false);
  const unlocked = useRef(false);
  const generation = useRef(0);
  const nextRef = useRef<() => void>(() => {});
  const [muted, setMuted] = useState(false);
  const [message, setMessage] = useState("Audio MP3 de Skainet · No requiere micrófono");

  const playNext = useCallback(() => {
    const player = audio.current;
    if (!player || current.current || mutedRef.current) return;
    const text = queue.current.shift();
    if (!text) return;
    const version = ++generation.current;
    current.current = text;
    const browserVoices = "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
    const pablo = browserVoices.find(voice => voice.name.trim().toLocaleLowerCase() === "microsoft pablo - spanish (spain)" || voice.name.toLocaleLowerCase().includes("microsoft pablo"));
    if (pablo && "SpeechSynthesisUtterance" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = pablo;
      utterance.lang = pablo.lang || "es-ES";
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.onstart = () => { if (generation.current === version) setMessage("Skainet está hablando · Voz Microsoft Pablo activa"); };
      utterance.onend = () => {
        if (generation.current !== version) return;
        current.current = "";
        setMessage("Audio listo · Esperando nuevas modulaciones");
        nextRef.current();
      };
      utterance.onerror = () => {
        if (generation.current !== version) return;
        current.current = "";
        queue.current.unshift(text);
        setMessage("No se pudo reproducir la voz del TV. Comprueba el sonido.");
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      return;
    }
    player.src = `/api/admin/skinet-audio?${new URLSearchParams({ text: text.slice(0, 700) })}`;
    player.volume = 1;
    const fail = (error: unknown) => {
      if (generation.current !== version || !current.current) return;
      queue.current.unshift(current.current);
      current.current = "";
      setMessage(error instanceof Error && error.name === "NotAllowedError"
        ? "Pulsa Probar voz con el control remoto para activar el sonido."
        : "No se pudo reproducir el MP3. Comprueba la conexión y pulsa Probar voz.");
    };
    player.onerror = () => fail(new Error("Audio no disponible"));
    player.onplaying = () => { if (generation.current === version) setMessage("Skainet está hablando · Audio del televisor activo"); };
    player.onended = () => {
      if (generation.current !== version) return;
      current.current = "";
      setMessage("Audio listo · Esperando nuevas modulaciones");
      nextRef.current();
    };
    // Comienza en el gesto del control remoto, sin esperar un fetch.
    try {
      const promise = player.play();
      if (promise) void promise.catch(fail);
    } catch (error) { fail(error); }
  }, []);

  useEffect(() => { nextRef.current = playNext; }, [playNext]);

  const testAudio = useCallback(() => {
    unlocked.current = true;
    mutedRef.current = false;
    setMuted(false);
    generation.current++;
    audio.current?.pause();
    if (current.current) queue.current.unshift(current.current);
    current.current = "";
    queue.current.unshift(TEST_MESSAGE);
    try { localStorage.setItem(AUDIO_SETTING_KEY, "1"); } catch { /* El TV puede bloquear almacenamiento. */ }
    playNext();
  }, [playNext]);

  useEffect(() => {
    let disabled = false;
    try { disabled = localStorage.getItem(AUDIO_SETTING_KEY) === "0"; } catch { /* Sin almacenamiento. */ }
    mutedRef.current = disabled;
    setMuted(disabled);
    const unlock = (event: Event) => {
      if (unlocked.current || mutedRef.current || (event.target instanceof Element && event.target.closest("[data-skainet-audio]"))) return;
      testAudio();
    };
    window.addEventListener("click", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [testAudio]);

  useEffect(() => {
    if (!ready) return;
    tracker.current ??= createModulationTracker();
    const fresh = tracker.current(records);
    if (mutedRef.current || !fresh.length) return;
    queue.current.push(...fresh.map(modulationAnnouncement));
    playNext();
  }, [records, ready, playNext]);

  useEffect(() => {
    const player = audio.current;
    const playbackGeneration = generation;
    return () => {
      playbackGeneration.current++;
      queue.current = [];
      current.current = "";
      if (player) {
        player.onended = null;
        player.onerror = null;
        player.onplaying = null;
        player.pause();
        player.removeAttribute("src");
        player.load();
      }
    };
  }, []);

  return <div data-skainet-audio className="fixed bottom-2 right-3 z-50 max-w-sm rounded-lg border border-cyan-200 bg-white p-3 text-xs text-slate-800 shadow">
    <p role="status" className="mb-2">{muted ? "Avisos de Skainet silenciados" : message}</p>
    <audio ref={audio} preload="none" aria-label="Audio de alertas de Skainet" />
    <button type="button" className="mr-2 rounded border border-cyan-200 px-3 py-2 font-semibold" onClick={testAudio}>Probar voz</button>
    <button type="button" className="rounded border border-cyan-200 px-3 py-2 font-semibold" onClick={() => {
      if (muted) { testAudio(); return; }
      mutedRef.current = true;
      setMuted(true);
      generation.current++;
      queue.current = [];
      current.current = "";
      audio.current?.pause();
      try { localStorage.setItem(AUDIO_SETTING_KEY, "0"); } catch { /* Sin almacenamiento. */ }
    }}>{muted ? "Activar avisos" : "Silenciar avisos"}</button>
  </div>;
}
