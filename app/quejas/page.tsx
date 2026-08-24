"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, ExternalLink, FileSpreadsheet, FileText, Filter, LoaderCircle, MessageSquareWarning, Paperclip, Upload, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { COMPLAINT_TEMPLATE_COLUMNS, type ComplaintRecord } from "../lib/complaints";
import { isComplaintsContractor, normalizeContractorName } from "../lib/contractors";

type Access = "checking" | "allowed" | "denied";

export default function ComplaintsPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const refreshingRef = useRef(false);
  const [access, setAccess] = useState<Access>("checking");
  const [canUploadComplaints, setCanUploadComplaints] = useState(false);
  const [isAdminSession, setIsAdminSession] = useState(false);
  const [records, setRecords] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [contractorFilter, setContractorFilter] = useState("all");
  const [matchFilter, setMatchFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<ComplaintRecord | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  useEffect(() => {
    fetch("/api/session/session", { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      const contractor = String(body?.session?.contractor || "");
      setAccess(response.ok && (body?.session?.isAdmin || isComplaintsContractor(contractor)) ? "allowed" : "denied");
      setCanUploadComplaints(response.ok && !body?.session?.isAdmin && normalizeContractorName(contractor) === "logisticos");
      setIsAdminSession(response.ok && Boolean(body?.session?.isAdmin));
    }).catch(() => setAccess("denied"));
  }, []);

  useEffect(() => { if (access === "allowed") void loadRecords(); }, [access]);

  useEffect(() => {
    if (access !== "allowed" || !isAdminSession) return;
    const refresh = () => { if (!document.hidden) void loadRecords(true); };
    const interval = window.setInterval(refresh, 3_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [access, isAdminSession]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadRecords(silent = false) {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/complaints?refresh=${Date.now()}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        const nextRecords = body.records || [];
        setRecords(nextRecords);
        setSelected((current) => current ? nextRecords.find((record: ComplaintRecord) => record.id === current.id) || current : null);
      } else if (!silent) setError(body.error || "No se pudieron consultar las quejas.");
    } catch {
      if (!silent) setError("No se pudieron consultar las quejas.");
    } finally {
      refreshingRef.current = false;
      if (!silent) setLoading(false);
    }
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([[...COMPLAINT_TEMPLATE_COLUMNS]]);
    sheet["!cols"] = [{ wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 34 }, { wch: 34 }, { wch: 22 }, { wch: 18 }, { wch: 18 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Quejas");
    XLSX.writeFile(workbook, "plantilla_quejas.xlsx");
  }

  async function uploadFile(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
      // La columna "tiempo para cierre" puede contener formulas arrastradas
      // hasta filas vacias. No debe convertir esas filas residuales en una
      // queja sin ID.
      const normalized = raw.map((row, index) => ({ ...normalizeTemplateRow(row), excelRow: index + 2 })).filter(hasComplaintTemplateData);
      if (!normalized.length) throw new Error("La plantilla no contiene quejas.");
      const missingIdRows = normalized.filter((row) => !String(row.id ?? "").trim());
      if (missingIdRows.length) {
        const details = missingIdRows.slice(0, 5).map((row) => {
          const reference = [row.code && `código ${row.code}`, row.createdDate && `fecha ${formatTemplateValue(row.createdDate)}`].filter(Boolean).join(", ");
          return `fila ${row.excelRow}${reference ? ` (${reference})` : ""}`;
        });
        throw new Error(`${missingIdRows.length} fila${missingIdRows.length === 1 ? "" : "s"} no ${missingIdRows.length === 1 ? "tiene" : "tienen"} ID: ${details.join("; ")}.`);
      }
      const enriched = await fillEstablishmentsFromClientCodes(normalized);
      const response = await fetch("/api/complaints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records: enriched }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo cargar la plantilla.");
      setMessage(`${body.inserted} quejas cargadas · ${body.matched} cruzadas con Seguimiento${body.duplicates ? ` · ${body.duplicates} duplicadas omitidas` : ""}.`);
      await loadRecords();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cargar la plantilla.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const visible = useMemo(() => {
    const needle = normalizeText(query);
    return records.filter((record) => {
      const closed = normalizeText(record.status).includes("cerrad");
      if (statusFilter === "open" && closed) return false;
      if (statusFilter === "closed" && !closed) return false;
      if (contractorFilter !== "all" && normalizeContractorName(record.contractor) !== contractorFilter) return false;
      if (matchFilter === "matched" && !record.matched) return false;
      if (matchFilter === "unmatched" && record.matched) return false;
      if (dateFrom && record.createdDate < dateFrom) return false;
      if (dateTo && record.createdDate > dateTo) return false;
      return !needle || normalizeText(`${record.id} ${record.closingTime} ${record.createdDate} ${record.code} ${record.establishment} ${record.issue} ${record.comments} ${record.status} ${record.dt} ${record.contractor} ${record.plate} ${record.responsible} ${record.driver} ${record.auxiliary}`).includes(needle);
    });
  }, [contractorFilter, dateFrom, dateTo, matchFilter, query, records, statusFilter]);

  function clearFilters() { setQuery(""); setStatusFilter("open"); setContractorFilter("all"); setMatchFilter("all"); setDateFrom(""); setDateTo(""); }

  async function exportComplaints(format: "excel" | "pdf") {
    if (!visible.length) { setError("No hay quejas visibles para exportar."); return; }
    setExporting(format); setError(""); setMessage("");
    try {
      if (format === "excel") await exportComplaintsExcel(visible);
      else await exportComplaintsPdf(visible);
      setMessage(`${visible.length} quejas exportadas en ${format === "excel" ? "Excel" : "PDF"}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo generar la exportacion.");
    } finally { setExporting(null); }
  }

  async function uploadEvidence(file?: File) {
    if (!selected || !file) return;
    setEvidenceBusy(true); setError("");
    try {
      const form = new FormData(); form.set("id", selected.id); form.set("file", file);
      const response = await fetch("/api/complaints/evidence", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo subir la evidencia.");
      const record = { ...selected, ...body.record };
      setSelected(record); setRecords((current) => current.map((item) => item.id === selected.id ? { ...item, ...record } : item));
      setMessage("Evidencia guardada correctamente.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo subir la evidencia."); }
    finally { setEvidenceBusy(false); }
  }

  async function closeComplaint() {
    if (!selected?.evidence) return;
    setEvidenceBusy(true); setError("");
    try {
      const response = await fetch("/api/complaints", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, action: "close" }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo cerrar la queja.");
      const record = { ...selected, ...body.record };
      setSelected(record); setRecords((current) => current.map((item) => item.id === selected.id ? { ...item, ...record } : item));
      setMessage("La queja quedo cerrada.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cerrar la queja."); }
    finally { setEvidenceBusy(false); }
  }

  async function saveComment(comments: string) {
    if (!selected) return;
    setEvidenceBusy(true); setError("");
    try {
      const response = await fetch("/api/complaints", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, action: "comment", comments }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo guardar el comentario.");
      const record = { ...selected, ...body.record, comments };
      setSelected(record); setRecords((current) => current.map((item) => item.id === selected.id ? { ...item, ...record } : item));
      setMessage("Comentario guardado correctamente.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar el comentario."); }
    finally { setEvidenceBusy(false); }
  }

  if (access === "checking") return <main className="min-h-screen bg-slate-50" />;
  if (access === "denied") return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="text-center"><AlertTriangle className="mx-auto text-amber-500" size={38} /><h1 className="mt-4 text-xl font-black text-slate-900">Modulo no disponible</h1><p className="mt-2 text-sm text-slate-500">Quejas esta habilitado para administracion, Logisticos, Punto Corona y Surti Cervezas.</p></section></main>;

  return (
    <main className="min-h-screen bg-[#eef2f5] text-slate-900">
      <header className="border-b border-[#17364d] bg-[#0b2235] text-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 sm:px-8">
          <button aria-label="Volver" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-white/10" onClick={() => router.push("/")} type="button"><ArrowLeft size={20} /></button>
          <div className="text-right"><p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-300">Control operativo</p><h1 className="text-xl font-bold">Quejas</h1></div>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] space-y-5 px-5 py-6 sm:px-8">
        <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-red-600">Gestion de novedades</p><h2 className="mt-1 text-2xl font-black text-[#10223d]">Quejas</h2><p className="mt-1 text-sm text-slate-500">{isAdminSession ? "Consulta el cumplimiento de cierre de las tres transportistas." : canUploadComplaints ? "Carga la plantilla para Logisticos, Punto Corona y Surti Cervezas, y consulta todos sus campos." : "Consulta las quejas asignadas a tu operacion y gestiona su evidencia."}</p></div>
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50" disabled={Boolean(exporting) || !visible.length} onClick={() => void exportComplaints("excel")} type="button">{exporting === "excel" ? <LoaderCircle className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}Exportar Excel</button>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50" disabled={Boolean(exporting) || !visible.length} onClick={() => void exportComplaints("pdf")} type="button">{exporting === "pdf" ? <LoaderCircle className="animate-spin" size={16} /> : <FileText size={16} />}Exportar PDF</button>
            {canUploadComplaints ? <>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50" onClick={() => void downloadTemplate()} type="button"><Download size={16} />Descargar plantilla</button>
            <input accept=".xlsx,.xls" className="hidden" onChange={(event) => void uploadFile(event.target.files?.[0])} ref={inputRef} type="file" />
            <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-50" disabled={uploading} onClick={() => inputRef.current?.click()} type="button">{uploading ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />}{uploading ? "Cargando" : "Subir quejas"}</button>
            </> : null}
          </div>
        </section>

        {message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</p> : null}
        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}

        <ComplaintFilters contractorFilter={contractorFilter} dateFrom={dateFrom} dateTo={dateTo} matchFilter={matchFilter} onClear={clearFilters} query={query} setContractorFilter={setContractorFilter} setDateFrom={setDateFrom} setDateTo={setDateTo} setMatchFilter={setMatchFilter} setQuery={setQuery} setStatusFilter={setStatusFilter} showContractor={isAdminSession || canUploadComplaints} statusFilter={statusFilter} total={records.length} visible={visible.length} />

        {!isAdminSession ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<MessageSquareWarning />} label="Quejas visibles" value={visible.length} />
          <Metric icon={<CheckCircle2 />} label="Quejas cerradas" value={records.filter((record) => normalizeText(record.status).includes("cerrad")).length} />
          <Metric icon={<Users />} label="Cruzadas con tripulacion" value={visible.filter(hasComplaintCrew).length} />
          <Metric icon={<FileSpreadsheet />} label="Sin tripulacion" value={visible.filter((record) => !hasComplaintCrew(record)).length} />
        </div> : null}

        {isAdminSession ? <ComplaintAdminCharts now={now} records={visible} /> : <ComplaintRecordsTable loading={loading} now={now} onSelect={setSelected} records={visible} />}
      </section>
      {selected ? <ComplaintModal busy={evidenceBusy} complaint={selected} now={now} onClose={() => setSelected(null)} onCloseComplaint={() => void closeComplaint()} onSaveComment={(comments) => void saveComment(comments)} onUpload={(file) => void uploadEvidence(file)} /> : null}
    </main>
  );
}

type ComplaintFiltersProps = {
  contractorFilter: string; dateFrom: string; dateTo: string; matchFilter: string; query: string; statusFilter: string;
  total: number; visible: number; showContractor: boolean; onClear: () => void;
  setContractorFilter: (value: string) => void; setDateFrom: (value: string) => void; setDateTo: (value: string) => void;
  setMatchFilter: (value: string) => void; setQuery: (value: string) => void; setStatusFilter: (value: string) => void;
};

function ComplaintRecordsTable({ loading, now, onSelect, records }: { loading: boolean; now: number; onSelect: (record: ComplaintRecord) => void; records: ComplaintRecord[] }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-200 p-4"><h2 className="font-black text-[#10223d]">Quejas cargadas</h2><p className="text-xs text-slate-500">{records.length} registros visibles</p></div>
    <div className="max-h-[650px] overflow-auto">
      <table className="w-full min-w-[1250px] text-left text-xs">
        <thead className="sticky top-0 bg-[#10223d] text-[10px] uppercase tracking-wider text-white"><tr><th className="px-3 py-3">ID</th><th className="px-3 py-3">Tiempo para cierre</th><th className="px-3 py-3">Fecha creacion</th><th className="px-3 py-3">Codigo</th><th className="px-3 py-3">Establecimiento</th><th className="px-3 py-3">Novedad</th><th className="px-3 py-3">Transportista</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Cruce seguimiento</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{records.map((record) => <tr className={hasComplaintCrew(record) ? "hover:bg-slate-50" : "bg-amber-50/60"} key={record.id}><td className="px-3 py-3 font-bold">{record.id}</td><td className="px-3 py-3"><ClosingCountdown deadline={record.closingTime} now={now} status={record.status} /></td><td className="whitespace-nowrap px-3 py-3">{record.createdDate}</td><td className="px-3 py-3">{record.code || "-"}</td><td className="max-w-56 px-3 py-3">{record.establishment || "-"}</td><td className="max-w-64 px-3 py-3"><button className="text-left font-bold text-red-700 underline decoration-red-300 underline-offset-2 hover:text-red-900" onClick={() => onSelect(record)} type="button">{record.issue || "Ver novedad"}</button></td><td className="px-3 py-3">{record.contractor || "-"}</td><td className="px-3 py-3"><span className={`rounded-md px-2 py-1 font-black ${normalizeText(record.status).includes("cerrad") ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>{record.status || "Abierta"}</span></td><td className="px-3 py-3"><b>{record.dt ? `DT ${record.dt}` : "Sin DT en plantilla"}</b><span className="block text-[10px] text-slate-500">{record.plate || (hasComplaintCrew(record) ? "Tripulacion encontrada" : "Sin tripulacion")}</span></td></tr>)}</tbody>
      </table>
      {!loading && !records.length ? <p className="p-10 text-center text-sm text-slate-400">No hay quejas para mostrar.</p> : null}
    </div>
  </section>;
}

function ComplaintFilters(props: ComplaintFiltersProps) {
  const inputClass = "h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500";
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Filter className="text-blue-700" size={18} /><div><h2 className="font-black text-[#10223d]">Filtros</h2><p className="text-xs text-slate-500">Mostrando {props.visible} de {props.total} quejas</p></div></div><button className="text-xs font-black text-blue-700 hover:underline" onClick={props.onClear} type="button">Limpiar filtros</button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><input className={`${inputClass} xl:col-span-2`} onChange={(event) => props.setQuery(event.target.value)} placeholder="Buscar ID, DT, placa, persona..." value={props.query} /><select className={inputClass} onChange={(event) => props.setStatusFilter(event.target.value)} value={props.statusFilter}><option value="all">Todos los estados</option><option value="open">Abiertas</option><option value="closed">Cerradas</option></select>{props.showContractor ? <select className={inputClass} onChange={(event) => props.setContractorFilter(event.target.value)} value={props.contractorFilter}><option value="all">Transportistas</option><option value="logisticos">Logisticos</option><option value="puntocorona">Punto Corona</option><option value="surticervezas">Surti Cervezas</option></select> : null}<select className={inputClass} onChange={(event) => props.setMatchFilter(event.target.value)} value={props.matchFilter}><option value="all">Todos los cruces</option><option value="matched">Con cruce</option><option value="unmatched">Sin cruce</option></select><div className="flex gap-2"><input aria-label="Fecha desde" className={`${inputClass} min-w-0 flex-1 px-2`} onChange={(event) => props.setDateFrom(event.target.value)} title="Fecha desde" type="date" value={props.dateFrom} /><input aria-label="Fecha hasta" className={`${inputClass} min-w-0 flex-1 px-2`} onChange={(event) => props.setDateTo(event.target.value)} title="Fecha hasta" type="date" value={props.dateTo} /></div></div></section>;
}

function normalizeTemplateRow(row: Record<string, unknown>) {
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeText(key), value]));
  return {
    id: normalized.get("id") || "",
    closingTime: normalized.get("tiempoparacierre") || "",
    createdDate: normalized.get("fechacreacion") || "",
    code: normalized.get("codigo") || "",
    establishment: normalized.get("establecimiento") || "",
    issue: normalized.get("novedad") || "",
    contractor: normalized.get("transportista") || "",
    status: normalized.get("estado") || "",
    dt: normalized.get("dt") || "",
  };
}

function hasComplaintTemplateData(row: ReturnType<typeof normalizeTemplateRow>) {
  return [row.id, row.createdDate, row.code, row.establishment, row.issue, row.contractor, row.status, row.dt]
    .some((value) => String(value ?? "").trim());
}

function formatTemplateValue(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toLocaleDateString("es-CO");
  return String(value ?? "").trim();
}

function normalizeText(value: unknown) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase(); }
function hasComplaintCrew(record: ComplaintRecord) { return Boolean(record.plate || record.responsible || record.driver || record.auxiliary); }

const EXPORT_COLUMNS: Array<{ header: string; key: keyof ComplaintRecord; width: number }> = [
  { header: "ID", key: "id", width: 16 },
  { header: "Fecha creacion", key: "createdDate", width: 16 },
  { header: "Tiempo para cierre", key: "closingTime", width: 22 },
  { header: "Codigo", key: "code", width: 15 },
  { header: "Establecimiento", key: "establishment", width: 28 },
  { header: "Novedad", key: "issue", width: 48 },
  { header: "Transportista", key: "contractor", width: 18 },
  { header: "Estado", key: "status", width: 14 },
  { header: "DT", key: "dt", width: 16 },
  { header: "Placa", key: "plate", width: 14 },
  { header: "Responsable", key: "responsible", width: 24 },
  { header: "Conductor", key: "driver", width: 24 },
  { header: "Auxiliar", key: "auxiliary", width: 24 },
  { header: "Comentario", key: "comments", width: 38 },
];

async function exportComplaintsExcel(records: ComplaintRecord[]) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Bavaria - Modulo de Quejas";
  const sheet = workbook.addWorksheet("Quejas", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [...EXPORT_COLUMNS, { header: "Evidencia", key: "evidenceExport", width: 28 }];
  const header = sheet.getRow(1);
  header.height = 24;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF10223D" } };
  header.alignment = { vertical: "middle" };

  for (const record of records) {
    const row = sheet.addRow({ ...record, evidenceExport: record.evidence?.name || "Sin evidencia" });
    row.alignment = { vertical: "top", wrapText: true };
    row.height = record.evidence?.type?.startsWith("image/") ? 92 : 42;
    const evidenceCell = row.getCell(EXPORT_COLUMNS.length + 1);
    if (!record.evidence) continue;
    const evidenceUrl = absoluteEvidenceUrl(record.id);
    evidenceCell.value = { text: record.evidence.name, hyperlink: evidenceUrl };
    evidenceCell.font = { color: { argb: "FF2563EB" }, underline: true };
    if (!record.evidence.type.startsWith("image/")) continue;
    const dataUrl = await fetchEvidenceDataUrl(record.id);
    const extension = record.evidence.type === "image/jpeg" ? "jpeg" : "png";
    const imageId = workbook.addImage({ base64: dataUrl, extension });
    sheet.addImage(imageId, {
      tl: { col: EXPORT_COLUMNS.length, row: row.number - 1 },
      ext: { width: 150, height: 110 },
      editAs: "oneCell",
    });
  }

  sheet.autoFilter = { from: "A1", to: `${excelColumnName(EXPORT_COLUMNS.length + 1)}1` };
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), exportFileName("xlsx"));
}

async function exportComplaintsPdf(records: ComplaintRecord[]) {
  const { jsPDF } = await import("jspdf");
  const document = new jsPDF({ format: "a4", unit: "mm" });
  for (let index = 0; index < records.length; index += 1) {
    if (index) document.addPage();
    const record = records[index];
    document.setFillColor(16, 34, 61); document.rect(0, 0, 210, 24, "F");
    document.setTextColor(255, 255, 255); document.setFontSize(15); document.setFont("helvetica", "bold");
    document.text("Reporte de queja", 14, 15);
    document.setTextColor(15, 23, 42); document.setFontSize(9);
    let y = 32;
    const fields: Array<[string, string]> = [
      ["ID", record.id], ["Fecha", record.createdDate], ["Estado", record.status || "Abierta"],
      ["Transportista", record.contractor], ["DT / Placa", `${record.dt || "Sin DT"} / ${record.plate || "Sin placa"}`],
      ["Establecimiento", record.establishment], ["Responsable", personLabel(record.responsible, record.responsibleId)],
      ["Conductor", personLabel(record.driver, record.driverId)], ["Auxiliar", personLabel(record.auxiliary, record.auxiliaryId)],
      ["Novedad", record.issue], ["Comentario", record.comments || "Sin comentario"],
    ];
    for (const [label, value] of fields) {
      document.setFont("helvetica", "bold"); document.text(`${label}:`, 14, y);
      document.setFont("helvetica", "normal");
      const lines = document.splitTextToSize(String(value || "Sin dato"), 156) as string[];
      document.text(lines, 40, y); y += Math.max(6, lines.length * 4.2);
    }
    if (record.evidence) {
      document.setFont("helvetica", "bold"); document.text("Evidencia:", 14, y); y += 5;
      if (record.evidence.type.startsWith("image/")) {
        const dataUrl = await fetchEvidenceDataUrl(record.id);
        const size = await imageFit(dataUrl, 180, Math.max(35, 275 - y));
        document.addImage(dataUrl, record.evidence.type === "image/jpeg" ? "JPEG" : "PNG", 14, y, size.width, size.height, undefined, "FAST");
      } else {
        document.setTextColor(37, 99, 235);
        document.textWithLink(record.evidence.name, 14, y, { url: absoluteEvidenceUrl(record.id) });
      }
    } else { document.setTextColor(100, 116, 139); document.text("Sin evidencia", 14, y); }
    document.setTextColor(100, 116, 139); document.setFontSize(8);
    document.text(`Pagina ${index + 1} de ${records.length}`, 196, 291, { align: "right" });
  }
  document.save(exportFileName("pdf"));
}

async function fetchEvidenceDataUrl(id: string) {
  const response = await fetch(`/api/complaints/evidence?id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo descargar la evidencia de la queja ${id}.`);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("No se pudo leer una evidencia.")); reader.readAsDataURL(blob);
  });
}

function absoluteEvidenceUrl(id: string) { return `${window.location.origin}/api/complaints/evidence?id=${encodeURIComponent(id)}`; }
function exportFileName(extension: "xlsx" | "pdf") { return `quejas_${new Date().toISOString().slice(0, 10)}.${extension}`; }
function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1_000); }
function excelColumnName(index: number) { let value = index; let result = ""; while (value) { value -= 1; result = String.fromCharCode(65 + (value % 26)) + result; value = Math.floor(value / 26); } return result; }
async function imageFit(dataUrl: string, maxWidth: number, maxHeight: number) { const image = new Image(); image.src = dataUrl; await image.decode(); const ratio = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1); return { width: image.naturalWidth * ratio, height: image.naturalHeight * ratio }; }

async function fillEstablishmentsFromClientCodes<T extends { code: unknown; establishment: unknown }>(rows: T[]) {
  const codes = Array.from(new Set(rows.map((row) => String(row.code ?? "").replace(/\D/g, "")).filter(Boolean)));
  const names = new Map<string, string>();
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < codes.length) {
      const code = codes[nextIndex++];
      const response = await fetch(`/api/clientes?codigo=${encodeURIComponent(code)}`, { cache: "no-store" });
      if (!response.ok) continue;
      const body = await response.json().catch(() => ({}));
      const name = String(body?.cliente?.nombre || "").trim();
      if (name) names.set(code, name);
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, codes.length) }, () => worker()));
  return rows.map((row) => {
    const code = String(row.code ?? "").replace(/\D/g, "");
    return { ...row, establishment: names.get(code) || row.establishment };
  });
}
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <article className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className="grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-red-700">{icon}</span><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="text-2xl font-black text-[#10223d]">{value.toLocaleString("es-CO")}</p></div></article>; }

function ComplaintAdminCharts({ now, records }: { now: number; records: ComplaintRecord[] }) {
  const contractors = ["Logisticos", "Punto Corona", "Surti Cervezas"];
  const contractorGroups = contractors.map((contractor) => ({
    contractor,
    records: records.filter((record) => normalizeContractorName(record.contractor) === normalizeContractorName(contractor)),
  }));
  const identifiedIds = new Set(contractorGroups.flatMap((group) => group.records.map((record) => record.id)));
  const groups = [
    ...contractorGroups,
    { contractor: "Por identificar", records: records.filter((record) => !identifiedIds.has(record.id)) },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5">
        <p className="text-[10px] font-black uppercase tracking-[.16em] text-red-600">Indicadores de cierre</p>
        <h2 className="mt-1 text-xl font-black text-[#10223d]">Cumplimiento de quejas por transportista</h2>
        <p className="mt-1 text-xs text-slate-500">Porcentaje de quejas cerradas sobre el total asignado.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {groups.map((group) => <ComplaintDonut key={group.contractor} label={group.contractor} records={group.records} />)}
        <ComplaintDonut general label="General · todas las quejas" records={records} />
      </div>
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-blue-700">Control de tiempos</p><h3 className="mt-1 text-lg font-black text-[#10223d]">Quejas activas por vencimiento</h3><p className="mt-1 text-xs text-slate-500">Distribucion de casos abiertos según su plazo operativo.</p></div>
          <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider"><span className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-700">Dentro del plazo</span><span className="rounded-full bg-red-100 px-3 py-1.5 text-red-700">Plazo vencido</span></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="bg-[#10223d] text-[10px] uppercase tracking-[.12em] text-white">
              <tr><th className="px-5 py-3.5">Transportista</th><th className="px-4 py-3.5 text-center">Activas</th><th className="px-4 py-3.5 text-center">Dentro de 48 horas</th><th className="px-4 py-3.5 text-center">Pasadas de 48 horas</th><th className="w-56 px-5 py-3.5">Distribucion</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groups.map((group) => <ComplaintDeadlineRow key={group.contractor} label={group.contractor} now={now} records={group.records} />)}
              <ComplaintDeadlineRow general label="General" now={now} records={records} />
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ComplaintDeadlineRow({ general = false, label, now, records }: { general?: boolean; label: string; now: number; records: ComplaintRecord[] }) {
  const active = records.filter((record) => !normalizeText(record.status).includes("cerrad") && !["future", "invalid"].includes(record.closingTime));
  const withinWindow = active.filter((record) => {
    const deadline = new Date(record.closingTime).getTime();
    return Number.isFinite(deadline) && deadline > now;
  }).length;
  const overdue = active.filter((record) => record.closingTime === "expired" || (Number.isFinite(new Date(record.closingTime).getTime()) && new Date(record.closingTime).getTime() <= now)).length;
  const percentage = (value: number) => active.length ? Math.round((value / active.length) * 100) : 0;

  return (
    <tr className={general ? "border-t-2 border-slate-300 bg-slate-100 font-black text-[#10223d]" : "bg-white transition hover:bg-slate-50"}>
      <td className="px-5 py-4"><div className="flex items-center gap-3"><span className={`h-9 w-1.5 rounded-full ${general ? "bg-[#10223d]" : "bg-blue-500"}`} /><div><p className="font-black">{label}</p><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Seguimiento de SLA</p></div></div></td>
      <td className="px-4 py-4 text-center"><b className="text-2xl text-blue-700">{active.length}</b><span className="block text-[10px] font-bold uppercase text-slate-400">casos</span></td>
      <td className="px-4 py-4 text-center"><b className="text-xl text-emerald-600">{withinWindow}</b><span className="block text-[10px] font-bold text-emerald-700">{percentage(withinWindow)}%</span></td>
      <td className="px-4 py-4 text-center"><b className="text-xl text-red-600">{overdue}</b><span className="block text-[10px] font-bold text-red-700">{percentage(overdue)}%</span></td>
      <td className="px-5 py-4"><div className="flex h-3 overflow-hidden rounded-full bg-slate-200" title={`${withinWindow} en plazo · ${overdue} vencidas`}><span className="bg-emerald-500" style={{ width: `${percentage(withinWindow)}%` }} /><span className="bg-red-500" style={{ width: `${percentage(overdue)}%` }} /></div><p className="mt-1.5 text-right text-[9px] font-bold uppercase tracking-wider text-slate-400">100% de activas</p></td>
    </tr>
  );
}

function ComplaintDonut({ general = false, label, records }: { general?: boolean; label: string; records: ComplaintRecord[] }) {
  const closed = records.filter((record) => normalizeText(record.status).includes("cerrad")).length;
  const total = records.length;
  const open = Math.max(total - closed, 0);
  const percentage = total ? Math.round((closed / total) * 100) : 0;
  const color = general ? "#10223d" : percentage >= 80 ? "#047857" : percentage >= 50 ? "#d97706" : "#dc2626";

  return (
    <article className={`rounded-2xl border p-4 ${general ? "border-slate-800 bg-slate-950 text-white" : "border-slate-200 bg-slate-50 text-[#10223d]"}`}>
      <p className={`text-xs font-black uppercase tracking-[.12em] ${general ? "text-cyan-300" : "text-slate-600"}`}>{label}</p>
      <div className="mt-4 flex items-center gap-4">
        <div className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${color} ${percentage}%, ${general ? "#334155" : "#e2e8f0"} 0)` }}>
          <div className={`grid h-20 w-20 place-items-center rounded-full ${general ? "bg-slate-950" : "bg-white"}`}>
            <span className="text-2xl font-black">{percentage}%</span>
          </div>
        </div>
        <div className="min-w-0 space-y-2 text-sm">
          <p><b className="text-lg">{total}</b><span className={general ? " text-slate-400" : " text-slate-500"}> quejas</span></p>
          <p className="font-bold text-emerald-600">{closed} cerradas</p>
          <p className="font-bold text-red-500">{open} abiertas</p>
        </div>
      </div>
    </article>
  );
}
function ClosingCountdown({ deadline, now, status }: { deadline: string; now: number; status: string }) {
  if (normalizeText(status).includes("cerrad")) return <span className="rounded-md bg-emerald-100 px-2 py-1 font-black text-emerald-700">Cerrada</span>;
  if (deadline === "expired") return <span className="inline-block rounded-md bg-red-100 px-2 py-1 font-black leading-4 text-red-700">Plazo vencido<br />Sin cerrar</span>;
  if (deadline === "future") return <span className="inline-block rounded-md bg-red-100 px-2 py-1 font-black leading-4 text-red-700">Plazo vencido<br />Sin cerrar</span>;
  if (deadline === "invalid") return <span className="text-slate-400">Sin fecha valida</span>;
  const remaining = new Date(deadline).getTime() - now;
  if (!deadline || !Number.isFinite(remaining)) return <span className="text-slate-400">Sin cronometro</span>;
  if (remaining <= 0) return <span className="rounded-md bg-red-100 px-2 py-1 font-black text-red-700">Vencida</span>;
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const urgent = remaining <= 6 * 60 * 60 * 1000;
  return <span className={`whitespace-nowrap rounded-md px-2 py-1 font-mono font-black ${urgent ? "bg-amber-100 text-amber-800" : "bg-blue-50 text-blue-700"}`}>{String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</span>;
}

function ComplaintModal({ busy, complaint, now, onClose, onCloseComplaint, onSaveComment, onUpload }: { busy: boolean; complaint: ComplaintRecord; now: number; onClose: () => void; onCloseComplaint: () => void; onSaveComment: (comments: string) => void; onUpload: (file?: File) => void }) {
  const closed = normalizeText(complaint.status).includes("cerrad");
  const [comment, setComment] = useState(complaint.comments || "");
  return <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" role="dialog" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-200 bg-red-50 p-5"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-red-700">Detalle de la novedad</p><h2 className="mt-1 text-xl font-black text-[#10223d]">{complaint.establishment || `Queja ${complaint.id}`}</h2><p className="mt-1 text-xs text-slate-500">DT {complaint.dt || "sin dato"} · Placa {complaint.plate || "sin cruce"}</p></div><button aria-label="Cerrar ventana" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white" onClick={onClose} type="button"><X size={18} /></button></header><div className="space-y-4 p-5"><div className="grid gap-3 sm:grid-cols-2"><Detail label="Novedad" value={complaint.issue || "Sin descripcion"} /><Detail label="Estado" value={complaint.status || "Abierta"} /><Detail label="Responsable" value={personLabel(complaint.responsible, complaint.responsibleId)} /><Detail label="Conductor" value={personLabel(complaint.driver, complaint.driverId)} /><Detail label="Auxiliar" value={personLabel(complaint.auxiliary, complaint.auxiliaryId)} /><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Tiempo restante</p><div className="mt-2"><ClosingCountdown deadline={complaint.closingTime} now={now} status={complaint.status} /></div></div></div><section className="rounded-xl border border-slate-200 p-4"><label className="text-sm font-black text-[#10223d]" htmlFor={`complaint-comment-${complaint.id}`}>Comentario</label><p className="mt-1 text-xs text-slate-500">Agrega una observación sobre la gestión de esta queja.</p><textarea className="mt-3 min-h-24 w-full resize-y rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-blue-500" disabled={busy} id={`complaint-comment-${complaint.id}`} maxLength={2000} onChange={(event) => setComment(event.target.value)} placeholder="Escribe un comentario..." value={comment} /><div className="mt-2 flex items-center justify-between gap-3"><span className="text-[10px] text-slate-400">{comment.length}/2000</span><button className="h-9 rounded-lg bg-blue-700 px-4 text-xs font-black text-white disabled:opacity-50" disabled={busy || comment === (complaint.comments || "")} onClick={() => onSaveComment(comment)} type="button">Guardar comentario</button></div></section><section className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black text-[#10223d]">Evidencia obligatoria</p><p className="mt-1 text-xs text-slate-500">Archivo PDF o PNG, maximo 5 MB.</p></div>{complaint.evidence ? <a className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-black text-blue-700" href={`/api/complaints/evidence?id=${encodeURIComponent(complaint.id)}`} rel="noreferrer" target="_blank"><ExternalLink size={14} />Ver evidencia</a> : null}</div><label className={`mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-4 text-sm font-bold text-slate-600 hover:bg-slate-50 ${closed ? "pointer-events-none opacity-50" : ""}`}><Paperclip size={17} />{busy ? "Procesando..." : complaint.evidence ? "Reemplazar evidencia" : "Subir evidencia"}<input accept="application/pdf,image/png,.pdf,.png" className="hidden" disabled={busy || closed} onChange={(event) => onUpload(event.target.files?.[0])} type="file" /></label>{complaint.evidence ? <p className="mt-2 text-xs font-semibold text-emerald-700">{complaint.evidence.name}</p> : <p className="mt-2 text-xs font-semibold text-red-600">No puedes cerrar la queja sin evidencia.</p>}</section><button className="h-11 w-full rounded-lg bg-emerald-700 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300" disabled={busy || !complaint.evidence || closed} onClick={onCloseComplaint} type="button">{closed ? "Queja cerrada" : "Cerrar queja"}</button></div></section></div>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-[#10223d]">{value}</p></div>; }
function personLabel(name: string, id: string) { return name ? `${name}${id ? ` · ${id}` : ""}` : "Sin dato en Seguimiento"; }
