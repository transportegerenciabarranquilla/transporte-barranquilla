import { useState, type ReactNode } from "react";
import { Table2, X } from "lucide-react";
import type { ContractorRefusalTrend, RrRefusalSummary, RefusalCausePreventistaSummary, RefusalClientSummary, RefusalComSummary } from "./types";
import { formatDateLabel } from "./utils";

export function TopRefusalClientsTable({ data }: { data: RefusalClientSummary[] }) {
  const groups = [data.slice(0, 5), data.slice(5, 10), data.slice(10, 15), data.slice(15, 20)];

  return (
    <section className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2 text-[#10223d]">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[#10223d] text-white">
            <Table2 size={15} />
          </span>
          <h2 className="text-xs font-semibold">Top 20 clientes que mas rechazan</h2>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Por cajas reportadas</span>
      </div>
      {data.length ? (
        <div className="grid gap-2 p-3 lg:grid-cols-4">
          {groups.map((group, groupIndex) => (
            <div className="overflow-hidden rounded-md border border-slate-100" key={`client-group-${groupIndex}`}>
              <div className="divide-y divide-slate-100">
                {group.map((row, index) => {
                  const rank = groupIndex * 5 + index + 1;

                  return (
                    <div className="grid grid-cols-[28px_minmax(0,1fr)_78px] items-center gap-2 bg-slate-50 px-2 py-1.5 transition hover:bg-white" key={`${row.codigoCliente}-${row.causal}-${rank}`}>
                      <span className="grid h-6 w-6 place-items-center rounded-md bg-white text-[10px] font-bold text-slate-500 shadow-sm">{rank}</span>
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold leading-4 text-[#10223d]" title={row.nombreCliente}>{row.nombreCliente}</p>
                        <p className="truncate text-[9px] leading-3 text-slate-500" title={`${row.codigoCliente} - ${row.causal}`}>
                          {row.codigoCliente} - {row.causal}
                        </p>
                        <p className="truncate text-[9px] leading-3 text-slate-400">
                          Fecha modulo: {formatDateLabel(row.date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] font-bold leading-4 text-red-700">{row.reportadas.toLocaleString("es-CO")}</p>
                        <p className="text-[8px] font-semibold uppercase tracking-[0.06em] text-slate-400">cajas</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="Sin clientes con rechazo para este filtro." />
      )}
    </section>
  );
}

export function RrRefusalTop({ data }: { data: RrRefusalSummary[] }) {
  const [selected, setSelected] = useState<RrRefusalSummary | null>(null);
  const groups = [data.slice(0, 5), data.slice(5, 10), data.slice(10, 15), data.slice(15, 20)];
  if (!data.length) return <EmptyState text="No hay rechazos registrados en Modulación para este filtro." />;
  return <>
    <section className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2"><div className="flex items-center gap-2 text-[#10223d]"><span className="grid h-7 w-7 place-items-center rounded-md bg-[#10223d] text-white"><Table2 size={15} /></span><h2 className="text-xs font-semibold">Top 20 RR que más rechazos registran</h2></div><span className="text-[10px] font-semibold uppercase tracking-[.1em] text-slate-400">Presiona un RR para ver clientes</span></div>
      <div className="grid gap-2 p-3 lg:grid-cols-4">{groups.map((group, groupIndex) => <div className="overflow-hidden rounded-md border border-slate-100" key={`rr-group-${groupIndex}`}><div className="divide-y divide-slate-100">{group.map((row, index) => { const rank = groupIndex * 5 + index + 1; return <button className="grid w-full grid-cols-[28px_minmax(0,1fr)_64px] items-center gap-2 bg-slate-50 px-2 py-1.5 text-left transition hover:bg-white" key={`${row.contractor}-${row.rr}`} onClick={() => setSelected(row)} type="button"><span className="grid h-6 w-6 place-items-center rounded-md bg-white text-[10px] font-bold text-slate-500 shadow-sm">{rank}</span><div className="min-w-0"><p className="truncate text-[11px] font-semibold leading-4 text-[#10223d]" title={row.rr}>{row.rr}</p><p className="truncate text-[9px] leading-3 text-slate-500">{row.contractor} · {row.registros} rechazos</p><p className="truncate text-[9px] leading-3 text-slate-400">{row.clientes.length} clientes</p></div><div className="text-right"><p className="text-[11px] font-bold leading-4 text-red-700">{row.rechazadas.toLocaleString("es-CO")}</p><p className="text-[8px] font-semibold uppercase tracking-[.06em] text-slate-400">cajas</p></div></button>; })}</div></div>)}</div>
    </section>
    {selected ? <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }} role="dialog"><article className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 p-5"><div><p className="text-[10px] font-black uppercase tracking-[.15em] text-red-600">Detalle del RR · {selected.contractor}</p><h3 className="mt-1 text-xl font-black text-[#10223d]">{selected.rr}</h3><p className="mt-1 text-xs text-slate-500">Clientes ordenados por número de veces que rechazaron</p></div><button aria-label="Cerrar detalle" className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-100" onClick={() => setSelected(null)} type="button"><X size={17} /></button></header><div className="grid grid-cols-3 gap-2 border-b border-slate-100 p-4"><ModalTotal label="Clientes" value={selected.clientes.length} /><ModalTotal label="Rechazos" value={selected.registros} /><ModalTotal label="Cajas" value={selected.rechazadas} /></div><div className="max-h-[55vh] overflow-auto divide-y divide-slate-100">{selected.clientes.map((client, index) => <div className="grid grid-cols-[30px_minmax(0,1fr)_70px_90px] items-center gap-3 px-5 py-3" key={client.codigo}><span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-xs font-black text-slate-500">{index + 1}</span><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800" title={client.nombre}>{client.nombre}</p><p className="mt-0.5 truncate text-[9px] font-semibold text-slate-400">{client.codigo} · {client.fechas.sort().map(formatDateLabel).join(", ")}</p></div><div className="text-right"><p className="text-lg font-black text-violet-700">{client.veces}x</p><p className="text-[8px] font-bold uppercase text-slate-400">veces</p></div><div className="text-right"><p className="text-lg font-black text-red-700">{client.rechazadas.toLocaleString("es-CO")}</p><p className="text-[8px] font-bold uppercase text-slate-400">cajas</p></div></div>)}</div></article></div> : null}
  </>;
}

function ModalTotal({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-slate-50 p-3 text-center"><p className="text-lg font-black text-[#10223d]">{value.toLocaleString("es-CO")}</p><p className="text-[9px] font-bold uppercase text-slate-400">{label}</p></div>;
}

export function ContractorRefusalHistory({ data }: { data: ContractorRefusalTrend[] }) {
  const colors = ["#ef4444", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899"];
  const dates = Array.from(new Set(data.flatMap((row) => row.points.map((point) => point.date)))).sort();
  const width = Math.max(720, dates.length * 58); const height = 290; const left = 44; const right = 20; const top = 24; const bottom = 42;
  const maximum = 3;
  const x = (date: string) => left + (dates.indexOf(date) / Math.max(dates.length - 1, 1)) * (width - left - right);
  const y = (value: number) => top + (1 - value / maximum) * (height - top - bottom);
  return <section className="mb-4 overflow-hidden rounded-2xl border border-slate-800 bg-[#07111f] p-5 text-white shadow-xl"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-red-300">Histórico diario</p><h2 className="mt-1 text-lg font-black">Evolución del refusal por contratista</h2><p className="mt-1 text-xs text-slate-400">Cierre final diario: usa check-in por DT y, si no existe, el pendiente modulado</p></div><div className="flex flex-wrap gap-3">{data.map((row, index) => <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300" key={row.contractor}><i className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />{row.contractor}</span>)}</div></div>{dates.length ? <div className="mt-4 overflow-x-auto"><svg aria-label="Histórico diario de refusal por contratista" className="min-w-[680px]" role="img" style={{ minWidth: width }} viewBox={`0 0 ${width} ${height}`}>{[0, 1, 2, 3].map((value) => <g key={value}><line stroke="#1e293b" strokeDasharray="4 5" x1={left} x2={width-right} y1={y(value)} y2={y(value)} /><text fill="#64748b" fontSize="9" textAnchor="end" x={left-7} y={y(value)+3}>{value}%</text></g>)}{data.map((row, index) => { const color = colors[index % colors.length]; return <g key={row.contractor}><polyline fill="none" points={row.points.map((point) => `${x(point.date)},${y(Math.min(point.percentage, 3))}`).join(" ")} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />{row.points.map((point) => <circle cx={x(point.date)} cy={y(Math.min(point.percentage, 3))} fill="#07111f" key={point.date} r="4" stroke={color} strokeWidth="2"><title>{`${row.contractor}: ${point.percentage.toFixed(2)}% · ${point.pending} cajas final / ${point.dispatched} despachadas · ${formatDateLabel(point.date)}`}</title></circle>)}</g>; })}{dates.map((date, index) => index === 0 || index === dates.length - 1 || index % Math.max(1, Math.ceil(dates.length / 8)) === 0 ? <text fill="#64748b" fontSize="9" textAnchor="middle" x={x(date)} y={height-12} key={date}>{date.slice(5)}</text> : null)}</svg></div> : <div className="mt-4 grid h-56 place-items-center rounded-xl border border-dashed border-slate-700 text-sm text-slate-500">Sin datos de refusal para el período seleccionado.</div>}</section>;
}

export function Metric({
  icon,
  label,
  tone,
  value,
}: {
  icon: ReactNode;
  label: string;
  tone: "amber" | "blue" | "red";
  value: string;
}) {
  const toneClass = {
    amber: "bg-amber-50 text-amber-800",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-700",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`mb-3 grid h-10 w-10 place-items-center rounded-md ${toneClass}`}>{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}

export function MiniStat({ label, value, tone = "slate" }: { label: string; value: string; tone?: "green" | "red" | "slate" }) {
  const toneClass = {
    green: "text-[#0f7c58]",
    red: "text-red-700",
    slate: "text-[#10223d]",
  }[tone];

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold leading-none ${toneClass}`}>{value}</p>
    </div>
  );
}

export function ChartPanel({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[#10223d]">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-[#10223d] text-white">{icon}</span>
        <h2 className="text-xs font-semibold">{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function RefusalComBars({ data, emptyText }: { data: RefusalComSummary[]; emptyText: string }) {
  const max = Math.max(...data.map((item) => item.refusalFinal), 1);
  if (!data.length) return <EmptyState text={emptyText} />;

  return (
    <div className="space-y-1.5">
      {data.map((item, index) => (
        <div className="grid grid-cols-[minmax(112px,170px)_1fr_52px] items-center gap-2" key={`${item.contractor}-${item.label}`}>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold leading-4 text-[#10223d]" title={item.label}>{item.label}</p>
            <p className="truncate text-[9px] leading-3 text-slate-500" title={item.contractor}>{item.contractor}</p>
          </div>
          <div className="h-5 overflow-hidden rounded-sm bg-slate-100">
            <div
              className={index === 0 ? "h-5 rounded-sm bg-gradient-to-r from-red-600 to-orange-400" : "h-5 rounded-sm bg-red-500/65"}
              style={{ width: `${Math.max(6, (item.refusalFinal / max) * 100)}%` }}
              title={`${item.refusalFinal} cajas - ${item.refusal}%`}
            />
          </div>
          <span className="text-right text-[11px] font-bold text-red-700">{item.refusalFinal.toLocaleString("es-CO")}</span>
        </div>
      ))}
    </div>
  );
}

export function RefusalCausePreventistaBars({ data }: { data: RefusalCausePreventistaSummary[] }) {
  const max = Math.max(...data.map((item) => item.reportadas), 1);
  if (!data.length) return <EmptyState text="Sin causales por preventista para este filtro." />;

  return (
    <div className="space-y-1.5">
      {data.map((item, index) => {
        const managedWidth = item.reportadas ? (item.gestionadas / item.reportadas) * 100 : 0;
        const pendingWidth = item.reportadas ? (item.pendientes / item.reportadas) * 100 : 0;

        return (
          <div className="grid grid-cols-[minmax(108px,150px)_1fr_96px] items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 ring-1 ring-slate-100" key={item.causal}>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold leading-4 text-[#10223d]" title={item.causal}>{item.causal}</p>
              <p className="truncate text-[9px] leading-3 text-slate-400" title={item.contractor}>
                {item.contractor || "Sin contratista"} - {item.registros} registro{item.registros === 1 ? "" : "s"}
              </p>
            </div>
            <div className="h-4 overflow-hidden rounded-sm bg-white ring-1 ring-slate-200">
              <div className="flex h-4" style={{ width: `${Math.max(6, (item.reportadas / max) * 100)}%` }}>
                <div
                  className={index === 0 ? "h-4 bg-[#0f7c58]" : "h-4 bg-[#0f7c58]/70"}
                  style={{ width: `${managedWidth}%` }}
                  title={`${item.gestionadas.toLocaleString("es-CO")} gestionadas`}
                />
                <div
                  className={index === 0 ? "h-4 bg-red-600" : "h-4 bg-red-500/75"}
                  style={{ width: `${pendingWidth}%` }}
                  title={`${item.pendientes.toLocaleString("es-CO")} pendientes`}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1 text-right">
              <BarStat label="R" value={item.reportadas} />
              <BarStat label="G" tone="green" value={item.gestionadas} />
              <BarStat label="P" tone="red" value={item.pendientes} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BarStat({ label, tone = "slate", value }: { label: string; tone?: "green" | "red" | "slate"; value: number }) {
  const toneClass = {
    green: "text-[#0f7c58]",
    red: "text-red-700",
    slate: "text-[#10223d]",
  }[tone];

  return (
    <div>
      <p className={`text-[11px] font-bold leading-4 ${toneClass}`}>{value.toLocaleString("es-CO")}</p>
      <p className="text-[8px] font-semibold uppercase tracking-[0.06em] text-slate-400">{label}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
