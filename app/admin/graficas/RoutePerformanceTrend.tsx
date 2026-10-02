import { buildDailyPerformanceTrend, type DailyPerformancePoint } from "../../lib/routePerformanceTrend";
import type { MatchedRoutePerformance } from "../../lib/routePerformanceImport";

const WIDTH = 960;
const HEIGHT = 250;
const LEFT = 48;
const RIGHT = 18;
const TOP = 16;
const BOTTOM = 38;
const format = (value: number) => value.toLocaleString("es-CO", { maximumFractionDigits: 2 });
const shortDate = (date: string) => date.slice(8, 10) + "/" + date.slice(5, 7);
const dateTime = (date: string) => Date.parse(`${date}T12:00:00Z`);

function seriesPath(points: DailyPerformancePoint[], field: "adherenceKmPercent" | "rangePercent", x: (date: string) => number) {
  let drawing = false;
  return points.map((point) => {
    const value = point[field];
    if (value === null) {
      drawing = false;
      return "";
    }
    const command = drawing ? "L" : "M";
    drawing = true;
    return `${command}${x(point.date).toFixed(1)} ${(TOP + (100 - value) / 100 * (HEIGHT - TOP - BOTTOM)).toFixed(1)}`;
  }).join(" ");
}

export default function RoutePerformanceTrend({ rows }: { rows: MatchedRoutePerformance[] }) {
  const points = buildDailyPerformanceTrend(rows);
  const first = points[0] ? dateTime(points[0].date) : 0;
  const last = points.length ? dateTime(points[points.length - 1].date) : first;
  const x = (date: string) => last === first ? (LEFT + WIDTH - RIGHT) / 2 : LEFT + (dateTime(date) - first) / (last - first) * (WIDTH - LEFT - RIGHT);
  const y = (value: number) => TOP + (100 - value) / 100 * (HEIGHT - TOP - BOTTOM);
  const labelStep = Math.max(1, Math.ceil(points.length / 6));

  return <section aria-label="Tendencia diaria de adherencia y entrega en rango" className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-700">Evolución diaria</p><h3 className="mt-1 text-base font-bold text-[#10223d]">Tendencia por día</h3><p className="mt-1 text-xs text-slate-500">Por fecha: promedio ADH_KM y clientes visitados / planeados. Filtros actuales</p></div><div className="flex flex-wrap gap-3 text-xs font-semibold"><span className="flex items-center gap-1.5 text-violet-700"><i className="h-2.5 w-2.5 rounded-full bg-violet-500" />Adherencia km</span><span className="flex items-center gap-1.5 text-emerald-700"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Rango MyGeotab</span></div></div>
    {points.some((point) => point.adherenceKmPercent !== null || point.rangePercent !== null) ? <div className="mt-4 overflow-x-auto"><svg className="min-w-[640px] w-full" role="img" aria-label="Líneas de porcentaje diario de adherencia a kilómetros y entrega en rango MyGeotab" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      {[0, 25, 50, 75, 100].map((tick) => <g key={tick}><line stroke="#e2e8f0" strokeDasharray="4 5" x1={LEFT} x2={WIDTH - RIGHT} y1={y(tick)} y2={y(tick)} /><text fill="#64748b" fontSize="11" textAnchor="end" x={LEFT - 8} y={y(tick) + 4}>{tick}%</text></g>)}
      <path d={seriesPath(points, "adherenceKmPercent", x)} fill="none" stroke="#8b5cf6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      <path d={seriesPath(points, "rangePercent", x)} fill="none" stroke="#10b981" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      {points.map((point, index) => <g key={point.date}>
        {(index % labelStep === 0 || index === points.length - 1) && <text fill="#64748b" fontSize="10" textAnchor="middle" x={x(point.date)} y={HEIGHT - 9}>{shortDate(point.date)}</text>}
        {(["adherenceKmPercent", "rangePercent"] as const).map((field) => point[field] === null ? null : <circle cx={x(point.date)} cy={y(point[field])} fill={field === "adherenceKmPercent" ? "#8b5cf6" : "#10b981"} key={field} r="3"><title>{point.date} · {field === "adherenceKmPercent" ? "Adherencia" : "Rango MyGeotab"}: {format(point[field])}% · {point.trips} viajes</title></circle>)}
      </g>)}
    </svg></div> : <p className="mt-4 rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">No hay porcentajes diarios para estos filtros.</p>}
  </section>;
}
