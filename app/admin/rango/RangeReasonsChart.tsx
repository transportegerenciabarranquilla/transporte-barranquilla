import { RANGE_REASONS } from "../../lib/rangeReasons";
import { summarizeRangeReasons } from "../../lib/rangeReasonSummary";

const COLORS = ["#0284c7", "#059669", "#d97706", "#7c3aed"];

export default function RangeReasonsChart({ rows }: { rows: Parameters<typeof summarizeRangeReasons>[0] }) {
  const groups = summarizeRangeReasons(rows);
  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const unclassified = groups.reduce((sum, group) => sum + group.unclassified, 0);
  const maximum = Math.max(1, ...groups.flatMap((group) => group.counts));
  const tick = Math.max(1, Math.ceil(maximum / 4));
  const scale = tick * 4;

  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="range-reasons-title">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-slate-50/60 px-5 py-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-700">Motivos registrados</p>
        <h3 id="range-reasons-title" className="mt-1 text-lg font-semibold text-[#10223d]">Fuera de rango por contratista</h3>
        <p className="mt-1 text-xs text-slate-500">Cantidad de visitas por motivo, según los filtros de fecha, contratista y DT.</p>
      </div>
      <div className="flex gap-2 text-xs">
        <span className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 font-semibold text-emerald-800">{(total - unclassified).toLocaleString("es-CO")} con motivo</span>
        <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-600">{unclassified.toLocaleString("es-CO")} sin clasificar</span>
      </div>
    </header>
    <div className="p-5">
      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2">
        {RANGE_REASONS.map((reason, index) => <span key={reason} className="inline-flex items-center gap-2 text-xs font-medium text-slate-600"><i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLORS[index] }} />{reason}</span>)}
      </div>
      {!groups.length ? <p className="rounded-lg bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">No hay visitas fuera de rango para los filtros seleccionados.</p> : <>
        {total === unclassified && <p className="mb-5 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800">Aún no hay visitas clasificadas con estos cuatro motivos. Las barras aparecerán al registrar los motivos en Rango.</p>}
        <p className="mb-3 text-xs font-medium text-slate-500">Visitas fuera de rango</p>
        <div className="overflow-x-auto pb-2">
          <div style={{ minWidth: Math.max(540, groups.length * 185) }}>
            <div className="relative ml-12 h-72 border-b border-l border-slate-400 sm:h-80">
              {[0, 1, 2, 3, 4].map((value) => <div key={value} className="pointer-events-none absolute inset-x-0 border-t border-slate-100" style={{ bottom: `${value * 25}%` }} aria-hidden="true">
                <span className="absolute right-full -translate-y-1/2 pr-3 text-xs tabular-nums text-slate-500">{(value * tick).toLocaleString("es-CO")}</span>
              </div>)}
              <div className="absolute inset-0 grid items-end" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
                {groups.map((group) => <div key={group.contractor} className="flex h-full items-end justify-center px-4">
                  {RANGE_REASONS.map((reason, index) => <div key={reason}
                    className="relative w-1/4 max-w-12 transition-[height] duration-300 motion-reduce:transition-none"
                    style={{ height: `${group.counts[index] / scale * 100}%`, backgroundColor: COLORS[index] }}
                    role="img" aria-label={`${group.contractor}, ${reason}: ${group.counts[index]} visitas`}
                    title={`${group.contractor} ? ${reason}: ${group.counts[index]} visitas`}>
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold tabular-nums text-slate-700">{group.counts[index].toLocaleString("es-CO")}</span>
                  </div>)}
                </div>)}
              </div>
            </div>
            <div className="ml-12 grid" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
              {groups.map((group) => <div key={group.contractor} className="px-3 pt-3 text-center">
                <h4 className="text-sm font-semibold text-[#10223d]">{group.contractor}</h4>
                <p className="mt-1 text-[11px] text-slate-500">{group.total.toLocaleString("es-CO")} fuera de rango</p>
                {group.unclassified > 0 && <p className="mt-1 text-[11px] text-amber-700">{group.unclassified.toLocaleString("es-CO")} sin clasificar</p>}
              </div>)}
            </div>
          </div>
        </div>
        <p className="mt-5 text-[11px] text-slate-500">Cada cliente se cuenta una vez por fecha, DT y contratista. «Sin clasificar» incluye visitas sin motivo o con un motivo diferente a los cuatro indicados.</p>
      </>}
    </div>
  </section>;
}
