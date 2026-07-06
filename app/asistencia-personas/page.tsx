"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, FileSpreadsheet, MessageSquareText, Search, Upload, Users, X } from "lucide-react";

type PersonHistory = {
  type: string;
  date: string;
  title: string;
  detail: string;
};

type PersonSummary = {
  cc: string;
  nombre: string;
  cargo: string;
  contratista: string;
  stats: {
    rutas: number;
    modulaciones: number;
    reubicaciones: number;
    tiempoPromedioRuta: string;
    ultimoDt: string;
  };
  history: PersonHistory[];
};

type PeopleGroup = {
  name: string;
  people: PersonSummary[];
};

type AttendanceStatus = "bien" | "regular" | "mal" | "fuera" | "sin-marca";

type AttendanceRow = {
  apellidos: string;
  nombres: string;
  identificador: string;
  grupo: string;
  fecha: string;
  fechaKey: string;
  permiso: string;
  turno: string;
  entrada: string;
  atraso: string;
  salida: string;
  cargo: string;
  nombreCompleto: string;
  contratista: string;
  estadoLlegada: AttendanceStatus;
};

type AttendancePersonRow = AttendanceRow & {
  entradas: string[];
  timbres: number;
};

type AttendanceSummary = {
  contractor: string;
  total: number;
  bien: number;
  regular: number;
  mal: number;
  fuera: number;
  sinMarca: number;
};

type TopOffender = {
  key: string;
  nombre: string;
  identificador: string;
  contratista: string;
  rangoHora: string;
  llegadasTarde: number;
  ultimaFecha: string;
  ultimaEntrada: string;
};

type StoredAttendance = {
  fileName: string;
  savedAt: string;
  rows: AttendanceRow[];
};

type AttendanceTableView = "detalle" | "top" | "comentarios" | "resumen";

const STORAGE_KEY = "bavaria.people.attendance.excel.v1";
const COMMENTS_STORAGE_KEY = "bavaria.people.attendance.late-comments.v1";

export default function AsistenciaPersonasPage() {
  const router = useRouter();
  const [peopleGroups, setPeopleGroups] = useState<PeopleGroup[]>([]);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [topOffenderDate, setTopOffenderDate] = useState("");
  const [selectedContractor, setSelectedContractor] = useState("Todos");
  const [query, setQuery] = useState("");
  const [activeTable, setActiveTable] = useState<AttendanceTableView>("detalle");
  const [lateComments, setLateComments] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isAllowed, setIsAllowed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = readStoredAttendance();
    if (stored) {
      setRows(stored.rows);
      setFileName(stored.fileName);
      setSavedAt(stored.savedAt);
    }
    setLateComments(readStoredComments());

    fetch("/api/session/session", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        const allowed = Boolean(body?.session?.isAdmin);
        setIsAllowed(allowed);
        if (!allowed) throw new Error("Este modulo esta disponible solo para administrador.");
        return fetch("/api/people/summary", { cache: "no-store" });
      })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudo cargar People.");
        setPeopleGroups(body.contractors || []);
      })
      .catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : "No se pudo cargar el modulo."))
      .finally(() => setIsLoading(false));
  }, []);

  const peopleById = useMemo(() => buildPeopleById(peopleGroups.flatMap((group) => group.people)), [peopleGroups]);
  const contractorOptions = useMemo(() => {
    const values = new Set<string>();
    peopleGroups.forEach((group) => values.add(group.name));
    rows.forEach((row) => values.add(row.contratista || "Sin contratista"));
    return Array.from(values).filter(Boolean).sort();
  }, [peopleGroups, rows]);

  const filteredRows = useMemo(() => {
    const needle = normalizeText(query);
    return rows.filter((row) => {
      const matchesDate = !selectedDate || row.fechaKey === selectedDate;
      const matchesContractor = selectedContractor === "Todos" || row.contratista === selectedContractor;
      const matchesQuery =
        !needle ||
        normalizeText(`${row.nombreCompleto} ${row.identificador} ${row.cargo} ${row.grupo} ${row.turno}`).includes(needle);
      return matchesDate && matchesContractor && matchesQuery;
    });
  }, [query, rows, selectedContractor, selectedDate]);
  const groupedRows = useMemo(() => buildPersonAttendanceRows(filteredRows), [filteredRows]);
  const summary = useMemo(() => buildAttendanceSummary(groupedRows), [groupedRows]);
  const totals = useMemo(() => buildAttendanceTotals(summary), [summary]);
  const topOffenders = useMemo(() => {
    const needle = normalizeText(query);
    return buildTopOffenders(rows.filter((row) => {
      const matchesDate = !topOffenderDate || row.fechaKey === topOffenderDate;
      const matchesContractor = selectedContractor === "Todos" || row.contratista === selectedContractor;
      const matchesQuery =
        !needle ||
        normalizeText(`${row.nombreCompleto} ${row.identificador} ${row.cargo} ${row.grupo} ${row.turno}`).includes(needle);
      return matchesDate && matchesContractor && matchesQuery;
    }));
  }, [query, rows, selectedContractor, topOffenderDate]);
  const lateRows = useMemo(() => buildPersonAttendanceRows(filteredRows.filter(isLateArrival)), [filteredRows]);
  const tableTabs = [
    { id: "detalle" as const, label: "Detalle", value: groupedRows.length },
    { id: "top" as const, label: "Top ofender", value: topOffenders.length },
    { id: "comentarios" as const, label: "Comentarios", value: lateRows.length },
    { id: "resumen" as const, label: "Resumen", value: summary.length },
  ];

  async function handleUpload(file: File | null) {
    if (!file) return;
    setIsUploading(true);
    setError("");

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("El archivo no tiene hojas para procesar.");

      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      const parsedRows = rawRows.map((row) => normalizeAttendanceRow(row, peopleById)).filter(Boolean) as AttendanceRow[];
      const nextSavedAt = new Date().toISOString();
      const payload = { fileName: file.name, rows: parsedRows, savedAt: nextSavedAt };

      setRows(parsedRows);
      setFileName(file.name);
      setSavedAt(nextSavedAt);
      persistAttendance(payload);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo leer el Excel de asistencia.");
    } finally {
      setIsUploading(false);
    }
  }

  function clearFilters() {
    setSelectedDate("");
    setSelectedContractor("Todos");
    setQuery("");
  }

  function updateLateComment(key: string, value: string) {
    const nextComments = { ...lateComments, [key]: value };
    setLateComments(nextComments);
    persistComments(nextComments);
  }

  if (isLoading) return <main className="min-h-screen bg-[#f4f7fb]" />;

  if (!isAllowed) {
    return (
      <main className="min-h-screen bg-[#f4f7fb] px-5 py-10 text-slate-900">
        <section className="mx-auto max-w-xl rounded-lg border border-red-100 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">Acceso restringido</p>
          <h1 className="mt-2 text-2xl font-semibold text-[#10223d]">Asistencia de personas</h1>
          <p className="mt-2 text-sm text-slate-600">{error || "Debes iniciar sesion como administrador."}</p>
          <button className="mt-5 rounded-md bg-[#10223d] px-4 py-2 text-sm font-semibold text-white" onClick={() => router.push("/")} type="button">
            Volver
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="tech-grid min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/86 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-[#10223d] shadow-sm transition hover:bg-slate-50"
            onClick={() => router.push("/")}
            type="button"
          >
            <ArrowLeft size={17} />
            Portal
          </button>
          <span className="rounded-md bg-[#10223d] px-3 py-2 text-sm font-semibold text-white shadow-sm">Asistencia personas</span>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        <section className="mb-4 rounded-lg border border-slate-200 bg-white/94 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <FileSpreadsheet size={20} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Control de llegada</p>
                <h1 className="mt-1 text-2xl font-semibold text-[#10223d]">Asistencia de personas</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Ultimo cargue: {fileName ? `${fileName}${savedAt ? ` - ${formatDateTime(savedAt)}` : ""}` : "sin archivo cargado"}
                </p>
              </div>
            </div>

            <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-[#0f7c58] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0b684a]">
              <Upload size={16} />
              {isUploading ? "Procesando..." : "Subir Excel"}
              <input
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                disabled={isUploading}
                onChange={(event) => handleUpload(event.target.files?.[0] || null)}
                type="file"
              />
            </label>
          </div>
        </section>

        {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}

        <div className="mb-4 grid gap-2 rounded-lg border border-slate-200 bg-white/94 p-3 shadow-sm lg:grid-cols-[180px_220px_1fr_auto] lg:items-end">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            <span className="mb-1 flex items-center gap-1.5">
              <CalendarDays size={15} />
              Fecha
            </span>
            <input
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
              onChange={(event) => setSelectedDate(event.target.value)}
              type="date"
              value={selectedDate}
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            <span className="mb-1 flex items-center gap-1.5">
              <Users size={15} />
              Contratista
            </span>
            <select
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
              onChange={(event) => setSelectedContractor(event.target.value)}
              value={selectedContractor}
            >
              <option value="Todos">Todos</option>
              {contractorOptions.map((contractor) => (
                <option key={contractor} value={contractor}>
                  {contractor}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            <span className="mb-1 flex items-center gap-1.5">
              <Search size={15} />
              Buscar
            </span>
            <input
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre, cedula, cargo, grupo o turno"
              type="search"
              value={query}
            />
          </label>
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!selectedDate && selectedContractor === "Todos" && !query}
            onClick={clearFilters}
            type="button"
          >
            <X size={15} />
            Limpiar
          </button>
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <MiniMetric label="Personas" tone="blue" value={groupedRows.length} />
          <MiniMetric label="Bien" tone="green" value={totals.bien} />
          <MiniMetric label="Regular" tone="amber" value={totals.regular} />
          <MiniMetric label="Mal" tone="red" value={totals.mal} />
          <MiniMetric label="Fuera" tone="slate" value={totals.fuera} />
          <MiniMetric label="Sin marca" tone="cyan" value={totals.sinMarca} />
        </div>

        <div className="mb-3 grid gap-1.5 rounded-md border border-slate-200 bg-white p-1 shadow-sm sm:grid-cols-4">
          {tableTabs.map((tab) => (
            <button
              className={`flex h-9 items-center justify-between rounded px-2.5 text-left text-xs font-semibold transition ${
                activeTable === tab.id ? "bg-[#10223d] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
              }`}
              key={tab.id}
              onClick={() => setActiveTable(tab.id)}
              type="button"
            >
              <span>{tab.label}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${activeTable === tab.id ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>
                {tab.value.toLocaleString("es-CO")}
              </span>
            </button>
          ))}
        </div>

        {activeTable === "top" ? (
        <section className="mb-3 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Top ofender</p>
              <h2 className="text-xs font-semibold text-[#10223d]">Llegadas tarde por persona</h2>
            </div>
            <label className="w-full text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 sm:w-[170px]">
              <span className="mb-0.5 flex items-center gap-1">
                <CalendarDays size={13} />
                Filtrar dia
              </span>
              <input
                className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
                onChange={(event) => setTopOffenderDate(event.target.value)}
                type="date"
                value={topOffenderDate}
              />
            </label>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[760px] text-[11px]">
              <thead className="bg-white text-[9px] uppercase tracking-[0.07em] text-slate-500">
                <tr>
                  <th className="px-2.5 py-1.5 text-left">Nombre</th>
                  <th className="px-2 py-1.5 text-left">Identificador</th>
                  <th className="px-2 py-1.5 text-left">Contratista</th>
                  <th className="px-2 py-1.5 text-left">Rango</th>
                  <th className="px-2 py-1.5 text-right">Veces</th>
                  <th className="px-2.5 py-1.5 text-left">Ultima</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topOffenders.map((item) => (
                  <tr className="hover:bg-red-50/40" key={item.key}>
                    <td className="max-w-[260px] truncate px-2.5 py-1 font-semibold text-[#10223d]" title={item.nombre}>{item.nombre}</td>
                    <td className="whitespace-nowrap px-2 py-1">{item.identificador || "-"}</td>
                    <td className="whitespace-nowrap px-2 py-1 font-semibold text-slate-700">{item.contratista}</td>
                    <td className="px-2 py-1">
                      <span className="inline-flex rounded border border-red-100 bg-red-50 px-1.5 py-0.5 text-[9px] font-semibold text-red-700">{item.rangoHora}</span>
                    </td>
                    <td className="px-2 py-1 text-right text-xs font-semibold text-red-700">{item.llegadasTarde}</td>
                    <td className="whitespace-nowrap px-2.5 py-1">{[item.ultimaFecha, item.ultimaEntrada].filter(Boolean).join(" - ") || "-"}</td>
                  </tr>
                ))}
                {!topOffenders.length ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-xs text-slate-500" colSpan={6}>
                      No hay llegadas tarde entre 6:31 y 7:00 para este filtro.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
        ) : null}

        {activeTable === "comentarios" ? (
        <section className="mb-3 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Comentarios</p>
              <h2 className="text-xs font-semibold text-[#10223d]">Seguimiento a personas tarde ({lateRows.length})</h2>
            </div>
            <MessageSquareText className="text-slate-400" size={16} />
          </div>
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full min-w-[860px] text-[11px]">
              <thead className="sticky top-0 z-10 bg-white text-[9px] uppercase tracking-[0.07em] text-slate-500">
                <tr>
                  <th className="px-2.5 py-1.5 text-left">Nombre</th>
                  <th className="px-2 py-1.5 text-left">Fecha</th>
                  <th className="px-2 py-1.5 text-center">Timbres</th>
                  <th className="px-2 py-1.5 text-center">Entro</th>
                  <th className="px-2 py-1.5 text-left">Rango</th>
                  <th className="px-2.5 py-1.5 text-left">Comentario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lateRows.map((row) => {
                  const key = lateCommentKey(row);
                  return (
                    <tr className="align-middle hover:bg-amber-50/40" key={key}>
                      <td className="px-2.5 py-1">
                        <p className="max-w-[260px] truncate font-semibold text-[#10223d]" title={row.nombreCompleto}>{row.nombreCompleto || "-"}</p>
                        <p className="text-[9px] leading-3 text-slate-500">CC {row.identificador || "-"} - {row.contratista}</p>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1">{row.fecha || "-"}</td>
                      <td className="px-2 py-1 text-center font-semibold text-[#10223d]">{row.timbres}</td>
                      <td className="max-w-[220px] whitespace-normal px-2 py-1 text-center font-semibold leading-4 text-red-700" title={row.entradas.join(", ")}>{formatEntries(row.entradas)}</td>
                      <td className="whitespace-nowrap px-2 py-1">{arrivalRangeLabel(row.entrada)}</td>
                      <td className="px-2.5 py-1">
                        <textarea
                          className="h-8 min-h-8 w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] leading-4 text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
                          onChange={(event) => updateLateComment(key, event.target.value)}
                          placeholder="Novedad o compromiso"
                          value={lateComments[key] || ""}
                        />
                      </td>
                    </tr>
                  );
                })}
                {!lateRows.length ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-xs text-slate-500" colSpan={6}>
                      No hay personas tarde con los filtros actuales.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
        ) : null}

        {activeTable === "resumen" ? (
        <section className="mb-3 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Resumen</p>
              <h2 className="text-xs font-semibold text-[#10223d]">Rangos por contratista</h2>
            </div>
            <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{summary.length} contratistas</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[680px] text-[11px]">
              <thead className="bg-white text-[9px] uppercase tracking-[0.07em] text-slate-500">
                <tr>
                  <th className="px-2.5 py-1.5 text-left">Contratista</th>
                  <th className="px-2 py-1.5 text-right">Bien</th>
                  <th className="px-2 py-1.5 text-right">Regular</th>
                  <th className="px-2 py-1.5 text-right">Mal</th>
                  <th className="px-2 py-1.5 text-right">Fuera</th>
                  <th className="px-2 py-1.5 text-right">Sin marca</th>
                  <th className="px-2.5 py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.map((item) => (
                  <tr key={item.contractor}>
                    <td className="px-2.5 py-1 font-semibold text-[#10223d]">{item.contractor}</td>
                    <td className="px-2 py-1 text-right font-semibold text-emerald-700">{item.bien}</td>
                    <td className="px-2 py-1 text-right font-semibold text-amber-700">{item.regular}</td>
                    <td className="px-2 py-1 text-right font-semibold text-red-700">{item.mal}</td>
                    <td className="px-2 py-1 text-right font-semibold text-slate-500">{item.fuera}</td>
                    <td className="px-2 py-1 text-right font-semibold text-[#07556b]">{item.sinMarca}</td>
                    <td className="px-2.5 py-1 text-right font-semibold text-slate-900">{item.total}</td>
                  </tr>
                ))}
                {!summary.length ? (
                  <tr>
                    <td className="px-3 py-4 text-center text-xs text-slate-500" colSpan={7}>
                      Sube un Excel para ver el resumen.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
        ) : null}

        {activeTable === "detalle" ? (
        <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Detalle</p>
              <h2 className="text-xs font-semibold text-[#10223d]">Tabla compacta ({groupedRows.length})</h2>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                <span className="mb-0.5 flex items-center gap-1">
                  <CalendarDays size={12} />
                  Dia
                </span>
                <input
                  className="h-8 w-[150px] rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#0f7c58] focus:ring-2 focus:ring-[#0f7c58]/15"
                  onChange={(event) => setSelectedDate(event.target.value)}
                  type="date"
                  value={selectedDate}
                />
              </label>
              <button
                className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!selectedDate}
                onClick={() => setSelectedDate("")}
                type="button"
              >
                <X size={12} />
                Limpiar
              </button>
              <span className="h-8 rounded bg-white px-1.5 py-2 text-[10px] font-semibold leading-none text-slate-500 ring-1 ring-slate-200">
                Bien 5:45-6:00 | Regular 6:01-6:30 | Mal 6:31-7:00
              </span>
            </div>
          </div>
          <div className="max-h-[62vh] overflow-auto">
            <table className="w-full min-w-[1080px] text-[10px]">
              <thead className="sticky top-0 z-10 bg-[#10223d] text-[8px] uppercase tracking-[0.06em] text-white">
                <tr>
                  <th className="px-1.5 py-1 text-left">Cargo</th>
                  <th className="px-1.5 py-1 text-left">Nombre</th>
                  <th className="px-1.5 py-1 text-left">ID</th>
                  <th className="px-1.5 py-1 text-left">Contratista</th>
                  <th className="px-1.5 py-1 text-center">Timbres</th>
                  <th className="px-1.5 py-1 text-left">Grupo</th>
                  <th className="px-1.5 py-1 text-left">Fecha</th>
                  <th className="px-1.5 py-1 text-left">Permiso</th>
                  <th className="px-1.5 py-1 text-left">Turno</th>
                  <th className="px-1.5 py-1 text-left">Entro</th>
                  <th className="px-1.5 py-1 text-center">Atraso</th>
                  <th className="px-1.5 py-1 text-center">Salio</th>
                  <th className="px-1.5 py-1 text-left">Llegada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupedRows.map((row) => (
                  <tr className="hover:bg-cyan-50/40" key={attendancePersonKey(row)}>
                    <td className="whitespace-nowrap px-1.5 py-1 font-semibold text-slate-600">{row.cargo || "-"}</td>
                    <td className="max-w-[190px] truncate px-1.5 py-1 font-semibold text-[#10223d]" title={row.nombreCompleto}>{row.nombreCompleto || "-"}</td>
                    <td className="whitespace-nowrap px-1.5 py-1">{row.identificador || "-"}</td>
                    <td className="whitespace-nowrap px-1.5 py-1 font-semibold text-slate-700">{row.contratista}</td>
                    <td className="px-1.5 py-1 text-center font-semibold text-[#10223d]">{row.timbres}</td>
                    <td className="whitespace-nowrap px-1.5 py-1">{row.grupo || "-"}</td>
                    <td className="whitespace-nowrap px-1.5 py-1">{row.fecha || "-"}</td>
                    <td className="whitespace-nowrap px-1.5 py-1">{row.permiso || "-"}</td>
                    <td className="max-w-[180px] truncate px-1.5 py-1" title={row.turno}>{row.turno || "-"}</td>
                    <td className="max-w-[240px] whitespace-normal px-1.5 py-1 font-semibold leading-4" title={row.entradas.join(", ")}>{formatEntries(row.entradas)}</td>
                    <td className="px-1.5 py-1 text-center">{row.atraso || "-"}</td>
                    <td className="px-1.5 py-1 text-center">{row.salida || "-"}</td>
                    <td className="whitespace-nowrap px-1.5 py-1">
                      <StatusChip status={row.estadoLlegada} />
                    </td>
                  </tr>
                ))}
                {!filteredRows.length ? (
                  <tr>
                    <td className="px-3 py-5 text-center text-xs text-slate-500" colSpan={13}>
                      No hay marcaciones para mostrar.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
        ) : null}
      </section>
    </main>
  );
}

function MiniMetric({ label, tone, value }: { label: string; tone: "amber" | "blue" | "cyan" | "green" | "red" | "slate"; value: number }) {
  const styles = {
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    blue: "border-blue-100 bg-[#e9f3ff] text-[#10223d]",
    cyan: "border-cyan-100 bg-cyan-50 text-[#07556b]",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    red: "border-red-100 bg-red-50 text-red-700",
    slate: "border-slate-200 bg-slate-100 text-slate-600",
  };

  return (
    <div className={`rounded-lg border px-3 py-2 ${styles[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-none">{value.toLocaleString("es-CO")}</p>
    </div>
  );
}

function StatusChip({ status }: { status: AttendanceStatus }) {
  const labels: Record<AttendanceStatus, string> = {
    bien: "Bien",
    fuera: "Fuera",
    mal: "Mal",
    regular: "Regular",
    "sin-marca": "Sin marca",
  };
  const styles: Record<AttendanceStatus, string> = {
    bien: "border-emerald-100 bg-emerald-50 text-emerald-700",
    fuera: "border-slate-200 bg-slate-50 text-slate-600",
    mal: "border-red-100 bg-red-50 text-red-700",
    regular: "border-amber-100 bg-amber-50 text-amber-700",
    "sin-marca": "border-cyan-100 bg-cyan-50 text-[#07556b]",
  };

  return <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${styles[status]}`}>{labels[status]}</span>;
}

function buildPeopleById(people: PersonSummary[]) {
  const byId = new Map<string, PersonSummary>();
  people.forEach((person) => {
    const id = normalizeId(person.cc);
    if (id && !byId.has(id)) byId.set(id, person);
  });
  return byId;
}

function normalizeAttendanceRow(row: Record<string, unknown>, peopleById: Map<string, PersonSummary>): AttendanceRow | null {
  const identificador = normalizeId(readAttendanceValue(row, ["identificador", "cedula", "cc", "documento"]));
  const apellidos = readAttendanceValue(row, ["apellidos", "apellido"]);
  const nombres = readAttendanceValue(row, ["nombres", "nombre"]);
  const fecha = readAttendanceValue(row, ["fecha"]);
  const turno = readAttendanceValue(row, ["turno"]);
  const entrada = normalizeTimeValue(readAttendanceValue(row, ["entro", "entrada"], false));
  const salida = normalizeTimeValue(readAttendanceValue(row, ["salio", "salida"], true));
  const person = identificador ? peopleById.get(identificador) : undefined;
  const cargo = readAttendanceValue(row, ["cargo"]) || person?.cargo || "";
  const nombreCompleto = [apellidos, nombres].filter(Boolean).join(" ").trim() || person?.nombre || "";

  if (!identificador && !nombreCompleto && !fecha) return null;

  return {
    apellidos,
    atraso: readAttendanceValue(row, ["atraso"], true),
    cargo,
    contratista: person?.contratista || "Sin contratista",
    entrada,
    estadoLlegada: classifyArrival(entrada),
    fecha,
    fechaKey: normalizeAttendanceDate(fecha),
    grupo: readAttendanceValue(row, ["grupo"]),
    identificador,
    nombres,
    nombreCompleto,
    permiso: readAttendanceValue(row, ["permiso"]),
    salida,
    turno,
  };
}

function buildPersonAttendanceRows(rows: AttendanceRow[]): AttendancePersonRow[] {
  const groups = new Map<string, AttendancePersonRow>();

  rows.forEach((row) => {
    const key = attendancePersonKey(row);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        ...row,
        entradas: row.entrada ? [row.entrada] : [],
        timbres: 1,
      });
      return;
    }

    const nextEntries = row.entrada ? uniqueValues([...current.entradas, row.entrada]) : current.entradas;
    const latest = isNewerAttendanceRow(row, current.fecha || current.fechaKey, current.entrada) ? row : current;

    groups.set(key, {
      ...latest,
      entradas: nextEntries,
      estadoLlegada: worstArrivalStatus(current.estadoLlegada, row.estadoLlegada),
      timbres: current.timbres + 1,
    });
  });

  return Array.from(groups.values()).sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto) || a.identificador.localeCompare(b.identificador));
}

function attendancePersonKey(row: AttendanceRow) {
  return row.identificador || normalizeText(row.nombreCompleto) || `${normalizeText(row.apellidos)}-${normalizeText(row.nombres)}`;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function worstArrivalStatus(a: AttendanceStatus, b: AttendanceStatus): AttendanceStatus {
  const rank: Record<AttendanceStatus, number> = {
    mal: 5,
    regular: 4,
    bien: 3,
    "sin-marca": 2,
    fuera: 1,
  };
  return rank[b] > rank[a] ? b : a;
}

function formatEntries(entries: string[]) {
  if (!entries.length) return "-";
  return entries.join(", ");
}

function buildAttendanceSummary(rows: AttendanceRow[]): AttendanceSummary[] {
  const groups = new Map<string, AttendanceSummary>();

  rows.forEach((row) => {
    const contractor = row.contratista || "Sin contratista";
    const current = groups.get(contractor) || { bien: 0, contractor, fuera: 0, mal: 0, regular: 0, sinMarca: 0, total: 0 };
    current.total += 1;
    if (row.estadoLlegada === "bien") current.bien += 1;
    if (row.estadoLlegada === "regular") current.regular += 1;
    if (row.estadoLlegada === "mal") current.mal += 1;
    if (row.estadoLlegada === "fuera") current.fuera += 1;
    if (row.estadoLlegada === "sin-marca") current.sinMarca += 1;
    groups.set(contractor, current);
  });

  return Array.from(groups.values()).sort((a, b) => b.total - a.total || a.contractor.localeCompare(b.contractor));
}

function buildAttendanceTotals(summary: AttendanceSummary[]) {
  return summary.reduce(
    (acc, item) => ({
      bien: acc.bien + item.bien,
      fuera: acc.fuera + item.fuera,
      mal: acc.mal + item.mal,
      regular: acc.regular + item.regular,
      sinMarca: acc.sinMarca + item.sinMarca,
      total: acc.total + item.total,
    }),
    { bien: 0, fuera: 0, mal: 0, regular: 0, sinMarca: 0, total: 0 },
  );
}

function buildTopOffenders(rows: AttendanceRow[]): TopOffender[] {
  const groups = new Map<string, TopOffender>();

  rows.filter(isLateArrival).forEach((row) => {
    const key = row.identificador || normalizeText(row.nombreCompleto);
    const current = groups.get(key) || {
      contratista: row.contratista || "Sin contratista",
      identificador: row.identificador,
      key,
      llegadasTarde: 0,
      nombre: row.nombreCompleto || "Sin nombre",
      rangoHora: arrivalRangeLabel(row.entrada),
      ultimaEntrada: "",
      ultimaFecha: "",
    };
    current.llegadasTarde += 1;
    if (isNewerAttendanceRow(row, current.ultimaFecha, current.ultimaEntrada)) {
      current.ultimaFecha = row.fecha || row.fechaKey;
      current.ultimaEntrada = row.entrada;
      current.rangoHora = arrivalRangeLabel(row.entrada);
    }
    groups.set(key, current);
  });

  return Array.from(groups.values()).sort((a, b) => b.llegadasTarde - a.llegadasTarde || a.nombre.localeCompare(b.nombre));
}

function isLateArrival(row: AttendanceRow) {
  const minutes = timeToMinutes(row.entrada);
  return minutes !== null && minutes > 6 * 60 + 30 && minutes <= 7 * 60;
}

function arrivalRangeLabel(value: string) {
  const minutes = timeToMinutes(value);
  if (minutes === null) return "Sin marca";
  if (minutes >= 5 * 60 + 45 && minutes <= 6 * 60) return "5:45-6:00";
  if (minutes > 6 * 60 && minutes <= 6 * 60 + 30) return "6:01-6:30";
  if (minutes > 6 * 60 + 30 && minutes <= 7 * 60) return "6:31-7:00";
  return "Fuera de rango";
}

function isNewerAttendanceRow(row: AttendanceRow, currentDate: string, currentTime: string) {
  const nextDate = row.fechaKey || normalizeAttendanceDate(row.fecha);
  const currentKey = normalizeAttendanceDate(currentDate) || currentDate;
  if (!currentKey) return true;
  if (nextDate !== currentKey) return nextDate > currentKey;
  return (timeToMinutes(row.entrada) || 0) >= (timeToMinutes(currentTime) || 0);
}

function lateCommentKey(row: AttendanceRow) {
  return [row.identificador || normalizeText(row.nombreCompleto), row.fechaKey || normalizeAttendanceDate(row.fecha), row.entrada].join("|");
}

function readAttendanceValue(row: Record<string, unknown>, names: string[], preferLast = false) {
  const values = Object.entries(row)
    .filter(([key]) => {
      const normalizedKey = normalizeHeader(key);
      return names.some((name) => normalizedKey === name || normalizedKey.startsWith(`${name}_`) || normalizedKey.startsWith(`${name}__`) || /^\d+$/.test(normalizedKey.replace(name, "")));
    })
    .map(([, value]) => cleanCell(value))
    .filter(Boolean);

  if (!values.length) return "";
  return preferLast ? values[values.length - 1] : values[0];
}

function cleanCell(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "");
}

function normalizeTimeValue(value: string) {
  const clean = cleanCell(value);
  if (!clean) return "";
  const decimal = Number(clean.replace(",", "."));
  if (Number.isFinite(decimal) && decimal > 0 && decimal < 1) {
    const totalMinutes = Math.round(decimal * 24 * 60);
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  }
  const match = clean.match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return clean;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function classifyArrival(value: string): AttendanceStatus {
  const minutes = timeToMinutes(value);
  if (minutes === null) return "sin-marca";
  if (minutes < 5 * 60 + 45) return "fuera";
  if (minutes <= 6 * 60) return "bien";
  if (minutes <= 6 * 60 + 30) return "regular";
  if (minutes <= 7 * 60) return "mal";
  return "fuera";
}

function timeToMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function normalizeAttendanceDate(value: string) {
  const clean = value.trim();
  if (!clean) return "";
  const iso = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const numeric = clean.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (numeric) {
    const [, day, month, year] = numeric;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const parsed = new Date(clean);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function normalizeId(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeText(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function persistAttendance(payload: StoredAttendance) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    throw new Error("El navegador no pudo guardar el cargue localmente. El archivo puede ser demasiado grande.");
  }
}

function readStoredAttendance() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAttendance;
    if (!Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistComments(comments: Record<string, string>) {
  try {
    window.localStorage.setItem(COMMENTS_STORAGE_KEY, JSON.stringify(comments));
  } catch {
    return;
  }
}

function readStoredComments() {
  try {
    const raw = window.localStorage.getItem(COMMENTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
}
