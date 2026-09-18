"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { LocateFixed, MapPinned } from "lucide-react";
import type { CoordinateRecord } from "../../lib/coordinateRecords";
import "leaflet/dist/leaflet.css";

export default function CoordinateHeatMap({ rows, selectedId, focusRequest = 0 }: { rows: CoordinateRecord[]; selectedId: number | null; focusRequest?: number }) {
  const element = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const framed = useRef("");

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    void import("leaflet").then((L) => {
      if (cancelled || !element.current) return;
      const map = L.map(element.current, { zoomControl: true, scrollWheelZoom: false }).setView([10.98, -74.82], 11);
      mapRef.current = map;
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles © Esri", maxZoom: 19 })
        .on("tileerror", () => { if (!cancelled) setMapError("No se pudo cargar el mapa base. Comprueba la conexión."); })
        .on("tileload", () => { if (!cancelled) setMapError(""); }).addTo(map);
      markerRef.current = L.layerGroup().addTo(map);
      observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(element.current);
      setReady(true);
    }).catch(() => { if (!cancelled) setMapError("No se pudo iniciar el mapa."); });
    return () => { cancelled = true; observer?.disconnect(); mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !canvas.current) return;
    const map = mapRef.current;
    const surface = canvas.current;
    let frame = 0;
    const draw = () => {
      const size = map.getSize();
      if (!size.x || !size.y) return;
      surface.width = size.x;
      surface.height = size.y;
      const ctx = surface.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      // Gaussian-like kernels accumulate alpha: overlapping locations produce
      // hotter colors. Every filtered record has the same weight.
      rows.forEach((row) => {
        const point = map.latLngToContainerPoint([row.latitud, row.longitud]);
        const radius = 35;
        if (point.x < -radius || point.y < -radius || point.x > size.x + radius || point.y > size.y + radius) return;
        const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
        gradient.addColorStop(0, "rgba(0,0,0,0.28)");
        gradient.addColorStop(0.45, "rgba(0,0,0,0.12)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
      });
      const pixels = ctx.getImageData(0, 0, size.x, size.y);
      const stops = [[37, 99, 235], [6, 182, 212], [52, 211, 153], [250, 204, 21], [249, 115, 22], [220, 38, 38]];
      for (let i = 0; i < pixels.data.length; i += 4) {
        const alpha = pixels.data[i + 3];
        if (!alpha) continue;
        const level = alpha / 255 * (stops.length - 1);
        const low = Math.floor(level), high = Math.min(stops.length - 1, low + 1), fraction = level - low;
        for (let channel = 0; channel < 3; channel++) pixels.data[i + channel] = Math.round(stops[low][channel] * (1 - fraction) + stops[high][channel] * fraction);
        pixels.data[i + 3] = Math.min(210, Math.round(alpha * 2));
      }
      ctx.putImageData(pixels, 0, 0);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
    const signature = rows.map((row) => `${row.id}:${row.latitud}:${row.longitud}`).join("|");
    if (rows.length && framed.current !== signature) {
      map.fitBounds(rows.map((row) => [row.latitud, row.longitud] as [number, number]), { padding: [45, 45], maxZoom: 14, animate: false });
    }
    framed.current = signature;
    map.on("move zoom resize", schedule);
    schedule();
    return () => { cancelAnimationFrame(frame); map.off("move zoom resize", schedule); };
  }, [rows, ready]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    let cancelled = false;
    markerRef.current?.clearLayers();
    const row = rows.find((item) => item.id === selectedId);
    if (row) void import("leaflet").then((L) => {
      if (cancelled || !mapRef.current || !markerRef.current) return;
      const popup = document.createElement("div");
      popup.textContent = `${row.ruta} · ${row.codigoCliente || "Sin código"} · ${row.nombreRr || row.tipo}`;
      const marker = L.circleMarker([row.latitud, row.longitud], { radius: 9, color: "#fff", weight: 3, fillColor: "#7c3aed", fillOpacity: 1 }).bindPopup(popup).addTo(markerRef.current);
      mapRef.current.setView([row.latitud, row.longitud], Math.max(14, mapRef.current.getZoom()));
      marker.openPopup();
    });
    return () => { cancelled = true; };
  }, [rows, selectedId, ready, focusRequest]);

  return <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3"><div><h2 className="flex items-center gap-2 font-bold"><MapPinned size={18} className="text-violet-600" />Mapa de calor</h2><p className="mt-1 text-xs text-slate-500">Concentración de las {rows.length} ubicaciones filtradas</p></div><button type="button" title="Ver todas las ubicaciones" aria-label="Centrar todas las ubicaciones" disabled={!rows.length || !ready} onClick={() => mapRef.current?.fitBounds(rows.map((row) => [row.latitud, row.longitud] as [number, number]), { padding: [45, 45], maxZoom: 14 })} className="rounded-lg border border-slate-200 p-2 text-violet-700 disabled:opacity-40"><LocateFixed size={18} /></button></header>
    <div className="relative isolate min-h-[380px] flex-1 bg-slate-100 lg:min-h-[460px]" role="region" aria-label="Mapa de concentración de ubicaciones">
      <div ref={element} className="absolute inset-0 z-0" />
      <canvas aria-hidden="true" ref={canvas} className="pointer-events-none absolute inset-0 z-[400] h-full w-full" />
      {mapError || !ready || !rows.length ? <p className="pointer-events-none absolute left-14 right-4 top-4 z-[500] rounded-lg bg-white/95 px-3 py-2 text-center text-xs font-semibold shadow">{mapError || (!ready ? "Cargando mapa..." : "No hay ubicaciones en este rango.")}</p> : null}
    </div>
    <footer className="border-t border-slate-100 px-4 py-3"><div className="flex items-center gap-3 text-[10px] font-bold text-slate-500"><span>Menor concentración</span><div className="h-2 flex-1 rounded-full" style={{ background: "linear-gradient(to right, #2563eb, #06b6d4, #34d399, #facc15, #f97316, #dc2626)" }} /><span>Mayor</span></div><p className="mt-2 text-[10px] text-slate-500">El color representa cercanía y cantidad de registros, no nivel de riesgo.</p></footer>
  </section>;
}
