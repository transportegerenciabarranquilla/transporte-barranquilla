"use client";

import { useState } from "react";
import { FileSpreadsheet, Upload, ChevronDown } from "lucide-react";
import { importFields, parseRangeImport, suggestImportMapping, type ImportedRangeVisit, type ImportField, type ImportMapping } from "../lib/clientRangeImport";

export default function ClientRangeUpload({ onImport }: { onImport: (rows: ImportedRangeVisit[]) => void }) {
  const [draft, setDraft] = useState<{ name: string; rows: Record<string, unknown>[]; headers: string[] } | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>(() => suggestImportMapping([]));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setMessage(""); setDraft(null);
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Selecciona un archivo Excel o CSV.");
      const XLSX = await import("xlsx");
      const workbook = /\.csv$/i.test(file.name) ? XLSX.read(await file.text(), { type: "string", raw: true }) : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true }) : [];
      if (!rows.length) throw new Error("La primera hoja está vacía.");
      const headers = Object.keys(rows[0]);
      setMapping(suggestImportMapping(headers));
      setDraft({ name: file.name, rows, headers });
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "No se pudo leer el archivo."); }
    finally { setBusy(false); }
  }
  function confirm() {
    if (!draft) return;
    const required = (Object.keys(importFields) as ImportField[]).filter(field => field !== "name");
    if (required.some(field => !mapping[field])) { setMessage("Selecciona las columnas obligatorias. El nombre es opcional."); return; }
    if (new Set(required.map(field => mapping[field])).size !== required.length) { setMessage("Cada campo debe usar una columna distinta."); return; }
    const result = parseRangeImport(draft.rows, mapping);
    if (result.errors.length) {
      setMessage(`${result.errors.length} filas necesitan corrección. No se agregó ningún dato. ${result.errors.slice(0, 5).join(" ")}`);
      return;
    }
    onImport(result.visits);
    setMessage(`${result.visits.length} filas procesadas. Las visitas repetidas por cliente, fecha y DT se cuentan una sola vez.`);
    setDraft(null);
  }
  return <div className="space-y-3 rounded-2xl border border-teal-200/70 bg-gradient-to-r from-teal-50 via-white to-white p-4 shadow-sm sm:px-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-teal-100 text-teal-700"><FileSpreadsheet size={23} aria-hidden="true" /></span><div><h3 className="text-sm font-bold text-[#10223d]">Agrega información a tu historial</h3><p className="mt-1 text-xs text-slate-500">Importa visitas y calcula distancias con sus coordenadas.</p></div></div>
      <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#0f766e] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 focus-within:ring-2 focus-within:ring-teal-500 focus-within:ring-offset-2 ${busy ? "opacity-50" : ""}`}>
        <input className="sr-only" type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
        <Upload size={17} aria-hidden="true" />{busy ? "Leyendo archivo..." : "Cargar Excel"}
      </label>
    </div>
    <details className="text-xs text-slate-500"><summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-teal-800"><ChevronDown size={14} />Ver formato del archivo</summary><p className="mt-2 max-w-3xl leading-5">Carga la primera hoja con código, transportista, fecha, DT y las cuatro coordenadas en grados decimales. El límite de rango es 50 m. Los datos agregados estarán disponibles mientras mantengas abierta esta pantalla.</p></details>
    {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
    {draft && <div className="space-y-3">
      <p className="text-sm font-semibold">{draft.name} · {draft.rows.length} filas. Revisa las columnas:</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(Object.keys(importFields) as ImportField[]).map(field => <label key={field} className="text-xs font-semibold text-slate-700">{importFields[field]}{field === "name" ? " (opcional)" : " *"}
        <select className="mt-1 block h-10 w-full rounded-md border border-slate-200 bg-white px-2" value={mapping[field]} onChange={event => setMapping(current => ({ ...current, [field]: event.target.value }))}>
          <option value="">Selecciona columna</option>{draft.headers.map(header => <option key={header} value={header}>{header}</option>)}
        </select>
      </label>)}</div>
      <button type="button" onClick={confirm} className="rounded-lg bg-[#10223d] px-4 py-2 text-sm font-semibold text-white">Agregar datos y calcular distancias</button>
      <button type="button" onClick={() => setDraft(null)} className="ml-3 text-sm text-slate-600">Cancelar</button>
    </div>}
  </div>;
}
