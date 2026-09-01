"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, MapPinned, Navigation, Search, ShieldCheck } from "lucide-react";

type CriticalNeighborhood = { id: number; route: string; distributionCenter: string };

const ORIGIN = "Centro Distribucion Galapa - Bavaria, Galapa, Atlantico, Colombia";

export default function PublicCriticalRoutesPage() {
  const [neighborhoods, setNeighborhoods] = useState<CriticalNeighborhood[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/public/critical-routes", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudieron cargar los barrios.");
        setNeighborhoods(Array.isArray(body.neighborhoods) ? body.neighborhoods : []);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "No se pudieron cargar los barrios."))
      .finally(() => setLoading(false));
  }, []);

  const visibleNeighborhoods = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return neighborhoods;
    return neighborhoods.filter((item) => normalize(`${item.route} ${item.distributionCenter}`).includes(normalizedQuery));
  }, [neighborhoods, query]);

  return (
    <main className="min-h-screen bg-[#edf2f5] text-[#10223d]">
      <header className="border-b border-white/10 bg-[#0b2235] text-white shadow-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-8">
          <Link aria-label="Volver al inicio" className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 transition hover:bg-white/10" href="/">
            <ArrowLeft size={20} />
          </Link>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-300">Acceso público</p>
            <h1 className="text-xl font-semibold">Rutas críticas</h1>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-8">
        <article className="overflow-hidden rounded-2xl bg-gradient-to-r from-[#0b2235] via-[#123d57] to-[#176b73] p-6 text-white shadow-lg sm:p-8">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-100/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-cyan-200">
              <ShieldCheck size={14} /> Sin iniciar sesión
            </span>
            <h2 className="mt-4 text-2xl font-semibold sm:text-4xl">Elige un barrio y abre la ruta en tu app favorita</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">Las indicaciones parten desde el Centro de Distribución Galapa. Puedes abrirlas directamente en Google Maps o Waze.</p>
          </div>
          <label className="mt-6 flex max-w-2xl items-center gap-3 rounded-xl bg-white px-4 text-[#10223d] shadow-xl">
            <Search className="shrink-0 text-[#176b73]" size={20} />
            <input aria-label="Buscar barrio" className="h-14 min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:font-normal placeholder:text-slate-400" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar barrio o centro de distribución" value={query} />
          </label>
        </article>

        <article className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#176b73]">Selección rápida</p>
              <h2 className="mt-1 text-lg font-semibold">Barrios con rutas críticas</h2>
            </div>
            {!loading && !error ? <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-[#176b73]">{visibleNeighborhoods.length} barrios</span> : null}
          </div>

          {loading ? <Status text="Cargando barrios…" /> : null}
          {error ? <Status text={`${error} Ejecuta el archivo SQL actualizado en Supabase para habilitar la lectura pública.`} error /> : null}
          {!loading && !error && visibleNeighborhoods.length === 0 ? <Status text="No encontramos barrios con esa búsqueda." /> : null}

          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleNeighborhoods.map((item) => {
              const name = neighborhoodName(item.route);
              const destination = `${name}, Barranquilla, Atlantico, Colombia`;
              return (
                <article className="flex min-h-44 flex-col rounded-xl border border-slate-200 p-4 transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md" key={item.id}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-[#176b73]"><MapPinned size={20} /></span>
                    <div className="min-w-0">
                      <h3 className="font-bold">{name}</h3>
                      <p className="mt-1 text-xs text-slate-500">{neighborhoodTrips(item.route)} {neighborhoodTrips(item.route) === 1 ? "viaje" : "viajes"} · {item.distributionCenter || "CD Galapa"}</p>
                    </div>
                  </div>
                  <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
                    <a className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#0b2235] px-3 text-xs font-bold text-white transition hover:bg-[#163c58]" href={googleMapsUrl(destination)} rel="noreferrer" target="_blank"><Navigation size={14} />Google Maps</a>
                    <a className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#33ccff] px-3 text-xs font-bold text-[#10223d] transition hover:bg-[#64d9ff]" href={wazeUrl(destination)} rel="noreferrer" target="_blank"><Navigation size={14} />Waze</a>
                  </div>
                </article>
              );
            })}
          </div>
        </article>
      </section>
    </main>
  );
}

function Status({ text, error = false }: { text: string; error?: boolean }) {
  return <p className={`m-4 rounded-xl px-4 py-8 text-center text-sm font-semibold ${error ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-500"}`}>{text}</p>;
}

function neighborhoodName(route: string) { return route.replace(/\s*\(\s*\d+\s+VIAJES?\s*\)\s*$/i, "").trim(); }
function neighborhoodTrips(route: string) { return Number(route.match(/\(\s*(\d+)\s+VIAJES?\s*\)/i)?.[1] || 1); }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function googleMapsUrl(destination: string) { return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", origin: ORIGIN, destination, travelmode: "driving" })}`; }
function wazeUrl(destination: string) { return `https://www.waze.com/ul?${new URLSearchParams({ q: destination, navigate: "yes", utm_source: "transporte_barranquilla" })}`; }
