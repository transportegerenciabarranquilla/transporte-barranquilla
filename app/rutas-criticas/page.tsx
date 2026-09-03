"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ChevronDown, Clock3, LocateFixed, MapPinned, Navigation, Plus, Search, ShieldCheck, Square, Truck, X } from "lucide-react";
import type { Layer, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

type Neighborhood = { id: number; route: string; distributionCenter: string };
type Hazard = { id: number; ruta: string; tipo: string; descripcion: string; latitud: number; longitud: number; activo: boolean };
type RouteResult = { origin: { label: string; latitude: number; longitude: number }; destination: { label: string; latitude: number; longitude: number }; route: { coordinates: [number, number][]; distanceMeters: number; durationSeconds: number; steps: Array<{ distanceMeters: number; durationSeconds: number; instruction: string }> } };

export default function PublicCriticalRoutesPage() {
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ type: "cables_bajos", description: "", latitude: "", longitude: "" });
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [navigating, setNavigating] = useState(false);
  const [vehiclePosition, setVehiclePosition] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  async function loadData() {
    try {
      const response = await fetch("/api/public/critical-routes", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudieron cargar las rutas.");
      setNeighborhoods(Array.isArray(body.neighborhoods) ? body.neighborhoods : []);
      setHazards(Array.isArray(body.hazards) ? body.hazards : []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudieron cargar las rutas."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadData(); }, []);

  const visible = useMemo(() => {
    const value = normalize(query);
    return value ? neighborhoods.filter((item) => normalize(`${item.route} ${item.distributionCenter}`).includes(value)) : neighborhoods;
  }, [neighborhoods, query]);
  const routeHazards = hazards.filter((hazard) => normalize(hazard.ruta) === normalize(expanded));

  async function openRoute(name: string) {
    setExpanded(name); setMessage(""); setRouteError(""); setRouteResult(null); setRouteLoading(true);
    document.body.style.overflow = "hidden";
    const response = await fetch(`/api/public/route-directions?q=${encodeURIComponent(name)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (response.ok) setRouteResult(body as RouteResult); else setRouteError(body.error || "No se pudo calcular la ruta.");
    setRouteLoading(false);
  }

  function stopNavigation() {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null; setNavigating(false);
  }

  function startNavigation() {
    setMessage("");
    if (!navigator.geolocation) { setMessage("Este dispositivo no permite seguimiento GPS."); return; }
    setNavigating(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => setVehiclePosition({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
      (locationError) => { setMessage(locationError.code === locationError.PERMISSION_DENIED ? "Permite la ubicación para iniciar la ruta." : "Se perdió la señal GPS. Intenta nuevamente."); stopNavigation(); },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }

  function closeRoute() { stopNavigation(); setVehiclePosition(null); setExpanded(""); setRouteResult(null); document.body.style.overflow = ""; }

  useEffect(() => () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); document.body.style.overflow = ""; }, []);

  function useLocation() {
    setMessage("");
    if (!navigator.geolocation) { setMessage("Este dispositivo no permite obtener la ubicación."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setForm((current) => ({ ...current, latitude: coords.latitude.toFixed(7), longitude: coords.longitude.toFixed(7) })); setMessage(`Ubicación capturada · precisión aproximada ${Math.round(coords.accuracy)} m`); setLocating(false); },
      (locationError) => { setMessage(locationError.code === locationError.PERMISSION_DENIED ? "Permite el acceso a la ubicación para continuar." : "Activa el GPS e inténtalo nuevamente."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const response = await fetch("/api/public/critical-routes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ route: expanded, ...form }) });
    const body = await response.json().catch(() => ({}));
    if (response.ok) { setMessage("Señal publicada correctamente."); setForm((current) => ({ ...current, description: "" })); await loadData(); }
    else setMessage(body.error || "No se pudo guardar la señal.");
    setSaving(false);
  }

  return <main className="min-h-screen bg-[#edf2f5] text-[#10223d]">
    <header className="bg-[#0b2235] text-white shadow-lg"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-8"><Link aria-label="Volver" className="grid h-10 w-10 place-items-center rounded-lg border border-white/15" href="/"><ArrowLeft /></Link><div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-300">Acceso público</p><h1 className="text-xl font-semibold">Rutas críticas</h1></div></div></header>
    <section className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-8">
      <article className="rounded-2xl bg-gradient-to-r from-[#0b2235] via-[#123d57] to-[#176b73] p-6 text-white shadow-lg sm:p-8"><span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-100/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-cyan-200"><ShieldCheck size={14} />Sin iniciar sesión</span><h2 className="mt-4 text-2xl font-semibold sm:text-4xl">Consulta el mapa y reporta riesgos</h2><p className="mt-3 text-sm text-slate-300">Selecciona un barrio para abrir el mapa integrado, ver las señales y reportar desde tu ubicación.</p><label className="mt-6 flex max-w-2xl items-center gap-3 rounded-xl bg-white px-4 text-[#10223d] shadow-xl"><Search className="text-[#176b73]" /><input aria-label="Buscar barrio" className="h-14 min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar barrio" value={query} /></label></article>
      <article className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4"><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#176b73]">Selección rápida</p><h2 className="mt-1 text-lg font-semibold">Barrios con rutas críticas</h2></div>{loading ? <Status text="Cargando barrios…" /> : null}{error ? <Status error text={error} /> : null}<div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map((item) => { const name = neighborhoodName(item.route); const count = hazards.filter((hazard) => normalize(hazard.ruta) === normalize(name)).length; return <article className="rounded-xl border border-slate-200 p-4" key={item.id}><div className="flex gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-[#176b73]"><MapPinned size={20} /></span><div><h3 className="font-bold">{name}</h3><p className="mt-1 text-xs text-slate-500">{trips(item.route)} viajes · {count} señales</p></div></div><button className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0b2235] text-sm font-bold text-white" onClick={() => void openRoute(name)} type="button"><Navigation size={17} />Ver ruta</button></article>; })}</div></article>
      {expanded ? <article className="fixed inset-0 z-[1000] grid h-[100dvh] grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-white"><div className="flex items-center justify-between bg-[#0b2235] px-4 py-3 text-white"><div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-cyan-300">Navegación desde CD Galapa</p><h2 className="font-semibold">{expanded}</h2></div><button aria-label="Cerrar mapa" className="grid h-11 w-11 place-items-center rounded-full border border-white/20" onClick={closeRoute}><X /></button></div><div className="grid min-h-0 grid-rows-[minmax(52dvh,1fr)_minmax(0,48dvh)] lg:grid-cols-[minmax(0,2fr)_420px] lg:grid-rows-1"><HazardMap hazards={routeHazards} routeResult={routeResult} vehiclePosition={vehiclePosition} /><aside className="overflow-y-auto border-t border-slate-200 bg-white lg:border-l lg:border-t-0"><div className="sticky top-0 z-10 bg-white p-4 shadow-sm">{routeLoading ? <p className="text-sm font-semibold">Calculando la mejor ruta…</p> : routeError ? <p className="text-sm font-semibold text-red-600">{routeError}</p> : routeResult ? <><div className="grid grid-cols-2 gap-2"><div className="rounded-xl bg-cyan-50 p-3"><Navigation className="text-[#176b73]" size={17} /><p className="mt-1 text-lg font-black">{formatDistance(routeResult.route.distanceMeters)}</p><p className="text-[10px] text-slate-500">Distancia</p></div><div className="rounded-xl bg-amber-50 p-3"><Clock3 className="text-amber-700" size={17} /><p className="mt-1 text-lg font-black">{formatDuration(routeResult.route.durationSeconds)}</p><p className="text-[10px] text-slate-500">Tiempo estimado</p></div></div><button className={`mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-black text-white ${navigating ? "bg-red-600" : "bg-emerald-600"}`} onClick={navigating ? stopNavigation : startNavigation} type="button">{navigating ? <Square size={17} /> : <Truck size={19} />}{navigating ? "Detener seguimiento" : "Iniciar ruta"}</button>{vehiclePosition ? <p className="mt-2 text-center text-[10px] font-semibold text-emerald-700">Vehículo localizado · precisión {Math.round(vehiclePosition.accuracy)} m</p> : null}</> : null}</div>{routeResult ? <div><h3 className="border-b bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Indicaciones</h3>{routeResult.route.steps.map((step, index) => <div className="flex gap-3 border-b border-slate-100 p-3 text-xs" key={`${step.instruction}-${index}`}><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cyan-50 font-black text-[#176b73]">{index + 1}</span><div><p className="font-semibold">{step.instruction}</p><p className="mt-1 text-[10px] text-slate-500">{formatDistance(step.distanceMeters)}</p></div></div>)}</div> : null}<form className="grid gap-3 border-t-4 border-slate-100 p-4" onSubmit={report}><h3 className="font-bold">Reportar peligro en mi ubicación</h3><select className="h-11 rounded-lg border border-slate-300 px-3 text-sm" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="cables_bajos">⚡ Cables bajos</option><option value="via_danada">🚧 Vía dañada</option><option value="inundacion">🌊 Zona inundable</option><option value="cierre">⛔ Cierre vial</option><option value="peligro">⚠️ Otro peligro</option></select><input className="h-11 rounded-lg border border-slate-300 px-3 text-sm" maxLength={240} required placeholder="Describe el riesgo" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /><button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border-2 border-[#176b73] text-sm font-black text-[#176b73]" disabled={locating} onClick={useLocation} type="button"><LocateFixed size={18} />{locating ? "Ubicando…" : "Tomar ubicación GPS"}</button><button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#f5bd19] text-sm font-black disabled:opacity-40" disabled={saving || !form.latitude} type="submit"><Plus size={17} />{saving ? "Publicando…" : "Publicar señal"}</button>{message ? <p className="text-xs font-semibold text-[#176b73]">{message}</p> : null}</form></aside></div></article> : null}
    </section>
  </main>;
}

function HazardMap({ hazards, routeResult, vehiclePosition }: { hazards: Hazard[]; routeResult: RouteResult | null; vehiclePosition: { latitude: number; longitude: number; accuracy: number } | null }) {
  const elementRef = useRef<HTMLDivElement>(null); const mapRef = useRef<LeafletMap | null>(null); const layersRef = useRef<Layer[]>([]); const [ready, setReady] = useState(false);
  useEffect(() => { let cancelled = false; void import("leaflet").then((L) => { if (cancelled || !elementRef.current) return; const first = hazards[0]; const map = L.map(elementRef.current).setView(first ? [first.latitud, first.longitud] : [10.92614, -74.84523], first ? 15 : 11); L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles © Esri", maxZoom: 19 }).addTo(map); mapRef.current = map; setReady(true); requestAnimationFrame(() => map.invalidateSize()); }); return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; }; }, []);
  useEffect(() => { if (!ready || !mapRef.current) return; const map = mapRef.current; void import("leaflet").then((L) => { layersRef.current.forEach((layer) => layer.removeFrom(map)); const hazardLayers = hazards.map((hazard) => L.marker([hazard.latitud, hazard.longitud], { icon: L.divIcon({ className: "", html: `<div style="display:grid;place-items:center;width:44px;height:44px;border-radius:999px;border:3px solid white;background:#fbbf24;font-size:23px;box-shadow:0 4px 14px #0005">${hazardIcon(hazard.tipo)}</div>`, iconSize: [44, 44], iconAnchor: [22, 22] }) }).bindPopup(`<strong>${hazardLabel(hazard.tipo)}</strong><br>${escapeHtml(hazard.descripcion)}`).addTo(map)); const routeLayers: Layer[] = []; if (routeResult?.route.coordinates.length) { const points = routeResult.route.coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number]); const outline = L.polyline(points, { color: "white", weight: 9, opacity: .9 }).addTo(map); const line = L.polyline(points, { color: "#1264ff", weight: 5 }).addTo(map); const origin = L.circleMarker([routeResult.origin.latitude, routeResult.origin.longitude], { radius: 9, color: "white", weight: 3, fillColor: "#1264ff", fillOpacity: 1 }).bindPopup("<strong>Origen: CD Galapa</strong>").addTo(map); const destination = L.circleMarker([routeResult.destination.latitude, routeResult.destination.longitude], { radius: 9, color: "white", weight: 3, fillColor: "#f97316", fillOpacity: 1 }).bindPopup(`<strong>Destino</strong><br>${escapeHtml(routeResult.destination.label)}`).addTo(map); routeLayers.push(outline, line, origin, destination); if (!vehiclePosition) map.fitBounds(line.getBounds(), { padding: [45, 45], maxZoom: 15 }); } else if (hazards.length && !vehiclePosition) map.fitBounds(hazards.map((hazard) => [hazard.latitud, hazard.longitud] as [number, number]), { padding: [50, 50], maxZoom: 16 }); if (vehiclePosition) { const accuracy = L.circle([vehiclePosition.latitude, vehiclePosition.longitude], { radius: vehiclePosition.accuracy, color: "#0891b2", weight: 1, fillColor: "#22d3ee", fillOpacity: .15 }).addTo(map); const vehicle = L.marker([vehiclePosition.latitude, vehiclePosition.longitude], { zIndexOffset: 1000, icon: L.divIcon({ className: "", html: `<div style="display:grid;place-items:center;width:46px;height:46px;border-radius:999px;border:4px solid white;background:#059669;font-size:23px;box-shadow:0 5px 16px #0006">🚚</div>`, iconSize: [46, 46], iconAnchor: [23, 23] }) }).bindPopup("<strong>Tu vehículo</strong><br>Ubicación GPS en tiempo real").addTo(map); routeLayers.push(accuracy, vehicle); map.setView([vehiclePosition.latitude, vehiclePosition.longitude], Math.max(map.getZoom(), 16), { animate: true }); } layersRef.current = [...routeLayers, ...hazardLayers]; }); }, [hazards, ready, routeResult, vehiclePosition]);
  return <div className="relative min-h-0"><div className="absolute inset-0" ref={elementRef} />{!hazards.length ? <div className="pointer-events-none absolute left-1/2 top-4 z-[500] -translate-x-1/2 rounded-lg bg-white/95 px-4 py-2 text-center text-xs font-semibold shadow">Sin señales reportadas en esta ruta.</div> : null}</div>;
}

function Status({ text, error = false }: { text: string; error?: boolean }) { return <p className={`m-4 rounded-xl px-4 py-8 text-center text-sm font-semibold ${error ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-500"}`}>{text}</p>; }
function hazardIcon(type: string) { return type === "cables_bajos" ? "⚡" : type === "via_danada" ? "🚧" : type === "inundacion" ? "🌊" : type === "cierre" ? "⛔" : "⚠️"; }
function hazardLabel(type: string) { return type === "cables_bajos" ? "Cables bajos" : type === "via_danada" ? "Vía dañada" : type === "inundacion" ? "Zona inundable" : type === "cierre" ? "Cierre vial" : "Peligro"; }
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character); }
function neighborhoodName(route: string) { return route.replace(/\s*\(\s*\d+\s+VIAJES?\s*\)\s*$/i, "").trim(); }
function trips(route: string) { return Number(route.match(/\(\s*(\d+)\s+VIAJES?\s*\)/i)?.[1] || 1); }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function formatDistance(meters: number) { return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`; }
function formatDuration(seconds: number) { const minutes = Math.max(1, Math.round(seconds / 60)); return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`; }
