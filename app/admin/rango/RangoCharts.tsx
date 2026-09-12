"use client";

import { Fragment, useState } from "react";
import type { PuntoCoronaRouteReport, PuntoCoronaRouteRow } from "../../lib/puntoCoronaRoutesStorage";
import { assignContractors, mapRows, suggestMapping, type FileRow, type FoxtrotRow } from "./foxtrot";

type Report = Pick<PuntoCoronaRouteReport, "contractor" | "operationalDate" | "summary" | "rows">;
type BeeRow = PuntoCoronaRouteRow & { contractor: string; date: string };
type Group = { key: string; rr: string; clients: BeeRow[]; contractor?: string; date?: string; dt?: string; contractors?: string[] };

export default function RangoCharts({ reports, contractor, from, to, dt }: { reports: Report[]; contractor: string; from: string; to: string; dt: string }) {
  const [foxtrot, setFoxtrot] = useState<FoxtrotRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const targetDt = normalizeDt(dt);
  const rows = reports
    .filter(report => (contractor === "Todas" || report.contractor === contractor) && (!from || report.operationalDate >= from) && (!to || report.operationalDate <= to))
    .flatMap(report => report.rows.map(row => ({ ...row, contractor: report.contractor, date: report.operationalDate })))
    .filter(row => row.status !== "NOT_STARTED")
    .filter(row => !targetDt || normalizeDt(row.dt).includes(targetDt))
    ;
  const clients = uniqueClients(rows);
  const inside = clients.filter(row => row.withinRadius === true);
  const outside = clients.filter(row => row.withinRadius === false);
  const unvalidated = clients.filter(row => row.withinRadius === null);
  const crews = buildCrews(rows);
  const rrs = buildRrs(rows);
  const percent = clients.length ? (inside.length / clients.length) * 100 : 0;
  const bees = { total: clients.length, inside: inside.length };
  const foxtrotRows = (foxtrot ? assignContractors(foxtrot, reports) : []).filter(row => (contractor === "Todas" || row.contractor === contractor) && (!from || row.date >= from) && (!to || row.date <= to) && (!targetDt || normalizeDt(row.dt).includes(targetDt)) && row.inRange !== null);
  const foxtrotStats = { total: foxtrotRows.length, inside: foxtrotRows.filter(row => row.inRange).length };

  async function upload(file?: File) {
    if (!file) return;
    setError("");
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Selecciona un archivo Excel o CSV de Foxtrot.");
      const XLSX = await import("xlsx");
      const workbook = /\.csv$/i.test(file.name) ? XLSX.read(await file.text(), { type: "string", raw: true }) : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = sheet ? XLSX.utils.sheet_to_json<FileRow>(sheet, { defval: "", raw: false, dateNF: "yyyy-mm-dd" }) : [];
      const mapped = mapRows(data, suggestMapping(Object.keys(data[0] || {})), "", "");
      if (!mapped.length || !mapped.some(row => row.inRange !== null)) throw new Error("El archivo de Foxtrot no tiene clientes o distancias válidas.");
      setFoxtrot(mapped); setFileName(file.name);
    } catch (caught) { setFoxtrot(null); setError(caught instanceof Error ? caught.message : "No se pudo leer Foxtrot."); }
  }

  return <section className="mb-6 space-y-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-amber-700">Datos BEES</p><h2 className="text-lg font-semibold text-[#10223d]">Rango de clientes</h2><p className="mt-1 text-xs text-slate-500">Información BEES filtrada por fecha y DT.</p></div><label className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-[#0f7c58] px-4 text-sm font-semibold text-white"><input className="sr-only" type="file" accept=".xlsx,.xls,.csv" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} />{fileName ? "Cambiar Foxtrot" : "Cargar Foxtrot"}</label></header>
    {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
    <Comparison bees={bees} foxtrot={foxtrotStats} loaded={foxtrot !== null} />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Clientes BEES" value={clients.length} tone="slate" /><Metric label="En rango" value={inside.length} tone="green" /><Metric label="Fuera de rango" value={outside.length} tone="red" /><Metric label="% en rango" value={`${percent.toFixed(2)}%`} tone="green" /></div>
    <Distribution inside={inside.length} outside={outside.length} unvalidated={unvalidated.length} />
    <BeesTable title="Detalle por tripulación" subtitle="Clientes BEES agrupados por fecha, DT y RR." groups={crews} showDate />
    <BeesTable title="Resumen por RR" subtitle="Clientes BEES agrupados por responsable de ruta." groups={rrs} />
  </section>;
}

function buildCrews(rows: BeeRow[]) { return group(rows, row => `${row.contractor}:${row.date}:${normalizeDt(row.dt)}:${normalize(row.driverName)}`, (key, values) => ({ key, contractor: values[0].contractor, date: values[0].date, dt: values[0].dt, rr: values[0].driverName || "Sin RR", clients: uniqueClients(values) })); }
function buildRrs(rows: BeeRow[]) { return group(rows, row => normalize(row.driverName) || "sin-rr", (key, values) => ({ key, rr: values[0].driverName || "Sin RR", clients: uniqueClients(values), contractors: [...new Set(values.map(row => row.contractor))] })); }
function group(rows: BeeRow[], keyFor: (row: BeeRow) => string, map: (key: string, values: BeeRow[]) => Group) { const buckets = new Map<string, BeeRow[]>(); rows.forEach(row => { const key = keyFor(row); buckets.set(key, [...(buckets.get(key) || []), row]); }); return [...buckets.entries()].map(([key, values]) => map(key, values)).sort((a, b) => ratio(a.clients) - ratio(b.clients) || a.rr.localeCompare(b.rr)); }
function uniqueClients(rows: BeeRow[]) { const seen = new Map<string, BeeRow>(); rows.forEach(row => { const key = `${row.contractor}:${row.date}:${normalizeDt(row.dt)}:${row.pocExternalId || row.id}`; if (!seen.has(key)) seen.set(key, row); }); return [...seen.values()]; }
function ratio(rows: BeeRow[]) { const valid = rows.filter(row => row.withinRadius !== null); return valid.length ? valid.filter(row => row.withinRadius).length / valid.length : 0; }
function normalize(value: unknown) { return String(value || "").trim().toLocaleLowerCase("es-CO"); }
function normalizeDt(value: unknown) { return String(value || "").replace(/^DT-?/i, "").replace(/\D/g, ""); }

function Comparison({ bees, foxtrot, loaded }: { bees: { total: number; inside: number }; foxtrot: { total: number; inside: number }; loaded: boolean }) {
  return <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"><div className="mb-3 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Comparativo general</p><h3 className="text-base font-semibold text-[#10223d]">BEES vs. Foxtrot</h3></div>{!loaded && <span className="text-xs text-slate-500">Carga Foxtrot para comparar</span>}</div><div className="grid gap-3 sm:grid-cols-2"><ComparisonItem label="BEES" stats={bees} color="bg-amber-400" /><ComparisonItem label="Foxtrot" stats={foxtrot} color="bg-blue-600" available={loaded} /></div></section>;
}
function ComparisonItem({ label, stats, color, available = true }: { label: string; stats: { total: number; inside: number }; color: string; available?: boolean }) { const percent = stats.total ? stats.inside / stats.total * 100 : 0; return <article className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex justify-between text-sm font-semibold"><span>{label}</span><span>{available && stats.total ? `${percent.toFixed(2)}%` : "—"}</span></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${available ? percent : 0}%` }} /></div><p className="mt-2 text-xs text-slate-500">{available ? `${stats.inside.toLocaleString("es-CO")} en rango de ${stats.total.toLocaleString("es-CO")} clientes` : "Pendiente de archivo"}</p></article>; }

function Metric({ label, value, tone }: { label: string; value: string | number; tone: "slate" | "green" | "red" }) { const color = { slate: "text-[#10223d]", green: "text-emerald-700", red: "text-red-700" }[tone]; return <article className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{typeof value === "number" ? value.toLocaleString("es-CO") : value}</p></article>; }
function Distribution({ inside, outside, unvalidated }: { inside: number; outside: number; unvalidated: number }) {
  const values = [{ label: "En rango", value: inside, color: "bg-emerald-500", text: "text-emerald-700" }, { label: "Fuera de rango", value: outside, color: "bg-red-500", text: "text-red-700" }, { label: "Sin validar", value: unvalidated, color: "bg-amber-400", text: "text-amber-700" }];
  const highest = Math.max(1, ...values.map(item => item.value));
  return <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"><h3 className="text-sm font-semibold text-slate-900">Distribución de clientes BEES</h3><div className="mt-4 grid grid-cols-3 gap-5 sm:gap-10">{values.map(item => <div key={item.label} className="text-center"><div className="flex h-36 items-end justify-center border-b border-slate-300"><div aria-label={`${item.label}: ${item.value} clientes`} className={`relative w-full max-w-28 rounded-t-md ${item.color}`} role="img" style={{ height: `${item.value ? Math.max(8, item.value / highest * 100) : 2}%` }}><span className={`absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-sm font-bold tabular-nums ${item.text}`}>{item.value.toLocaleString("es-CO")}</span></div></div><p className={`mt-2 text-xs font-semibold ${item.text}`}>{item.label}</p></div>)}</div></section>;
}
function BeesTable({ title, subtitle, groups, showDate = false }: { title: string; subtitle: string; groups: Group[]; showDate?: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const columns = showDate ? 7 : 6;
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><header className="border-b border-slate-200 px-4 py-3"><h3 className="text-base font-semibold text-[#10223d]">{title}</h3><p className="mt-0.5 text-xs text-slate-500">{subtitle} Presiona una fila para ver sus clientes.</p></header><div className="max-h-[560px] overflow-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="sticky top-0 bg-[#10223d] text-[10px] uppercase tracking-wider text-white"><tr>{showDate && <th className="px-3 py-2">Fecha</th>}<th className="px-3 py-2">RR</th><th className="px-3 py-2">DT / contratista</th><th className="px-2 py-2 text-center">Clientes</th><th className="px-2 py-2 text-center">En rango</th><th className="px-2 py-2 text-center">Fuera de rango</th><th className="px-3 py-2 text-right">% en rango</th></tr></thead><tbody className="divide-y divide-slate-200">{groups.map(group => { const inside = group.clients.filter(row => row.withinRadius === true).length; const outside = group.clients.filter(row => row.withinRadius === false).length; const valid = inside + outside; const isExpanded = expanded === group.key; return <Fragment key={group.key}><tr className="cursor-pointer even:bg-slate-50/70 hover:bg-amber-50" onClick={() => setExpanded(isExpanded ? null : group.key)}>{showDate && <td className="px-3 py-2">{formatDate(group.date || "")}</td>}<td className="px-3 py-2 font-semibold text-[#10223d]">{group.rr}</td><td className="px-3 py-2 text-slate-600">{group.dt ? `DT ${normalizeDt(group.dt)} · ${group.contractor}` : group.contractors?.join(", ")}</td><td className="px-2 py-2 text-center font-bold">{group.clients.length}</td><td className="px-2 py-2 text-center font-bold text-emerald-700">{inside}</td><td className="px-2 py-2 text-center font-bold text-red-700">{outside}</td><td className="px-3 py-2 text-right font-bold">{valid ? `${(inside / valid * 100).toFixed(2)}%` : "—"}</td></tr>{isExpanded && <tr className="bg-amber-50/50"><td colSpan={columns} className="p-3"><ClientTable clients={group.clients} /></td></tr>}</Fragment>; })}</tbody></table>{!groups.length && <p className="px-4 py-8 text-center text-sm text-slate-500">No hay clientes BEES para los filtros seleccionados.</p>}</div></section>;
}
function ClientTable({ clients }: { clients: BeeRow[] }) { return <div className="overflow-hidden rounded-lg border border-amber-100 bg-white"><div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-3 py-2"><p className="text-xs font-semibold text-[#10223d]">Clientes BEES</p><span className="text-xs font-bold text-slate-600">{clients.length} clientes</span></div><div className="max-h-64 overflow-auto"><table className="w-full min-w-[700px] text-xs"><thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2 text-left">Cliente</th><th className="px-3 py-2 text-left">Código</th><th className="px-3 py-2 text-left">DT</th><th className="px-3 py-2 text-center">Rango</th><th className="px-3 py-2 text-left">Motivo</th></tr></thead><tbody className="divide-y divide-slate-100">{clients.map(client => <tr key={`${client.id}:${client.dt}`} className="even:bg-slate-50/70"><td className="px-3 py-2 font-medium text-slate-800">{client.pocName || "Sin nombre"}</td><td className="px-3 py-2 font-mono text-slate-500">{client.pocExternalId || "—"}</td><td className="px-3 py-2 font-mono text-slate-600">{normalizeDt(client.dt)}</td><td className="px-3 py-2 text-center"><RangeStatus value={client.withinRadius} /></td><td className="px-3 py-2 text-slate-600">{client.outOfRadiusReason || client.skippedReason || "—"}</td></tr>)}</tbody></table></div></div>; }
function RangeStatus({ value }: { value: boolean | null }) { if (value === null) return <span className="rounded bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Sin validar</span>; return <span className={`rounded px-2 py-1 text-[10px] font-semibold ${value ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{value ? "En rango" : "Fuera de rango"}</span>; }
function formatDate(value: string) { const [year, month, day] = value.split("-"); return year && month && day ? `${day}/${month}/${year}` : "—"; }
