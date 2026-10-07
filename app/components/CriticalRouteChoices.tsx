"use client";

type RouteChoice = { distanceMeters: number; durationSeconds: number; direction?: string | null };

export default function CriticalRouteChoices({ routes, selectedIndex, onSelect }: { routes: RouteChoice[]; selectedIndex: number; onSelect: (index: number) => void }) {
  if (!routes.length) return null;
  return <div className="absolute bottom-4 left-4 right-4 z-[500] max-h-[40vh] max-w-sm overflow-y-auto rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:right-auto" aria-label="Opciones de ruta">
    <p className="text-xs font-black uppercase tracking-wide text-[#10223d]">Opciones de ruta</p>
    <div className="mt-2 grid gap-2">{routes.map((route, index) => <button
      aria-pressed={selectedIndex === index}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-xs transition ${selectedIndex === index ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"}`}
      key={index}
      onClick={() => onSelect(index)}
      type="button"
    ><span className="font-bold">{index === 0 ? "Ruta recomendada" : `Alternativa ${index}${route.direction ? ` · ${route.direction}` : ""}`}</span><span className="whitespace-nowrap tabular-nums">{(route.distanceMeters / 1000).toFixed(1)} km · {Math.max(1, Math.round(route.durationSeconds / 60))} min</span></button>)}</div>
    {routes.length < 4 ? <p className="mt-2 text-[11px] text-slate-500">Se encontraron {routes.length} recorridos vehiculares distintos para este destino.</p> : null}
  </div>;
}
