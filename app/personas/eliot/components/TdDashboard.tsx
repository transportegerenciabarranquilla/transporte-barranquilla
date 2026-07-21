"use client";

import {
  AlertCircle,
  BellRing,
  Clock3,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LockKeyhole,
  RotateCcw,
  Upload,
} from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildRankings,
  filterRows,
  getCarriers,
  getPlates,
  sortRanking,
  summarizeRows,
  type DashboardFilters,
} from "../lib/analytics";
import {
  createBackup,
  deleteSnapshot,
  findSnapshotByHash,
  listSnapshots,
  restoreBackup,
  saveSnapshot,
} from "../lib/db";
import { hashFileBuffer, parseTdWorkbook } from "../lib/parser";
import { formatCountdown } from "../lib/time";
import type { BackupPayload, CrewRole, TdSnapshot } from "../lib/types";
import { DashboardFiltersPanel, EmptyDashboard, HistoryPanel, PlateCrewTable, RankingsTable, WarningsSummary } from "./DashboardUi";
import { RankingChart } from "./RankingChart";
import { RoleSummaryCards } from "./RoleSummaryCards";
import { TrendChart } from "./TrendChart";
import { MissingMarksTable } from "./MissingMarksTable";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const DEFAULT_FILTERS: DashboardFilters = { query: "", carrier: "todos", plate: "todas", status: "todos" };
const ROLES: CrewRole[] = ["rr", "aux", "conductor"];

export function TdDashboard({ onLock }: { onLock: () => void }) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const backupInput = useRef<HTMLInputElement | null>(null);
  const [snapshots, setSnapshots] = useState<TdSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [activeDate, setActiveDate] = useState("");
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [rankingMode, setRankingMode] = useState<"mejores" | "offenders">("mejores");
  const [showMissingMarks, setShowMissingMarks] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [now, setNow] = useState(0);

  const refreshSnapshots = useCallback(async (preferredId?: string) => {
    try {
      const records = await listSnapshots();
      setSnapshots(records);
      const preferred = records.find((record) => record.id === preferredId) ?? records[0];
      if (preferred) {
        setSelectedId(preferred.id);
        setActiveDate(preferred.operationalDate);
      } else {
        setSelectedId("");
        setActiveDate("");
      }
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "No fue posible cargar los cortes de Supabase." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    listSnapshots()
      .then((records) => {
        if (!active) return;
        setSnapshots(records);
        const preferred = records[0];
        if (preferred) {
          setSelectedId(preferred.id);
          setActiveDate(preferred.operationalDate);
        }
      })
      .catch((error: unknown) => {
        if (active) setMessage({ tone: "error", text: error instanceof Error ? error.message : "No fue posible cargar los cortes de Supabase." });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const availableDates = useMemo(() => Array.from(new Set(snapshots.map((item) => item.operationalDate))).sort().reverse(), [snapshots]);
  const dateSnapshots = useMemo(() => snapshots.filter((item) => item.operationalDate === activeDate), [activeDate, snapshots]);
  const closedSnapshot = dateSnapshots.find((snapshot) => snapshot.closedAt);
  const selectedSnapshot = useMemo(
    () => snapshots.find((item) => item.id === selectedId) ?? dateSnapshots[0] ?? null,
    [dateSnapshots, selectedId, snapshots],
  );
  const filteredRows = useMemo(() => filterRows(selectedSnapshot?.rows ?? [], filters), [filters, selectedSnapshot]);
  const summary = useMemo(() => summarizeRows(filteredRows), [filteredRows]);
  const rankings = useMemo(
    () => Object.fromEntries(ROLES.map((role) => [role, sortRanking(buildRankings(filteredRows, role).filter((entry) => entry.missingMarks === 0), rankingMode)])) as Record<CrewRole, ReturnType<typeof buildRankings>>,
    [filteredRows, rankingMode],
  );
  const latestSnapshot = snapshots[0] ?? null;
  const nextDueAt = latestSnapshot ? new Date(latestSnapshot.uploadedAt).getTime() + TWO_HOURS_MS : 0;
  const remaining = nextDueAt - now;
  const cadence = !latestSnapshot ? "empty" : remaining <= 0 ? "overdue" : remaining <= 15 * 60 * 1000 ? "soon" : "ok";

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setMessage(null);
    try {
      if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("Selecciona un archivo Excel .xlsx o .xls.");
      if (file.size > 10 * 1024 * 1024) throw new Error("El archivo supera el límite de 10 MB.");
      const buffer = await file.arrayBuffer();
      const fileHash = await hashFileBuffer(buffer);
      const duplicate = await findSnapshotByHash(fileHash);
      if (duplicate) throw new Error(`Este archivo ya fue cargado el ${formatDateTime(duplicate.uploadedAt)}.`);
      const parsed = parseTdWorkbook(buffer);
      const closedDay = snapshots.find((snapshot) => snapshot.operationalDate === parsed.operationalDate && snapshot.closedAt);
      if (closedDay) throw new Error(`El día ${parsed.operationalDate} ya fue cerrado y no admite nuevas cargas.`);
      const uploadedAt = new Date().toISOString();
      const snapshot: TdSnapshot = {
        id: `td:${parsed.operationalDate}:${Date.now()}:${fileHash.slice(0, 10)}`,
        fileName: file.name,
        fileHash,
        operationalDate: parsed.operationalDate,
        uploadedAt,
        rows: parsed.rows,
        warnings: parsed.warnings,
      };
      await saveSnapshot(snapshot);
      setFilters(DEFAULT_FILTERS);
      await refreshSnapshots(snapshot.id);
      setMessage({
        tone: "success",
        text: `Corte guardado: ${parsed.rows.length} rutas y ${parsed.warnings.length} advertencia${parsed.warnings.length === 1 ? "" : "s"}. Próxima carga en 2 horas.`,
      });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "No fue posible procesar el archivo." });
    } finally {
      setUploading(false);
    }
  }

  function changeDate(date: string) {
    setActiveDate(date);
    const next = snapshots.find((item) => item.operationalDate === date);
    setSelectedId(next?.id ?? "");
    setFilters(DEFAULT_FILTERS);
  }

  function selectSnapshot(snapshot: TdSnapshot) {
    setActiveDate(snapshot.operationalDate);
    setSelectedId(snapshot.id);
    setFilters(DEFAULT_FILTERS);
  }

  async function closeOperationalDay() {
    const latest = dateSnapshots[0];
    if (!latest || closedSnapshot) return;
    if (!window.confirm(`Se cerrará definitivamente el día ${activeDate}. La última carga quedará como corte final y no se permitirán más archivos de esa fecha. ¿Deseas continuar?`)) return;
    setMessage(null);
    try {
      const closedAt = new Date().toISOString();
      await saveSnapshot({ ...latest, closedAt });
      await refreshSnapshots(latest.id);
      setMessage({ tone: "success", text: `Día ${activeDate} cerrado correctamente. La última carga quedó como corte final.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "No fue posible cerrar el día." });
    }
  }

  async function removeSnapshot(snapshot: TdSnapshot) {
    if (!window.confirm(`¿Eliminar el corte ${formatDateTime(snapshot.uploadedAt)} de ${snapshot.fileName}?`)) return;
    setMessage(null);
    try {
      await deleteSnapshot(snapshot.id);
      await refreshSnapshots();
      setMessage({ tone: "success", text: "Corte eliminado de Supabase." });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "No fue posible eliminar el corte.",
      });
    }
  }

  async function downloadBackup() {
    const backup = await createBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `respaldo-control-td-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleBackupRestore(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as BackupPayload;
      await restoreBackup(payload);
      await refreshSnapshots();
      setMessage({ tone: "success", text: `Respaldo restaurado con ${payload.snapshots.length} corte${payload.snapshots.length === 1 ? "" : "s"}.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "No fue posible restaurar el respaldo." });
    }
  }

  return (
    <main className="min-h-screen text-slate-800">
      <header className="no-print sticky top-0 z-30 border-b border-white/70 bg-white/90 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1380px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#2d1b4e] text-white shadow-lg shadow-violet-200"><FileSpreadsheet size={22} /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ed6a5a]">Operación de transporte</p>
              <h1 className="text-lg font-black text-[#2d1b4e] sm:text-xl">Control de llegada y salida</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input accept=".xlsx,.xls" className="hidden" onChange={handleUpload} ref={fileInput} type="file" />
            <input accept="application/json,.json" className="hidden" onChange={handleBackupRestore} ref={backupInput} type="file" />
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50" onClick={() => backupInput.current?.click()} type="button"><RotateCcw size={15} /> Restaurar</button>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40" disabled={!snapshots.length} onClick={downloadBackup} type="button"><Download size={15} /> Respaldo</button>
            <button className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50 ${closedSnapshot ? "border-teal-200 bg-teal-50 text-teal-700" : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"}`} disabled={!dateSnapshots.length || Boolean(closedSnapshot) || uploading} onClick={closeOperationalDay} type="button"><CheckCircle2 size={15} /> {closedSnapshot ? "Día cerrado" : "Cerrar día"}</button>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#ed6a5a] px-4 text-xs font-black text-white shadow-sm shadow-rose-100 hover:bg-[#d95749] disabled:bg-slate-300" disabled={uploading} onClick={() => fileInput.current?.click()} type="button"><Upload size={16} /> {uploading ? "Procesando…" : "Subir Excel"}</button>
            <button aria-label="Bloquear" className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-[#2d1b4e]" onClick={onLock} type="button"><LockKeyhole size={17} /></button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1380px] space-y-8 px-4 py-6 sm:px-8 sm:py-9">
        <section className={`panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between ${cadence === "overdue" ? "border-red-200" : cadence === "soon" ? "border-amber-200" : ""}`}>
          <div className="flex items-center gap-3">
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${cadence === "overdue" ? "bg-red-50 text-red-600" : cadence === "soon" ? "bg-amber-50 text-amber-600" : "bg-violet-50 text-violet-700"}`}>{cadence === "overdue" ? <BellRing size={20} /> : <Clock3 size={20} />}</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Frecuencia de carga</p>
              <p className="mt-1 font-black text-[#2d1b4e]">{!latestSnapshot ? "Aún no hay un corte cargado" : cadence === "overdue" ? `Carga vencida hace ${formatCountdown(Math.abs(remaining))}` : `Próxima carga en ${formatCountdown(remaining)}`}</p>
            </div>
          </div>
          <div className="text-left text-xs leading-5 text-slate-500 sm:text-right">
            <p>Último corte: <strong className="text-slate-700">{latestSnapshot ? formatDateTime(latestSnapshot.uploadedAt) : "—"}</strong></p>
            <p>{latestSnapshot?.fileName || "Carga la plantilla DATA ASISTENCIA"}</p>
          </div>
        </section>

        {message ? <div className={`flex items-start gap-2 rounded-2xl border px-5 py-4 text-sm font-semibold ${message.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-violet-200 bg-violet-50 text-violet-800"}`}><AlertCircle className="mt-0.5 shrink-0" size={17} />{message.text}</div> : null}

        {loading ? <div className="panel grid min-h-64 place-items-center text-sm font-semibold text-slate-500">Cargando información local…</div> : selectedSnapshot ? (
          <>
            <DashboardFiltersPanel
              activeDate={activeDate}
              availableDates={availableDates}
              carriers={getCarriers(selectedSnapshot.rows)}
              dateSnapshots={dateSnapshots}
              filters={filters}
              onChange={setFilters}
              onDateChange={changeDate}
              onSnapshotChange={selectSnapshot}
              plates={getPlates(selectedSnapshot.rows)}
              selectedSnapshot={selectedSnapshot}
            />
            <RoleSummaryCards summary={summary} />

            <section className="panel flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Vista de rankings</p>
                <p className="mt-1 text-sm font-semibold text-slate-600">TD recalculado: salida R − llegada RR Z / auxiliar AA / conductor AB. Los errores de marcación se revisan por separado.</p>
              </div>
              <div className="grid grid-cols-3 rounded-lg bg-slate-100 p-1">
                <button className={`rounded-md px-3 py-2 text-xs font-black ${!showMissingMarks && rankingMode === "mejores" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`} onClick={() => { setShowMissingMarks(false); setRankingMode("mejores"); }} type="button">10 mejores</button>
                <button className={`rounded-md px-3 py-2 text-xs font-black ${!showMissingMarks && rankingMode === "offenders" ? "bg-white text-red-700 shadow-sm" : "text-slate-500"}`} onClick={() => { setShowMissingMarks(false); setRankingMode("offenders"); }} type="button">Top offenders</button>
                <button className={`rounded-md px-3 py-2 text-xs font-black ${showMissingMarks ? "bg-white text-red-700 shadow-sm" : "text-slate-500"}`} onClick={() => setShowMissingMarks(true)} type="button">Sin marcación · {summary.missingMarks}</button>
              </div>
            </section>

            {showMissingMarks ? <MissingMarksTable rows={filteredRows} /> : (
              <>
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {ROLES.map((role) => <RankingChart entries={rankings[role]} key={role} mode={rankingMode} role={role} />)}
                </div>
                <RankingsTable mode={rankingMode} rankings={rankings} />
              </>
            )}
            <TrendChart rows={filteredRows} />
            <PlateCrewTable rows={filteredRows} />

            {selectedSnapshot.warnings.length ? <WarningsSummary rowCount={selectedSnapshot.rows.length} warnings={selectedSnapshot.warnings} /> : null}

            <HistoryPanel onDelete={removeSnapshot} onSelect={selectSnapshot} selectedId={selectedSnapshot.id} snapshots={snapshots} />
          </>
        ) : <EmptyDashboard onUpload={() => fileInput.current?.click()} />}
      </div>
    </main>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", hour12: false }).format(new Date(value));
}
