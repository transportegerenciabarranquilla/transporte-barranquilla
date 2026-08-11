"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, BarChart3, ChevronDown, ChevronUp, Database, FileSpreadsheet, LoaderCircle, PackageOpen, ShieldAlert, TrendingDown, Trophy, Truck, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { DateInput, FilterSelect, formatChartNumber, PanelHeader } from "./components/RtiVisuals";
import type { RtiRecord } from "./rtiTypes";
import { quantityDifference } from "./rtiCalculation";
import {
  aggregateRecords,
  monthIndex,
  normalizeColumnName,
  parseDatabaseRows,
  performanceColor,
  rankingColor,
  recordDateKey,
  skuBarColor,
  uniqueValues,
} from "./rtiUtils";

type DailyMatrixItem = { name: string; day: number; percentage: number };
type DailyMatrixRow = { name: string; percentages: Map<number, number>; total: number };
type RtiPageCache = { records: RtiRecord[]; databaseRows: number; duplicateRowsRemoved: number };

let rtiPageCache: RtiPageCache | undefined;

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
      <div className="max-h-[360px] overflow-auto p-2.5">
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

function formatBoxes(envases: number) {
  return Math.floor(Math.abs(Number(envases) || 0) / 30).toLocaleString("es-CO");
}

function DailyTrendChart({ data }: { data: Array<{ date: string; day: number; month: number; percentage: number }> }) {
  if (!data.length) return <div className="grid min-h-[250px] place-items-center text-sm font-medium text-slate-500">Sin resultados</div>;
  const width = Math.max(760, data.length * 72);
  const height = 270;
  const left = 54;
  const right = 24;
  const top = 24;
  const bottom = 46;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const maximum = Math.max(110, Math.ceil(Math.max(...data.map((item) => item.percentage)) / 10) * 10);
  const xFor = (index: number) => data.length === 1 ? left + chartWidth / 2 : left + (index / (data.length - 1)) * chartWidth;
  const yFor = (value: number) => top + chartHeight - (Math.max(0, value) / maximum) * chartHeight;
  const points = data.map((item, index) => `${xFor(index)},${yFor(item.percentage)}`).join(" ");
  const areaPath = `M ${xFor(0)} ${top + chartHeight} L ${points.replaceAll(",", " ")} L ${xFor(data.length - 1)} ${top + chartHeight} Z`;
  const labelStep = Math.max(1, Math.ceil(data.length / 12));
  const gridValues = [0, 25, 50, 75, 100].filter((value) => value <= maximum);

  return (
    <div className="overflow-x-auto px-3 pb-3 pt-2">
      <svg aria-label="Tendencia diaria del porcentaje RTI" className="h-[270px]" role="img" style={{ minWidth: `${width}px` }} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id="dailyRtiArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.42" />
            <stop offset="55%" stopColor="#14b8a6" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.01" />
          </linearGradient>
          <pattern height="24" id="dailyTechGrid" patternUnits="userSpaceOnUse" width="24">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#0f766e" strokeOpacity="0.06" strokeWidth="1" />
          </pattern>
          <filter height="200%" id="dailyGlow" width="200%" x="-50%" y="-50%">
            <feGaussianBlur result="blur" stdDeviation="3" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect fill="url(#dailyTechGrid)" height={chartHeight} rx="14" width={chartWidth} x={left} y={top} />
        {gridValues.map((value) => (
          <g key={value}>
            <line stroke="#e2e8f0" strokeDasharray="4 5" x1={left} x2={width - right} y1={yFor(value)} y2={yFor(value)} />
            <text fill="#64748b" fontSize="10" fontWeight="700" textAnchor="end" x={left - 10} y={yFor(value) + 4}>{value}%</text>
          </g>
        ))}
        <line stroke="#f59e0b" strokeDasharray="7 5" strokeWidth="1.5" x1={left} x2={width - right} y1={yFor(95)} y2={yFor(95)} />
        <text fill="#b45309" fontSize="10" fontWeight="800" textAnchor="end" x={width - right} y={yFor(95) - 7}>Meta 95%</text>
        <path d={areaPath} fill="url(#dailyRtiArea)" />
        <polyline fill="none" opacity="0.22" points={points} stroke="#22d3ee" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10" />
        <polyline fill="none" filter="url(#dailyGlow)" points={points} stroke="#0e7490" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        {data.map((item, index) => (
          <g key={item.date}>
            <circle cx={xFor(index)} cy={yFor(item.percentage)} fill={item.percentage >= 95 ? "#10b981" : item.percentage >= 85 ? "#f59e0b" : "#ef4444"} opacity="0.18" r="10" />
            <circle cx={xFor(index)} cy={yFor(item.percentage)} fill={item.percentage >= 95 ? "#10b981" : item.percentage >= 85 ? "#f59e0b" : "#ef4444"} filter="url(#dailyGlow)" r="5" stroke="white" strokeWidth="2">
              <title>{item.date}: {item.percentage}%</title>
            </circle>
            {index % labelStep === 0 || index === data.length - 1 ? <text fill="#475569" fontSize="10" fontWeight="700" textAnchor="middle" x={xFor(index)} y={height - 18}>{item.day}/{item.month}</text> : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

function InsightMetric({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: "emerald" | "red" | "amber" | "blue" }) {
  const styles = {
    emerald: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-700",
    red: "border-red-200 bg-gradient-to-br from-red-50 to-white text-red-700",
    amber: "border-amber-200 bg-gradient-to-br from-amber-50 to-white text-amber-700",
    blue: "border-blue-200 bg-gradient-to-br from-blue-50 to-white text-blue-700",
  };
  return (
    <article className={`flex min-h-28 items-center gap-3 rounded-2xl border p-4 shadow-sm ${styles[tone]}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">{icon}</span>
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[.12em] opacity-75">{label}</p>
        <p className="mt-1 truncate text-xs font-black text-slate-900" title={value}>{value}</p>
        <p className="mt-1 text-lg font-black">{detail}</p>
      </div>
    </article>
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
  const [records, setRecords] = useState<RtiRecord[]>(() => rtiPageCache?.records ?? []);
  const [databaseState, setDatabaseState] = useState<"loading" | "connected" | "error">(() => rtiPageCache ? "connected" : "loading");
  const [databaseRows, setDatabaseRows] = useState(() => rtiPageCache?.databaseRows ?? 0);
  const [duplicateRowsRemoved, setDuplicateRowsRemoved] = useState(() => rtiPageCache?.duplicateRowsRemoved ?? 0);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadTarget, setUploadTarget] = useState<"RACOCIMI1" | "RACOCIMI2">("RACOCIMI1");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [responsible, setResponsible] = useState("");
  const [reference, setReference] = useState("");
  const [carrier, setCarrier] = useState("");
  const [selectedOffender, setSelectedOffender] = useState<{ responsible: string; carrier: string } | null>(null);
  const [showAllOffenders, setShowAllOffenders] = useState(false);
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
    const debounce = window.setTimeout(() => void loadRtiData(Boolean(rtiPageCache)), rtiPageCache ? 0 : 150);
    return () => {
      window.clearTimeout(debounce);
      rtiRequestRef.current?.abort();
    };
  }, [access]);

  useEffect(() => {
    if (!selectedOffender) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedOffender(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedOffender]);

  async function loadRtiData(background = false) {
    rtiRequestRef.current?.abort();
    const controller = new AbortController();
    rtiRequestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 180_000);
    try {
      if (!background) setDatabaseState("loading");
      if (!background) setUploadMessage("");
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
      const duplicates = body?.duplicateRowsRemoved || {};
      const nextDuplicateRowsRemoved = Object.values(duplicates).reduce((sum: number, value) => sum + (Number(value) || 0), 0);
      const nextDatabaseRows = Number(body?.total) || 0;
      setDatabaseRows(nextDatabaseRows);
      setDuplicateRowsRemoved(nextDuplicateRowsRemoved);
      rtiPageCache = { records: parsedRecords, databaseRows: nextDatabaseRows, duplicateRowsRemoved: nextDuplicateRowsRemoved };
      setDatabaseState("connected");
    } catch (error) {
      if (controller.signal.aborted && rtiRequestRef.current !== controller) return;
      if (!background || !rtiPageCache) setDatabaseState("error");
      if (!background || !rtiPageCache) setUploadMessage(
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
      formData.append("targetTable", uploadTarget);
      Array.from(files).forEach((file) => formData.append("file", file));
      const response = await fetch("/api/people/rti/upload", { method: "POST", body: formData });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || "No se pudo importar el Excel.");
      const fileNames = Array.isArray(body?.fileNames) ? body.fileNames.join(", ") : "";
      const replacedTables = Array.isArray(body?.replacedTables) ? body.replacedTables.join(", ") : "";
      const deletedRows = Number(body?.deletedRows) || 0;
      const replacedRoutes = Number(body?.replacedRoutes) || 0;
      const discardedDuplicates = Number(body?.duplicateRowsDiscarded) || 0;
      setUploadMessage(
        `Carga lista · ${replacedTables || uploadTarget} · ${fileNames} · ${body?.inserted || 0} filas · ${replacedRoutes} rutas actualizadas · ${deletedRows} filas anteriores reemplazadas${discardedDuplicates ? ` · ${discardedDuplicates} duplicados descartados` : ""}`,
      );
      rtiPageCache = undefined;
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
  const offenderRanking = Array.from(
    filteredRecords.reduce((summary, record) => {
      const key = `${record.carrier}\u0000${record.responsible}`;
      const current = summary.get(key) ?? { responsible: record.responsible, carrier: record.carrier, outbound: 0, returned: 0 };
      summary.set(key, {
        responsible: current.responsible,
        carrier: current.carrier,
        outbound: current.outbound + (record.outbound || 0),
        returned: current.returned + (record.returned || 0),
      });
      return summary;
    }, new Map<string, { responsible: string; carrier: string; outbound: number; returned: number }>()),
    ([, result]) => ({
      responsible: result.responsible,
      carrier: result.carrier,
      percentage: result.outbound ? Math.round((result.returned / result.outbound) * 1_000) / 10 : 0,
    }),
  ).sort((left, right) => left.percentage - right.percentage || left.responsible.localeCompare(right.responsible, "es-CO"));
  const responsibleRanking = aggregateRecords(filteredRecords, (record) => record.responsible)
    .sort((left, right) => left.percentage - right.percentage || left.name.localeCompare(right.name, "es-CO"));
  const allOffendersByCarrier = Array.from(
    offenderRanking.reduce((groups, item) => {
      const rows = groups.get(item.carrier) || [];
      rows.push(item);
      groups.set(item.carrier, rows);
      return groups;
    }, new Map<string, typeof offenderRanking>()),
  ).sort(([left], [right]) => left.localeCompare(right, "es-CO"));
  const hiddenOffenderCount = allOffendersByCarrier.reduce((total, [, rows]) => total + Math.max(rows.length - 20, 0), 0);
  const offendersByCarrier = allOffendersByCarrier.map(([contractor, rows]) => [
    contractor,
    (showAllOffenders ? rows : rows.slice(0, 20)).map((item, index) => ({ ...item, rank: index + 1 })),
  ] as const);
  const selectedOffenderReferences = selectedOffender
    ? aggregateRecords(
        filteredRecords.filter((record) => record.responsible === selectedOffender.responsible && record.carrier === selectedOffender.carrier),
        (record) => record.reference,
      ).sort((left, right) =>
        (right.outbound - right.returned) - (left.outbound - left.returned) ||
        right.outbound - left.outbound ||
        left.name.localeCompare(right.name, "es-CO"),
      )
    : [];
  const mostDispatchedReference = [...selectedOffenderReferences].sort((left, right) => right.outbound - left.outbound)[0];
  const mostPendingReference = selectedOffenderReferences.find((item) => item.outbound > item.returned);
  const selectedOffenderDtIssues = selectedOffender
    ? Array.from(
        filteredRecords
          .filter((record) => record.responsible === selectedOffender.responsible && record.carrier === selectedOffender.carrier)
          .reduce((groups, record) => {
            const dt = record.dt || "Sin DT";
            const key = `${dt}\u0000${record.reference}`;
            const current = groups.get(key) || { dt, reference: record.reference, outbound: 0, returned: 0 };
            current.outbound += record.outbound || 0;
            current.returned += record.returned || 0;
            groups.set(key, current);
            return groups;
          }, new Map<string, { dt: string; reference: string; outbound: number; returned: number }>()),
        ([, item]) => ({
          ...item,
          difference: item.returned - item.outbound,
          percentage: item.outbound ? Math.round((item.returned / item.outbound) * 1_000) / 10 : null,
        }),
      )
        .filter((item) => item.difference !== 0)
        .sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference) || left.dt.localeCompare(right.dt, "es-CO"))
    : [];
  const localCarrierMetrics = aggregateRecords(filteredRecords, (record) => record.carrier)
    .sort((left, right) => right.percentage - left.percentage || left.name.localeCompare(right.name, "es-CO"));
  const localDifferenceRanking = aggregateRecords(filteredRecords, (record) => record.responsible)
    .map((item) => ({ ...item, carrier: filteredRecords.find((record) => record.responsible === item.name)?.carrier || "Sin transportista" }))
    .sort((left, right) => right.difference - left.difference || left.name.localeCompare(right.name, "es-CO"));
  const localBoxDifferences = complianceByReference
    .map((item) => ({ reference: item.name, value: item.difference }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
  const localPackageMovement = complianceByReference
    .map((item) => ({ reference: item.name, outbound: item.outbound, returned: item.returned }))
    .sort((left, right) =>
      Math.abs(right.outbound - right.returned) - Math.abs(left.outbound - left.returned) ||
      right.outbound - left.outbound,
    );
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
  const bestReference = complianceByReference[0];
  const lowestReference = [...complianceByReference].sort((left, right) => left.percentage - right.percentage)[0];
  const largestDifference = localBoxDifferences[0];
  const bestCarrier = localCarrierMetrics[0];
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

  async function exportDashboardExcel() {
    if (!filteredRecords.length) {
      setUploadMessage("No hay datos con los filtros actuales para exportar.");
      return;
    }
    setExporting(true);
    setUploadMessage("");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      const appendSheet = (name: string, rows: Record<string, string | number>[], widths: number[]) => {
        const sheet = XLSX.utils.json_to_sheet(rows);
        sheet["!cols"] = widths.map((wch) => ({ wch }));
        XLSX.utils.book_append_sheet(workbook, sheet, name);
      };
      appendSheet("Resumen", [
        { Indicador: "Fecha desde", Valor: dateFrom || "Todo el historico" },
        { Indicador: "Fecha hasta", Valor: dateTo || "Todo el historico" },
        { Indicador: "Responsable", Valor: responsible || "Todos" },
        { Indicador: "Referencia de envase", Valor: reference || "Todas" },
        { Indicador: "Transportista", Valor: carrier || "Todos" },
        { Indicador: "Envases de salida", Valor: outboundTotal },
        { Indicador: "Envases retornados", Valor: returnedTotal },
        { Indicador: "Envases pendientes", Valor: Math.max(outboundTotal - returnedTotal, 0) },
        { Indicador: "Diferencia en cajas", Valor: totalBoxDifference },
        { Indicador: "Porcentaje RTI", Valor: rtiPercentage / 100 },
      ], [28, 28]);
      appendSheet("Top Offender", offenderRanking.map((item, index) => ({
        Posicion: index + 1,
        Responsable: item.responsible,
        Transportista: item.carrier,
        "Porcentaje RTI": item.percentage / 100,
      })), [10, 36, 28, 18]);
      appendSheet("Referencias", complianceByReference.map((item) => ({
        Envase: item.name,
        Salida: item.outbound,
        Retorno: item.returned,
        "Pendiente envases": Math.max(item.outbound - item.returned, 0),
        "Diferencia cajas": item.difference,
        "Porcentaje RTI": item.percentage / 100,
      })), [42, 16, 16, 20, 18, 18]);
      appendSheet("Responsables", responsibleRanking.map((item) => ({
        Responsable: item.name,
        Salida: item.outbound,
        Retorno: item.returned,
        "Diferencia cajas": item.difference,
        "Porcentaje RTI": item.percentage / 100,
      })), [38, 16, 16, 18, 18]);
      appendSheet("Transportistas", localCarrierMetrics.map((item) => ({
        Transportista: item.name,
        Salida: item.outbound,
        Retorno: item.returned,
        "Diferencia cajas": item.difference,
        "Porcentaje RTI": item.percentage / 100,
      })), [34, 16, 16, 18, 18]);
      appendSheet("RTI diario", dailyRtiMetrics.map((item) => ({
        Fecha: item.date,
        Dia: item.day,
        Mes: item.month,
        "Porcentaje RTI": item.percentage / 100,
      })), [16, 10, 10, 18]);
      appendSheet("Detalle DT", filteredRecords.map((record) => ({
        Fecha: recordDateKey(record),
        DT: record.dt || "Sin DT",
        Responsable: record.responsible,
        Transportista: record.carrier,
        Envase: record.reference,
        Salida: record.outbound || 0,
        Retorno: record.returned || 0,
        "Diferencia envases": (record.outbound || 0) - (record.returned || 0),
        "Diferencia cajas": quantityDifference(record.outbound || 0, record.returned || 0),
        "Porcentaje RTI": record.outbound ? (record.returned || 0) / record.outbound : 0,
      })), [16, 20, 36, 28, 42, 14, 14, 20, 18, 18]);

      for (const sheet of workbook.SheetNames.map((name) => workbook.Sheets[name])) {
        const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
        for (let column = range.s.c; column <= range.e.c; column += 1) {
          const header = String(sheet[XLSX.utils.encode_cell({ r: 0, c: column })]?.v || "");
          if (!header.includes("Porcentaje")) continue;
          for (let row = 1; row <= range.e.r; row += 1) {
            const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
            if (cell?.t === "n") cell.z = "0.0%";
          }
        }
        sheet["!autofilter"] = { ref: sheet["!ref"] || "A1:A1" };
      }
      const suffix = [dateFrom, dateTo].filter(Boolean).join("-a-") || new Date().toISOString().slice(0, 10);
      const filename = `reporte-rti-${suffix}.xlsx`;
      XLSX.writeFile(workbook, filename, { compression: true });
      setUploadMessage(`Excel generado: ${filename} (${filteredRecords.length} registros filtrados).`);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "No se pudo exportar el Excel.");
    } finally {
      setExporting(false);
    }
  }

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
            <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 shadow-sm">
              <span className="hidden text-[8px] font-black uppercase tracking-wide text-slate-500 md:inline">Destino</span>
              <select
                aria-label="Tabla RACOCIMI de destino"
                className="bg-transparent text-xs font-black text-slate-800 outline-none"
                disabled={uploading}
                onChange={(event) => setUploadTarget(event.target.value as "RACOCIMI1" | "RACOCIMI2")}
                value={uploadTarget}
              >
                <option value="RACOCIMI1">RACOCIMI1 · Salida</option>
                <option value="RACOCIMI2">RACOCIMI2 · Retorno</option>
              </select>
            </label>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"
              disabled={exporting || databaseState !== "connected" || !filteredRecords.length}
              onClick={() => void exportDashboardExcel()}
              type="button"
            >
              {exporting ? <LoaderCircle className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}
              {exporting ? "Generando..." : "Exportar Excel"}
            </button>
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
            uploadMessage.startsWith("Carga lista") ? "text-emerald-700" : "text-red-600"
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

        <section className="h-[500px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_-24px_rgba(15,23,42,.35)]">
          <PanelHeader>Porcentaje de RTI</PanelHeader>
          <div className="grid h-[438px] place-items-center bg-[radial-gradient(circle_at_50%_15%,#f0fdfa_0%,#ffffff_55%)] px-5 pb-5 pt-3">
            <div className="w-full max-w-[300px]">
              <svg aria-label={`Porcentaje de RTI ${rtiPercentage}%`} className="w-full" role="img" viewBox="0 0 300 205">
                <title>Porcentaje de RTI</title>
                <desc>Medidor semicircular con un resultado de {rtiPercentage} por ciento.</desc>
                <defs>
                  <linearGradient id="rtiGauge" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor="#dc2626" />
                    <stop offset="50%" stopColor="#facc15" />
                    <stop offset="100%" stopColor="#16a34a" />
                  </linearGradient>
                  <filter height="180%" id="gaugeGlow" width="180%" x="-40%" y="-40%">
                    <feGaussianBlur result="blur" stdDeviation="3" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                <path d="M 32 150 A 118 118 0 0 1 268 150" fill="none" pathLength="100" stroke="#e2e8f0" strokeLinecap="round" strokeWidth="34" />
                <path d="M 32 150 A 118 118 0 0 1 268 150" fill="none" filter="url(#gaugeGlow)" pathLength="100" stroke="url(#rtiGauge)" strokeDasharray={`${gaugePercentage} 100`} strokeLinecap="round" strokeWidth="34" />
                <line filter="url(#gaugeGlow)" stroke="#0f172a" strokeLinecap="round" strokeWidth="7" x1="150" x2={needleX} y1="150" y2={needleY} />
                <circle cx="150" cy="150" fill="#ffffff" filter="url(#gaugeGlow)" r="17" stroke="#0f172a" strokeWidth="6" />
                <text fill="#64748b" fontSize="15" fontWeight="600" x="16" y="184">0 %</text>
                <text fill="#64748b" fontSize="15" fontWeight="600" textAnchor="end" x="284" y="184">100 %</text>
                <text fill="#0f172a" fontSize="38" fontWeight="700" textAnchor="middle" x="150" y="202">{rtiPercentage} %</text>
              </svg>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center">
                  <p className="text-[9px] font-extrabold uppercase tracking-[.12em] text-amber-700">Envases de salida</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{formatChartNumber(outboundTotal)}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center">
                  <p className="text-[9px] font-extrabold uppercase tracking-[.12em] text-emerald-700">Envases retornados</p>
                  <p className="mt-1 text-xl font-black text-slate-900">{formatChartNumber(returnedTotal)}</p>
                </div>
              </div>
              {!filteredRecords.length ? <p className="mt-3 text-center text-sm font-medium text-slate-500">Sin datos para los filtros seleccionados.</p> : null}
            </div>
          </div>
        </section>

        <section className="h-[500px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_-24px_rgba(15,23,42,.35)]">
          <PanelHeader>Top Offender</PanelHeader>
          <div className="h-[438px] overflow-auto p-4">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="sticky top-0 z-20">
                <tr className="bg-slate-950 text-white">
                  <th className="px-4 py-3 text-left font-semibold">Nombre RR</th>
                  <th className="px-4 py-3 text-right font-semibold">Porcentaje RTI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {offendersByCarrier.map(([contractor, contractorOffenders]) => (
                  <Fragment key={contractor}>
                    <tr className="border-y border-slate-200 bg-slate-100">
                      <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-[.12em] text-slate-600" colSpan={2} scope="rowgroup">
                        Contratista: {contractor}
                      </th>
                    </tr>
                    {contractorOffenders.map((record) => (
                      <tr
                        aria-label={`Ver detalle de envases de ${record.responsible}, contratista ${record.carrier}`}
                        className="cursor-pointer transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"
                        key={`${record.carrier}-${record.responsible}`}
                        onClick={() => setSelectedOffender({ responsible: record.responsible, carrier: record.carrier })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedOffender({ responsible: record.responsible, carrier: record.carrier });
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <td className="px-4 py-3 font-bold uppercase text-slate-800"><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-[10px] text-slate-500">{record.rank}</span>{record.responsible}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="relative ml-auto h-9 max-w-52 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200">
                            <div className={`absolute inset-y-0 left-0 rounded-full ${performanceColor(record.percentage)}`} style={{ width: `${Math.min(record.percentage, 100)}%` }} />
                            <span className="relative z-10 flex h-full items-center justify-end px-3 font-black text-slate-950">{record.percentage} %</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {!offenderRanking.length ? (
                  <tr>
                    <td className="px-4 py-12 text-center font-medium text-slate-500" colSpan={2}>Sin resultados</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {hiddenOffenderCount > 0 ? (
              <button
                className="mx-auto mt-4 flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white transition hover:bg-slate-800"
                onClick={() => setShowAllOffenders((current) => !current)}
                type="button"
              >
                {showAllOffenders ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {showAllOffenders ? "Ver menos" : `Ver más (${hiddenOffenderCount})`}
              </button>
            ) : null}
          </div>
        </section>

        <DailyReferenceMatrix days={referenceDailyDays} rows={referenceDailyRows} />

        <section className="grid gap-3 sm:grid-cols-2 lg:col-span-full xl:grid-cols-4">
          <InsightMetric icon={<Trophy size={18} />} label="Mejor referencia" tone="emerald" value={bestReference?.name || "Sin datos"} detail={bestReference ? `${bestReference.percentage} % RTI` : "—"} />
          <InsightMetric icon={<TrendingDown size={18} />} label="Referencia por mejorar" tone="red" value={lowestReference?.name || "Sin datos"} detail={lowestReference ? `${lowestReference.percentage} % RTI` : "—"} />
          <InsightMetric icon={<PackageOpen size={18} />} label="Mayor diferencia" tone="amber" value={largestDifference?.reference || "Sin datos"} detail={largestDifference ? `${formatChartNumber(largestDifference.value)} cajas` : "—"} />
          <InsightMetric icon={<Truck size={18} />} label="Mejor transportista" tone="blue" value={bestCarrier?.name || "Sin datos"} detail={bestCarrier ? `${bestCarrier.percentage} % RTI` : "—"} />
        </section>

        <section className="grid w-full items-stretch gap-4 rounded-3xl border border-slate-200/80 bg-slate-200/50 p-3 lg:col-span-full lg:grid-cols-2">
          <article className="h-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>Porcentaje de cumplimiento RTI por referencia</PanelHeader>
            <div className="h-[322px] space-y-2 overflow-auto p-4">
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

          <article className="h-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>Cantidad de cajas de diferencia por referencia</PanelHeader>
            <div className="h-[322px] overflow-auto p-4">
              <p className="mb-3 text-[10px] font-semibold text-slate-500">Diferencia = (salida − retorno) ÷ 30 envases por caja · ordenada por impacto absoluto</p>
              <div className="space-y-3">
                {displayedBoxDifferences.map((item) => {
                  const width = item.value === 0 ? 0 : Math.max((Math.abs(item.value) / displayedBoxDifferenceMax) * 100, 2);
                  return (
                    <div className="grid grid-cols-[minmax(130px,1fr)_2fr_80px] items-center gap-3" key={item.reference}>
                      <span className="truncate text-[10px] font-bold text-slate-700" title={item.reference}>{item.reference}</span>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200">
                        <div className={`h-full ${item.value > 0 ? "bg-red-500" : item.value < 0 ? "bg-blue-500" : "bg-emerald-400"}`} style={{ width: `${width}%` }} />
                      </div>
                      <span className={`text-right text-xs font-black ${item.value > 0 ? "text-red-600" : item.value < 0 ? "text-blue-600" : "text-emerald-600"}`}>{formatChartNumber(item.value)}</span>
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
          <div className="max-h-[360px] overflow-auto p-2">
            <table className="w-full text-xs" style={{ minWidth: `${Math.max(520, 330 + responsibleDailyDays.length * 68)}px` }}>
              <thead className="sticky top-0 z-20">
                <tr className="bg-slate-950 text-white">
                  <th className="sticky left-0 z-30 min-w-64 bg-slate-950 px-4 py-2 text-left font-semibold">Nombre RR</th>
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

        <section className="grid w-full items-stretch gap-4 rounded-3xl border border-slate-200/80 bg-slate-200/50 p-3 lg:col-span-full lg:grid-cols-2">
          <article className="h-[390px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>Diferencia de envase salida vs retorno</PanelHeader>
            <div className="h-[352px] overflow-auto p-4">
              <div className="mb-4 flex justify-center gap-4 text-[10px] font-semibold text-slate-600">
                <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />Envase salida</span>
                <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Envase retorno</span>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {displayedPackageMovement.map((item) => {
                  const balance = item.outbound - item.returned;
                  return (
                  <div className="grid min-h-16 grid-cols-[minmax(110px,.9fr)_1.4fr] items-center gap-3 rounded-xl border border-cyan-900/10 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_65%,#ecfeff_100%)] p-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-[0_10px_24px_-14px_rgba(6,182,212,.7)]" key={item.reference}>
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-bold text-slate-700" title={item.reference}>{item.reference}</p>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[8px] font-black ${balance > 0 ? "bg-red-50 text-red-700" : balance < 0 ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {balance > 0 ? `Pendiente ${formatChartNumber(balance)}` : balance < 0 ? `Excedente ${formatChartNumber(Math.abs(balance))}` : "Completo"}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[1fr_70px] items-center gap-2">
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-400" style={{ width: `${(item.outbound / packageMovementMax) * 100}%` }} /></div>
                        <span className="text-right text-[9px] font-black text-amber-700">{formatChartNumber(item.outbound)}</span>
                      </div>
                      <div className="grid grid-cols-[1fr_70px] items-center gap-2">
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${(item.returned / packageMovementMax) * 100}%` }} /></div>
                        <span className="text-right text-[9px] font-black text-emerald-700">{formatChartNumber(item.returned)}</span>
                      </div>
                    </div>
                  </div>
                  );
                })}
                {!displayedPackageMovement.length ? <div className="grid min-h-[180px] place-items-center text-sm font-medium text-slate-500">Sin resultados</div> : null}
              </div>
            </div>
          </article>

          <article className="h-[390px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>Porcentaje RTI por transportista</PanelHeader>
            <div className="grid h-[352px] auto-rows-fr gap-3 overflow-auto p-4 sm:grid-cols-2">
              {displayedCarrierMetrics.map((item, index) => (
                <article className="relative flex min-h-32 flex-col justify-between overflow-hidden rounded-2xl border border-cyan-900/10 bg-[radial-gradient(circle_at_100%_0%,rgba(34,211,238,.18),transparent_42%),linear-gradient(135deg,#ffffff,#f8fafc)] p-4 shadow-sm transition duration-200 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-cyan-400 before:to-transparent hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(8,145,178,.8)]" key={item.name}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-[10px] font-black text-white">{index + 1}</span>
                    <span className={`rounded-full px-2.5 py-1 text-sm font-black ${item.percentage >= 95 ? "bg-emerald-100 text-emerald-700" : item.percentage >= 85 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{item.percentage} %</span>
                  </div>
                  <p className="mt-3 truncate text-xs font-black uppercase text-slate-800" title={item.name}>{item.name}</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full rounded-full ${performanceColor(item.percentage)}`} style={{ width: `${Math.min(Math.max(item.percentage, 0), 100)}%` }} />
                  </div>
                </article>
              ))}
              {!displayedCarrierMetrics.length ? <div className="grid min-h-[180px] place-items-center text-sm font-medium text-slate-500">Sin resultados</div> : null}
            </div>
          </article>

          <article className="h-[390px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>SKU retorno</PanelHeader>
            <div className="h-[352px] space-y-3 overflow-auto p-4">
              <p className="text-[10px] font-semibold text-slate-500">Retornos por nombre de envase del catálogo SKU</p>
              <div className="grid gap-3 xl:grid-cols-2">
                {displayedSkuReturns.map((item, index) => (
                  <div className="grid grid-cols-[24px_minmax(100px,1fr)_1.5fr_68px] items-center gap-2.5 rounded-xl border border-violet-100 bg-[linear-gradient(120deg,#ffffff,#faf5ff)] p-2.5 transition hover:border-violet-300 hover:shadow-[0_8px_20px_-16px_rgba(124,58,237,.8)]" key={item.referenceName}>
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-white text-[8px] font-black text-slate-500 ring-1 ring-slate-200">{index + 1}</span>
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

          <article className="h-[390px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>Diferencia en cajas</PanelHeader>
              <div className="h-[352px] overflow-auto p-3">
              <p className="mb-2 text-[10px] font-semibold text-slate-500">Diferencia = (salida − retorno) ÷ 30. Un valor positivo representa cajas pendientes.</p>
              <table className="w-full min-w-[500px] text-[10px]">
                <thead className="sticky top-0 z-10">
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
                      <td className={`px-2 py-1.5 text-center font-bold ${item.value > 0 ? "bg-red-500 text-white" : item.value === 0 ? "bg-emerald-100 text-emerald-800" : "bg-blue-500 text-white"}`}>{item.value}</td>
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
            <DailyTrendChart data={dailyRtiMetrics} />
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-200/70">
            <PanelHeader compact>RTI diario por ruta</PanelHeader>
            <div className="max-h-[360px] overflow-auto p-3">
              <table className="w-full min-w-[390px] text-[11px]">
                <thead className="sticky top-0 z-10">
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
      {selectedOffender ? (
        <div
          aria-labelledby="offender-detail-title"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSelectedOffender(null);
          }}
          role="dialog"
        >
          <section className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <header className="flex items-start gap-4 bg-slate-950 px-5 py-4 text-white sm:px-6">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-amber-400">Detalle Top Offender</p>
                <h2 className="mt-1 truncate text-lg font-black uppercase sm:text-xl" id="offender-detail-title">{selectedOffender.responsible}</h2>
                <p className="mt-1 text-xs text-slate-300">Contratista: {selectedOffender.carrier} · Envases calculados con los filtros actuales.</p>
              </div>
              <button aria-label="Cerrar detalle" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 transition hover:bg-white/20" onClick={() => setSelectedOffender(null)} type="button">
                <X size={19} />
              </button>
            </header>

            <div className="overflow-y-auto p-5 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">Envase más despachado</p>
                  <p className="mt-2 font-black uppercase text-slate-900">{mostDispatchedReference?.name || "Sin datos"}</p>
                  <p className="mt-1 text-2xl font-black text-amber-700">{formatChartNumber(mostDispatchedReference?.outbound || 0)}</p>
                  <p className="text-xs font-semibold text-slate-500">envases de salida <span className="mx-1 text-slate-300">|</span> <strong className="text-amber-700">{formatBoxes(mostDispatchedReference?.outbound || 0)} cajas</strong></p>
                </article>
                <article className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-red-700">Mayor cantidad sin retornar</p>
                  <p className="mt-2 font-black uppercase text-slate-900">{mostPendingReference?.name || "Sin datos"}</p>
                  <p className="mt-1 text-2xl font-black text-red-700">{formatChartNumber(Math.max((mostPendingReference?.outbound || 0) - (mostPendingReference?.returned || 0), 0))}</p>
                  <p className="text-xs font-semibold text-slate-500">envases pendientes <span className="mx-1 text-slate-300">|</span> <strong className="text-red-700">{formatBoxes(Math.max((mostPendingReference?.outbound || 0) - (mostPendingReference?.returned || 0), 0))} cajas</strong></p>
                </article>
              </div>

              <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-slate-100 text-[10px] font-black uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left">Envase</th>
                      <th className="px-3 py-3 text-right">Salida</th>
                      <th className="px-3 py-3 text-right">Cajas</th>
                      <th className="px-3 py-3 text-right">Retorno</th>
                      <th className="px-3 py-3 text-right">Cajas</th>
                      <th className="px-3 py-3 text-right">Pendiente</th>
                      <th className="px-3 py-3 text-right">Cajas</th>
                      <th className="px-4 py-3 text-right">RTI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedOffenderReferences.map((item) => {
                      const pending = Math.max(item.outbound - item.returned, 0);
                      return (
                        <tr className="hover:bg-slate-50" key={item.name}>
                          <td className="px-4 py-3 font-bold uppercase text-slate-800">{item.name}</td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-700">{formatChartNumber(item.outbound)}</td>
                          <td className="px-3 py-3 text-right font-black text-amber-700">{formatBoxes(item.outbound)}</td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-700">{formatChartNumber(item.returned)}</td>
                          <td className="px-3 py-3 text-right font-black text-emerald-700">{formatBoxes(item.returned)}</td>
                          <td className={`px-3 py-3 text-right font-black ${pending > 0 ? "text-red-600" : "text-emerald-600"}`}>{formatChartNumber(pending)}</td>
                          <td className={`px-3 py-3 text-right font-black ${pending > 0 ? "text-red-600" : "text-emerald-600"}`}>{formatBoxes(pending)}</td>
                          <td className="px-4 py-3 text-right font-black text-slate-900">{item.outbound ? `${item.percentage} %` : "N/A"}</td>
                        </tr>
                      );
                    })}
                    {!selectedOffenderReferences.length ? <tr><td className="px-4 py-10 text-center text-slate-500" colSpan={8}>Sin datos de envases para este responsable.</td></tr> : null}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-slate-500">Pendiente = salida − retorno. Si el retorno supera la salida, se muestra 0 pendiente.</p>

              <div className="mt-6 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[.15em] text-red-600">Trazabilidad de diferencias</p>
                  <h3 className="mt-1 text-base font-black uppercase text-slate-900">DT con inconsistencias por envase</h3>
                </div>
                <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">{selectedOffenderDtIssues.length} casos</span>
              </div>
              <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full min-w-[1050px] text-sm">
                  <thead className="bg-slate-950 text-[10px] font-black uppercase tracking-wide text-white">
                    <tr>
                      <th className="px-4 py-3 text-left">DT</th>
                      <th className="px-4 py-3 text-left">Envase</th>
                      <th className="px-3 py-3 text-right">Salida</th>
                      <th className="px-3 py-3 text-right">Cajas</th>
                      <th className="px-3 py-3 text-right">Retorno</th>
                      <th className="px-3 py-3 text-right">Cajas</th>
                      <th className="px-3 py-3 text-right">Diferencia</th>
                      <th className="px-3 py-3 text-right">Cajas</th>
                      <th className="px-4 py-3 text-right">RTI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedOffenderDtIssues.map((item) => (
                      <tr className="hover:bg-slate-50" key={`${item.dt}-${item.reference}`}>
                        <td className="px-4 py-3 font-black text-slate-900">{item.dt}</td>
                        <td className="px-4 py-3 font-bold uppercase text-slate-700">{item.reference}</td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-700">{formatChartNumber(item.outbound)}</td>
                        <td className="px-3 py-3 text-right font-black text-amber-400">{formatBoxes(item.outbound)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-700">{formatChartNumber(item.returned)}</td>
                        <td className="px-3 py-3 text-right font-black text-emerald-400">{formatBoxes(item.returned)}</td>
                        <td className={`px-3 py-3 text-right font-black ${item.difference < 0 ? "text-red-600" : "text-blue-600"}`}>{item.difference > 0 ? "+" : item.difference < 0 ? "−" : ""}{formatChartNumber(Math.abs(item.difference))}</td>
                        <td className={`px-3 py-3 text-right font-black ${item.difference < 0 ? "text-red-600" : "text-blue-600"}`}>{item.difference > 0 ? "+" : item.difference < 0 ? "−" : ""}{formatBoxes(item.difference)}</td>
                        <td className="px-4 py-3 text-right font-black text-slate-900">{item.percentage === null ? "N/A" : `${item.percentage} %`}</td>
                      </tr>
                    ))}
                    {!selectedOffenderDtIssues.length ? (
                      <tr><td className="px-4 py-10 text-center font-medium text-slate-500" colSpan={9}>No se encontraron diferencias entre salida y retorno por DT.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-slate-500">Diferencia = retorno − salida. Un valor negativo indica envases pendientes y uno positivo indica retornos adicionales.</p>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
