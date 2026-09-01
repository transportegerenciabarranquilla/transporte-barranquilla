"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ChevronRight, Clock3, MapPin, Navigation, Route, Search, ShieldCheck, Truck } from "lucide-react";
import type { GeoJSONSource, Map as MapLibreMap, Marker as MapLibreMarker, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Point = { label: string; latitude: number; longitude: number; type?: string };
type RouteStep = { distanceMeters: number; durationSeconds: number; instruction: string };
type RouteResult = {
  origin: Point;
  destination: Point;
  route: { coordinates: [number, number][]; distanceMeters: number; durationSeconds: number; steps: RouteStep[] };
  disclaimer: string;
};

type CriticalNeighborhood = { id: number; route: string; distributionCenter: string };

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    openStreetMap: {
      type: "raster",
      tiles: ["/api/map-tiles/{z}/{x}/{y}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "open-street-map", type: "raster", source: "openStreetMap" }],
};

export default function CriticalRoutesPage() {
  const router = useRouter();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<RouteResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<CriticalNeighborhood[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const mapSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/session/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => setAccess(body?.session?.isPeople || body?.session?.isAdmin ? "allowed" : "denied"))
      .catch(() => setAccess("denied"));
  }, []);

  useEffect(() => {
    if (access !== "allowed") return;
    setListLoading(true);
    fetch("/api/people/critical-routes?list=true", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudo cargar la tabla de barrios.");
        setNeighborhoods(Array.isArray(body.neighborhoods) ? body.neighborhoods : []);
      })
      .catch((caught) => setListError(caught instanceof Error ? caught.message : "No se pudo cargar la tabla de barrios."))
      .finally(() => setListLoading(false));
  }, [access]);

  async function searchRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await calculateRoute(query.trim());
  }

  async function calculateRoute(value: string, neighborhoodName?: string) {
    if (value.length < 3 || loading) return;
    setQuery(value);
    setSelectedNeighborhood(neighborhoodName || null);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/people/critical-routes?q=${encodeURIComponent(value)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo calcular la ruta.");
      setResult(body as RouteResult);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "No se pudo calcular la ruta.");
    } finally {
      setLoading(false);
    }
  }

  function selectNeighborhood(neighborhood: CriticalNeighborhood) {
    const name = neighborhoodName(neighborhood.route);
    mapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    void calculateRoute(`${name}, Barranquilla`, name);
  }

  if (access === "checking") return <StatusScreen text="Validando acceso a People…" />;
  if (access === "denied") return <StatusScreen text="Este módulo es exclusivo de People y Administración." />;

  return (
    <main className="min-h-screen bg-[#edf2f5] text-[#10223d]">
      <header className="border-b border-[#18374d] bg-[#0b2235] text-white shadow-lg">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 sm:px-8">
          <button aria-label="Volver al portal" className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 transition hover:bg-white/10" onClick={() => router.push("/")} type="button"><ArrowLeft size={20} /></button>
          <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-300">People Intelligence</p><h1 className="text-xl font-semibold">Rutas críticas</h1></div>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] space-y-5 px-4 py-6 sm:px-8">
        <article className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
          <div className="grid gap-5 bg-gradient-to-r from-[#0b2235] via-[#123d57] to-[#176b73] p-5 text-white lg:grid-cols-[minmax(0,1fr)_minmax(420px,620px)] lg:items-center sm:p-7">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-100/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-cyan-200"><Route size={14} />Planeación territorial</span>
              <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">Encuentra la ruta más rápida desde el CD Galapa</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Busca un barrio o una ciudad. Por ejemplo: Carrizal, Soledad, Galapa o Cartagena.</p>
            </div>
            <form className="rounded-xl border border-white/15 bg-white/10 p-2 shadow-xl backdrop-blur" onSubmit={searchRoute}>
              <label className="flex min-w-0 items-center gap-3 rounded-lg bg-white px-3 text-[#10223d]">
                <Search className="shrink-0 text-[#176b73]" size={20} />
                <input aria-label="Barrio o ciudad de destino" className="h-12 min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:font-normal placeholder:text-slate-400" onChange={(event) => setQuery(event.target.value)} placeholder="Ej. Carrizal" value={query} />
                <button className="h-9 rounded-lg bg-[#f5bd19] px-4 text-xs font-black text-[#10223d] transition hover:bg-[#ffd454] disabled:cursor-wait disabled:opacity-60" disabled={loading || query.trim().length < 3} type="submit">{loading ? "Calculando…" : "Trazar ruta"}</button>
              </label>
            </form>
          </div>
          {error ? <div className="flex items-center gap-3 border-t border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700"><AlertTriangle size={18} />{error}</div> : null}
        </article>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <article className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm xl:order-1">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#176b73]">Selección rápida</p>
              <h2 className="mt-0.5 text-lg font-semibold text-[#10223d]">Barrios con rutas críticas</h2>
              <p className="mt-0.5 text-xs text-slate-500">{listLoading ? "Cargando barrios desde Supabase…" : `${neighborhoods.length} barrios cargados desde la tabla ruta_criticas.`}</p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700"><ShieldCheck size={14} />Ruta recomendada</span>
          </div>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[9px] font-black uppercase tracking-[.14em] text-slate-500 shadow-[0_1px_0_#e2e8f0]">
                <tr><th className="w-14 px-4 py-2">#</th><th className="px-3 py-2">Barrio / ruta</th><th className="px-3 py-2">Viajes</th><th className="px-3 py-2">CD</th><th className="px-4 py-2 text-right">Acción</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {neighborhoods.map((neighborhood) => {
                  const name = neighborhoodName(neighborhood.route);
                  const trips = neighborhoodTrips(neighborhood.route);
                  const isSelected = selectedNeighborhood === name;
                  return (
                    <tr className={`group transition ${isSelected ? "bg-cyan-50" : "hover:bg-slate-50"}`} key={neighborhood.id}>
                      <td className="px-4 py-0.5 text-xs font-bold text-slate-400">{neighborhood.id}</td>
                      <td className="px-3 py-0.5"><button className="flex w-full items-center gap-2 py-1.5 text-left text-sm font-bold text-[#10223d] outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-[#176b73]" disabled={loading} onClick={() => selectNeighborhood(neighborhood)} type="button"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${isSelected ? "bg-[#176b73] text-white" : "bg-cyan-50 text-[#176b73] group-hover:bg-cyan-100"}`}><MapPin size={14} /></span>{name}</button></td>
                      <td className="px-3 py-0.5 text-xs font-semibold text-slate-600">{trips} {trips === 1 ? "viaje" : "viajes"}</td>
                      <td className="px-3 py-0.5"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{neighborhood.distributionCenter}</span></td>
                      <td className="px-4 py-0.5 text-right"><button aria-label={`Calcular ruta recomendada hacia ${name}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-black text-[#176b73] transition hover:bg-cyan-50 disabled:opacity-50" disabled={loading} onClick={() => selectNeighborhood(neighborhood)} type="button">Ver ruta <ChevronRight size={14} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {listError ? <div className="border-t border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">{listError}</div> : null}
            {!listLoading && !listError && neighborhoods.length === 0 ? <div className="px-5 py-6 text-center text-sm text-slate-500">La tabla no devolvió barrios. Revisa sus permisos de lectura en Supabase.</div> : null}
          </div>
        </article>

          <article className="relative order-3 min-h-[620px] scroll-mt-5 overflow-hidden rounded-2xl border border-slate-300 bg-[#dcecf3] shadow-sm xl:col-span-2" ref={mapSectionRef}>
            <RouteMap result={result} />
            {!result ? <div className="pointer-events-none absolute inset-0 grid place-items-center p-6"><div className="max-w-sm rounded-2xl border border-white/80 bg-white/95 p-6 text-center shadow-xl backdrop-blur"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-50 text-[#176b73]"><MapPin size={27} /></span><h3 className="mt-4 text-lg font-semibold">Busca el primer destino</h3><p className="mt-2 text-sm leading-6 text-slate-500">El mapa mostrará el recorrido desde el Centro Distribución Galapa - Bavaria hasta el lugar encontrado.</p></div></div> : null}
          </article>

          <aside className="order-2 max-h-[460px] overflow-y-auto rounded-2xl border border-slate-300 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-[#0b2235] p-5 text-white"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-cyan-300">Resumen del recorrido</p><h2 className="mt-1 text-lg font-semibold">{result ? shortDestination(result.destination.label) : "Sin destino seleccionado"}</h2></div>
            {result ? <>
              <div className="grid grid-cols-2 gap-3 border-b border-slate-200 p-4">
                <Metric icon={<Navigation size={18} />} label="Distancia" value={formatDistance(result.route.distanceMeters)} />
                <Metric icon={<Clock3 size={18} />} label="Tiempo estimado" value={formatDuration(result.route.durationSeconds)} />
              </div>
              <div className="space-y-3 border-b border-slate-200 p-4 text-xs">
                <RoutePoint color="bg-[#1264ff]" label="Origen" value={result.origin.label} />
                <RoutePoint color="bg-[#f97316]" label="Destino" value={result.destination.label} />
              </div>
              <div className="max-h-[330px] overflow-y-auto">
                <div className="sticky top-0 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[9px] font-black uppercase tracking-[.14em] text-slate-500">Indicaciones principales</div>
                {result.route.steps.slice(0, 14).map((step, index) => <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 border-b border-slate-100 px-4 py-3 text-xs" key={`${step.instruction}-${index}`}><span className="grid h-6 w-6 place-items-center rounded-full bg-cyan-50 text-[9px] font-black text-[#176b73]">{index + 1}</span><div><p className="font-semibold text-[#10223d]">{step.instruction}</p><p className="mt-1 text-[10px] text-slate-500">{formatDistance(step.distanceMeters)} · {formatDuration(step.durationSeconds)}</p></div></div>)}
              </div>
              <div className="space-y-3 bg-amber-50 p-4 text-[10px] leading-5 text-amber-900"><p>{result.disclaimer}</p><div className="flex flex-wrap gap-2"><a className="inline-flex items-center gap-2 rounded-lg bg-[#33ccff] px-3 py-2 font-bold text-[#10223d]" href={wazeDirectionsUrl(result)} rel="noreferrer" target="_blank"><Navigation size={13} />Iniciar guía con Waze</a><a className="inline-flex items-center gap-2 rounded-lg bg-[#0b2235] px-3 py-2 font-bold text-white" href={googleDirectionsUrl(result)} rel="noreferrer" target="_blank"><Navigation size={13} />Google Maps</a></div></div>
            </> : <div className="p-6 text-sm leading-6 text-slate-500">Aquí aparecerán la distancia, el tiempo estimado y las indicaciones cuando realices una búsqueda.</div>}
          </aside>
        </div>
      </section>
    </main>
  );
}

function RouteMap({ result }: { result: RouteResult | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const { AttributionControl, Map, NavigationControl } = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;
        const map = new Map({
          attributionControl: false,
          center: [-74.84523, 10.92614],
          container: containerRef.current,
          maxZoom: 19,
          style: MAP_STYLE,
          transformRequest: (url) => ({ url: clampOpenStreetMapTileUrl(url) }),
          zoom: 10.5,
        });
        map.setMaxZoom(19);
        map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
        map.addControl(new AttributionControl({ compact: true }), "bottom-left");
        map.on("load", () => { if (!cancelled) setMapReady(true); });
        map.on("error", (event) => {
          if (!cancelled && event.error?.message) setMapError("No se pudo cargar el mapa base. Revisa la conexión e inténtalo nuevamente.");
        });
        mapRef.current = map;
        resizeObserverRef.current = new ResizeObserver(() => map.resize());
        resizeObserverRef.current.observe(containerRef.current);
        requestAnimationFrame(() => map.resize());
      } catch {
        if (!cancelled) setMapError("No se pudo cargar el mapa.");
      }
    }
    void initialize();
    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.remove());
      resizeObserverRef.current?.disconnect();
      mapRef.current?.remove();
      resizeObserverRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !result || !mapRef.current) return;
    const map = mapRef.current;
    const data = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: result.route.coordinates } };
    const source = map.getSource("fastest-route") as GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      map.addSource("fastest-route", { type: "geojson", data });
      map.addLayer({ id: "fastest-route-outline", type: "line", source: "fastest-route", paint: { "line-color": "#ffffff", "line-width": 8, "line-opacity": 0.9 } });
      map.addLayer({ id: "fastest-route-line", type: "line", source: "fastest-route", paint: { "line-color": "#1264ff", "line-width": 5 } });
    }

    markersRef.current.forEach((marker) => marker.remove());
    void import("maplibre-gl").then(({ LngLatBounds, Marker, Popup }) => {
      markersRef.current = [
        new Marker({ color: "#1264ff" }).setLngLat([result.origin.longitude, result.origin.latitude]).setPopup(new Popup({ offset: 20 }).setDOMContent(popupContent("Origen", result.origin.label))).addTo(map),
        new Marker({ color: "#f97316" }).setLngLat([result.destination.longitude, result.destination.latitude]).setPopup(new Popup({ offset: 20 }).setDOMContent(popupContent("Destino", result.destination.label))).addTo(map),
      ];
      const bounds = result.route.coordinates.reduce((value, coordinate) => value.extend(coordinate), new LngLatBounds(result.route.coordinates[0], result.route.coordinates[0]));
      map.fitBounds(bounds, { padding: 70, duration: 900, maxZoom: 15 });
    });
  }, [mapReady, result]);

  if (mapError) return <div className="absolute inset-0 grid place-items-center text-sm font-semibold text-slate-500">{mapError}</div>;
  return <div aria-label="Mapa de la ruta crítica" className="absolute inset-0" ref={containerRef} role="img" />;
}

function clampOpenStreetMapTileUrl(url: string) {
  const match = url.match(/^(https:\/\/tile\.openstreetmap\.org\/)(\d+)\/(\d+)\/(\d+)\.png(\?.*)?$/);
  if (!match) return url;
  const zoom = Number(match[2]);
  if (zoom <= 19) return url;
  const scale = 2 ** (zoom - 19);
  const x = Math.floor(Number(match[3]) / scale);
  const y = Math.floor(Number(match[4]) / scale);
  return `${match[1]}19/${x}/${y}.png${match[5] || ""}`;
}

function popupContent(kind: string, label: string) {
  const container = document.createElement("div");
  const title = document.createElement("strong");
  const detail = document.createElement("p");
  title.textContent = kind;
  detail.textContent = label;
  detail.style.marginTop = "4px";
  container.append(title, detail);
  return container;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-[#176b73]">{icon}</span><p className="mt-2 text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-[#10223d]">{value}</p></div>; }
function RoutePoint({ color, label, value }: { color: string; label: string; value: string }) { return <div className="flex gap-3"><span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${color}`} /><div><p className="font-black uppercase tracking-[.12em] text-slate-400">{label}</p><p className="mt-1 font-semibold text-[#10223d]">{value}</p></div></div>; }
function StatusScreen({ text }: { text: string }) { return <main className="grid min-h-screen place-items-center bg-[#edf2f5] p-6"><div className="rounded-2xl border border-slate-300 bg-white p-8 text-center shadow-xl"><Truck className="mx-auto text-[#176b73]" size={32} /><p className="mt-4 font-semibold text-[#10223d]">{text}</p></div></main>; }
function formatDistance(meters: number) { return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`; }
function formatDuration(seconds: number) { const minutes = Math.max(1, Math.round(seconds / 60)); return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`; }
function shortDestination(label: string) { return label.split(",").slice(0, 2).join(","); }
function neighborhoodName(route: string) { return route.replace(/\s*\(\s*\d+\s+VIAJES?\s*\)\s*$/i, "").trim(); }
function neighborhoodTrips(route: string) { return Number(route.match(/\(\s*(\d+)\s+VIAJES?\s*\)/i)?.[1] || 1); }
function googleDirectionsUrl(result: RouteResult) { const params = new URLSearchParams({ api: "1", origin: `${result.origin.latitude},${result.origin.longitude}`, destination: `${result.destination.latitude},${result.destination.longitude}`, travelmode: "driving" }); return `https://www.google.com/maps/dir/?${params}`; }
function wazeDirectionsUrl(result: RouteResult) { const params = new URLSearchParams({ ll: `${result.destination.latitude},${result.destination.longitude}`, navigate: "yes", utm_source: "transporte_barranquilla" }); return `https://www.waze.com/ul?${params}`; }
