"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BarChart3, Database, LoaderCircle, ShieldAlert, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { DateInput, FilterSelect, formatChartNumber, MovementBar, PanelHeader } from "./components/RtiVisuals";
import type { RtiRecord } from "./rtiTypes";
import { quantityDifference } from "./rtiCalculation";
import {
  aggregateRecords,
  monthIndex,
  normalizeColumnName,
  parseDatabaseRows,
  percentageBarColor,
  performanceColor,
  rankingColor,
  recordDateKey,
  skuBarColor,
  uniqueValues,
} from "./rtiUtils";

type DailyMatrixItem = { name: string; day: number; percentage: number };
type DailyMatrixRow = { name: string; percentages: Map<number, number>; total: number };

function buildDailyMatrix(items: DailyMatrixItem[], totals: Array<{ name: string; percentage: number }>) {
  const totalByName = new Map(totals.map((item) => [item.name, item.percentage]));
  const rows = new Map<string, Map<number, number>>();
  items.forEach((item) => {
    const percentages = rows.get(item.name) || new Map<number, number>();
    percentages.set(item.day, item.percentage);
    rows.set(item.name, percentages);
  });
  return Array.from(rows, ([name, percentages]): DailyMatrixRow => ({
    name,
    percentages,
    total: totalByName.get(name) ?? percentages.values().next().value ?? 0,
  }));
}

function DailyReferenceMatrix({ days, rows }: { days: number[]; rows: DailyMatrixRow[] }) {
  return (
    <section className="w-full overflow-hidden rounded-2xl border-[3px] border-[#929879] bg-white shadow-md shadow-slate-200/70 lg:col-span-full">
      <h2 className="bg-[#929879] px-4 py-2.5 text-center text-sm font-black uppercase tracking-wide text-white">Seguimiento diario porcentaje RTI</h2>
      <div className="max-h-[520px] overflow-auto p-2.5">
        <table className="w-full border-separate border-spacing-0 text-xs" style={{ minWidth: `${Math.max(760, 360 + days.length * 70)}px` }}>
          <thead className="sticky top-0 z-20">
            <tr className="bg-[#656565] text-white">
              <th className="sticky left-0 z-30 min-w-80 border-b border-r border-slate-800 bg-[#656565] px-4 py-3 text-left text-sm font-extrabold">Descripción de envase</th>
              {days.map((day) => (
                <th className="min-w-16 border-b border-r border-slate-800 px-3 py-3 text-center text-sm font-extrabold" key={day}>{day}</th>
              ))}
              <th className="min-w-20 border-b border-slate-800 px-3 py-3 text-center text-sm font-extrabold">Total</th>
            </tr>
          </thead>
          <tbody className="font-black">
            {rows.map((row) => (
              <tr key={row.name}>
                <td className="sticky left-0 z-10 border-b border-r border-slate-800 bg-[#656565] px-2 py-2 text-sm uppercase text-white">{row.name}</td>
                {days.map((day) => {
                  const percentage = row.percentages.get(day);
                  return (
                    <td className={`border-b border-r border-slate-700 px-2 py-2 text-center text-sm ${percentage === undefined ? "bg-slate-100 text-slate-400" : percentage >= 100 ? "bg-lime-400 text-slate-950" : percentage >= 85 ? "bg-[#e3c600] text-slate-950" : "bg-red-500 text-white"}`} key={day}>
                      {percentage === undefined ? "—" : `${percentage} %`}
                    </td>
                  );
                })}
                <td className="border-b border-slate-700 bg-white px-3 py-2 text-center text-sm text-slate-900">{row.total} %</td>
              </tr>
            ))}
            {!rows.length ? <tr><td className="px-4 py-10 text-center font-medium text-slate-500" colSpan={days.length + 2}>Sin resultados</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function buildLocalDailyItems(records: RtiRecord[], keyFor: (record: RtiRecord) => string) {
  const groups = new Map<string, { name: string; day: number; outbound: number; returned: number }>();
  records.forEach((record) => {
    const name = keyFor(record);
    if (!name) return;
    const id = `${name}\u0000${record.day}`;
    const current = groups.get(id) || { name, day: record.day, outbound: 0, returned: 0 };
    current.outbound += record.outbound || 0;
    current.returned += record.returned || 0;
    groups.set(id, current);
  });
  return Array.from(groups.values(), (item): DailyMatrixItem => ({
    name: item.name,
    day: item.day,
    percentage: item.outbound ? Math.round((item.returned / item.outbound) * 100) : 0,
  }));
}

function matchesFilter(value: string, filter: string) {
  return !filter || normalizeColumnName(value) === normalizeColumnName(filter);
}

export default function RtiPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rtiRequestRef = useRef<AbortController | null>(null);
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [records, setRecords] = useState<RtiRecord[]>([]);
  const [databaseState, setDatabaseState] = useState<"loading" | "connected" | "error">("loading");
  const [databaseRows, setDatabaseRows] = useState(0);
  const [duplicateRowsRemoved, setDuplicateRowsRemoved] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [responsible, setResponsible] = useState("");
  const [reference, setReference] = useState("");
  const [carrier, setCarrier] = useState("");
  const availableDateKeys = records.map(recordDateKey).filter((key) => !key.endsWith("-00")).sort();
  const minAvailableDate = availableDateKeys[0];
  const maxAvailableDate = availableDateKeys.at(-1);

  useEffect(() => {
    fetch("/api/session/session", { cache: "no-store" })
      .then(async (response) => {
        const body = response.ok ? await response.json().catch(() => null) : null;
        setAccess(body?.session?.isPeople || body?.session?.isAdmin ? "allowed" : "denied");
      })
      .catch(() => setAccess("denied"));
  }, []);

  useEffect(() => {
    if (access !== "allowed") return;
    const debounce = window.setTimeout(() => void loadRtiData(), 350);
    return () => {
      window.clearTimeout(debounce);
      rtiRequestRef.current?.abort();
    };
  }, [access]);

  async function loadRtiData() {
    rtiRequestRef.current?.abort();
    const controller = new AbortController();
    rtiRequestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 180_000);
    try {
      setDatabaseState("loading");
      setUploadMessage("");
      // Por defecto se consulta todo el histórico cargado (sin filtro de
      // fecha); si el usuario elige un rango en los filtros, se usa ese.
      const query = new URLSearchParams();
      const response = await fetch(`/api/people/rti?${query}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "No se pudo consultar RTI.");
      const rawRows = [...(body?.records || body?.tables?.RTI || [])] as Record<string, unknown>[];
      const parsedRecords = parseDatabaseRows(rawRows);
      setRecords(parsedRecords);
      setDatabaseRows(Number(body?.total) || 0);
      const duplicates = body?.duplicateRowsRemoved || {};
      setDuplicateRowsRemoved(Object.values(duplicates).reduce((sum: number, value) => sum + (Number(value) || 0), 0));
      setDatabaseState("connected");
    } catch (error) {
      if (controller.signal.aborted && rtiRequestRef.current !== controller) return;
      setDatabaseState("error");
      setUploadMessage(
        controller.signal.aborted
          ? "La consulta RTI tardó demasiado. Intenta nuevamente."
          : error instanceof Error
            ? error.message
            : "No se pudo consultar RTI.",
      );
    } finally {
      window.clearTimeout(timeout);
      if (rtiRequestRef.current === controller) rtiRequestRef.current = null;
    }
  }

  async function uploadExcelFiles(files: FileList) {
    setUploading(true);
    setUploadMessage("");
    try {
      // Se envían todos los archivos seleccionados en una sola petición para
      // que el borrado de cada tabla (RACOCIMI1/2) ocurra una única vez por
      // carga. Si se mandara un archivo por petición, dos archivos que caen
      // en la misma tabla se pisarían entre sí: el segundo borraría lo que
      // el primero acababa de insertar.
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("file", file));
      const response = await fetch("/api/people/rti/upload", { method: "POST", body: formData });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "No se pudo importar el Excel.");
      const fileNames = Array.isArray(body?.fileNames) ? body.fileNames.join(", ") : "";
      const replacedTables = Array.isArray(body?.replacedTables) ? body.replacedTables.join(", ") : "";
      const deletedRows = Number(body?.deletedRows) || 0;
      setUploadMessage(
        `${fileNames}: ${body?.inserted || 0} filas${deletedRows ? ` · borró ${deletedRows}` : ""}${replacedTables ? ` · reemplazó ${replacedTables}` : ""}`,
      );
      await loadRtiData();
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "No se pudo importar el Excel.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const filteredRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          (!dateFrom || recordDateKey(record) >= dateFrom) &&
          (!dateTo || recordDateKey(record) <= dateTo) &&
          matchesFilter(record.responsible, responsible) &&
          matchesFilter(record.reference, reference) &&
          matchesFilter(record.carrier, carrier),
      ),
    [carrier, dateFrom, dateTo, records, reference, responsible],
  );
  const visibleSummary = useMemo(() => {
    const outboundTotal = filteredRecords.reduce((total, record) => total + (record.outbound || 0), 0);
    const returnedTotal = filteredRecords.reduce((total, record) => total + (record.returned || 0), 0);
    return {
      outboundTotal,
      returnedTotal,
      rtiPercentage: outboundTotal ? Math.round((returnedTotal / outboundTotal) * 1_000) / 10 : 0,
    };
  }, [filteredRecords]);
  const { outboundTotal, returnedTotal, rtiPercentage } = visibleSummary;
  const complianceByReference = Array.from(
    filteredRecords.reduce((summary, record) => {
      const current = summary.get(record.reference) ?? { outbound: 0, returned: 0 };
      summary.set(record.reference, {
        outbound: current.outbound + (record.outbound || 0),
        returned: current.returned + (record.returned || 0),
      });
      return summary;
    }, new Map<string, { outbound: number; returned: number }>()),
    ([name, result]) => ({
      name,
      outbound: result.outbound,
      returned: result.returned,
      // Misma convención que aggregateRecords en rtiUtils.ts y que
      // "Diferencia envase retorno" en el backend: salida - retorno.
      // Antes este cálculo estaba invertido (retorno - salida), lo que hacía
      // que esta tabla mostrara el signo contrario al resto de la página
      // para el mismo dato.
      difference: quantityDifference(result.outbound, result.returned),
      percentage: result.outbound ? Math.round((result.returned / result.outbound) * 100) : 0,
    }),
  ).sort((left, right) => right.percentage - left.percentage);
  const responsibleRanking = Array.from(
    filteredRecords.reduce((summary, record) => {
      const current = summary.get(record.responsible) ?? { outbound: 0, returned: 0 };
      summary.set(record.responsible, {
        outbound: current.outbound + (record.outbound || 0),
        returned: current.returned + (record.returned || 0),
      });
      return summary;
    }, new Map<string, { outbound: number; returned: number }>()),
    ([name, result]) => ({
      name,
      percentage: result.outbound ? Math.round((result.returned / result.outbound) * 1_000) / 10 : 0,
    }),
  ).sort((left, right) => left.percentage - right.percentage);
  const offenders = responsibleRanking.slice(0, 7).map((item) => ({
    responsible: item.name,
    reference: "",
    percentage: item.percentage,
  }));
  const localCarrierMetrics = aggregateRecords(filteredRecords, (record) => record.carrier)
    .sort((left, right) => right.percentage - left.percentage || left.name.localeCompare(right.name, "es-CO"));
  const localDifferenceRanking = aggregateRecords(filteredRecords, (record) => record.responsible)
    .map((item) => ({ ...item, carrier: filteredRecords.find((record) => record.responsible === item.name)?.carrier || "Sin transportista" }))
    .sort((left, right) => right.difference - left.difference || left.name.localeCompare(right.name, "es-CO"));
  const localBoxDifferences = complianceByReference
    .map((item) => ({ reference: item.name, value: item.difference }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
  const localPackageMovement = complianceByReference.map((item) => ({ reference: item.name, outbound: item.outbound, returned: item.returned }));
  const localSkuReturns = Array.from(
    filteredRecords.reduce((summary, record) => {
      summary.set(record.reference, (summary.get(record.reference) || 0) + (record.returned || 0));
      return summary;
    }, new Map<string, number>()),
    ([referenceName, value]) => ({ referenceName, value }),
  );
  const localBoxDifferenceRanking = localDifferenceRanking.map((item) => ({ name: item.name, value: item.difference, carrier: item.carrier }));
  const localDailyRouteRti = aggregateRecords(filteredRecords.filter((record) => record.dt), (record) => record.dt || "")
    .map((item) => {
      const source = filteredRecords.find((record) => record.dt === item.name);
      return { route: item.name, month: source?.month || "", day: source?.day || 0, percentage: item.percentage };
    })
    .sort((left, right) => monthIndex(left.month) - monthIndex(right.month) || left.day - right.day || left.route.localeCompare(right.route));
  const localDailyRtiMetrics = aggregateRecords(filteredRecords, recordDateKey)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((item) => ({
      date: item.name,
      day: Number(item.name.slice(8, 10)),
      month: Number(item.name.slice(5, 7)),
      percentage: item.percentage,
    }));
  const chartReferences = complianceByReference
    .slice(0, 10);
  const displayedCarrierMetrics = localCarrierMetrics.slice(0, 6);
  const displayedBoxDifferences = localBoxDifferences.slice(0, 10);
  const displayedBoxDifferenceMax = Math.max(
    1,
    ...displayedBoxDifferences.map((item) => Math.abs(item.value)),
  );
  const displayedPackageMovement = localPackageMovement.slice(0, 10);
  const packageMovementMax = Math.max(
    1,
    ...displayedPackageMovement.flatMap((item) => [item.outbound, item.returned]),
  );
  const displayedSkuReturns = localSkuReturns.sort((left, right) => right.value - left.value).slice(0, 12);
  const skuReturnMax = Math.max(1, ...displayedSkuReturns.map((item) => item.value));
  const displayedBoxDifferenceRanking = localBoxDifferenceRanking;
  const totalBoxDifference = quantityDifference(outboundTotal, returnedTotal);
  const dailyRtiMetrics = localDailyRtiMetrics;
  const displayedDailyRouteRti = localDailyRouteRti.slice(0, 15);
  const localResponsibleDailyItems = buildLocalDailyItems(filteredRecords, (record) => record.responsible);
  const localReferenceDailyItems = buildLocalDailyItems(filteredRecords, (record) => record.reference);
  const responsibleDailyRows = buildDailyMatrix(localResponsibleDailyItems, responsibleRanking)
    .sort((left, right) => left.total - right.total || left.name.localeCompare(right.name, "es-CO"));
  const responsibleDailyDays = Array.from(new Set(
    responsibleDailyRows.flatMap((row) => Array.from(row.percentages.keys())),
  )).sort((left, right) => left - right);
  const referenceDailyRows = buildDailyMatrix(
    localReferenceDailyItems,
    complianceByReference.map((item) => ({ name: item.name, percentage: item.percentage })),
  ).sort((left, right) => left.name.localeCompare(right.name, "es-CO"));
  const referenceDailyDays = Array.from(new Set(
    referenceDailyRows.flatMap((row) => Array.from(row.percentages.keys())),
  )).sort((left, right) => left - right);
  const gaugePercentage = Math.max(0, Math.min(rtiPercentage, 100));
  const needleAngle = 180 + (gaugePercentage / 100) * 180;
  const needleRadians = (needleAngle * Math.PI) / 180;
  const needleX = 150 + Math.cos(needleRadians) * 76;
  const needleY = 150 + Math.sin(needleRadians) * 76;

  if (access === "checking") return <main className="min-h-screen bg-slate-100" />;

  if (access === "denied") {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-5">
        <section className="max-w-md rounded-lg border border-red-100 bg-white p-6 text-center shadow-sm">
          <ShieldAlert className="mx-auto text-red-600" size={28} />
          <h1 className="mt-3 text-xl font-semibold text-[#10223d]">Modulo no disponible</h1>
          <p className="mt-2 text-sm text-slate-500">RTI esta disponible exclusivamente para People.</p>
          <button className="mt-5 rounded-md bg-[#10223d] px-4 py-2 text-sm font-semibold text-white" onClick={() => router.push("/")} type="button">
            Volver
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-5 py-4 sm:px-8">
          <button aria-label="Volver al portal" className="grid h-10 w-10 place-items-center rounded-xl text-slate-900 transition hover:bg-slate-100" onClick={() => router.push("/")} type="button">
            <ArrowLeft size={19} />
          </button>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-900 text-white shadow-md shadow-slate-200">
            <BarChart3 size={22} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">People Transporte</p>
            <h1 className="text-2xl font-semibold text-slate-950">RTI</h1>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <button className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:flex ${
              databaseState === "connected"
                ? "bg-emerald-50 text-emerald-700"
                : databaseState === "error"
                  ? "bg-red-50 text-red-700"
                  : "bg-slate-100 text-slate-600"
            }`}
              disabled={databaseState === "loading"}
              onClick={() => void loadRtiData()}
              title={databaseState === "error" ? "Reintentar conexión" : undefined}
              type="button"
            >
              {databaseState === "loading" ? <LoaderCircle className="animate-spin" size={14} /> : <Database size={14} />}
              {databaseState === "connected"
                ? `RACOCIMI · ${databaseRows} filas`
                : databaseState === "error"
                  ? "Reintentar"
                  : "Conectando"}
            </button>
            <input
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const files = event.target.files;
                if (files?.length) void uploadExcelFiles(files);
              }}
              multiple
              ref={fileInputRef}
              type="file"
            />
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {uploading ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />}
              {uploading ? "Subiendo…" : "Subir Excel"}
            </button>
          </div>
        </div>
        {uploadMessage ? (
          <div className={`mx-auto max-w-[1500px] px-5 pb-3 text-right text-xs font-semibold sm:px-8 ${
            uploadMessage.includes("correctamente") ? "text-emerald-700" : "text-red-600"
          }`}>
            {uploadMessage}
          </div>
        ) : null}
      </header>

      {databaseState === "connected" && databaseRows === 0 ? (
        <div className="mx-auto mt-5 max-w-[1436px] rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          Supabase no devolvió filas de RACOCIMI1/2. Habilita las políticas de lectura del módulo RTI para consultar los datos y cruzar los responsables.
        </div>
      ) : null}

      {databaseState === "connected" && duplicateRowsRemoved > 0 ? (
        <div className="mx-auto mt-5 max-w-[1436px] rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          Se detectaron {duplicateRowsRemoved} filas duplicadas en RACOCIMI1/2 (mismo contenido repetido, probablemente un Excel cargado dos veces). No se contaron dos veces en el RTI, pero conviene depurarlas en Supabase.
        </div>
      ) : null}

      <section className="mx-auto grid max-w-[1500px] gap-4 px-5 py-6 sm:px-8 lg:grid-cols-2">
        <aside className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-md shadow-slate-200/70 lg:col-span-full lg:grid-cols-5">
          <div className="grid grid-cols-2 gap-2 lg:contents">
            <DateInput
              label="Desde"
              max={dateTo || maxAvailableDate}
              min={minAvailableDate}
              onChange={(value) => {
                setDateFrom(value);
                if (!value && dateTo === dateFrom) setDateTo("");
                else if (value && (!dateTo || value > dateTo)) setDateTo(value);
              }}
              value={dateFrom}
            />
            <DateInput
              label="Hasta"
              max={maxAvailableDate}
              min={dateFrom || minAvailableDate}
              onChange={(value) => {
                setDateTo(value);
                if (!value && dateFrom === dateTo) setDateFrom("");
                else if (value && (!dateFrom || value < dateFrom)) setDateFrom(value);
              }}
              value={dateTo}
            />
          </div>
          <div className="grid gap-3 lg:contents">
            <FilterSelect wide label="Responsable de ruta" value={responsible} onChange={setResponsible} options={uniqueValues(records, "responsible")} allLabel="Todas" />
            <FilterSelect wide label="Referencia de envase" value={reference} onChange={setReference} options={uniqueValues(records, "reference")} allLabel="Todas" />
            <FilterSelect wide label="Transportista" value={carrier} onChange={setCarrier} options={uniqueValues(records, "carrier")} allLabel="Todas" />
          </div>
        </aside>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_-24px_rgba(15,23,42,.35)]">
          <PanelHeader>Porcentaje de RTI</PanelHeader>
          <div className="grid min-h-[390px] place-items-center bg-[radial-gradient(circle_at_50%_15%,#f0fdfa_0%,#ffffff_55%)] px-5 pb-6 pt-4">
            <div className="w-full max-w-[390px]">
              <svg aria-label={`Porcentaje de RTI ${rtiPercentage}%`} className="w-full" role="img" viewBox="0 0 300 205">
                <title>Porcentaje de RTI</title>
                <desc>Medidor semicircular con un resultado de {rtiPercentage} por ciento.</desc>
                <defs>
                  <linearGradient id="rtiGauge" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#dc2626" />
                    <stop offset="50%" stopColor="#facc15" />
                    <stop offset="100%" stopColor="#16a34a" />
                  </linearGradient>
                </defs>
                <path d="M 32 150 A 118 118 0 0 1 268 150" fill="none" pathLength="100" stroke="#e2e8f0" strokeLinecap="round" strokeWidth="34" />
                <path d="M 32 150 A 118 118 0 0 1 268 150" fill="none" pathLength="100" stroke="url(#rtiGauge)" strokeDasharray={`${gaugePercentage} 100`} strokeLinecap="round" strokeWidth="34" />
                <line stroke="#0f172a" strokeLinecap="round" strokeWidth="7" x1="150" x2={needleX} y1="150" y2={needleY} />
                <circle cx="150" cy="150" fill="#ffffff" r="17" stroke="#0f172a" strokeWidth="6" />
                <text fill="#64748b" fontSize="15" fontWeight="600" x="16" y="184">0 %</text>
                <text fill="#64748b" fontSize="15" fontWeight="600" textAnchor="end" x="284" y="184">100 %</text>
                <text fill="#0f172a" fontSize="38" fontWeight="700" textAnchor="middle" x="150" y="202">{rtiPercentage} %</text>
              </svg>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
                  <p className="text-[9px] font-extrabold uppercase tracking-[.12em] text-amber-700">Envases de salida</p>
                  <p className="mt-1 text-2xl font-black text-slate-900">{formatChartNumber(outboundTotal)}</p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
                  <p className="text-[9px] font-extrabold uppercase tracking-[.12em] text-emerald-700">Envases retornados</p>
                  <p className="mt-1 text-2xl font-black text-slate-900">{formatChartNumber(returnedTotal)}</p>
                </div>
              </div>
              {!filteredRecords.length ? <p className="mt-3 text-center text-sm font-medium text-slate-500">Sin datos para los filtros seleccionados.</p> : null}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_-24px_rgba(15,23,42,.35)]">
          <PanelHeader>Top Offender</PanelHeader>
          <div className="overflow-x-auto p-4">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="bg-slate-950 text-white">
                  <th className="px-4 py-3 text-left font-semibold">Nombre RR</th>
                  <th className="px-4 py-3 text-right font-semibold">Porcentaje RTI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {offenders.map((record) => (
                  <tr className="transition-colors hover:bg-slate-50" key={`${record.responsible}-${record.reference}`}>
                    <td className="px-4 py-3 font-bold uppercase text-slate-800"><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-[10px] text-slate-500">{offenders.indexOf(record) + 1}</span>{record.responsible}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative ml-auto h-9 max-w-52 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200">
                        <div className={`absolute inset-y-0 left-0 rounded-full ${performanceColor(record.percentage)}`} style={{ width: `${Math.min(record.percentage, 100)}%` }} />
                        <span className="relative z-10 flex h-full items-center justify-end px-3 font-black text-slate-950">{record.percentage} %</span>
                      </div>
                    </td>
                  </tr>
                ))}
                {!offenders.length ? (
                  <tr>
                    <td className="px-4 py-12 text-center font-medium text-slate-500" colSpan={2}>Sin resultados</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <DailyReferenceMatrix days={referenceDailyDays} rows={referenceDailyRows} />

        <section className="grid w-full items-start gap-4 lg:col-span-full lg:grid-cols-2">
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>Porcentaje de cumplimiento RTI por referencia</PanelHeader>
            <div className="max-h-[360px] space-y-2 overflow-auto p-4">
              {chartReferences.length ? (
                <div className="space-y-3">
                  {chartReferences.map((item) => (
                    <div className="grid grid-cols-[minmax(130px,1fr)_2fr_58px] items-center gap-3" key={item.name}>
                      <span className="truncate text-[10px] font-bold text-slate-700" title={item.name}>{item.name}</span>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200">
                        <div className={`h-full rounded-full ${performanceColor(item.percentage)}`} style={{ width: `${Math.min(Math.max(item.percentage, 0), 100)}%` }} />
                      </div>
                      <span className="text-right text-xs font-black text-slate-900">{item.percentage} %</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid min-h-[185px] place-items-center text-sm font-medium text-slate-500">Sin resultados</div>
              )}
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>Cantidad de cajas de diferencia por referencia</PanelHeader>
            <div className="max-h-[360px] overflow-auto p-4">
              <p className="mb-3 text-[10px] font-semibold text-slate-500">Diferencia = salida − retorno · ordenada por impacto absoluto</p>
              <div className="space-y-3">
                {displayedBoxDifferences.map((item) => {
                  const width = item.value === 0 ? 0 : Math.max((Math.abs(item.value) / displayedBoxDifferenceMax) * 100, 2);
                  return (
                    <div className="grid grid-cols-[minmax(130px,1fr)_2fr_80px] items-center gap-3" key={item.reference}>
                      <span className="truncate text-[10px] font-bold text-slate-700" title={item.reference}>{item.reference}</span>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200">
                        <div className={`h-full ${item.value >= 0 ? "bg-amber-400" : "bg-red-500"}`} style={{ width: `${width}%` }} />
                      </div>
                      <span className={`text-right text-xs font-black ${item.value >= 0 ? "text-amber-700" : "text-red-600"}`}>{formatChartNumber(item.value)}</span>
                    </div>
                  );
                })}
                {!displayedBoxDifferences.length ? <div className="grid min-h-[150px] place-items-center text-sm font-medium text-slate-500">Sin resultados</div> : null}
              </div>
            </div>
          </article>
        </section>

        <section className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70 lg:col-span-full">
          <PanelHeader compact>Porcentaje RTI por día</PanelHeader>
          <div className="max-h-[520px] overflow-auto p-2">
            <table className="w-full text-xs" style={{ minWidth: `${Math.max(520, 330 + responsibleDailyDays.length * 68)}px` }}>
              <thead>
                <tr className="bg-slate-950 text-white">
                  <th className="sticky left-0 z-10 min-w-64 bg-slate-950 px-4 py-2 text-left font-semibold">Nombre RR</th>
                  {responsibleDailyDays.map((day) => (
                    <th className="w-16 px-3 py-2 text-center font-semibold" key={day}>Día {day}</th>
                  ))}
                  <th className="w-32 px-4 py-2 text-center font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {responsibleDailyRows.map((row) => (
                  <tr className="hover:bg-slate-50" key={row.name}>
                    <td className="sticky left-0 z-[1] bg-white px-4 py-1.5 font-semibold uppercase text-slate-800">{row.name}</td>
                    {responsibleDailyDays.map((day) => {
                      const percentage = row.percentages.get(day);
                      return (
                        <td className={`px-3 py-1.5 text-center font-bold ${percentage === undefined ? "bg-slate-50 text-slate-400" : rankingColor(percentage)}`} key={day}>
                          {percentage === undefined ? "—" : `${percentage} %`}
                        </td>
                      );
                    })}
                    <td className="bg-slate-100 px-4 py-1.5 text-center font-bold text-slate-800">{row.total} %</td>
                  </tr>
                ))}
                {!responsibleDailyRows.length ? (
                  <tr>
                    <td className="px-4 py-8 text-center font-medium text-slate-500" colSpan={responsibleDailyDays.length + 2}>Sin resultados</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid w-full items-start gap-4 lg:col-span-full lg:grid-cols-2">
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>Diferencia de envase salida vs retorno</PanelHeader>
            <div className="overflow-x-auto p-3">
              <div className="mb-2 flex justify-center gap-4 text-[9px] font-semibold text-slate-600">
                <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />Envase salida</span>
                <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Envase retorno</span>
              </div>
              <div
                className="flex min-h-[220px] items-end gap-4 border-b border-slate-300 px-3"
                style={{ minWidth: `${Math.max(displayedPackageMovement.length * 115, 570)}px` }}
              >
                {displayedPackageMovement.map((item) => (
                  <div className="flex min-w-0 flex-1 flex-col items-center" key={item.reference}>
                    <div className="flex h-[150px] items-end justify-center gap-2">
                      <MovementBar color="bg-gradient-to-t from-amber-500 to-yellow-300" max={packageMovementMax} value={item.outbound} />
                      <MovementBar color="bg-gradient-to-t from-emerald-600 to-emerald-400" max={packageMovementMax} value={item.returned} />
                    </div>
                    <span className="mt-2 line-clamp-2 min-h-10 max-w-28 text-center text-[9px] font-semibold leading-tight text-slate-700" title={item.reference}>
                      {item.reference}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>Porcentaje RTI por transportista</PanelHeader>
            <div className="flex min-h-[232px] items-end justify-center gap-5 overflow-x-auto p-4">
              {displayedCarrierMetrics.map((item) => (
                <div className="flex w-32 shrink-0 flex-col items-center" key={item.name}>
                  <span className="mb-1 text-xs font-bold text-slate-800">{item.percentage} %</span>
                  <div className="w-16 rounded-t-md bg-gradient-to-t from-emerald-700 to-emerald-400 shadow-sm" style={{ height: `${Math.max(item.percentage * 1.25, 5)}px` }} />
                  <span className="mt-2 text-center text-[9px] font-semibold uppercase leading-tight text-slate-700">{item.name}</span>
                </div>
              ))}
              {!displayedCarrierMetrics.length ? <span className="self-center text-sm font-medium text-slate-500">Sin resultados</span> : null}
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>SKU retorno</PanelHeader>
            <div className="max-h-[360px] space-y-3 overflow-auto p-4">
              <p className="text-[10px] font-semibold text-slate-500">Retornos por nombre de envase del catálogo SKU</p>
              <div className="space-y-3">
                {displayedSkuReturns.map((item, index) => (
                  <div className="grid grid-cols-[minmax(150px,1fr)_2fr_78px] items-center gap-3" key={item.referenceName}>
                    <span className="truncate text-[10px] font-bold text-slate-700" title={item.referenceName}>{item.referenceName}</span>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200">
                      <div className={`h-full rounded-full ${skuBarColor(index)}`} style={{ width: `${Math.max((item.value / skuReturnMax) * 100, item.value ? 2 : 0)}%` }} />
                    </div>
                    <span className="text-right text-[10px] font-black text-slate-900">{formatChartNumber(item.value)}</span>
                  </div>
                ))}
                {!displayedSkuReturns.length ? <div className="grid min-h-[150px] place-items-center text-sm font-medium text-slate-500">Sin resultados</div> : null}
              </div>
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>Diferencia en cajas</PanelHeader>
              <div className="max-h-[430px] overflow-auto p-3">
              <p className="mb-2 text-[10px] font-semibold text-slate-500">Diferencia = salida − retorno. Un valor positivo representa cajas pendientes.</p>
              <table className="w-full min-w-[500px] text-[10px]">
                <thead>
                  <tr className="bg-slate-950 text-white">
                    <th className="px-2 py-2 text-left">Nombre RR</th>
                    <th className="px-2 py-2 text-center">Dif. cajas</th>
                    <th className="px-2 py-2 text-left">Transportista</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {displayedBoxDifferenceRanking.map((item) => (
                    <tr className="transition-colors hover:bg-slate-50" key={item.name}>
                      <td className="px-2 py-1.5 font-semibold uppercase text-slate-800">{item.name}</td>
                      <td className={`px-2 py-1.5 text-center font-bold ${item.value > 0 ? "bg-emerald-500 text-white" : item.value === 0 ? "bg-amber-300 text-slate-950" : "bg-red-500/90 text-white"}`}>{item.value}</td>
                      <td className="px-2 py-1.5 font-semibold uppercase text-slate-700">{item.carrier}</td>
                    </tr>
                  ))}
                  {!displayedBoxDifferenceRanking.length ? <tr><td className="px-3 py-8 text-center text-slate-500" colSpan={3}>Sin resultados</td></tr> : null}
                </tbody>
                <tfoot>
                  <tr className="sticky bottom-0 bg-slate-900 font-black text-white">
                    <td className="px-2 py-2">TOTAL DEL FILTRO</td>
                    <td className="px-2 py-2 text-center">{formatChartNumber(totalBoxDifference)}</td>
                    <td className="px-2 py-2 text-right text-[9px]">{formatChartNumber(outboundTotal)} − {formatChartNumber(returnedTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </article>
        </section>

        <section className="grid w-full items-start gap-4 lg:col-span-full lg:grid-cols-1">
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70 lg:col-span-2">
            <PanelHeader compact>Porcentaje RTI por día</PanelHeader>
            <div className="overflow-x-auto px-5 pb-4 pt-6">
              <div
                className="flex min-h-[210px] items-end gap-3 border-b border-slate-300"
                style={{ minWidth: `${Math.max(dailyRtiMetrics.length * 72, 420)}px` }}
              >
                {dailyRtiMetrics.map((item) => (
                  <div className="flex min-w-14 flex-1 flex-col items-center" key={item.date}>
                    <span className="mb-1 text-[9px] font-bold text-slate-800">{item.percentage} %</span>
                    <div
                      className={`w-full max-w-12 rounded-t-sm shadow-sm ${percentageBarColor(item.percentage)}`}
                      style={{ height: `${Math.max(Math.min(item.percentage, 110) * 1.35, 4)}px` }}
                    />
                    <span className="mt-2 pb-2 text-[9px] font-bold text-slate-700">{item.day}/{item.month}</span>
                  </div>
                ))}
                {!dailyRtiMetrics.length ? (
                  <div className="grid min-h-[190px] w-full place-items-center text-sm font-medium text-slate-500">Sin resultados</div>
                ) : null}
              </div>
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>RTI diario por ruta</PanelHeader>
            <div className="max-h-[520px] overflow-auto p-3">
              <table className="w-full min-w-[390px] text-[11px]">
                <thead>
                  <tr className="bg-slate-950 text-white">
                    <th className="px-2 py-2 text-left">Ruta</th>
                    <th className="px-2 py-2 text-left">Mes</th>
                    <th className="px-2 py-2 text-center">Día</th>
                    <th className="px-2 py-2 text-center">Porcentaje RTI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {displayedDailyRouteRti.map((item) => (
                    <tr className="hover:bg-slate-50" key={`${item.route}-${item.month}-${item.day}`}>
                      <td className="px-2 py-2 font-semibold text-slate-800">{item.route}</td>
                      <td className="px-2 py-2 text-slate-700">{item.month}</td>
                      <td className="px-2 py-2 text-center text-slate-700">{item.day}</td>
                      <td className={`px-2 py-2 text-center font-bold ${rankingColor(item.percentage)}`}>{item.percentage} %</td>
                    </tr>
                  ))}
                  {!displayedDailyRouteRti.length ? <tr><td className="px-3 py-8 text-center text-slate-500" colSpan={4}>Sin resultados</td></tr> : null}
                  <tr className="bg-slate-100 font-bold text-slate-900">
                    <td className="px-2 py-2" colSpan={3}>Total</td>
                    <td className="px-2 py-2 text-center">{rtiPercentage} %</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

        </section>
      </section>
    </main>
  );
}
