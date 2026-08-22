import { useState, type ReactNode } from "react";
import { Table2, X } from "lucide-react";
import type { AdminRefusalComRow, ContractorRefusalTrend, RrRefusalSummary, RefusalCausePreventistaSummary, RefusalClientSummary, RefusalComSummary } from "./types";
import { formatDateLabel } from "./utils";

export function TopRefusalClientsTable({
  causales,
  data,
  onCausalChange,
  selectedCausal,
}: {
  causales: string[];
  data: RefusalClientSummary[];
  onCausalChange: (causal: string) => void;
  selectedCausal: string;
}) {
  const groups = [data.slice(0, 5), data.slice(5, 10), data.slice(10, 15), data.slice(15, 20)];

  return (
    <section className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2 text-[#10223d]">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[#10223d] text-white">
            <Table2 size={15} />
          </span>
          <h2 className="text-xs font-semibold">Top 20 clientes que mas rechazan</h2>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-500" htmlFor="top-client-causal">Causal</label>
          <select
            className="h-8 max-w-56 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold text-[#10223d] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            id="top-client-causal"
            onChange={(event) => onCausalChange(event.target.value)}
            value={selectedCausal}
          >
            <option value="Todas">Todas las causales</option>
            {causales.map((causal) => <option key={causal} value={causal}>{causal}</option>)}
          </select>
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 sm:inline">Por rechazo final</span>
        </div>
      </div>
      {data.length ? (
        <div className="grid gap-2 p-3 lg:grid-cols-4">
          {groups.map((group, groupIndex) => (
            <div className="overflow-hidden rounded-md border border-slate-100" key={`client-group-${groupIndex}`}>
              <div className="divide-y divide-slate-100">
                {group.map((row, index) => {
                  const rank = groupIndex * 5 + index + 1;

                  return (
                    <div className="grid grid-cols-[28px_minmax(0,1fr)_94px] items-center gap-2 bg-slate-50 px-2 py-1.5 transition hover:bg-white" key={`${row.codigoCliente}-${rank}`}>
                      <span className="grid h-6 w-6 place-items-center rounded-md bg-white text-[10px] font-bold text-slate-500 shadow-sm">{rank}</span>
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold leading-4 text-[#10223d]" title={row.nombreCliente}>{row.nombreCliente}</p>
                        <p className="truncate text-[9px] leading-3 text-slate-500" title={`${row.codigoCliente} - ${row.causal}`}>
                          {row.codigoCliente} - {row.causal}
                        </p>
                        <p className="truncate text-[9px] leading-3 text-slate-400">
                          Fecha modulo: {formatDateLabel(row.date)}
                        </p>
                        {row.gestionadas > 0 ? <p className="truncate text-[8px] font-semibold leading-3 text-emerald-600">{row.gestionadas.toLocaleString("es-CO")} cajas reubicadas</p> : null}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-right">
                        <div>
                          <p className="text-[11px] font-bold leading-4 text-violet-700">{row.registros}x</p>
                          <p className="text-[8px] font-semibold uppercase tracking-[0.04em] text-slate-400">veces</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-bold leading-4 text-red-700">{row.pendientes.toLocaleString("es-CO")}</p>
                          <p className="text-[8px] font-semibold uppercase tracking-[0.04em] text-slate-400">final</p>
                        </div>
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

const REFUSAL_RANGES = [
  { label: "1 a 15 cajas", className: "bg-amber-400", min: 1, max: 15 },
  { label: "16 a 40 cajas", className: "bg-orange-500", min: 16, max: 40 },
  { label: "41 a 100 cajas", className: "bg-red-600", min: 41, max: 100 },
  { label: ">100 cajas", className: "bg-neutral-800", min: 101, max: Number.POSITIVE_INFINITY },
] as const;

export function RefusalClientsByRange({ data, rows }: { data: RefusalClientSummary[]; rows: AdminRefusalComRow[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const dateRows = rows.filter((row) => (!rangeFrom || row.date >= rangeFrom) && (!rangeTo || row.date <= rangeTo));
  const dateClientTotals = new Map<string, RefusalClientSummary>();
  dateRows.forEach((row) => {
    const code = row.codigoCliente?.trim() || "Sin código";
    const name = row.nombreCliente?.trim() || "Cliente sin nombre";
    const key = `${code}:${name.toLocaleLowerCase("es")}`;
    const current = dateClientTotals.get(key) || { causal: row.causal || "Sin causal", codigoCliente: code, contractor: row.contractor || "Sin contratista", date: row.date, gestionadas: 0, nombreCliente: name, pendientes: 0, registros: 0, reportadas: 0 };
    current.gestionadas += Number(row.gestionadas || 0);
    current.pendientes += Number.isFinite(Number(row.refusalFinal)) ? Number(row.refusalFinal) : Math.max(Number(row.reportadas || 0) - Number(row.gestionadas || 0), 0);
    current.reportadas += Number(row.reportadas || 0);
    current.registros += 1;
    dateClientTotals.set(key, current);
  });
  const rangedData = dateRows.length || rangeFrom || rangeTo ? Array.from(dateClientTotals.values()) : data;
  const ranges = REFUSAL_RANGES.map((range) => ({
    ...range,
    clients: rangedData.filter((client) => client.pendientes >= range.min && client.pendientes <= range.max),
  }));
  const maxRangeClients = Math.max(...ranges.map((range) => range.clients.length), 1);
  const selected = selectedIndex === null ? null : ranges[selectedIndex];
  const chartClients = selected ? [...selected.clients].sort((a, b) => b.registros - a.registros || b.pendientes - a.pendientes).slice(0, 10) : [];
  const maxRejections = Math.max(...chartClients.map((client) => client.registros), 1);
  const causeTotals = new Map<string, number>();
  dateRows.forEach((row) => {
    const cause = row.causal?.trim() || "Sin causal";
    causeTotals.set(cause, (causeTotals.get(cause) || 0) + 1);
  });
  const chartCauses = Array.from(causeTotals, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  const maxCauseCount = Math.max(...chartCauses.map((cause) => cause.count), 1);

  return <>
    <section className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2 text-[#10223d]"><span className="grid h-7 w-7 place-items-center rounded-md bg-[#10223d] text-white"><Table2 size={15} /></span><h2 className="text-xs font-semibold">Clientes por cajas rechazadas</h2></div>
        <div className="flex flex-wrap items-end gap-2"><label className="text-[9px] font-bold uppercase text-slate-500">Desde<input className="mt-1 block h-8 rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-700" onChange={(event) => setRangeFrom(event.target.value)} type="date" value={rangeFrom} /></label><label className="text-[9px] font-bold uppercase text-slate-500">Hasta<input className="mt-1 block h-8 rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-700" onChange={(event) => setRangeTo(event.target.value)} type="date" value={rangeTo} /></label>{rangeFrom || rangeTo ? <button className="h-8 rounded-md border border-slate-200 bg-white px-3 text-[9px] font-bold uppercase text-slate-500 hover:bg-slate-100" onClick={() => { setRangeFrom(""); setRangeTo(""); }} type="button">Limpiar</button> : null}</div>
      </div>
      <div className="p-4">
        <p className="mb-2 text-right text-[9px] font-semibold uppercase tracking-[.1em] text-slate-400">Presiona una barra para ver clientes</p>
        <div className="grid h-64 grid-cols-4 items-end gap-3 rounded-lg border border-slate-100 bg-gradient-to-b from-slate-50 to-white px-3 pb-3 pt-7 sm:gap-6 sm:px-8">
          {ranges.map((range, index) => <button className="flex h-full min-w-0 flex-col items-center justify-end gap-2" key={range.label} onClick={() => setSelectedIndex(index)} type="button"><span className="text-sm font-black text-[#10223d]">{range.clients.length}</span><span className={`w-full max-w-24 rounded-t-md shadow-md transition hover:brightness-110 ${range.className}`} style={{ height: `${Math.max(8, range.clients.length / maxRangeClients * 170)}px` }} /><span className="min-h-7 text-center text-[9px] font-black uppercase leading-3 text-slate-600 sm:text-[10px]">{range.label}</span></button>)}
        </div>
      </div>
    </section>
    <section className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2 text-[#10223d]"><span className="grid h-7 w-7 place-items-center rounded-md bg-orange-500 text-white"><Table2 size={15} /></span><h2 className="text-xs font-semibold">Rechazos por causal</h2></div>
        <span className="text-[10px] font-semibold uppercase tracking-[.1em] text-slate-400">Cantidad de registros</span>
      </div>
      <div className="p-4">
        {chartCauses.length ? <div className="space-y-2">{chartCauses.map((cause) => <div className="grid grid-cols-[minmax(110px,190px)_1fr_42px] items-center gap-3" key={cause.label}><span className="truncate text-[11px] font-semibold text-slate-600" title={cause.label}>{cause.label}</span><div className="h-6 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-gradient-to-r from-orange-500 to-amber-300" style={{ width: `${Math.max(5, cause.count / maxCauseCount * 100)}%` }} /></div><span className="text-right text-xs font-black text-orange-700">{cause.count}x</span></div>)}</div> : <EmptyState text="No hay causales para graficar con estos filtros." />}
      </div>
    </section>
    {selected ? <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedIndex(null); }} role="dialog"><article className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"><header className={`${selected.className} flex items-start justify-between gap-4 p-5 text-white`}><div><p className="text-[10px] font-black uppercase tracking-[.15em] text-white/75">Clientes que rechazan</p><h3 className="mt-1 text-xl font-black">{selected.label}</h3><p className="mt-1 text-xs text-white/80">{selected.clients.length} cliente{selected.clients.length === 1 ? "" : "s"} en este rango</p></div><button aria-label="Cerrar detalle" className="grid h-9 w-9 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30" onClick={() => setSelectedIndex(null)} type="button"><X size={17} /></button></header><div className="max-h-[72vh] overflow-auto"><div className="grid border-b border-slate-100 lg:grid-cols-2"><div className="border-b border-slate-100 p-5 lg:border-b-0 lg:border-r"><div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs font-black text-[#10223d]">Veces que han rechazado</p><p className="text-[9px] font-semibold text-slate-400">Top 10 clientes del rango</p></div><span className="text-[9px] font-bold uppercase text-violet-600">Rechazos</span></div>{chartClients.length ? <div className="space-y-2">{chartClients.map((client) => <div className="grid grid-cols-[minmax(80px,130px)_1fr_34px] items-center gap-2" key={`chart-${client.codigoCliente}`}><span className="truncate text-[10px] font-semibold text-slate-600" title={client.nombreCliente}>{client.nombreCliente}</span><div className="h-5 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-gradient-to-r from-violet-600 to-fuchsia-400" style={{ width: `${Math.max(5, client.registros / maxRejections * 100)}%` }} /></div><span className="text-right text-xs font-black text-violet-700">{client.registros}x</span></div>)}</div> : <p className="py-5 text-center text-xs text-slate-400">No hay datos para graficar.</p>}</div><div className="p-5"><div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs font-black text-[#10223d]">Rechazos por causal</p><p className="text-[9px] font-semibold text-slate-400">Top 10 causales del rango</p></div><span className="text-[9px] font-bold uppercase text-orange-600">Registros</span></div>{chartCauses.length ? <div className="space-y-2">{chartCauses.map((cause) => <div className="grid grid-cols-[minmax(80px,130px)_1fr_34px] items-center gap-2" key={cause.label}><span className="truncate text-[10px] font-semibold text-slate-600" title={cause.label}>{cause.label}</span><div className="h-5 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-gradient-to-r from-orange-500 to-amber-300" style={{ width: `${Math.max(5, cause.count / maxCauseCount * 100)}%` }} /></div><span className="text-right text-xs font-black text-orange-700">{cause.count}x</span></div>)}</div> : <p className="py-5 text-center text-xs text-slate-400">No hay causales para graficar.</p>}</div></div><div className="divide-y divide-slate-100">{selected.clients.length ? selected.clients.map((client, index) => <div className="grid grid-cols-[30px_minmax(0,1fr)_70px_90px] items-center gap-3 px-5 py-3" key={`${client.codigoCliente}-${index}`}><span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-xs font-black text-slate-500">{index + 1}</span><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800" title={client.nombreCliente}>{client.nombreCliente}</p><p className="mt-0.5 truncate text-[9px] font-semibold text-slate-400">{client.codigoCliente} · {client.contractor} · {client.causal}</p></div><div className="text-right"><p className="text-lg font-black text-violet-700">{client.registros}x</p><p className="text-[8px] font-bold uppercase text-slate-400">veces</p></div><div className="text-right"><p className="text-lg font-black text-red-700">{client.pendientes.toLocaleString("es-CO")}</p><p className="text-[8px] font-bold uppercase text-slate-400">cajas finales</p></div></div>) : <EmptyState text="No hay clientes en este rango." />}</div></div></article></div> : null}
  </>;
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
  const colors = ["#16a66a", "#c88a08", "#2f7dd1", "#159bb5", "#d65b91"];
  const gradientColors = [
    { light: "#79e2b4", dark: "#0b7c4c" },
    { light: "#ffd86b", dark: "#a66500" },
    { light: "#83c5ff", dark: "#1559aa" },
    { light: "#73dceb", dark: "#08788f" },
    { light: "#f4a1c7", dark: "#ad356b" },
  ];
  const dates = Array.from(new Set(data.flatMap((row) => row.points.map((point) => point.date)))).sort();
  const seriesCount = Math.max(data.length, 1);
  const groupWidth = Math.max(86, seriesCount * 24 + 18);
  const width = Math.max(720, dates.length * groupWidth);
  const height = 310; const left = 44; const right = 20; const top = 30; const bottom = 44;
  const maximum = 3;
  const plotWidth = width - left - right;
  const dateCenter = (date: string) => left + (dates.indexOf(date) + 0.5) * (plotWidth / Math.max(dates.length, 1));
  const barWidth = Math.min(18, Math.max(9, (groupWidth - 16) / seriesCount));
  const barX = (date: string, seriesIndex: number) => dateCenter(date) - (barWidth * seriesCount) / 2 + seriesIndex * barWidth;
  const y = (value: number) => top + (1 - value / maximum) * (height - top - bottom);
  return <section className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-lg shadow-slate-200/60"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-rose-500">Histórico diario</p><h2 className="mt-1 text-lg font-black text-[#10223d]">Refusal diario por contratista</h2><p className="mt-1 text-xs text-slate-500">Porcentaje final diario: usa check-in por DT y, si no existe, el pendiente modulado</p></div><div className="flex flex-wrap gap-3">{data.map((row, index) => <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700" key={row.contractor}><i className="h-3 w-3 rounded-full shadow-sm ring-2 ring-white" style={{ backgroundColor: colors[index % colors.length], boxShadow: `0 2px 5px ${colors[index % colors.length]}66` }} />{row.contractor}</span>)}</div></div>{dates.length ? <div className="mt-4 overflow-x-auto rounded-xl bg-gradient-to-b from-white to-slate-50"><svg aria-label="Barras de refusal diario por contratista" className="min-w-[680px]" role="img" style={{ minWidth: width }} viewBox={`0 0 ${width} ${height}`}><defs>{gradientColors.map((gradient, index) => <linearGradient id={`refusal-bar-${index}`} key={gradient.dark} x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stopColor={gradient.light} /><stop offset="48%" stopColor={colors[index]} /><stop offset="100%" stopColor={gradient.dark} /></linearGradient>)}<filter height="140%" id="refusal-shadow" width="160%" x="-30%" y="-15%"><feDropShadow dx="2" dy="3" floodColor="#0f172a" floodOpacity=".22" stdDeviation="2" /></filter></defs>{[0, 1, 2, 3].map((value) => <g key={value}><line stroke="#dbe4ef" strokeDasharray="4 5" x1={left} x2={width-right} y1={y(value)} y2={y(value)} /><text fill="#64748b" fontSize="9" textAnchor="end" x={left-7} y={y(value)+3}>{value}%</text></g>)}{data.map((row, seriesIndex) => { const colorIndex = seriesIndex % colors.length; return <g key={row.contractor}>{row.points.map((point) => { const displayed = Math.min(point.percentage, maximum); const topY = y(displayed); const barHeight = Math.max(y(0) - topY, point.percentage > 0 ? 3 : 0); const centerX = barX(point.date, seriesIndex) + barWidth / 2; const rectWidth = Math.max(barWidth - 3, 6); const rectX = barX(point.date, seriesIndex) + 1; return <g key={point.date}><rect fill={`url(#refusal-bar-${colorIndex})`} filter="url(#refusal-shadow)" height={barHeight} rx="4" width={rectWidth} x={rectX} y={y(0) - barHeight}><title>{`${row.contractor}: ${point.percentage.toFixed(2)}% · ${point.pending} cajas final / ${point.dispatched} despachadas · ${formatDateLabel(point.date)}`}</title></rect>{barHeight > 7 ? <rect fill="#ffffff" height={Math.min(3, barHeight / 3)} opacity=".5" rx="2" width={Math.max(rectWidth - 5, 2)} x={rectX + 2} y={y(0) - barHeight + 2} /> : null}{point.percentage > 0 ? <text fill="#10223d" fontSize="7.5" fontWeight="800" textAnchor="middle" x={centerX} y={Math.max(topY - 6, 10)}>{point.percentage.toFixed(2)}%</text> : null}</g>; })}</g>; })}{dates.map((date) => <text fill="#64748b" fontSize="9" textAnchor="middle" x={dateCenter(date)} y={height-12} key={date}>{date.slice(5)}</text>)}</svg></div> : <div className="mt-4 grid h-56 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">Sin datos de refusal para el período seleccionado.</div>}</section>;
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
