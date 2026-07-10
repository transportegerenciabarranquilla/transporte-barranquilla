import type { Vehiculo } from "../../seguimiento/types";
import { normalizeCajasTotal } from "../../seguimiento/utils";
import type {
  AdminRefusalComRow,
  GraphDateRange,
  LateComment,
  RefusalCausePreventistaSummary,
  RefusalClientSummary,
  RefusalComSummary,
} from "./types";

export function getContractors(records: Vehiculo[]) {
  return Array.from(new Set(records.map((record) => record.transportista).filter(Boolean))).sort();
}

export function getActiveDateRange(autoDateRange: boolean, records: Vehiculo[], dateRange: GraphDateRange) {
  if (!autoDateRange || !records.length) return dateRange;
  const dates = records.map(getVehicleDateKey).filter(Boolean).sort();
  return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : dateRange;
}

export function filterRecords(records: Vehiculo[], activeDateRange: GraphDateRange, contractor: string, dtSearch: string) {
  const targetDt = normalizeDt(dtSearch);

  return records.filter((record) => {
    const recordDate = getVehicleDateKey(record);
    const matchesDate = isDateInRange(recordDate, activeDateRange);
    const matchesContractor = contractor === "Todas" || record.transportista === contractor;
    const matchesDt = !targetDt || normalizeDt(record.transporte).includes(targetDt);
    return matchesDate && matchesContractor && matchesDt;
  });
}

export function filterRefusalRows(refusalRows: AdminRefusalComRow[], activeDateRange: GraphDateRange, contractor: string, dtSearch: string) {
  const targetDt = normalizeDt(dtSearch);

  return refusalRows.filter((row) => {
    const matchesDate = isDateInRange(row.date, activeDateRange);
    const matchesContractor = contractor === "Todas" || row.contractor === contractor;
    const matchesDt = !targetDt || normalizeDt(row.dt).includes(targetDt);
    return matchesDate && matchesContractor && matchesDt;
  });
}

export function buildRefusalByCom(visibleRefusalRows: AdminRefusalComRow[]) {
  const groups = new Map<string, RefusalComSummary>();

  visibleRefusalRows.forEach((row) => {
    const preventista = row.preventista?.trim() || "Sin preventista";
    const key = `${row.contractor}:${preventista}`;
    const current = groups.get(key) || createRefusalComSummary(row.contractor, preventista, preventista);

    addRefusalTotals(current, row);
    groups.set(key, current);
  });

  return Array.from(groups.values()).sort((a, b) => b.refusalFinal - a.refusalFinal);
}

export function buildRefusalByJefeVentas(visibleRefusalRows: AdminRefusalComRow[]) {
  const groups = new Map<string, RefusalComSummary>();

  visibleRefusalRows.forEach((row) => {
    const jefeVentas = normalizeJefeVentas(row.jefeVentas);
    const current = groups.get(jefeVentas) || createRefusalComSummary("", jefeVentas, jefeVentas);

    addRefusalTotals(current, row);
    current.contractor = addUniqueLabel(current.contractor, row.contractor || "Sin contratista");
    groups.set(jefeVentas, current);
  });

  return Array.from(groups.values()).sort((a, b) => b.refusalFinal - a.refusalFinal);
}

export function buildRefusalCauseByPreventista(visibleRefusalRows: AdminRefusalComRow[]) {
  const groups = new Map<string, RefusalCausePreventistaSummary>();

  visibleRefusalRows.forEach((row) => {
    const causal = row.causal?.trim() || "Sin causal";
    const contractor = row.contractor || "Sin contratista";
    const current = groups.get(causal) || {
      causal,
      contractor: "",
      gestionadas: 0,
      pendientes: 0,
      registros: 0,
      reportadas: 0,
    };
    const reportadas = readNumber(row.reportadas);
    const gestionadas = readNumber(row.gestionadas);

    current.reportadas += reportadas;
    current.gestionadas += gestionadas;
    current.pendientes += readOptionalNumber(row.refusalFinal) ?? Math.max(reportadas - gestionadas, 0);
    current.registros += 1;
    current.contractor = addUniqueLabel(current.contractor, contractor);
    groups.set(causal, current);
  });

  return Array.from(groups.values()).sort(
    (a, b) => b.pendientes - a.pendientes || b.reportadas - a.reportadas || a.causal.localeCompare(b.causal),
  );
}

export function buildTopRefusalClients(visibleRefusalRows: AdminRefusalComRow[]) {
  const groups = new Map<string, RefusalClientSummary>();

  visibleRefusalRows.forEach((row) => {
    const codigoCliente = row.codigoCliente?.trim() || "Sin codigo";
    const nombreCliente = row.nombreCliente?.trim() || "Cliente sin nombre";
    const causal = row.causal?.trim() || "Sin causal";
    const contractor = row.contractor || "Sin contratista";
    const key = `${codigoCliente}:${normalizeTextKey(nombreCliente)}:${causal}`;
    const current = groups.get(key) || {
      causal,
      codigoCliente,
      contractor: "",
      date: row.date || "",
      gestionadas: 0,
      nombreCliente,
      pendientes: 0,
      registros: 0,
      reportadas: 0,
    };
    const reportadas = readNumber(row.reportadas);
    const gestionadas = readNumber(row.gestionadas);

    current.reportadas += reportadas;
    current.gestionadas += gestionadas;
    current.pendientes += readOptionalNumber(row.refusalFinal) ?? Math.max(reportadas - gestionadas, 0);
    current.registros += 1;
    current.contractor = addUniqueLabel(current.contractor, contractor);
    if (row.date && (!current.date || row.date > current.date)) current.date = row.date;
    groups.set(key, current);
  });

  return Array.from(groups.values()).sort(
    (a, b) => b.reportadas - a.reportadas || b.pendientes - a.pendientes || a.nombreCliente.localeCompare(b.nombreCliente),
  );
}

export function buildLateComments(visibleRecords: Vehiculo[]): LateComment[] {
  return visibleRecords
    .filter((record) => record.causalSalidaTardia || record.comentarioSalidaTardia)
    .map((record) => ({
      causal: record.causalSalidaTardia || "Sin causal",
      comentario: record.comentarioSalidaTardia || "Sin comentario",
      contractor: record.transportista || "Sin contratista",
      date: getVehicleDateKey(record),
      dt: record.transporte || "-",
      placa: record.vehiculo || "-",
    }))
    .sort((a, b) => a.causal.localeCompare(b.causal));
}

export function buildGraphTotals(
  visibleRecords: Vehiculo[],
  visibleRefusalRows: AdminRefusalComRow[],
  refusalCauseByPreventista: RefusalCausePreventistaSummary[],
  lateComments: LateComment[],
) {
  const cajasSeguimiento = normalizeCajasTotal(visibleRecords.reduce((total, record) => total + readNumber(record.cajas), 0));
  const reportadas = visibleRefusalRows.reduce((total, row) => total + readNumber(row.reportadas), 0);
  const gestionadas = visibleRefusalRows.reduce((total, row) => total + readNumber(row.gestionadas), 0);
  const refusalFinal = refusalCauseByPreventista.reduce((total, row) => total + readNumber(row.pendientes), 0);

  return {
    causales: refusalCauseByPreventista.length,
    comentarios: lateComments.length,
    gestionadas,
    refusal: cajasSeguimiento ? Number(((refusalFinal / cajasSeguimiento) * 100).toFixed(2)) : 0,
    refusalFinal,
    reportadas,
    rutas: visibleRecords.length,
  };
}

export function buildFilteredHref(path: string, range: GraphDateRange, dt: string, selectedContractor: string) {
  const params = new URLSearchParams();
  if (range.from) params.set("desde", range.from);
  if (range.to) params.set("hasta", range.to);
  if (dt) params.set("dt", dt);
  if (selectedContractor !== "Todas") params.set("contratista", selectedContractor);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function getInitialGraphFilters(today: string) {
  if (typeof window === "undefined") {
    return {
      autoDateRange: true,
      contractor: "Todas",
      dateRange: { from: today, to: today },
      dtSearch: "",
    };
  }

  const params = new URLSearchParams(window.location.search);
  const from = params.get("desde") || params.get("fecha") || "";
  const to = params.get("hasta") || params.get("fecha") || "";
  const dtSearch = params.get("dt") || "";
  const contractor = params.get("contratista") || "Todas";
  const hasDateFilter = Boolean(from || to);

  return {
    autoDateRange: !hasDateFilter,
    contractor,
    dateRange: hasDateFilter ? normalizeDateRange(from || to, to || from) : { from: today, to: today },
    dtSearch,
  };
}

export function getVehicleDateKey(record: Vehiculo) {
  return toDateKeyValue(record.fechaDespacho || record.fechaDt || record.date || record.createdAt);
}

export function normalizeDateRange(from: string, to: string) {
  const start = from || to || toDateKey(new Date());
  const end = to || from || toDateKey(new Date());
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function normalizeDt(value: unknown) {
  return String(value || "")
    .replace(/^DT-?/i, "")
    .replace(/\D/g, "");
}

export function formatDateLabel(value: string) {
  if (!value) return "Sin fecha";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function createRefusalComSummary(contractor: string, label: string, preventista: string): RefusalComSummary {
  return {
    contractor,
    label,
    preventista,
    reportadas: 0,
    gestionadas: 0,
    refusalFinal: 0,
    registros: 0,
    refusal: 0,
  };
}

function addRefusalTotals(current: RefusalComSummary, row: AdminRefusalComRow) {
  current.reportadas += readNumber(row.reportadas);
  current.gestionadas += readNumber(row.gestionadas);
  current.refusalFinal += readNumber(row.refusalFinal);
  current.registros += 1;
  current.refusal = current.reportadas ? Number(((current.refusalFinal / current.reportadas) * 100).toFixed(2)) : 0;
}

function readNumber(value: unknown) {
  return readOptionalNumber(value) ?? 0;
}

function readOptionalNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = String(value ?? "").trim();
  if (!text) return null;

  const normalized = normalizeNumberText(text);
  const parsed = Number(normalized.replace(/[^\d.-]/g, ""));

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNumberText(value: string) {
  const clean = value.replace(/\s/g, "");
  if (clean.includes(",") && clean.includes(".")) return clean.replace(/\./g, "").replace(",", ".");
  if (/^-?\d{1,3}(\.\d{3})+$/.test(clean)) return clean.replace(/\./g, "");
  return clean.replace(",", ".");
}

function addUniqueLabel(current: string, next: string) {
  if (!next) return current;
  const values = current ? current.split(", ") : [];
  return values.includes(next) ? current : [...values, next].join(", ");
}

function normalizeJefeVentas(value: string | undefined) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue || /^rr\b/i.test(cleanValue) || /^rr[-\s]?\d+/i.test(cleanValue)) return "Sin jefe de ventas";
  return cleanValue;
}

function normalizeTextKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isDateInRange(dateKey: string, range: GraphDateRange) {
  if (!dateKey) return false;
  return dateKey >= range.from && dateKey <= range.to;
}

function toDateKeyValue(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);

  const slashMatch = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const fullYear = year.length === 2 ? `20${year}` : year;
    return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return toDateKey(parsed);
}
