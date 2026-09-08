"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, RefreshCw, ScanFace, ShieldCheck, Trash2, UserRoundPlus } from "lucide-react";

type FaceDetection = {
  descriptor: Float32Array;
  detection: { box: { x: number; y: number; width: number; height: number } };
};

type FaceApi = {
  TinyFaceDetectorOptions: new (options: { inputSize: number; scoreThreshold: number }) => unknown;
  detectAllFaces: (video: HTMLVideoElement, options: unknown) => {
    withFaceLandmarks: () => { withFaceDescriptors: () => Promise<FaceDetection[]> };
  };
  euclideanDistance: (left: Float32Array, right: Float32Array) => number;
  nets: {
    tinyFaceDetector: { loadFromUri: (uri: string) => Promise<void> };
    faceLandmark68Net: { loadFromUri: (uri: string) => Promise<void> };
    faceRecognitionNet: { loadFromUri: (uri: string) => Promise<void> };
  };
};

type StoredFaceProfile = { document: string; name: string; descriptors: number[][] };

declare global {
  interface Window { faceapi?: FaceApi }
}

const FACE_API_URLS = [
  "https://unpkg.com/face-api.js@0.22.2/dist/face-api.min.js",
  "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js",
];
const MODEL_URL = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";
const MATCH_THRESHOLD = 0.5;
let faceApiPromise: Promise<FaceApi> | null = null;
type CameraFacing = "user" | "environment";

export function FacialRecognition({ disabled, documentValue, onRecognize, onStart }: { disabled: boolean; documentValue: string; onRecognize: (document: string) => Promise<void>; onStart: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const profilesRef = useRef(new Map<string, { name: string; samples: Float32Array[] }>());
  const recognitionTimerRef = useRef<number | null>(null);
  const recognitionVersionRef = useRef(0);
  const recognizingRef = useRef(false);
  const readinessTimerRef = useRef<number | null>(null);
  const readinessVersionRef = useRef(0);
  const cameraReadyTimerRef = useRef<number | null>(null);
  const recognitionAvailableRef = useRef(false);
  const busyRef = useRef(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Prepara la IA para registrar o reconocer un rostro.");
  const [registered, setRegistered] = useState<Array<{ document: string; name: string; samples: number }>>([]);
  const [registrationDocument, setRegistrationDocument] = useState(documentValue);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>("environment");
  const [faceReady, setFaceReady] = useState(false);
  const [faceReadinessLabel, setFaceReadinessLabel] = useState("Enciende la cámara para detectar el rostro.");
  const [recognitionAvailable, setRecognitionAvailable] = useState(false);

  useEffect(() => () => {
    recognitionVersionRef.current += 1;
    recognizingRef.current = false;
    if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
    readinessVersionRef.current += 1;
    if (readinessTimerRef.current) window.clearTimeout(readinessTimerRef.current);
    if (cameraReadyTimerRef.current) window.clearTimeout(cameraReadyTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);
  useEffect(() => {
    if (/^\d{1,15}$/.test(documentValue)) setRegistrationDocument(documentValue);
  }, [documentValue]);

  function updateRegistered() {
    setRegistered(Array.from(profilesRef.current, ([document, profile]) => ({ document, name: profile.name, samples: profile.samples.length })));
  }

  async function prepareModels() {
    if (busyRef.current || modelsReady) return;
    setBusyState(true);
    setMessage("Descargando el reconocimiento facial…");
    try {
      const faceapi = await loadFaceApi();
      setMessage("Cargando modelos de reconocimiento…");
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      setModelsReady(true);
      const storedCount = await loadStoredProfiles();
      setMessage(storedCount ? `Reconocimiento listo. ${storedCount} persona(s) cargadas desde Supabase.` : "Reconocimiento listo. Ahora puedes registrar el primer rostro.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar el reconocimiento facial.");
    } finally {
      setBusyState(false);
    }
  }

  async function startCamera(facing: CameraFacing = cameraFacing) {
    if (!modelsReady || busyRef.current) return;
    onStart();
    setBusyState(true);
    setMessage(`Solicitando acceso a la cámara ${cameraLabel(facing).toLowerCase()}…`);
    let cameraStarted = false;
    try {
      if (!window.isSecureContext) throw new Error("La cámara necesita abrirse desde una dirección HTTPS segura.");
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador no permite utilizar la cámara.");
      stopRecognition(false);
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const actualFacing = stream.getVideoTracks()[0]?.getSettings().facingMode;
      const activeFacing: CameraFacing = actualFacing === "user" || actualFacing === "environment" ? actualFacing : facing;
      setCameraFacing(activeFacing);
      video.srcObject = stream;
      await video.play();
      resizeCanvas();
      setCameraActive(true);
      recognitionAvailableRef.current = false;
      setRecognitionAvailable(false);
      if (cameraReadyTimerRef.current) window.clearTimeout(cameraReadyTimerRef.current);
      cameraReadyTimerRef.current = window.setTimeout(() => {
        recognitionAvailableRef.current = true;
        setRecognitionAvailable(true);
      }, 2_500);
      cameraStarted = true;
      setMessage(`Cámara ${cameraLabel(activeFacing).toLowerCase()} encendida. Coloca un solo rostro dentro del encuadre.`);
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      setMessage(name === "NotAllowedError" ? "El navegador denegó la cámara. Permítela en los ajustes del sitio y vuelve a cargar." : error instanceof Error ? error.message : "No se pudo abrir la cámara.");
      stopStream();
    } finally {
      setBusyState(false);
      if (cameraStarted && streamRef.current) startFaceReadiness();
    }
  }

  function changeCamera(facing: CameraFacing) {
    if (cameraActive && facing === cameraFacing) return;
    void startCamera(facing);
  }

  function startFaceReadiness() {
    stopFaceReadiness();
    setFaceReady(false);
    setFaceReadinessLabel("Buscando un rostro…");
    const version = ++readinessVersionRef.current;
    void checkFaceReadiness(version);
  }

  async function checkFaceReadiness(version: number) {
    if (version !== readinessVersionRef.current || !streamRef.current || busyRef.current || recognizingRef.current) return;
    try {
      const faces = await detectFaces();
      if (version !== readinessVersionRef.current || !streamRef.current) return;
      if (faces.length === 1) {
        setFaceReady(true);
        setFaceReadinessLabel("Rostro listo. Ya puedes reconocer e ingresar.");
      } else if (faces.length > 1) {
        setFaceReady(false);
        setFaceReadinessLabel("Hay más de un rostro. Deja solo una persona frente a la cámara.");
      } else {
        setFaceReady(false);
        setFaceReadinessLabel(recognitionAvailableRef.current ? "Cámara lista. Acerca el rostro y pulsa Reconocer ahora." : "Buscando un rostro…");
      }
    } catch {
      setFaceReady(false);
      setFaceReadinessLabel("No se puede analizar el rostro todavía. Revisa la cámara.");
    }
    if (version === readinessVersionRef.current && streamRef.current && !busyRef.current && !recognizingRef.current) {
      readinessTimerRef.current = window.setTimeout(() => void checkFaceReadiness(version), 550);
    }
  }

  function stopFaceReadiness() {
    readinessVersionRef.current += 1;
    if (readinessTimerRef.current) window.clearTimeout(readinessTimerRef.current);
    readinessTimerRef.current = null;
    setFaceReady(false);
  }

  function resizeCanvas() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
  }

  async function registerFace() {
    const document = registrationDocument.trim();
    if (!/^\d{1,15}$/.test(document)) { setMessage("Escribe una cédula válida para registrar el rostro."); return; }
    if (!cameraActive || busyRef.current || recognizing) return;
    stopFaceReadiness();
    setBusyState(true);
    setMessage("Validando la cédula y analizando el rostro…");
    try {
      const response = await fetch(`/api/effective-rest?document=${encodeURIComponent(document)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se encontró esta cédula en Descanso Efectivo.");
      const name = String(body.person?.name || `CC ${document}`).trim();
      const faces = await detectFaces();
      if (faces.length !== 1) { setMessage(`Debe aparecer exactamente un rostro. Detectados: ${faces.length}.`); return; }
      const currentProfile = profilesRef.current.get(document);
      const samples = currentProfile?.samples || [];
      const photo = capturePhoto();
      const saveResponse = await fetch("/api/effective-rest/faces", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document, name, descriptor: Array.from(faces[0].descriptor), photo }),
        cache: "no-store",
      });
      const saveBody = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) throw new Error(saveBody.error || "No se pudo guardar el rostro en Supabase.");
      const saved = saveBody.profile as StoredFaceProfile;
      const savedSamples = normalizeStoredDescriptors(saved?.descriptors);
      profilesRef.current.set(document, { name: saved?.name || name, samples: savedSamples.length ? savedSamples : [...samples, faces[0].descriptor] });
      updateRegistered();
      drawFaces(faces, name, true);
      setMessage(`${name} quedó guardado(a) en Supabase. Muestras: ${profilesRef.current.get(document)?.samples.length || 1}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo registrar el rostro.");
    } finally {
      setBusyState(false);
      if (streamRef.current) startFaceReadiness();
    }
  }

  function startRecognition() {
    if (!cameraActive || !profilesRef.current.size || recognizing || busyRef.current) return;
    onStart();
    stopFaceReadiness();
    recognizingRef.current = true;
    setRecognizing(true);
    setMessage("Reconocimiento activo. Mira de frente a la cámara.");
    const version = ++recognitionVersionRef.current;
    void recognitionLoop(version);
  }

  async function recognitionLoop(version: number) {
    if (version !== recognitionVersionRef.current || !streamRef.current) return;
    try {
      const faces = await detectFaces();
      if (version !== recognitionVersionRef.current) return;
      if (faces.length !== 1) {
        clearCanvas();
        setMessage(faces.length ? "Debe aparecer una sola persona frente a la cámara." : "No se detecta ningún rostro.");
      } else {
        const match = findMatch(faces[0].descriptor);
        drawFaces(faces, match ? match.name : "No reconocido", Boolean(match));
        if (match) {
          stopRecognition(false);
          setMessage(`${match.name} reconocido(a). Consultando descanso efectivo…`);
          await onRecognize(match.document);
          if (streamRef.current) startFaceReadiness();
          return;
        }
        setMessage("Rostro no reconocido. Intenta mirar de frente y con buena iluminación.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error durante el reconocimiento.");
    }
    if (version === recognitionVersionRef.current && streamRef.current) recognitionTimerRef.current = window.setTimeout(() => void recognitionLoop(version), 350);
  }

  async function detectFaces() {
    const faceapi = await loadFaceApi();
    const video = videoRef.current;
    if (!video) return [];
    return faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptors();
  }

  function findMatch(descriptor: Float32Array) {
    const faceapi = window.faceapi;
    if (!faceapi) return null;
    let best: { document: string; name: string; distance: number } | null = null;
    for (const [document, profile] of profilesRef.current) {
      for (const sample of profile.samples) {
        const distance = faceapi.euclideanDistance(descriptor, sample);
        if (!best || distance < best.distance) best = { document, name: profile.name, distance };
      }
    }
    return best && best.distance <= MATCH_THRESHOLD ? best : null;
  }

  function drawFaces(faces: FaceDetection[], label: string, matched: boolean) {
    clearCanvas();
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    faces.forEach(({ detection: { box } }) => {
      context.strokeStyle = matched ? "#34d399" : "#fb7185";
      context.lineWidth = 4;
      context.strokeRect(box.x, box.y, box.width, box.height);
      context.font = "bold 18px Arial";
      const width = context.measureText(label).width + 20;
      const y = Math.max(0, box.y - 32);
      context.fillStyle = matched ? "rgba(5,150,105,.92)" : "rgba(225,29,72,.92)";
      context.fillRect(box.x, y, width, 32);
      context.fillStyle = "white";
      context.fillText(label, box.x + 10, y + 22);
    });
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }

  function stopRecognition(updateMessage = true) {
    recognitionVersionRef.current += 1;
    recognizingRef.current = false;
    if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
    recognitionTimerRef.current = null;
    setRecognizing(false);
    clearCanvas();
    if (updateMessage) setMessage("Reconocimiento detenido.");
    if (updateMessage && streamRef.current) startFaceReadiness();
  }

  function stopStream() {
    stopFaceReadiness();
    if (cameraReadyTimerRef.current) window.clearTimeout(cameraReadyTimerRef.current);
    cameraReadyTimerRef.current = null;
    recognitionAvailableRef.current = false;
    setRecognitionAvailable(false);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }

  function stopCamera() {
    stopRecognition(false);
    stopStream();
  }

  async function clearProfiles() {
    const documents = Array.from(profilesRef.current.keys());
    if (!documents.length || !window.confirm("¿Borrar de Supabase todos los rostros registrados?")) return;
    stopRecognition(false);
    setBusyState(true);
    try {
      const response = await fetch("/api/effective-rest/faces", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documents }), cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudieron borrar los rostros.");
      profilesRef.current.clear();
      updateRegistered();
      clearCanvas();
      setMessage("Se borraron los perfiles faciales de Supabase.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron borrar los rostros.");
    } finally {
      setBusyState(false);
    }
  }

  async function loadStoredProfiles() {
    const response = await fetch("/api/effective-rest/faces", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "No se pudieron cargar los rostros guardados.");
    const profiles = Array.isArray(body.profiles) ? body.profiles as StoredFaceProfile[] : [];
    profilesRef.current.clear();
    profiles.forEach((profile) => {
      const samples = normalizeStoredDescriptors(profile.descriptors);
      if (profile.document && samples.length) profilesRef.current.set(profile.document, { name: profile.name || `CC ${profile.document}`, samples });
    });
    updateRegistered();
    return profilesRef.current.size;
  }

  function capturePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return "";
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = Math.round(320 * video.videoHeight / video.videoWidth);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  }

  function setBusyState(value: boolean) {
    busyRef.current = value;
    setBusy(value);
  }

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-violet-200 bg-violet-50/60">
      <div className="flex items-start gap-3 p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-600 text-white"><ScanFace size={22} /></span><div><h2 className="text-sm font-black text-[#10223d]">Reconocimiento facial</h2><p className="mt-1 text-xs leading-5 text-slate-500">Vincula el rostro con una cédula y guárdalo en Supabase. Al reconocerlo se mostrará la misma autorización de ingreso.</p></div></div>
      <div className="px-4 pb-4"><label className="text-[10px] font-black uppercase tracking-wide text-violet-700" htmlFor="face-registration-document">Cédula para registrar</label><input autoComplete="off" className="mt-1 h-11 w-full rounded-xl border border-violet-200 bg-white px-4 text-base font-bold text-[#10223d] outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" id="face-registration-document" inputMode="numeric" onChange={(event) => setRegistrationDocument(event.target.value.replace(/\D/g, ""))} placeholder="Escribe la cédula de la persona" value={registrationDocument} /><p className="mt-1.5 text-[10px] font-medium text-slate-500">Se validará la cédula y se cargará automáticamente el nombre antes de guardar el rostro.</p></div>
      {!modelsReady ? <div className="px-4 pb-4"><button className="min-h-11 w-full rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={busy || disabled} onClick={() => void prepareModels()} type="button">{busy ? "Preparando reconocimiento…" : "Preparar reconocimiento facial"}</button></div> : null}
      {modelsReady ? <div className="border-t border-violet-100 bg-white p-4">
        <div className={`relative overflow-hidden rounded-xl bg-slate-950 ${cameraActive ? "block" : "hidden"}`}><video className="aspect-[4/3] w-full object-contain" muted onLoadedMetadata={resizeCanvas} playsInline ref={videoRef} /><canvas className="pointer-events-none absolute inset-0 h-full w-full" ref={canvasRef} /></div>
        <div aria-label="Seleccionar cámara" className="grid grid-cols-2 gap-2" role="group">
          <button aria-pressed={cameraFacing === "environment"} className={`min-h-10 rounded-xl border px-3 text-xs font-black transition ${cameraFacing === "environment" ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-600"}`} disabled={busy || disabled} onClick={() => changeCamera("environment")} type="button"><Camera className="mr-1 inline" size={16} />Trasera</button>
          <button aria-pressed={cameraFacing === "user"} className={`min-h-10 rounded-xl border px-3 text-xs font-black transition ${cameraFacing === "user" ? "border-violet-600 bg-violet-600 text-white" : "border-slate-200 bg-white text-slate-600"}`} disabled={busy || disabled} onClick={() => changeCamera("user")} type="button"><RefreshCw className="mr-1 inline" size={15} />Frontal</button>
        </div>
        <p className="mt-2 text-center text-[10px] font-semibold text-slate-500">Para registrar a otra persona usa preferiblemente la cámara trasera.</p>
        {!cameraActive ? <button className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#10223d] px-4 text-sm font-bold text-white disabled:opacity-50" disabled={busy || disabled} onClick={() => void startCamera()} type="button"><Camera size={18} />Encender cámara {cameraLabel(cameraFacing).toLowerCase()}</button> : <><div aria-live="polite" className={`mt-3 flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-center text-[11px] font-bold ${faceReady ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}><span className={`h-2 w-2 rounded-full ${faceReady ? "bg-emerald-500" : "animate-pulse bg-amber-400"}`} />{faceReadinessLabel}</div><div className="mt-3 grid grid-cols-2 gap-2"><button className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 text-xs font-bold text-white disabled:opacity-50" disabled={busy || recognizing || disabled} onClick={() => void registerFace()} type="button"><UserRoundPlus size={17} />Registrar esta cédula</button><button className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-50" disabled={busy || recognizing || !registered.length || !recognitionAvailable || disabled} onClick={startRecognition} type="button"><ShieldCheck size={17} />{faceReady ? "Reconocer e ingresar" : recognitionAvailable ? "Reconocer ahora" : "Preparando cámara…"}</button>{recognizing ? <button className="col-span-2 min-h-10 rounded-xl border border-amber-200 bg-amber-50 text-xs font-bold text-amber-800" onClick={() => stopRecognition()} type="button">Detener reconocimiento</button> : null}<button className="col-span-2 flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600" onClick={stopCamera} type="button"><CameraOff size={16} />Apagar cámara</button></div></>}
        <p aria-live="polite" className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-600">{message}</p>
        {registered.length ? <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Personas guardadas en Supabase</p><button aria-label="Borrar rostros guardados" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-red-600 hover:bg-red-50" disabled={busy} onClick={() => void clearProfiles()} type="button"><Trash2 size={16} /></button></div><div className="mt-2 space-y-1.5">{registered.map((person) => <div className="flex items-center justify-between gap-3 text-xs" key={person.document}><span className="min-w-0 truncate font-bold text-[#10223d]">{person.name}</span><span className="shrink-0 text-[10px] font-semibold text-slate-400">CC {person.document} · {person.samples} muestra(s)</span></div>)}</div></div> : null}
      </div> : <p className="px-4 pb-4 text-xs font-semibold text-slate-500">{message}</p>}
    </section>
  );
}

async function loadFaceApi() {
  if (window.faceapi) return window.faceapi;
  if (faceApiPromise) return faceApiPromise;
  faceApiPromise = (async () => {
    for (const url of FACE_API_URLS) {
      try {
        await loadScript(url);
        if (window.faceapi) return window.faceapi;
      } catch { /* Try the next CDN. */ }
    }
    throw new Error("No se pudo descargar face-api.js. Revisa la conexión a internet.");
  })();
  return faceApiPromise;
}

function loadScript(url: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${url}"]`);
    if (existing) { if (window.faceapi) resolve(); else existing.addEventListener("load", () => resolve(), { once: true }); return; }
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    document.head.appendChild(script);
  });
}

function normalizeStoredDescriptors(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((descriptor): descriptor is number[] => Array.isArray(descriptor) && descriptor.length === 128 && descriptor.every((number) => Number.isFinite(Number(number))))
    .map((descriptor) => new Float32Array(descriptor.map(Number)));
}

function cameraLabel(facing: CameraFacing) {
  return facing === "environment" ? "Trasera" : "Frontal";
}
