"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, LoaderCircle, Search, Upload, Users, WalletCards, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Vehiculo } from "../../seguimiento/types";

type ResultStatus = "Cumplio" | "No cumplio";
type TrackingRow = { contractor: string; data: Vehiculo };
type RrOffender = { rr: string; contractor: string; violations: number; clients: number; amount: number; records: CashellResult[] };
type CashellResult = {
  route: string; visit: string; clientCode: string; clientName: string; paymentMethod: string;
  receipt: string; amount: number; vehicle: string; center: string; transport: string; date: string;
  dateKey: string; dt: string; status: ResultStatus; reason: string; contractor: string;
  responsible: string; driver: string; auxiliary: string;
};

export default function CashellPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cashellRows, setCashellRows] = useState<Record<string, unknown>[]>([]);
  const [results, setResults] = useState<CashellResult[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CashellResult | null>(null);
  const [selectedOffender, setSelectedOffender] = useState<RrOffender | null>(null);
  const [expandedTable, setExpandedTable] = useState<"clients" | "offenders" | "crew" | null>(null);

  useEffect(() => {
    fetch("/api/admin/cashell", { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo consultar la tabla CASHELL.");
      setCashellRows(body.records || []);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "No se pudo consultar CASHELL."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = normalize(query);
    return !needle ? results : results.filter((row) => normalize(`${row.clientCode} ${row.clientName} ${row.paymentMethod} ${row.dt} ${row.responsible} ${row.driver} ${row.auxiliary}`).includes(needle));
  }, [query, results]);
  const nonCompliant = useMemo(() => filtered.filter((row) => row.status === "No cumplio"), [filtered]);
  const rrOffenders = useMemo(() => buildRrOffenders(nonCompliant), [nonCompliant]);
  const percentage = results.length ? Math.round((results.filter((row) => row.status === "Cumplio").length / results.length) * 100) : 0;

  async function processFile(file?: File) {
    if (!file) return;
    setProcessing(true); setError(""); setResults([]); setSelected(null); setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const uploaded = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
      if (!uploaded.length) throw new Error("El archivo no contiene registros.");
      const cashellCodes = new Set(cashellRows.flatMap(readCashellClientCodes).filter(Boolean));
      if (!cashellCodes.size) throw new Error("La tabla CASHELL no contiene codigos de cliente reconocibles.");
      const excludedCenters = new Set(["av74"]);
      const matched = uploaded.map(readUploadedRow).filter((row) => cashellCodes.has(row.clientCode) && !excludedCenters.has(normalize(row.center)));
      if (!matched.length) throw new Error("Ningun cliente del archivo fue encontrado en la tabla CASHELL.");
      const response = await fetch("/api/admin/cashell", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dts: Array.from(new Set(matched.map((row) => row.dt).filter(Boolean))) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo cruzar con Seguimiento.");
      const tracking = (body.records || []) as TrackingRow[];
      setResults(matched.map((row) => attachTracking(row, tracking)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo procesar el archivo.");
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function exportResults() {
    if (!results.length) return;
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const yes = results.filter((row) => row.status === "Cumplio");
    const no = results.filter((row) => row.status === "No cumplio");
    const summarySheet = XLSX.utils.aoa_to_sheet([
      ["Indicador", "Valor"], ["Archivo", fileName], ["Clientes CASHELL evaluados", results.length],
      ["Cumplen", yes.length], ["No cumplen", no.length], ["Porcentaje de cumplimiento", percentage / 100],
    ]);
    summarySheet.B6 = { t: "n", v: percentage / 100, z: "0%" };
    summarySheet["!cols"] = [{ wch: 32 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumen");
    appendResultSheet(XLSX, workbook, "Cumplen", yes);
    appendResultSheet(XLSX, workbook, "No cumplen", no);
    appendCrewSheet(XLSX, workbook, results);
    XLSX.writeFile(workbook, `acuerdo_CASHELL_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return <main className="min-h-screen bg-[#f3f6fa] text-slate-900">
    <header className="border-b border-slate-800 bg-[#0b2235] text-white"><div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 sm:px-8"><button aria-label="Volver" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-white/10" onClick={() => router.push("/admin")} type="button"><ArrowLeft size={20} /></button><div className="text-right"><p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-300">Control administrativo</p><h1 className="text-xl font-bold">Acuerdo CASHELL</h1></div></div></header>
    <section className="mx-auto max-w-[1500px] space-y-5 px-5 py-6 sm:px-8">
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-violet-600">Cruce diario sin almacenamiento</p><h2 className="mt-1 text-2xl font-black text-[#10223d]">Cumplimiento del acuerdo CASHELL</h2><p className="mt-1 text-sm text-slate-500">clientes Cashell</p></div><div className="flex flex-wrap gap-2"><input accept=".xlsx,.xls" className="hidden" onChange={(event) => void processFile(event.target.files?.[0])} ref={fileRef} type="file" /><button className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-700 px-4 text-sm font-bold text-white disabled:opacity-50" disabled={loading || processing} onClick={() => fileRef.current?.click()} type="button">{processing ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />}{processing ? "Cruzando" : "Subir archivo diario"}</button><button className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-700 disabled:opacity-50" disabled={!results.length} onClick={() => void exportResults()} type="button"><Download size={16} />Exportar Excel</button></div></section>
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}
      {loading ? <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">Consultando clientes CASHELL...</p> : null}
      {results.length ? <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={<FileSpreadsheet />} label="Clientes evaluados" value={results.length} /><Stat icon={<CheckCircle2 />} label="Cumplieron" tone="green" value={results.filter((row) => row.status === "Cumplio").length} /><Stat icon={<XCircle />} label="No cumplieron" tone="red" value={results.filter((row) => row.status === "No cumplio").length} /><Stat icon={<Users />} label="Con tripulacion" value={results.filter(hasCrew).length} /></section>
        <section className="grid gap-4 lg:grid-cols-[320px_1fr]"><ComplianceChart percentage={percentage} yes={results.filter((row) => row.status === "Cumplio").length} no={results.filter((row) => row.status === "No cumplio").length} /><article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><label className="flex items-center gap-2"><Search className="text-slate-400" size={17} /><input className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-violet-500" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, DT o persona..." value={query} /></label><p className="mt-3 text-xs text-slate-500">{fileName} · {filtered.length} clientes CASHELL visibles</p></article></section>
        <section className="grid items-start gap-4 xl:grid-cols-2">
          <div className="[&>article>div]:!max-h-none [&>article>div]:!overflow-hidden [&_td]:!py-1.5"><ResultTable onSelect={setSelected} rows={nonCompliant.slice(0, 10)} title="Top 10 clientes que no cumplieron" tone="red" />{nonCompliant.length > 10 ? <MoreButton onClick={() => setExpandedTable("clients")} total={nonCompliant.length} /> : null}</div>
          <div className="[&>article>div]:!max-h-none [&>article>div]:!overflow-hidden [&_td]:!py-1.5"><RrOffenderTable onSelect={setSelectedOffender} rows={rrOffenders} />{rrOffenders.length > 10 ? <MoreButton onClick={() => setExpandedTable("offenders")} total={rrOffenders.length} /> : null}</div>
        </section>
        <div className="mx-auto w-full max-w-6xl [&>article>div]:!max-h-none [&>article>div]:!overflow-hidden [&_td]:!py-1.5"><CrewTable rows={nonCompliant.slice(0, 10)} />{nonCompliant.length > 10 ? <MoreButton onClick={() => setExpandedTable("crew")} total={nonCompliant.length} /> : null}</div>
      </> : <EmptyState />}
    </section>
    {selected ? <CrewModal onClose={() => setSelected(null)} row={selected} /> : null}
    {selectedOffender ? <RrOffenderModal offender={selectedOffender} onClose={() => setSelectedOffender(null)} /> : null}
    {expandedTable ? <ExpandedTableModal kind={expandedTable} nonCompliant={nonCompliant} offenders={rrOffenders} onClose={() => setExpandedTable(null)} /> : null}
  </main>;
}

function MoreButton({ onClick, total }: { onClick: () => void; total: number }) {
  return <button className="mt-2 h-8 w-full rounded-lg border border-slate-200 bg-white text-[10px] font-black text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50" onClick={onClick} type="button">Ver más ({total})</button>;
}

function ExpandedTableModal({ kind, nonCompliant, offenders, onClose }: { kind: "clients" | "offenders" | "crew"; nonCompliant: CashellResult[]; offenders: RrOffender[]; onClose: () => void }) {
  const title = kind === "offenders" ? "Todos los RR con incumplimientos" : kind === "crew" ? "Toda la tripulación incumplida" : "Todos los clientes que no cumplieron";
  return <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog"><article className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-violet-200 bg-violet-50 px-4 py-3"><div><p className="text-[9px] font-black uppercase tracking-wider text-violet-700">Vista completa</p><h3 className="font-black text-[#10223d]">{title}</h3></div><button className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white" onClick={onClose} type="button"><X size={17} /></button></header><div className="max-h-[72vh] overflow-auto">{kind === "offenders" ? <table className="w-full text-left text-[10px]"><thead className="sticky top-0 bg-[#10223d] text-[9px] uppercase text-white"><tr><th className="px-3 py-2">RR</th><th className="px-3 py-2">Transportista</th><th className="px-3 py-2 text-center">Incumplimientos</th><th className="px-3 py-2 text-center">Clientes</th><th className="px-3 py-2 text-right">Importe</th></tr></thead><tbody className="divide-y divide-slate-100">{offenders.map((row) => <tr key={`${row.contractor}-${row.rr}`}><td className="px-3 py-2 font-bold">{row.rr}</td><td className="px-3 py-2">{row.contractor}</td><td className="px-3 py-2 text-center">{row.violations}</td><td className="px-3 py-2 text-center">{row.clients}</td><td className="px-3 py-2 text-right font-bold">{money(row.amount)}</td></tr>)}</tbody></table> : <table className="w-full text-left text-[10px]"><thead className="sticky top-0 bg-[#10223d] text-[9px] uppercase text-white"><tr><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">DT</th><th className="px-3 py-2">Transportista</th><th className="px-3 py-2">RR</th><th className="px-3 py-2">Conductor</th><th className="px-3 py-2">Auxiliar</th></tr></thead><tbody className="divide-y divide-slate-100">{nonCompliant.map((row, index) => <tr key={`${row.clientCode}-${row.dt}-${index}`}><td className="px-3 py-2"><b>{row.clientCode}</b><span className="block text-[9px] text-slate-500">{row.clientName}</span></td><td className="px-3 py-2 font-bold">{row.dt}</td><td className="px-3 py-2">{row.contractor || "Sin cruce"}</td><td className="px-3 py-2">{row.responsible || "Sin dato"}</td><td className="px-3 py-2">{row.driver || "Sin dato"}</td><td className="px-3 py-2">{row.auxiliary || "Sin dato"}</td></tr>)}</tbody></table>}</div></article></div>;
}

function ResultTable({ onSelect, rows: allRows, title, tone }: { onSelect?: (row: CashellResult) => void; rows: CashellResult[]; title: string; tone: "green" | "red" }) {
  const [expanded, setExpanded] = useState(false);
  const rows = expanded ? allRows : allRows.slice(0, 10);
  const accent = tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700";
  return <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
    <header className={`flex items-center justify-between gap-3 border-b px-3 py-2 ${accent}`}>
      <div><h3 className="font-black text-[#10223d]">{title}</h3><p className="text-[10px] font-semibold text-slate-500">Orden del archivo cargado</p></div>
      <div className="flex items-center gap-2"><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black shadow-sm">{allRows.length}</span>{allRows.length > 10 ? <button className="rounded-md border border-current/20 bg-white px-2 py-1 text-[9px] font-black" onClick={() => setExpanded((current) => !current)} type="button">{expanded ? "Ver top 10" : "Ver más"}</button> : null}</div>
    </header>
    <div className="max-h-[260px] overflow-auto">
      <table className="w-full min-w-[640px] table-fixed text-left text-[9px] [&_td]:px-2 [&_td]:py-1.5">
        <thead className="sticky top-0 z-10 bg-[#10223d] text-[8px] uppercase tracking-wide text-white"><tr><th className="w-[25%] px-2 py-1.5">Cliente</th><th className="w-[15%] px-2 py-1.5">DT</th><th className="w-[18%] px-2 py-1.5">Pago</th><th className="w-[15%] px-2 py-1.5 text-right">Importe</th><th className="w-[12%] px-2 py-1.5">Fecha</th><th className="w-[15%] px-2 py-1.5 text-center">Tripulacion</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr className={`${index % 2 ? "bg-slate-50/70" : "bg-white"} ${onSelect ? "cursor-pointer hover:bg-red-50" : "hover:bg-emerald-50/50"}`} key={`${row.clientCode}-${row.receipt}-${index}`} onClick={() => onSelect?.(row)}><td className="px-3 py-2.5"><b className="text-[#10223d]">{row.clientCode}</b><span className="block truncate text-[9px] text-slate-500" title={row.clientName}>{row.clientName}</span></td><td className="px-3 py-2.5 font-bold text-slate-700">{row.dt || "-"}</td><td className="px-3 py-2.5"><span className={`inline-flex max-w-full truncate rounded-md px-2 py-1 font-bold ${tone === "green" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`} title={row.paymentMethod}>{row.paymentMethod}</span></td><td className="whitespace-nowrap px-3 py-2.5 text-right font-black text-[#10223d]">{money(row.amount)}</td><td className="whitespace-nowrap px-3 py-2.5">{row.date}</td><td className="px-3 py-2.5 text-center">{onSelect ? <button className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-black text-blue-700 hover:bg-blue-100" type="button">Ver tripulacion</button> : hasCrew(row) ? <span className="font-bold text-blue-700">{row.responsible || "Encontrada"}</span> : <span className="text-slate-400">Sin cruce</span>}</td></tr>)}</tbody>
      </table>
      {!rows.length ? <p className="p-8 text-center text-sm text-slate-400">Sin registros.</p> : null}
    </div>
  </article>;
}

function RrOffenderTable({ onSelect, rows }: { onSelect: (row: RrOffender) => void; rows: RrOffender[] }) {
  return <article className="overflow-hidden rounded-lg border border-violet-200 bg-white shadow-sm">
    <header className="flex items-center justify-between gap-3 border-b border-violet-200 bg-violet-50 px-3 py-2"><div><p className="text-[8px] font-black uppercase tracking-wider text-violet-700">Top ofensores</p><h3 className="text-sm font-black text-[#10223d]">RR con mas incumplimientos CASHELL</h3></div><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-violet-700 shadow-sm">Top {Math.min(rows.length, 10)}</span></header>
    <div className="max-h-[300px] overflow-auto"><table className="w-full min-w-[680px] text-left text-[9px]"><thead className="sticky top-0 z-10 bg-[#10223d] text-[8px] uppercase tracking-wide text-white"><tr><th className="w-12 px-2 py-2 text-center">#</th><th className="px-2 py-2">RR</th><th className="px-2 py-2">Transportista</th><th className="px-2 py-2 text-center">Incumplimientos</th><th className="px-2 py-2 text-center">Clientes</th><th className="px-2 py-2 text-right">Importe</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.slice(0, 10).map((row, index) => <tr className={`${index % 2 ? "bg-slate-50/70" : "bg-white"} cursor-pointer hover:bg-violet-100`} key={`${row.contractor}-${row.rr}`} onClick={() => onSelect(row)}><td className="px-2 py-1.5 text-center"><span className="inline-grid h-5 w-5 place-items-center rounded bg-violet-100 font-black text-violet-700">{index + 1}</span></td><td className="px-2 py-1.5 font-black text-[#10223d]"><button className="text-left hover:text-violet-700" type="button">{row.rr}</button></td><td className="px-2 py-1.5 text-slate-500">{row.contractor || "Sin transportista"}</td><td className="px-2 py-1.5 text-center"><span className="rounded-full bg-red-100 px-2 py-0.5 font-black text-red-700">{row.violations}</span></td><td className="px-2 py-1.5 text-center font-bold">{row.clients}</td><td className="px-2 py-1.5 text-right font-black">{money(row.amount)}</td></tr>)}</tbody></table>{!rows.length ? <p className="p-8 text-center text-sm text-slate-400">No hay RR asociados a incumplimientos.</p> : null}</div>
  </article>;
}

function RrOffenderModal({ offender, onClose }: { offender: RrOffender; onClose: () => void }) {
  return <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog"><article className="max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-violet-200 bg-violet-50 p-5"><div><p className="text-[9px] font-black uppercase tracking-wider text-violet-700">Detalle del RR · {offender.contractor || "Sin transportista"}</p><h3 className="mt-1 text-xl font-black text-[#10223d]">{offender.rr}</h3><p className="mt-1 text-xs text-slate-500">{offender.violations} incumplimientos · {offender.clients} clientes · {money(offender.amount)}</p></div><button className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white" onClick={onClose} type="button"><X size={18} /></button></header><div className="max-h-[65vh] overflow-auto"><table className="w-full min-w-[760px] text-left text-[10px]"><thead className="sticky top-0 bg-[#10223d] text-[9px] uppercase text-white"><tr><th className="px-3 py-2.5">Cliente</th><th className="px-3 py-2.5">Fecha</th><th className="px-3 py-2.5">DT</th><th className="px-3 py-2.5">Via de pago</th><th className="px-3 py-2.5 text-right">Importe</th></tr></thead><tbody className="divide-y divide-slate-100">{offender.records.map((row, index) => <tr className={`${index % 2 ? "bg-slate-50" : "bg-white"} hover:bg-violet-50`} key={`${row.clientCode}-${row.dt}-${index}`}><td className="px-3 py-2"><b>{row.clientCode}</b><span className="block text-[9px] text-slate-500">{row.clientName}</span></td><td className="px-3 py-2">{row.date}</td><td className="px-3 py-2 font-black">{row.dt || "Sin DT"}</td><td className="px-3 py-2">{row.paymentMethod}</td><td className="px-3 py-2 text-right font-black">{money(row.amount)}</td></tr>)}</tbody></table></div></article></div>;
}

function CrewTable({ rows }: { rows: CashellResult[] }) {
  return <article className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-3"><div><h3 className="font-black text-[#10223d]">Tripulacion de clientes que no cumplieron</h3><p className="text-[10px] text-slate-500">Datos encontrados en Seguimiento para cada visita incumplida.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-black text-red-700 shadow-sm">{rows.length} incumplimientos</span></header><div className="max-h-[400px] overflow-auto"><table className="w-full min-w-[1080px] table-fixed text-left text-[10px]"><thead className="sticky top-0 z-10 bg-[#10223d] text-[9px] uppercase tracking-wide text-white"><tr><th className="w-[20%] px-3 py-2">Cliente</th><th className="w-[10%] px-3 py-2">Fecha</th><th className="w-[12%] px-3 py-2">DT</th><th className="w-[12%] px-3 py-2">Transportista</th><th className="w-[16%] px-3 py-2">RR</th><th className="w-[15%] px-3 py-2">Conductor</th><th className="w-[15%] px-3 py-2">Auxiliar</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr className={`${index % 2 ? "bg-slate-50/70" : "bg-white"} hover:bg-red-50`} key={`${row.clientCode}-${row.dt}-${index}`}><td className="px-3 py-2"><b className="text-[#10223d]">{row.clientCode}</b><span className="block truncate text-[9px] text-slate-500" title={row.clientName}>{row.clientName}</span></td><td className="whitespace-nowrap px-3 py-2">{row.date}</td><td className="px-3 py-2 font-black text-slate-700">{row.dt || "-"}</td><td className="px-3 py-2"><span className={`rounded-md px-2 py-1 font-bold ${row.contractor ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{row.contractor || "Sin cruce"}</span></td><PersonCell value={row.responsible} /><PersonCell value={row.driver} /><PersonCell value={row.auxiliary} /></tr>)}</tbody></table>{!rows.length ? <p className="p-8 text-center text-sm text-slate-400">No hay clientes incumplidos para mostrar.</p> : null}</div></article>;
}

function PersonCell({ value }: { value: string }) {
  return <td className="px-3 py-2.5"><span className={`block truncate font-semibold ${value ? "text-slate-700" : "text-slate-400"}`} title={value || "Sin dato en Seguimiento"}>{value || "Sin dato"}</span></td>;
}

function CrewModal({ onClose, row }: { onClose: () => void; row: CashellResult }) {
  return <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog"><article className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-red-200 bg-red-50 p-5"><div><p className="text-[10px] font-black uppercase tracking-wider text-red-700">No cumplio el acuerdo CASHELL</p><h3 className="mt-1 text-xl font-black text-[#10223d]">{row.clientName}</h3><p className="text-xs text-slate-500">Cliente {row.clientCode} · DT {row.dt || "sin cruce"} · {row.date}</p></div><button className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white" onClick={onClose} type="button"><X size={18} /></button></header><div className="grid gap-3 p-5 sm:grid-cols-2"><Detail label="Transportista" value={row.contractor} /><Detail label="Vehiculo" value={row.vehicle} /><Detail label="RR / Responsable" value={row.responsible} /><Detail label="Conductor" value={row.driver} /><Detail label="Auxiliar" value={row.auxiliary} /><Detail label="Via de pago" value={row.paymentMethod} /></div></article></div>;
}

function readUploadedRow(row: Record<string, unknown>): Omit<CashellResult, "contractor" | "responsible" | "driver" | "auxiliary"> {
  const values = normalizedRow(row);
  const paymentMethod = text(readValueByIncludes(values, ["viadepago", "formadepago", "metododepago"]));
  const compliant = /wallet|transferencia|pagoelectronico|pagoeletronico/.test(normalize(paymentMethod));
  const route = text(readValue(values, ["ruta", "dt", "transporte"]));
  return {
    route, dt: normalizeDt(route), visit: text(readValue(values, ["visita"])),
    clientCode: normalizeClientCode(readValue(values, ["cliente", "codigocliente", "client"])),
    clientName: text(readValue(values, ["nombrecliente", "clientenombre"])), paymentMethod,
    receipt: text(readValueByIncludes(values, ["recibodepago", "recibo"])),
    amount: parseAmount(readValueByIncludes(values, ["importedelpago", "importe", "valor"])),
    vehicle: text(readValue(values, ["vehiculo"])), center: text(readValue(values, ["centro"])),
    transport: text(readValueByIncludes(values, ["transpor"])), date: formatDate(readValue(values, ["fecha"])),
    dateKey: dateKey(readValue(values, ["fecha"])), status: compliant ? "Cumplio" : "No cumplio",
    reason: compliant ? "Pago por Wallet, transferencia o medio electronico" : "Pago en efectivo u otro medio no permitido",
  };
}

function attachTracking(row: ReturnType<typeof readUploadedRow>, tracking: TrackingRow[]): CashellResult {
  const candidates = tracking.filter((item) => normalizeDt(item.data.transporte) === row.dt);
  const exact = candidates.filter((item) => trackingDates(item.data).includes(row.dateKey));
  const match = exact[0] || closestTracking(candidates, row.dateKey);
  const data = match?.data;
  return { ...row, contractor: match?.contractor || data?.transportista || "", vehicle: row.vehicle || data?.vehiculo || "", responsible: text(data?.nombreResponsable || data?.responsable), driver: text(data?.nombreAuxiliar1), auxiliary: text(data?.nombreAuxiliar2) };
}
function buildRrOffenders(rows: CashellResult[]): RrOffender[] {
  const groups = new Map<string, RrOffender & { clientCodes: Set<string> }>();
  rows.filter((row) => row.responsible).forEach((row) => {
    const key = `${normalize(row.contractor)}:${normalize(row.responsible)}`;
    const current = groups.get(key) || { rr: row.responsible, contractor: row.contractor, violations: 0, clients: 0, amount: 0, records: [], clientCodes: new Set<string>() };
    current.violations += 1;
    current.amount += row.amount;
    current.records.push(row);
    current.clientCodes.add(row.clientCode);
    current.clients = current.clientCodes.size;
    groups.set(key, current);
  });
  return Array.from(groups.values()).map((row) => ({ rr: row.rr, contractor: row.contractor, violations: row.violations, clients: row.clients, amount: row.amount, records: row.records }))
    .sort((left, right) => right.violations - left.violations || right.clients - left.clients || right.amount - left.amount);
}
function closestTracking(rows: TrackingRow[], target: string) { const time = Date.parse(`${target}T12:00:00Z`); if (!Number.isFinite(time)) return rows[0]; return rows.map((row) => ({ row, distance: Math.min(...trackingDates(row.data).map((date) => Math.abs(Date.parse(`${date}T12:00:00Z`) - time))) })).sort((a, b) => a.distance - b.distance)[0]?.row; }
function trackingDates(data: Vehiculo) { return [data.fechaDespacho, data.fechaDt, data.date, data.createdAt].map(dateKey).filter(Boolean); }
function readCashellClientCodes(row: Record<string, unknown>) {
  const values = normalizedDeepRow(row);
  const preferred = normalizeClientCode(readValueByIncludes(values, ["codigocliente", "cliente", "codigo", "idcliente", "customer", "kunnr", "codigosap", "clientsap"]));
  if (preferred) return [preferred];
  return Array.from(values.values()).map(normalizeClientCode).filter((value) => value.length >= 6 && value.length <= 10);
}
function normalizedDeepRow(row: Record<string, unknown>) {
  const values = new Map<string, unknown>();
  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) { value.forEach((item, index) => visit(item, `${path}${index}`)); return; }
    if (value && typeof value === "object" && !(value instanceof Date)) {
      Object.entries(value as Record<string, unknown>).forEach(([key, item]) => visit(item, `${path}${key}`));
      return;
    }
    values.set(normalize(path), value);
  };
  Object.entries(row).forEach(([key, value]) => visit(value, key));
  return values;
}
function normalizedRow(row: Record<string, unknown>) { return new Map(Object.entries(row).map(([key, value]) => [normalize(key), value])); }
function readValue(values: Map<string, unknown>, keys: string[]) { for (const key of keys) { const value = values.get(normalize(key)); if (value !== undefined && value !== "") return value; } return ""; }
function readValueByIncludes(values: Map<string, unknown>, keys: string[]) { for (const [key, value] of values) if (keys.some((candidate) => key.includes(normalize(candidate))) && value !== "") return value; return ""; }
function normalize(value: unknown) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase(); }
function digits(value: unknown) { return String(value ?? "").replace(/\D/g, "").replace(/^0+/, ""); }
function normalizeClientCode(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value)).replace(/^0+/, "");
  const raw = text(value).replace(/\s/g, "");
  if (/^\d+(?:[.,]0+)?$/.test(raw)) return raw.split(/[.,]/)[0].replace(/^0+/, "");
  return digits(raw);
}
function normalizeDt(value: unknown) { const valueDigits = digits(value); return valueDigits.length > 10 && valueDigits.startsWith("10") ? valueDigits.slice(-10) : valueDigits; }
function text(value: unknown) { return String(value ?? "").trim(); }
function parseAmount(value: unknown) { if (typeof value === "number") return value; const cleaned = text(value).replace(/[^\d,.-]/g, ""); const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned; const parsed = Number(normalized); return Number.isFinite(parsed) ? parsed : 0; }
function dateKey(value: unknown) { if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10); const raw = text(value); const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/); return match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : ""; }
function formatDate(value: unknown) { const key = dateKey(value); return key ? `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}` : text(value); }
function money(value: number) { return value.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }); }
function hasCrew(row: CashellResult) { return Boolean(row.responsible || row.driver || row.auxiliary); }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 font-bold text-[#10223d]">{value || "Sin dato en Seguimiento"}</p></div>; }
function ComplianceChart({ no, percentage, yes }: { no: number; percentage: number; yes: number }) { return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[.14em] text-violet-600">Resultado</p><h3 className="mt-1 font-black text-[#10223d]">Porcentaje de cumplimiento</h3><div className="mx-auto mt-4 grid h-48 w-48 place-items-center rounded-full" style={{ background: `conic-gradient(#059669 ${percentage}%, #dc2626 0)` }}><div className="grid h-36 w-36 place-items-center rounded-full bg-white"><p className="text-4xl font-black">{percentage}%</p></div></div><div className="mt-4 flex justify-center gap-4 text-xs font-bold"><span className="text-emerald-700">{yes} cumplen</span><span className="text-red-700">{no} no cumplen</span></div></article>; }
function Stat({ icon, label, tone = "slate", value }: { icon: ReactNode; label: string; tone?: "green" | "red" | "slate"; value: number }) { const color = tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "red" ? "bg-red-50 text-red-700" : "bg-slate-100 text-[#10223d]"; return <article className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`grid h-11 w-11 place-items-center rounded-xl ${color}`}>{icon}</span><div><p className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="text-2xl font-black text-[#10223d]">{value.toLocaleString("es-CO")}</p></div></article>; }
function EmptyState() { return <section className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white text-center"><div><WalletCards className="mx-auto text-slate-300" size={42} /><p className="mt-3 font-black text-[#10223d]">Sube el archivo del dia</p><p className="mt-1 text-sm text-slate-500">El cruce se realiza en memoria y no se guarda.</p></div></section>; }
function appendResultSheet(XLSX: typeof import("xlsx"), workbook: import("xlsx").WorkBook, name: string, rows: CashellResult[]) { const data = rows.map((row) => ({ Cliente: row.clientCode, "Nombre Cliente": row.clientName, DT: row.dt, "Via de pago": row.paymentMethod, Importe: row.amount, Fecha: row.date, Transportista: row.contractor, RR: row.responsible, Conductor: row.driver, Auxiliar: row.auxiliary, Resultado: row.status, Motivo: row.reason })); const sheet = XLSX.utils.json_to_sheet(data); sheet["!cols"] = Array.from({ length: 12 }, (_, index) => ({ wch: [16, 32, 16, 24, 16, 14, 18, 24, 24, 24, 14, 42][index] })); XLSX.utils.book_append_sheet(workbook, sheet, name); }
function appendCrewSheet(XLSX: typeof import("xlsx"), workbook: import("xlsx").WorkBook, rows: CashellResult[]) { const data = rows.map((row) => ({ Cliente: row.clientCode, "Nombre Cliente": row.clientName, Fecha: row.date, DT: row.dt, Transportista: row.contractor, RR: row.responsible, Conductor: row.driver, Auxiliar: row.auxiliary, Resultado: row.status })); const sheet = XLSX.utils.json_to_sheet(data); sheet["!cols"] = [{ wch: 16 }, { wch: 32 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 14 }]; XLSX.utils.book_append_sheet(workbook, sheet, "Tripulacion"); }
