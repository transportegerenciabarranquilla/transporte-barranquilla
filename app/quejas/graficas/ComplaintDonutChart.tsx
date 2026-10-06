import ComplaintChartCard from "./ComplaintChartCard";

type Slice = { label: string; count: number; color?: string; onClick?: () => void };
const palette = ["#2563eb", "#0d9488", "#7c3aed", "#0284c7", "#475569", "#64748b"];
const format = (value: number) => value.toLocaleString("es-CO");

export default function ComplaintDonutChart({ title, description, values, centerValue, centerLabel, emptyMessage, embedded = false }: { title: string; description: string; values: Slice[]; centerValue?: string; centerLabel?: string; emptyMessage?: string; embedded?: boolean }) {
  const total = values.reduce((sum, value) => sum + value.count, 0);
  // Keep small contractor slices readable and account for every complaint.
  const slices = values.length > 6 ? [...values.slice(0, 5), { label: "Otros transportistas", count: values.slice(5).reduce((sum, value) => sum + value.count, 0) }] : values;
  let offset = 0;
  const segments = slices.map((slice, index) => {
    const start = offset;
    offset += total ? slice.count / total * 100 : 0;
    return `${slice.color || palette[index % palette.length]} ${start}% ${offset}%`;
  });
  const contents = <>
    <div className={`flex flex-col items-center gap-5 ${embedded ? "px-1 pb-1 pt-4" : "flex-1 justify-center p-3 min-[380px]:flex-row"}`}>
      <div role="img" title={description} aria-label={`${title}: ${slices.map(slice => `${slice.label}, ${format(slice.count)}`).join("; ")}. Total: ${format(total)}. ${description}`} className="grid h-40 w-40 shrink-0 place-items-center rounded-full shadow-[0_8px_24px_rgba(16,34,61,0.08)] ring-8 ring-slate-50" style={{ background: total ? `conic-gradient(${segments.join(", ")})` : "#e2e8f0" }}>
        <div className="grid h-32 w-32 content-center rounded-full bg-white px-2 text-center"><strong className="text-3xl font-extrabold tracking-tight tabular-nums">{centerValue ?? format(total)}</strong><span className="mx-auto mt-1 max-w-24 text-[11px] font-medium leading-4 text-slate-500">{centerLabel ?? "Quejas en total"}</span></div>
      </div>
      <ul className="w-full min-w-0 space-y-2">{slices.map((slice, index) => <li key={slice.label} className="min-w-0">
        {slice.onClick ? <button type="button" onClick={slice.onClick} aria-haspopup="dialog" className="flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-blue-600">
          <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color || palette[index % palette.length] }} />
          <span className="min-w-0 flex-1 break-words text-xs font-semibold text-slate-700">{slice.label} · Ver detalle</span>
          <span className="flex shrink-0 items-center gap-2 text-right"><strong className="text-sm tabular-nums">{format(slice.count)}</strong><span className="min-w-12 rounded-md bg-white px-1.5 py-1 text-[11px] font-semibold tabular-nums text-slate-600">{(total ? slice.count / total * 100 : 0).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%</span></span>
        </button> : <div className="flex min-h-11 items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color || palette[index % palette.length] }} />
        <span className="min-w-0 flex-1 break-words text-xs font-semibold text-slate-700">{slice.label}</span>
        <span className="flex shrink-0 items-center gap-2 text-right"><strong className="text-sm tabular-nums">{format(slice.count)}</strong><span className="min-w-12 rounded-md bg-white px-1.5 py-1 text-[11px] font-semibold tabular-nums text-slate-600">{(total ? slice.count / total * 100 : 0).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%</span></span>
        </div>}
      </li>)}</ul>
    </div>
    {!total && <p className="px-3 pb-3 text-sm text-slate-500">{emptyMessage ?? "No hay quejas con los filtros seleccionados."}</p>}
  </>;
  return embedded ? <section className="flex min-w-0 flex-col px-4 py-5 sm:px-5">
    <h3 className="text-center text-sm font-bold tracking-tight">{title}</h3>
    {contents}
  </section> : <ComplaintChartCard title={title} circular>{contents}</ComplaintChartCard>;
}
