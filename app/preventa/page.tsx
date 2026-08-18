"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BarChart3, Check, Clock3, Download, Pencil, Phone, RefreshCw, Search, Upload, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";

type ProductLine = { order: string; customer_order: string; material: string; product: string; boxes: number; hectoliters: number; net_value: number; gross_weight: number };
type EditEntry = { editor: string; at: string; from: string; to: string; client_code: string; client_name: string };
type RecordRow = { id: string; contractor: string; batch_id: string; batch_name: string; client_code: string; client_name: string; phone: string; previous_refusals: number; products?: ProductLine[]; call_result: "pendiente" | "si" | "no"; no_contact_reason: string; notes: string; caller_name?: string; last_edited_by?: string; edit_history?: EditEntry[]; called_at?: string; created_at: string };
type Offender = { contractor: string; client_code: string; client_name: string; phone: string; refusals: number; rejected_boxes: number; events: Array<{ date: string; contractor: string; boxes: number }> };
type Session = { contractor: string; isAdmin?: boolean };
const CONTRACTORS = ["Logisticos", "Punto Corona", "Surti Cervezas"];
const REASONS = ["No contesta", "Numero apagado", "Numero equivocado", "Fuera de servicio", "Buzon de voz", "Cliente no disponible", "Otro"];
const NO_RECEIVE_REASON = "Cliente confirma que no recibe";
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export default function PreventaPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [historicalOffenders, setHistoricalOffenders] = useState<Offender[]>([]);
  const [contractor, setContractor] = useState("");
  const [batch, setBatch] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState(TODAY);
  const [dateTo, setDateTo] = useState(TODAY);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState("");
  const [selectedClient, setSelectedClient] = useState<RecordRow | null>(null);
  const [selectedOffender, setSelectedOffender] = useState<Offender | null>(null);
  const [callerName, setCallerName] = useState("");
  const [callerDraft, setCallerDraft] = useState("");
  const [showCallerStats, setShowCallerStats] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { result?: "si" | "no"; reason?: string; notes?: string; editing?: boolean }>>({});

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ from, to });
      const [sessionResponse, dataResponse] = await Promise.all([fetch("/api/session/session", { cache: "no-store" }), fetch(`/api/preventa?${query}`, { cache: "no-store" })]);
      const sessionBody = await sessionResponse.json().catch(() => ({}));
      const dataBody = await dataResponse.json().catch(() => ({}));
      if (!sessionResponse.ok || !dataResponse.ok) throw new Error(dataBody.error || "No autorizado.");
      setSession(sessionBody.session);
      setContractor(sessionBody.session.isAdmin ? "Todas" : sessionBody.session.contractor);
      setRows(dataBody.records || []);
      setHistoricalOffenders(dataBody.offenders || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cargar preventa."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { setCallerName(sessionStorage.getItem("preventa.caller-name") || ""); }, []);
  useEffect(() => { if (dateFrom && dateTo && dateFrom <= dateTo) void load(dateFrom, dateTo); }, [dateFrom, dateTo, load]);

  const batches = useMemo(() => Array.from(new Map(rows.filter((row) => contractor === "Todas" || row.contractor === contractor).map((row) => [row.batch_id, row])).values()), [rows, contractor]);
  const visible = useMemo(() => rows.filter((row) => {
    const text = `${row.client_code} ${row.client_name} ${row.phone}`.toLowerCase();
    const matchesStatus = status === "todos" || status === "pendiente" && row.call_result === "pendiente" || status === "si" && row.call_result === "si" || status === "no_recibe" && row.call_result === "no" && row.no_contact_reason === NO_RECEIVE_REASON || status === "no_contactado" && row.call_result === "no" && row.no_contact_reason !== NO_RECEIVE_REASON;
    return (contractor === "Todas" || row.contractor === contractor) && (batch === "todos" || row.batch_id === batch) && matchesStatus && text.includes(query.toLowerCase().trim());
  }).sort((a, b) => Number(a.call_result !== "pendiente") - Number(b.call_result !== "pendiente") || b.previous_refusals - a.previous_refusals || a.client_name.localeCompare(b.client_name, "es")), [rows, contractor, batch, status, query]);
  const stats = useMemo(() => ({ total: visible.length, pending: visible.filter((r) => r.call_result === "pendiente").length, yes: visible.filter((r) => r.call_result === "si").length, noReceive: visible.filter((r) => r.call_result === "no" && r.no_contact_reason === NO_RECEIVE_REASON).length, noContact: visible.filter((r) => r.call_result === "no" && r.no_contact_reason !== NO_RECEIVE_REASON).length }), [visible]);
  const modulationTableRows = useMemo(() => historicalOffenders.slice(0, 10), [historicalOffenders]);
  const offendersByCode = useMemo(() => new Map(historicalOffenders.map((row) => [row.client_code.trim().toLowerCase(), row])), [historicalOffenders]);
  const reasonData = useMemo(() => REASONS.map((reason) => ({ reason, count: visible.filter((r) => r.call_result === "no" && r.no_contact_reason === reason).length })).filter((item) => item.count).sort((a, b) => b.count - a.count), [visible]);
  const callQueue = useMemo(() => (status === "todos" || status === "pendiente" ? visible.filter((row) => row.call_result === "pendiente") : visible).slice(0, 10), [status, visible]);
  const callerStats = useMemo(() => {
    const totals = new Map<string, { name: string; calls: number; edits: number; history: EditEntry[] }>();
    rows.forEach((row) => {
      if (row.call_result !== "pendiente" && row.caller_name) {
        const key = row.caller_name.trim().toLocaleLowerCase("es"); const item = totals.get(key) || { name: row.caller_name.trim(), calls: 0, edits: 0, history: [] }; item.calls += 1; totals.set(key, item);
      }
      (row.edit_history || []).forEach((entry) => { if (!entry.editor) return; const key = entry.editor.trim().toLocaleLowerCase("es"); const item = totals.get(key) || { name: entry.editor.trim(), calls: 0, edits: 0, history: [] }; item.edits += 1; item.history.push(entry); totals.set(key, item); });
      if (row.last_edited_by && !(row.edit_history || []).length) { const key = row.last_edited_by.trim().toLocaleLowerCase("es"); const item = totals.get(key) || { name: row.last_edited_by.trim(), calls: 0, edits: 0, history: [] }; item.edits += 1; item.history.push({ editor: row.last_edited_by, at: row.called_at || "", from: "Respuesta anterior", to: formatCallOutcome(row.call_result, row.no_contact_reason), client_code: row.client_code, client_name: row.client_name }); totals.set(key, item); }
    });
    return Array.from(totals.values()).sort((a, b) => b.calls - a.calls || b.edits - a.edits || a.name.localeCompare(b.name, "es"));
  }, [rows]);

  async function upload(file?: File) {
    if (!file) return;
    const target = session?.isAdmin ? contractor : session?.contractor;
    if (!target || target === "Todas") { setError("Selecciona una contratista antes de subir el Excel."); return; }
    setUploading(true); setError(""); setMessage("");
    try {
      const form = new FormData(); form.set("file", file); form.set("contractor", target);
      const response = await fetch("/api/preventa/upload", { method: "POST", body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo importar.");
      setMessage(`${body.imported} clientes cargados desde ${body.fileName}.`); await load(dateFrom, dateTo); setBatch(body.batchId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo importar."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const headers = [
      "Documento",
      "Cliente",
      "No ped Cli",
      "Material",
      "Material",
      "Valor neto",
      "Cajas",
      "Hectolitro",
      "NOMBRE DEL ESTABLECIMIENTO",
    ];
    const worksheet = XLSX.utils.aoa_to_sheet([headers]);
    worksheet["!cols"] = [18, 16, 20, 16, 36, 18, 12, 14, 38].map((wch) => ({ wch }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Preventa");
    XLSX.writeFile(workbook, "plantilla_preventa.xlsx");
  }

  async function save(row: RecordRow, override?: { result?: "pendiente" | "si" | "no"; reason?: string; notes?: string }) {
    if (!callerName.trim()) { setError("Ingresa el nombre de la persona que realiza la llamada."); return; }
    const draft = { ...(drafts[row.id] || {}), ...override };
    if (!draft.result) { setError("Selecciona Sí recibe, No recibe o No contactado."); return; }
    if (draft.result === "no" && !draft.reason) { setError("Selecciona la causa del no contacto."); return; }
    setSaving(row.id); setError("");
    try {
      const response = await fetch("/api/preventa", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, contractor: row.contractor, callResult: draft.result, reason: draft.reason, notes: draft.notes, callerName }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo guardar.");
      setRows((current) => current.map((item) => item.id === row.id ? body.record : item));
      setDrafts((current) => { const next = { ...current }; delete next[row.id]; return next; });
      setMessage(`${row.client_name || row.client_code} quedo guardado en la base de datos.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar."); }
    finally { setSaving(""); }
  }

  async function refreshCalls() {
    setMessage("");
    await load(dateFrom, dateTo);
    setMessage("Top 10 actualizado con los siguientes clientes pendientes.");
  }

  function enterCaller() {
    const name = callerDraft.trim().replace(/\s+/g, " ");
    if (name.length < 3) { setError("Escribe el nombre completo de la persona que realizará las llamadas."); return; }
    sessionStorage.setItem("preventa.caller-name", name); setCallerName(name); setCallerDraft(""); setError("");
  }

  return <main className="min-h-screen bg-[#f3f5f8] text-slate-900">
    {!callerName ? <CallerGate error={error} value={callerDraft} onChange={setCallerDraft} onEnter={enterCaller}/> : null}
    <header className="border-b border-slate-200 bg-[#101c36] text-white">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 sm:px-8">
        <button className="grid h-10 w-10 place-items-center rounded-lg hover:bg-white/10" onClick={() => router.push("/")}><ArrowLeft size={20} /></button>
        <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[.22em] text-violet-300">Gestion comercial</p><h1 className="text-xl font-semibold">Preventa y confirmacion de entrega</h1></div>
      </div>
    </header>
    <section className="mx-auto max-w-[1500px] space-y-5 px-4 py-6 sm:px-8">
      {error && <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}<button onClick={() => setError("")}><X size={17}/></button></div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div>}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-600">Base de llamadas</p><h2 className="mt-1 text-2xl font-bold text-[#101c36]">Clientes programados para preventa</h2><p className="mt-1 text-sm text-slate-500">Plantilla basada en el archivo operativo de preventa; teléfonos y rechazos se cruzan automáticamente.</p></div>
          <div className="flex flex-wrap gap-2">
            <label className="flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[10px] font-bold uppercase text-slate-500">Desde<input className="bg-transparent text-xs font-semibold text-slate-700 outline-none" max={dateTo} onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom}/></label>
            <label className="flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-[10px] font-bold uppercase text-slate-500">Hasta<input className="bg-transparent text-xs font-semibold text-slate-700 outline-none" min={dateFrom} onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo}/></label>
            <button className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50" onClick={() => setShowCallerStats(true)} type="button"><Users size={16}/>Rendimiento</button>
            <button className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50" onClick={() => { sessionStorage.removeItem("preventa.caller-name"); setCallerName(""); }} type="button">Operador: {callerName || "Sin identificar"}</button>
            {session?.isAdmin && <select className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold" value={contractor} onChange={(e) => { setContractor(e.target.value); setBatch("todos"); }}><option>Todas</option>{CONTRACTORS.map((value) => <option key={value}>{value}</option>)}</select>}
            <button onClick={() => void downloadTemplate()} className="inline-flex h-11 items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 text-sm font-bold text-violet-700 hover:bg-violet-100" type="button"><Download size={17}/>Descargar plantilla</button>
            <input ref={fileRef} className="hidden" type="file" accept=".xlsx,.xls" onChange={(e) => void upload(e.target.files?.[0])}/>
            <button disabled={uploading} onClick={() => fileRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-700 disabled:bg-slate-400"><Upload size={17}/>{uploading ? "Importando..." : "Subir preventa"}</button>
          </div>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Stat icon={<Users/>} label="Clientes" value={stats.total}/><Stat icon={<Clock3/>} label="Pendientes" value={stats.pending} tone="amber"/><Stat icon={<Check/>} label="Sí reciben" value={stats.yes} tone="green"/><Stat icon={<X/>} label="No reciben" value={stats.noReceive} tone="red"/><Stat icon={<Phone/>} label="No contactados" value={stats.noContact} tone="red"/></div>
      <section>
        <ChartCard title="Resultado de llamadas" subtitle="Avance despues de gestionar la preventa"><div className="flex min-h-48 items-center justify-center gap-6"><Donut yes={stats.yes} noReceive={stats.noReceive} noContact={stats.noContact} pending={stats.pending}/><div className="space-y-2 text-xs"><Legend color="bg-emerald-500" label="Sí recibe" value={stats.yes}/><Legend color="bg-rose-600" label="No recibe" value={stats.noReceive}/><Legend color="bg-red-400" label="No contactado" value={stats.noContact}/><Legend color="bg-amber-400" label="Pendiente" value={stats.pending}/></div></div></ChartCard>
      </section>
      {reasonData.length > 0 && <ChartCard title="Causales de no contacto" subtitle="Motivos seleccionados por el equipo"><Bars rows={reasonData.map((r) => ({ label: r.reason, value: r.count }))} color="bg-red-500" empty=""/></ChartCard>}
      <div className="grid items-stretch gap-4 xl:grid-cols-2">
      <section className="flex h-[620px] min-w-0 flex-col overflow-hidden rounded-xl border border-violet-100 bg-white shadow-[0_12px_30px_-24px_rgba(76,29,149,.4)]">
        <div className="flex min-h-[78px] items-center justify-between border-b border-violet-100 bg-gradient-to-r from-violet-50/80 via-white to-white px-3 py-2.5"><div><p className="text-[8px] font-black uppercase tracking-[.16em] text-violet-600">Tabla 1 · Modulacion</p><h2 className="mt-0.5 text-base font-black text-[#101c36]">Top 10 de clientes que rechazan</h2><p className="text-[10px] text-slate-500">Todo el histórico de Modulación, aunque no esté en la plantilla.</p></div><span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-100 text-xs font-black text-violet-700">10</span></div>
        {loading ? <div className="grid min-h-0 flex-1 place-items-center text-[10px] font-semibold text-slate-500">Consultando Modulacion...</div> : modulationTableRows.length === 0 ? <div className="grid min-h-0 flex-1 place-items-center p-6 text-center text-[10px] text-slate-500">No hay rechazos registrados en Modulacion.</div> : <div className="min-h-0 flex-1 overflow-auto"><table className="w-full min-w-[590px] table-fixed text-left text-[10px]"><thead className="sticky top-0 z-10 bg-slate-50 text-[8px] uppercase tracking-wide text-slate-500"><tr><th className="w-10 px-2 py-1.5">#</th><th className="w-[13%] px-1.5 py-1.5">Codigo</th><th className="w-[25%] px-1.5 py-1.5">Cliente</th><th className="w-[19%] px-1.5 py-1.5">Telefono</th><th className="w-[15%] px-1.5 py-1.5">Contratista</th><th className="w-[10%] px-1.5 py-1.5 text-right">Veces</th><th className="w-[12%] px-2 py-1.5 text-right">Cajas</th></tr></thead><tbody className="divide-y divide-slate-100">{modulationTableRows.map((row, index) => <tr key={`${row.contractor}-${row.client_code}`} className="h-8 cursor-pointer transition hover:bg-violet-50/60" onClick={() => setSelectedOffender(row)}><td className="px-2 py-0.5"><span className={`grid h-5 w-5 place-items-center rounded text-[8px] font-black ${index < 3 ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"}`}>{index + 1}</span></td><td className="truncate px-1.5 py-0.5 font-black text-[#101c36]">{row.client_code}</td><td className="truncate px-1.5 py-0.5 font-semibold text-slate-700" title={row.client_name}>{row.client_name || "Sin nombre"}</td><td className="truncate px-1.5 py-0.5 font-semibold text-slate-600">{row.phone || "Sin telefono"}</td><td className="truncate px-1.5 py-0.5 text-slate-500">{row.contractor}</td><td className="px-1.5 py-0.5 text-right"><span className="rounded-full bg-violet-100 px-1.5 py-0.5 font-black text-violet-700">{row.refusals}x</span></td><td className="px-2 py-0.5 text-right font-black text-rose-600">{Number(row.rejected_boxes || 0).toLocaleString("es-CO")}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="flex h-[620px] min-w-0 flex-col overflow-hidden rounded-xl border border-blue-100 bg-white shadow-[0_12px_30px_-24px_rgba(37,99,235,.4)]">
        <div className="flex min-h-[62px] items-center justify-between gap-2 border-b border-blue-100 bg-gradient-to-r from-blue-50/80 via-white to-white px-3 py-2"><div><p className="text-[8px] font-black uppercase tracking-[.16em] text-blue-600">Tabla 2 · Excel preventa</p><h2 className="text-sm font-black text-[#101c36]">Top 10 para gestionar</h2><p className="text-[9px] text-slate-500">Clientes de la plantilla, ordenados por todo su historial de rechazos.</p></div><div className="flex items-center gap-1.5"><span className="rounded-full bg-blue-100 px-2 py-1 text-[9px] font-black text-blue-700">{stats.pending} pendientes</span><button className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-600 px-2 text-[9px] font-black text-white hover:bg-blue-700" disabled={loading || Boolean(saving)} onClick={() => void refreshCalls()} type="button"><RefreshCw size={11}/>Actualizar</button></div></div>
        <div className="grid gap-1.5 border-b border-slate-200 bg-slate-50/70 p-2 md:grid-cols-[minmax(0,1fr)_125px_115px]">
          <label className="flex h-8 min-w-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-2"><Search size={13} className="shrink-0 text-slate-400"/><input className="min-w-0 w-full bg-transparent text-[10px] outline-none" placeholder="Buscar cliente..." value={query} onChange={(e) => setQuery(e.target.value)}/></label>
          <select className="h-8 min-w-0 truncate rounded-md border border-slate-300 bg-white px-1.5 text-[10px] font-semibold text-slate-600" title="Filtrar por archivo" value={batch} onChange={(e) => setBatch(e.target.value)}><option value="todos">Todos los archivos</option>{batches.map((item) => <option value={item.batch_id} key={item.batch_id}>{item.batch_name}</option>)}</select>
          <select className="h-8 min-w-0 truncate rounded-md border border-slate-300 bg-white px-1.5 text-[10px] font-semibold text-slate-600" title="Filtrar por estado" value={status} onChange={(e) => setStatus(e.target.value)}><option value="todos">Todos los estados</option><option value="pendiente">Pendientes</option><option value="si">Sí recibe</option><option value="no_recibe">No recibe</option><option value="no_contactado">No contactado</option></select>
        </div>
        {loading ? <div className="grid min-h-0 flex-1 place-items-center text-xs font-semibold text-slate-500">Cargando preventa...</div> : callQueue.length === 0 ? <div className="grid min-h-0 flex-1 place-items-center p-8 text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-500"><Phone size={24} /></span><p className="mt-3 text-sm font-black text-slate-700">No hay clientes pendientes</p></div></div> : <div className="min-h-0 flex-1"><table className="w-full table-fixed text-left text-[10px]"><thead className="bg-slate-50 text-[8px] uppercase tracking-wide text-slate-500"><tr><th className="w-[27%] px-2 py-1">Cliente</th><th className="w-[18%] px-1 py-1">Telefono</th><th className="w-[8%] px-1 py-1">Rechazos</th><th className="w-[27%] px-1 py-1">Resultado</th><th className="w-[20%] px-1 py-1">Causal / nota</th></tr></thead><tbody className="divide-y divide-slate-100">{callQueue.map((row) => <ClientRow key={row.id} row={row} draft={drafts[row.id] || {}} onOpen={() => setSelectedClient(row)} onOpenHistory={() => { const offender = offendersByCode.get(row.client_code.trim().toLowerCase()); if (offender) setSelectedOffender(offender); }} setDraft={(next) => setDrafts((current) => ({ ...current, [row.id]: { ...current[row.id], ...next } }))} save={(override) => void save(row, override)} saving={saving === row.id}/>)}</tbody></table></div>}
      </section>
      </div>
      {selectedClient ? <ProductsModal client={selectedClient} onClose={() => setSelectedClient(null)} /> : null}
      {selectedOffender ? <RejectionHistoryModal offender={selectedOffender} onClose={() => setSelectedOffender(null)} /> : null}
      {showCallerStats ? <CallerStatsModal rows={callerStats} onClose={() => setShowCallerStats(false)}/> : null}
    </section>
  </main>;
}

function CallerGate({ error, value, onChange, onEnter }: { error: string; value: string; onChange: (value: string) => void; onEnter: () => void }) {
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-[#101c36]/80 p-4 backdrop-blur-md"><form className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onSubmit={(event) => { event.preventDefault(); onEnter(); }}><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-violet-700"><Phone size={25}/></span><div className="mt-4 text-center"><p className="text-[10px] font-black uppercase tracking-[.2em] text-violet-600">Identificación de llamada</p><h2 className="mt-1 text-xl font-black text-[#101c36]">¿Quién realizará las llamadas?</h2><p className="mt-2 text-xs leading-5 text-slate-500">El nombre quedará asociado a las gestiones y correcciones realizadas.</p></div><label className="mt-5 block"><span className="mb-1.5 block text-[10px] font-black uppercase text-slate-500">Nombre completo</span><input autoFocus className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" minLength={3} onChange={(event) => onChange(event.target.value)} placeholder="Ej. María González" required value={value}/></label>{error ? <p className="mt-2 text-center text-xs font-bold text-red-600">{error}</p> : null}<button className="mt-4 h-11 w-full rounded-xl bg-violet-600 text-sm font-black text-white hover:bg-violet-700" type="submit">Ingresar a Preventa</button></form></div>;
}

function CallerStatsModal({ rows, onClose }: { rows: Array<{ name: string; calls: number; edits: number; history: EditEntry[] }>; onClose: () => void }) {
  const [expanded, setExpanded] = useState("");
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-200 bg-gradient-to-r from-violet-50 to-white p-5"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-violet-600">Equipo de llamadas</p><h2 className="mt-1 text-xl font-black text-[#101c36]">Rendimiento por persona</h2><p className="mt-1 text-xs text-slate-500">Despliega una persona para consultar cada corrección.</p></div><button className="grid h-9 w-9 place-items-center rounded-full hover:bg-white" onClick={onClose} type="button"><X size={17}/></button></header><div className="max-h-[65vh] overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-50 text-[9px] uppercase text-slate-500"><tr><th className="px-4 py-3">Pos.</th><th className="px-3 py-3">Persona</th><th className="px-3 py-3 text-right">Llamadas</th><th className="px-4 py-3 text-right">Ediciones</th><th className="px-4 py-3 text-right">Detalle</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.flatMap((row, index) => { const isOpen = expanded === row.name; const main = <tr className="hover:bg-slate-50" key={`person-${row.name}`}><td className="px-4 py-3"><span className={`grid h-7 w-7 place-items-center rounded-lg font-black ${index < 3 ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"}`}>{index + 1}</span></td><td className="px-3 py-3 font-black text-[#101c36]">{row.name}</td><td className="px-3 py-3 text-right text-base font-black text-emerald-600">{row.calls}</td><td className="px-4 py-3 text-right font-black text-blue-600">{row.edits}</td><td className="px-4 py-3 text-right"><button className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[9px] font-black text-violet-700 disabled:opacity-40" disabled={!row.history.length} onClick={() => setExpanded(isOpen ? "" : row.name)} type="button">{isOpen ? "Ocultar" : "Ver ediciones"}</button></td></tr>; if (!isOpen) return [main]; const detail = <tr key={`detail-${row.name}`}><td className="bg-slate-50 p-3" colSpan={5}><div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><table className="w-full text-[10px]"><thead className="bg-slate-50 text-[8px] uppercase text-slate-500"><tr><th className="px-3 py-2">Fecha y hora</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Antes</th><th className="px-3 py-2">Después</th></tr></thead><tbody className="divide-y divide-slate-100">{row.history.slice().reverse().map((entry, editIndex) => <tr key={`${entry.at}-${editIndex}`}><td className="whitespace-nowrap px-3 py-2 text-slate-500">{entry.at ? new Date(entry.at).toLocaleString("es-CO") : "Sin fecha"}</td><td className="px-3 py-2"><strong className="block text-slate-700">{entry.client_name || "Sin nombre"}</strong><span className="text-[8px] text-slate-400">{entry.client_code}</span></td><td className="px-3 py-2 text-rose-600">{entry.from}</td><td className="px-3 py-2 font-bold text-emerald-700">{entry.to}</td></tr>)}</tbody></table></div></td></tr>; return [main, detail]; })}</tbody></table>{!rows.length ? <p className="p-10 text-center text-sm text-slate-400">Todavía no hay llamadas identificadas.</p> : null}</div></section></div>;
}
function ClientRow({ row, draft, onOpen, onOpenHistory, setDraft, save, saving }: { row: RecordRow; draft: { result?: "si" | "no"; reason?: string; notes?: string; editing?: boolean }; onOpen: () => void; onOpenHistory: () => void; setDraft: (value: Partial<typeof draft>) => void; save: (override?: { result?: "pendiente" | "si" | "no"; reason?: string; notes?: string }) => void; saving: boolean }) {
  const selected = draft.result || (row.call_result === "pendiente" ? undefined : row.call_result);
  const selectedOutcome = selected === "si" ? "si" : selected === "no" && (draft.reason ?? row.no_contact_reason) === NO_RECEIVE_REASON ? "no_recibe" : selected === "no" ? "no_contactado" : undefined;
  const savedResult: "si" | "no" = row.call_result === "si" ? "si" : "no";
  const isNoReceive = row.call_result === "no" && row.no_contact_reason === NO_RECEIVE_REASON;
  const clientCell = <><button className="max-w-full text-left hover:text-blue-700" onClick={onOpen} type="button"><span className="block truncate font-bold text-[#101c36]">{row.client_name || "Sin nombre"}</span><span className="block truncate text-[8px] text-slate-500">{row.client_code} · {(row.products || []).length} productos</span></button></>;
  const clearButton = <button className="h-6 shrink-0 rounded border border-amber-200 bg-amber-50 px-1 text-[8px] font-black text-amber-700 hover:bg-amber-100" onClick={() => save({ result: "pendiente", reason: "", notes: "" })} type="button">Quitar</button>;
  const cancelButton = <button className="h-6 shrink-0 rounded px-1 text-[8px] font-bold text-slate-500 hover:bg-white" onClick={() => setDraft({ editing: false, result: savedResult, reason: row.no_contact_reason, notes: row.notes })} type="button">Cancelar</button>;

  const rejectionButton = <button className="rounded-full bg-violet-50 px-1.5 py-0.5 font-bold text-violet-700 hover:bg-violet-200 disabled:cursor-default" disabled={!row.previous_refusals} onClick={onOpenHistory} type="button">{row.previous_refusals}</button>;
  if (row.call_result !== "pendiente" && !draft.editing) return <tr className="h-[35px] bg-slate-50/50"><td className="truncate px-2 py-1">{clientCell}</td><td className="truncate px-1 py-1 font-semibold">{row.phone || "Sin telefono"}</td><td className="px-1 py-1">{rejectionButton}</td><td className="px-1 py-1"><span className={`rounded-full px-2 py-1 text-[8px] font-black ${row.call_result === "si" ? "bg-emerald-100 text-emerald-700" : isNoReceive ? "bg-rose-100 text-rose-700" : "bg-red-100 text-red-700"}`}>{row.call_result === "si" ? "Sí recibe" : isNoReceive ? "No recibe" : "No contactado"}</span></td><td className="px-1 py-1 text-[9px] text-slate-600"><div className="flex items-center justify-between gap-1"><div className="min-w-0"><span className="block truncate">{isNoReceive ? row.notes || "Rechazo confirmado" : row.no_contact_reason || row.notes || "Sin nota"}</span>{row.called_at ? <span className="block text-[8px] text-slate-400">{new Date(row.called_at).toLocaleString("es-CO")}</span> : null}</div><button className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-blue-200 bg-white px-1.5 text-[8px] font-black text-blue-700 hover:bg-blue-50" onClick={() => setDraft({ editing: true, result: savedResult, reason: row.no_contact_reason, notes: row.notes })} type="button"><Pencil size={9}/>Editar</button></div></td></tr>;

  const clearSelection = () => row.call_result === "pendiente" ? setDraft({ result: undefined, reason: "" }) : save({ result: "pendiente", reason: "", notes: "" });
  const resultButtons = saving ? <span className="text-[9px] font-bold text-blue-600">Guardando...</span> : <div className="flex gap-1"><Choice active={selectedOutcome === "si"} label="Sí" good onClick={() => selectedOutcome === "si" ? clearSelection() : save({ result: "si", reason: "", notes: draft.notes })}/><Choice active={selectedOutcome === "no_recibe"} label="No recibe" onClick={() => selectedOutcome === "no_recibe" ? clearSelection() : save({ result: "no", reason: NO_RECEIVE_REASON, notes: draft.notes })}/><Choice active={selectedOutcome === "no_contactado"} label="No contactado" onClick={() => selectedOutcome === "no_contactado" ? clearSelection() : setDraft({ result: "no", reason: "" })}/></div>;
  const contactReason = selectedOutcome === "no_contactado" ? <select autoFocus className="h-6 min-w-0 flex-1 rounded-md border border-red-300 bg-red-50 px-1 text-[9px]" value={draft.reason || ""} onChange={(event) => { const reason = event.target.value; setDraft({ reason }); if (reason) save({ result: "no", reason, notes: draft.notes }); }}><option value="">Selecciona causal</option>{REASONS.map((reason) => <option key={reason}>{reason}</option>)}</select> : <input className="h-6 min-w-0 flex-1 rounded-md border border-slate-300 px-1 text-[9px]" placeholder="Nota opcional" value={draft.notes ?? row.notes} onChange={(event) => setDraft({ notes: event.target.value })}/>;
  return <tr className={`h-[38px] ${draft.editing ? "bg-blue-50/60" : "hover:bg-slate-50/70"}`}><td className="truncate px-2 py-1">{draft.editing ? <span className="font-bold text-[#101c36]">{row.client_name || "Sin nombre"}</span> : clientCell}</td><td className="truncate px-1 py-1 font-semibold">{row.phone || "Sin telefono"}</td><td className="px-1 py-1">{rejectionButton}</td><td className="px-1 py-1">{resultButtons}</td><td className="px-1 py-1"><div className="flex gap-1">{contactReason}{draft.editing ? clearButton : null}{draft.editing ? cancelButton : null}</div></td></tr>;
}

function RejectionHistoryModal({ offender, onClose }: { offender: Offender; onClose: () => void }) {
  return <div aria-modal="true" className="fixed inset-0 z-[65] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog"><section className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-200 bg-gradient-to-r from-violet-50 to-white p-5"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-violet-600">Historial de rechazos</p><h2 className="mt-1 text-xl font-black text-[#101c36]">{offender.client_name || "Cliente sin nombre"}</h2><p className="mt-1 text-xs text-slate-500">Código {offender.client_code} · {offender.refusals} rechazos · {offender.rejected_boxes.toLocaleString("es-CO")} cajas</p></div><button aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full hover:bg-white" onClick={onClose} type="button"><X size={18}/></button></header><div className="min-h-0 overflow-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-[9px] uppercase text-slate-500"><tr><th className="px-5 py-3">Fecha del rechazo</th><th className="px-4 py-3">Contratista</th><th className="px-5 py-3 text-right">Cajas rechazadas</th></tr></thead><tbody className="divide-y divide-slate-100">{offender.events.map((event, index) => <tr key={`${event.date}-${event.contractor}-${index}`}><td className="px-5 py-3 font-bold text-slate-700">{event.date === "Sin fecha" ? event.date : new Date(`${event.date}T12:00:00`).toLocaleDateString("es-CO")}</td><td className="px-4 py-3 text-slate-600">{event.contractor}</td><td className="px-5 py-3 text-right font-black text-rose-600">{event.boxes.toLocaleString("es-CO")}</td></tr>)}</tbody><tfoot className="sticky bottom-0 bg-slate-100 font-black text-[#101c36]"><tr><td className="px-5 py-3" colSpan={2}>Total</td><td className="px-5 py-3 text-right">{offender.rejected_boxes.toLocaleString("es-CO")}</td></tr></tfoot></table></div></section></div>;
}
function ProductsModal({ client, onClose }: { client: RecordRow; onClose: () => void }) {
  const products = client.products || [];
  const orders = Array.from(new Set(products.map((item) => item.order || item.customer_order || "Sin pedido")));
  const totalBoxes = products.reduce((sum, item) => sum + Number(item.boxes || 0), 0);
  const totalValue = products.reduce((sum, item) => sum + Number(item.net_value || 0), 0);
  return <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog"><div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-200 bg-gradient-to-r from-blue-50 to-white p-5"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-blue-600">Detalle de pedidos</p><h3 className="mt-1 text-xl font-black text-[#101c36]">{client.client_name}</h3><p className="mt-1 text-xs text-slate-500">Cliente {client.client_code} · {client.phone || "Sin telefono en base de datos"}</p></div><button aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-white hover:text-slate-900" onClick={onClose} type="button"><X size={18}/></button></div><div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 text-center"><ModalStat label="Pedidos" value={orders.length.toLocaleString("es-CO")}/><ModalStat label="Productos" value={products.length.toLocaleString("es-CO")}/><ModalStat label="Cajas" value={totalBoxes.toLocaleString("es-CO")}/></div><div className="min-h-0 flex-1 overflow-auto p-4">{orders.map((order) => { const orderProducts = products.filter((item) => (item.order || item.customer_order || "Sin pedido") === order); return <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 last:mb-0" key={order}><div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2"><div><p className="text-[9px] font-black uppercase text-slate-400">Pedido</p><p className="text-xs font-black text-[#101c36]">{order}</p></div><p className="text-xs font-bold text-slate-500">{orderProducts.reduce((sum, item) => sum + item.boxes, 0).toLocaleString("es-CO")} cajas</p></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="bg-white text-[9px] uppercase text-slate-400"><tr><th className="px-3 py-2">Material</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Cajas</th><th className="px-3 py-2 text-right">Hectolitros</th><th className="px-3 py-2 text-right">Valor neto</th></tr></thead><tbody className="divide-y divide-slate-100">{orderProducts.map((item, index) => <tr key={`${item.material}-${index}`}><td className="px-3 py-2 font-bold text-slate-700">{item.material || "—"}</td><td className="px-3 py-2">{item.product || "Sin descripcion"}</td><td className="px-3 py-2 text-right font-black">{item.boxes.toLocaleString("es-CO")}</td><td className="px-3 py-2 text-right">{item.hectoliters.toLocaleString("es-CO", { maximumFractionDigits: 3 })}</td><td className="px-3 py-2 text-right">{item.net_value.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}</td></tr>)}</tbody></table></div></section>; })}{!products.length ? <div className="p-12 text-center text-sm text-slate-400">Este cliente no tiene productos guardados.</div> : null}</div><div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-right text-xs font-black text-slate-700">Valor total: {totalValue.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })}</div></div></div>;
}
function ModalStat({ label, value }: { label: string; value: string }) { return <div className="border-r border-slate-200 px-3 py-3 last:border-r-0"><p className="text-lg font-black text-[#101c36]">{value}</p><p className="text-[9px] font-black uppercase text-slate-400">{label}</p></div>; }
function Choice({ active, label, good, onClick }: { active: boolean; label: string; good?: boolean; onClick: () => void }) { return <button onClick={onClick} className={`h-7 min-w-9 rounded-md border px-2 text-[10px] font-bold ${active ? good ? "border-emerald-600 bg-emerald-600 text-white" : "border-red-600 bg-red-600 text-white" : "border-slate-300 bg-white text-slate-600"}`}>{label}</button>; }
function Stat({ icon, label, value, tone = "blue" }: { icon: React.ReactNode; label: string; value: number; tone?: string }) { const colors: Record<string,string> = { blue: "bg-blue-50 text-blue-600", amber: "bg-amber-50 text-amber-600", green: "bg-emerald-50 text-emerald-600", red: "bg-red-50 text-red-600" }; return <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`grid h-11 w-11 place-items-center rounded-xl ${colors[tone]}`}>{icon}</span><div><p className="text-2xl font-black text-[#101c36]">{value}</p><p className="text-xs font-semibold text-slate-500">{label}</p></div></div>; }
function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-violet-50 text-violet-600"><BarChart3 size={19}/></span><div><h3 className="font-bold text-[#101c36]">{title}</h3><p className="text-xs text-slate-500">{subtitle}</p></div></div><div className="mt-5">{children}</div></section>; }
function Bars({ rows, color, empty }: { rows: { label: string; value: number }[]; color: string; empty: string }) { const max = Math.max(...rows.map((r) => r.value), 1); return rows.length ? <div className="space-y-3">{rows.map((row) => <div key={row.label} className="grid grid-cols-[minmax(120px,220px)_1fr_35px] items-center gap-3 text-xs"><span className="truncate font-semibold text-slate-600" title={row.label}>{row.label}</span><div className="h-3 rounded-full bg-slate-100"><div className={`h-3 rounded-full ${color}`} style={{ width: `${Math.max((row.value/max)*100, 3)}%` }}/></div><strong>{row.value}</strong></div>)}</div> : <div className="grid min-h-56 place-items-center text-sm text-slate-400">{empty}</div>; }
function Donut({ yes, noReceive, noContact, pending }: { yes: number; noReceive: number; noContact: number; pending: number }) { const total = yes + noReceive + noContact + pending || 1; const y = yes/total*100; const nr = noReceive/total*100; const nc = noContact/total*100; return <div className="grid h-44 w-44 place-items-center rounded-full" style={{ background: `conic-gradient(#10b981 0 ${y}%, #e11d48 ${y}% ${y+nr}%, #f87171 ${y+nr}% ${y+nr+nc}%, #fbbf24 ${y+nr+nc}% 100%)` }}><div className="grid h-28 w-28 place-items-center rounded-full bg-white text-center"><div><strong className="text-2xl text-[#101c36]">{yes + noReceive + noContact}</strong><p className="text-[10px] font-bold uppercase text-slate-400">gestionados</p></div></div></div>; }
function Legend({ color, label, value }: { color: string; label: string; value: number }) { return <div className="flex items-center gap-3"><span className={`h-3 w-3 rounded-full ${color}`}/><span className="min-w-24 text-slate-600">{label}</span><strong>{value}</strong></div>; }
function formatCallOutcome(result: RecordRow["call_result"], reason: string) { if (result === "pendiente") return "Pendiente"; if (result === "si") return "Sí recibe"; if (reason === NO_RECEIVE_REASON) return "No recibe"; return `No contactado${reason ? `: ${reason}` : ""}`; }






