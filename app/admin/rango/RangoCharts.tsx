"use client";

import CrewRangeTable from "./CrewRangeTable";
import { assignRouteRrs, type RouteAttendance } from "./foxtrot";
import RrRangeTable from "./RrRangeTable";
import { useState } from "react";
import type { PuntoCoronaRouteReport } from "../../lib/puntoCoronaRoutesStorage";
import { contractorLabel } from "../../lib/contractors";
import { assignContractors, dateKey, distanceBands, inBand, mapRows, normalize, normalizeDt, suggestMapping, type Field, type FileRow, type FoxtrotRow, type Mapping } from "./foxtrot";

type Report = Pick<PuntoCoronaRouteReport, "contractor" | "operationalDate" | "summary">;
export default function RangoCharts({ reports, contractor, from, to, dt }: { reports: Report[]; contractor: string; from: string; to: string; dt: string }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<FoxtrotRow[] | null>(null);
  const [attendance, setAttendance] = useState<RouteAttendance[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const assignedRows = rows === null ? null : assignRouteRrs(assignContractors(rows, reports), attendance);
  const inDate = (date: string) => (!from || date >= from) && (!to || date <= to);
  const matchesDt = (value: string) => !dt.trim() || normalizeDt(value).includes(normalizeDt(dt));
  const visible = (assignedRows || []).filter(row => (contractor === "Todas" || normalize(contractorLabel(row.contractor)) === normalize(contractor)) && inDate(row.date) && matchesDt(row.dt));
  const bees = reports.filter(report => (contractor === "Todas" || contractor === report.contractor) && inDate(report.operationalDate));
  const beesComparison = bees.reduce((acc, report) => {
    const crews = report.summary.crews.filter(crew => matchesDt(crew.dt));
    return {
      total: acc.total + (dt.trim() ? crews.reduce((sum, crew) => sum + crew.totalStarted, 0) : report.summary.startedRows),
      inside: acc.inside + (dt.trim() ? crews.reduce((sum, crew) => sum + crew.inRange, 0) : report.summary.inRange),
    };
  }, { total: 0, inside: 0 });
  const validFoxtrot = visible.filter(row => row.inRange !== null);
  const foxtrotComparison = { total: validFoxtrot.length, inside: validFoxtrot.filter(row => row.inRange === true).length };
  const contractorCount = new Set(bees.map(report => report.contractor)).size;
  const contractorGroups = [...new Set(bees.map(report => report.contractor))].sort();
  const outside = visible.filter(row => row.inRange === false);
  const tables = distanceBands.map(band => ({ ...band, rows: outside.filter(row => inBand(row, band.min, band.max)).sort((a, b) => (a.meters || 0) - (b.meters || 0)) }));

  function generate(data: FileRow[], selectedMapping: Mapping) {
    setError("");
    setRows(null);
    const required: Field[] = ["code", "name", "dt", "rr", "meters"];
    if (required.some(key => !selectedMapping[key]) || !selectedMapping.date) {
      setError("El archivo no tiene todos los encabezados requeridos de Foxtrot.");
      return;
    }
    const selected = Object.entries(selectedMapping)
      .filter(([key, value]) => key !== "contractor" && Boolean(value))
      .map(([, value]) => value);
    if (new Set(selected).size !== selected.length) {
      setError("Cada dato debe usar una columna diferente.");
      return;
    }
    const parsed = mapRows(data, { ...selectedMapping, contractor: "" }, "", "");
    const invalid = parsed.findIndex(row => !row.code || !row.name || !row.dt || !row.rr || !row.date);
    if (invalid >= 0) {
      setError(`Revisa la fila ${invalid + 2}: falta código, nombre, DT, RR o una fecha válida (día/mes/año o año-mes-día).`);
      return;
    }
    if (!parsed.some(row => row.inRange !== null)) {
      setError("No hay distancias válidas en Visit Meters from Customer. Revisa la columna seleccionada.");
      return;
    }
    setRows(parsed);
  }

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setError(""); setRows(null); setFileName("");
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Selecciona un archivo Excel o CSV.");
      const XLSX = await import("xlsx");
      const workbook = /\.csv$/i.test(file.name) ? XLSX.read(await file.text(), { type: "string", raw: true }) : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("El archivo no contiene hojas.");
      const data = XLSX.utils.sheet_to_json<FileRow>(sheet, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
      const typedData = XLSX.utils.sheet_to_json<FileRow>(sheet, { defval: "", raw: true });
      data.forEach((row, index) => {
        Object.entries(typedData[index] || {}).forEach(([key, value]) => {
          if (value instanceof Date) row[key] = dateKey(value);
        });
      });
      if (!data.length) throw new Error("La primera hoja está vacía. Los encabezados deben estar en la primera fila.");
      const columns = Object.keys(data[0]);
      const suggestedMapping = suggestMapping(columns);
      const response = await fetch("/api/asistencias?live=1", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo consultar el RR de cada ruta.");
      setAttendance(body.records || []);
      setFileName(file.name);
      generate(data, suggestedMapping);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo leer el archivo."); }
    finally { setBusy(false); }
  }
  return <section className="mb-6 space-y-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-[#10223d]">Gráficas de rango</h2>{fileName && rows ? <p className="mt-1 text-xs text-slate-500">{fileName} · {rows.length.toLocaleString("es-CO")} visitas</p> : null}</div>
      <label className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-[#0f7c58] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b684a]">
        {busy ? "Procesando…" : fileName ? "Cambiar Foxtrot" : "Cargar Foxtrot"}
        <input className="sr-only" type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
      </label>
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
    <ComparisonChart bees={beesComparison} foxtrot={foxtrotComparison} contractorCount={contractorCount} foxtrotLoaded={rows !== null} />
    {contractorGroups.length > 0 && <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">Comparativo por contratista</h3>
        <span className="text-xs text-slate-500">Bees vs. Foxtrot</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {contractorGroups.map(group => {
          const groupBees = bees.filter(report => report.contractor === group).reduce((acc, report) => {
            const crews = report.summary.crews.filter(crew => matchesDt(crew.dt));
            return {
              total: acc.total + (dt.trim() ? crews.reduce((sum, crew) => sum + crew.totalStarted, 0) : report.summary.startedRows),
              inside: acc.inside + (dt.trim() ? crews.reduce((sum, crew) => sum + crew.inRange, 0) : report.summary.inRange),
            };
          }, { total: 0, inside: 0 });
          const groupFoxtrotRows = visible.filter(row => contractorLabel(row.contractor) === group && row.inRange !== null);
          const groupFoxtrot = { total: groupFoxtrotRows.length, inside: groupFoxtrotRows.filter(row => row.inRange === true).length };
          return <ContractorComparisonCard key={group} contractor={group} bees={groupBees} foxtrot={groupFoxtrot} foxtrotLoaded={rows !== null} />;
        })}
      </div>
    </section>}
    {rows !== null && <>
      <div className="grid gap-3 sm:grid-cols-3">
        {[{ label: "Visitas analizadas", value: visible.length, color: "text-slate-900" }, { label: "Fuera de rango", value: outside.length, color: "text-red-700" }, { label: "Sin distancia", value: visible.filter(row => row.meters === null).length, color: "text-amber-700" }].map(item => <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3"><p className="text-xs text-slate-500">{item.label}</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${item.color}`}>{item.value.toLocaleString("es-CO")}</p></div>)}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2"><h2 className="text-lg font-semibold text-slate-900">Clientes fuera de rango</h2><p className="text-xs text-slate-500"></p></div>
      <DistanceBandsChart tables={tables} />
    </>}
    {rows !== null && <CrewRangeTable rows={visible} />}
    {rows !== null && <RrRangeTable rows={visible} />}
  </section>;
}

function ComparisonChart({ bees, foxtrot, contractorCount, foxtrotLoaded }: {
  bees: { total: number; inside: number };
  foxtrot: { total: number; inside: number };
  contractorCount: number;
  foxtrotLoaded: boolean;
}) {
  const series = [
    { label: "Bees", ...bees, color: "#eab308" },
    { label: "Foxtrot", ...foxtrot, color: "#2563eb" },
  ];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Comparativo general</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Porcentaje de visitas en rango</h3>
        </div>
        <span className="text-xs text-slate-500">{contractorCount} contratista{contractorCount === 1 ? "" : "s"}</span>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {series.map(item => {
          const available = item.label === "Bees" || foxtrotLoaded;
          const percent = item.total ? (item.inside / item.total) * 100 : 0;
          const displayedPercent = available && item.total ? percent : 0;
          return (
            <article key={item.label} className="flex flex-col items-center rounded-xl bg-slate-50/70 px-4 py-5 text-center">
              <div
                role="img"
                aria-label={`${item.label}: ${available && item.total ? `${percent.toFixed(2)}% en rango` : "sin datos"}`}
                className="grid h-44 w-44 place-items-center rounded-full p-[14px] shadow-sm"
                style={{ background: `conic-gradient(${item.color} 0% ${displayedPercent}%, #e2e8f0 ${displayedPercent}% 100%)` }}
              >
                <div className="grid h-full w-full place-items-center rounded-full bg-white shadow-inner">
                  <div>
                    <span className="block text-3xl font-bold tabular-nums text-slate-900">{available && item.total ? `${percent.toFixed(2)}%` : "—"}</span>
                    <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">En rango</span>
                  </div>
                </div>
              </div>
              <h4 className="mt-4 text-base font-bold text-slate-900">{item.label}</h4>
              <p className="mt-1 text-xs tabular-nums text-slate-500">{available && item.total ? `${item.inside.toLocaleString("es-CO")} en rango de ${item.total.toLocaleString("es-CO")} visitas` : item.label === "Foxtrot" ? "Carga el archivo para comparar" : "Sin visitas en los filtros seleccionados"}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ContractorComparisonCard({ contractor, bees, foxtrot, foxtrotLoaded }: {
  contractor: string;
  bees: { total: number; inside: number };
  foxtrot: { total: number; inside: number };
  foxtrotLoaded: boolean;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="mb-4 font-semibold text-slate-900">{contractor}</h4>
      <div className="space-y-4">
        <CompactBar label="Bees" total={bees.total} inside={bees.inside} color="bg-yellow-500" />
        <CompactBar label="Foxtrot" total={foxtrot.total} inside={foxtrot.inside} color="bg-blue-600" available={foxtrotLoaded} />
      </div>
    </article>
  );
}

function CompactBar({ label, total, inside, color, available = true }: {
  label: string;
  total: number;
  inside: number;
  color: string;
  available?: boolean;
}) {
  const percent = total ? (inside / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-slate-600">{label}</span>
        <strong className="tabular-nums text-slate-900">{available && total ? `${percent.toFixed(2)}%` : "—"}</strong>
      </div>
      <div role="img" aria-label={`${label}: ${available && total ? `${percent.toFixed(2)}% en rango` : "sin datos"}`} className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${available ? Math.min(100, percent) : 0}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] tabular-nums text-slate-500">{available && total ? `${inside.toLocaleString("es-CO")} / ${total.toLocaleString("es-CO")} visitas` : label === "Foxtrot" ? "Pendiente de archivo" : "Sin visitas"}</p>
    </div>
  );
}

function DistanceBandsChart({ tables }: { tables: Array<{ min: number; max: number; label: string; rows: FoxtrotRow[] }> }) {
  const highest = Math.max(1, ...tables.map(table => table.rows.length));
  const colors = ["bg-amber-500", "bg-orange-500", "bg-red-600"];

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 pb-4 pt-3">
      <h3 className="text-sm font-semibold text-slate-900">Clientes por distancia fuera de rango</h3>
      <div className="mt-3 grid grid-cols-3 gap-3 sm:gap-8">
        {tables.map((table, index) => {
          const height = table.rows.length ? Math.max(8, (table.rows.length / highest) * 100) : 2;
          return (
            <div key={table.max} className="min-w-0 text-center">
              <div className="flex h-36 items-end justify-center px-1 pt-6">
                <div
                  role="img"
                  aria-label={`${table.rows.length} clientes en el intervalo ${table.label} fuera de rango`}
                  className={`relative w-full max-w-24 rounded-t-md ${colors[index]}`}
                  style={{ height: `${height}%` }}
                >
                  <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold tabular-nums text-slate-800">{table.rows.length} cliente{table.rows.length === 1 ? "" : "s"}</span>
                </div>
              </div>
              <p className="border-t border-slate-300 pt-2 text-[11px] font-semibold tabular-nums text-slate-600">{table.label}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
