import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { CONTRACTORS, contractorLabel, isPuntoCoronaContractor } from "../../../lib/contractors";
import type { PuntoCoronaRouteReport, PuntoCoronaRouteRow } from "../../../lib/puntoCoronaRoutesStorage";
import { cachedJsonFetch } from "../../../lib/serverCache";
import { supabaseAdminHeaders, supabaseHeaders, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";
import type { CheckinCajasRegistro } from "../../../lib/checkinStorage";
import type { ModulacionRegistro } from "../../../lib/modulacionStorage";
import type { Vehiculo } from "../../../seguimiento/types";
import { normalizeCajasTotal, normalizeCajasValue, normalizePuntoCoronaVolumeValue } from "../../../seguimiento/utils";

type Row = { data: Vehiculo; contractor?: string };
type CheckinRow = { data: CheckinCajasRegistro; contractor?: string };
type AdminCheckin = CheckinCajasRegistro & { contratista?: string };
type ModulacionListRow = Partial<Record<keyof ModulacionRegistro, unknown>> & { contractor?: string };
type PuntoCoronaReportRow = {
  contractor?: string;
  operational_date?: string;
  kind?: PuntoCoronaRouteReport["kind"];
  data?: PuntoCoronaRouteReport;
  updated_at?: string;
};
type AdminPuntoCoronaReport = PuntoCoronaRouteReport & { updatedAt?: string };
type AdminRefusalComRow = {
  causal: string;
  contractor: string;
  codigoCliente: string;
  com: string;
  date: string;
  dt: string;
  jefeVentas: string;
  nombreCliente: string;
  preventista: string;
  reportadas: number;
  gestionadas: number;
  refusalFinal: number;
};
const MODULACION_LIST_SELECT =
  "contractor,id:data->>id,contratista:data->>contratista,dt:data->>dt,fechaDespacho:data->>fechaDespacho,fechaDt:data->>fechaDt,codigoCliente:data->>codigoCliente,nombreCliente:data->>nombreCliente,telefonoCliente:data->>telefonoCliente,com:data->>com,jefeComercial:data->>jefeComercial,telefonoJefeComercial:data->>telefonoJefeComercial,preventista:data->>preventista,preventistaNombre:data->>preventistaNombre,telefonoPreventista:data->>telefonoPreventista,totalCajas:data->>totalCajas,cajasGestionadas:data->>cajasGestionadas,persona:data->>persona,personaNombre:data->>personaNombre,causal:data->>causal,comentario:data->>comentario,comentarioModulador:data->>comentarioModulador,imagenNombre:data->>imagenNombre,createdAt:data->>createdAt";
const PUNTO_CORONA_REPORT_SELECT = "contractor,operational_date,kind,data,updated_at";
const ADMIN_CACHE_VERSION = "v4";
const LIST_CACHE_TTL_MS = 30_000;

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session?.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const adminHeaders = supabaseAdminHeaders();
    const sessionHeaders = adminHeaders || supabaseUserHeaders(session.accessToken);
    const publicHeaders = adminHeaders || supabaseHeaders();
    const [rows, modulacionesRows, checkinRows, puntoCoronaRows] = await Promise.all([
      fetchAdminRowsByContractor<Row>("seguimiento_vehiculos", "contractor,data", "updated_at.desc", 2500, publicHeaders, "seguimiento"),
      fetchAdminRowsByContractor<ModulacionListRow>("modulaciones_ruta", MODULACION_LIST_SELECT, "updated_at.desc", 2500, sessionHeaders, "modulaciones"),
      fetchAdminRowsByContractor<CheckinRow>("checkins_cajas", "contractor,data", "updated_at.desc", 2500, sessionHeaders, "checkins").catch(() => []),
      fetchAdminRowsByContractor<PuntoCoronaReportRow>(
        "punto_corona_route_reports",
        PUNTO_CORONA_REPORT_SELECT,
        "operational_date.desc,updated_at.desc",
        1200,
        sessionHeaders,
        "punto-corona",
      ).catch(() => []),
    ]);
    const modulaciones = modulacionesRows.map((row) => {
      const record = fromModulacionListRow(row);
      return { ...record, contratista: contractorLabel(row.contractor || record.contratista) || record.contratista };
    });
    const checkins = checkinRows.map((row) => ({
      ...row.data,
      contratista: contractorLabel(row.contractor || (row.data as CheckinCajasRegistro & { contratista?: string }).contratista),
    }));
    const modulacionesIndex = indexModulacionesByRoute(modulaciones);
    const checkinsIndex = indexCheckinsByRoute(checkins);
    const seguimientoRecords = rows.map((row) => {
      const transportista = contractorLabel(row.contractor || row.data.transportista) || row.data.transportista;
      const cajas = readVehicleBoxes(row.data);
      const routeDate = getVehicleDate(row.data);
      const routeKey = buildRouteKey(transportista, row.data.transporte, routeDate);
      const fallbackRouteKey = buildRouteKey(transportista, row.data.transporte);
      const registrosDt = modulacionesIndex.byDate.get(routeKey) || modulacionesIndex.byDt.get(fallbackRouteKey) || [];
      const checkin = checkinsIndex.byDate.get(routeKey) || checkinsIndex.byDt.get(fallbackRouteKey);
      const refusal = summarizeRefusal(registrosDt, cajas, checkin?.totalCajas);

      return {
        ...row.data,
        transportista,
        cajas,
        cajasRechazadas: refusal.cajasRechazadas,
        cajasGestionadas: refusal.cajasGestionadas,
        cajasRefusalFinal: refusal.cajasPendientes,
        refusal: refusal.refusal,
      };
    });
    const records = appendPuntoCoronaReportRecords(seguimientoRecords, puntoCoronaRows);
    const refusalByComRows = buildRefusalByComRows(modulaciones, records);
    const totals = records.reduce(
      (acc, record) => ({
        cajas: acc.cajas + readNumber(record.cajas),
        rechazadas: acc.rechazadas + readNumber(record.cajasRechazadas),
        gestionadas: acc.gestionadas + readNumber(record.cajasGestionadas),
        refusalFinal: acc.refusalFinal + readNumber(record.cajasRefusalFinal),
      }),
      { cajas: 0, rechazadas: 0, gestionadas: 0, refusalFinal: 0 },
    );
    const roundedTotalCajas = normalizeCajasTotal(totals.cajas);
    const totalRefusal = roundedTotalCajas ? Number(((totals.refusalFinal / roundedTotalCajas) * 100).toFixed(2)) : 0;
    const summaries = CONTRACTORS.map((contractor) => {
      const contractorRecords = records.filter((record) => record.transportista === contractor);
      const cajas = normalizeCajasTotal(contractorRecords.reduce((total, record) => total + readNumber(record.cajas), 0));
      const refusalFinal = contractorRecords.reduce((total, record) => total + readNumber(record.cajasRefusalFinal), 0);

      return {
        contractor,
        rutas: contractorRecords.length,
        cajas,
        clientes: contractorRecords.reduce((total, record) => total + readNumber(record.clientes), 0),
        visitados: contractorRecords.reduce((total, record) => total + readNumber(record.visitados), 0),
        rechazadas: contractorRecords.reduce((total, record) => total + readNumber(record.cajasRechazadas), 0),
        gestionadas: contractorRecords.reduce((total, record) => total + readNumber(record.cajasGestionadas), 0),
        refusalFinal,
        refusal: cajas ? Number(((refusalFinal / cajas) * 100).toFixed(2)) : 0,
      };
    });

    return NextResponse.json({
      summaries,
      records,
      refusalByComRows,
      totalCajas: roundedTotalCajas,
      totalRechazadas: totals.rechazadas,
      totalGestionadas: totals.gestionadas,
      totalRefusalFinal: totals.refusalFinal,
      totalRefusal,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando admin." }, { status: 500 });
  }
}

async function fetchAdminRowsByContractor<T>(
  table: string,
  select: string,
  order: string,
  limit: number,
  headers: Record<string, string>,
  cacheKey: string,
) {
  const groups = await Promise.all(
    CONTRACTORS.map((contractor) => {
      const params = new URLSearchParams({
        select,
        contractor: `eq.${contractor}`,
        order,
        limit: String(limit),
      });
      const url = supabaseRest(table, `?${params.toString()}`);
      return cachedJsonFetch<T[]>(`supabase:admin-seguimiento:${ADMIN_CACHE_VERSION}:${cacheKey}:${contractor}:${url}`, LIST_CACHE_TTL_MS, url, { headers });
    }),
  );

  return groups.flat();
}

function indexModulacionesByRoute(records: ModulacionRegistro[]) {
  const byDate = new Map<string, ModulacionRegistro[]>();
  const byDt = new Map<string, ModulacionRegistro[]>();

  records.forEach((record) => {
    addToGroup(byDate, buildRouteKey(record.contratista, record.dt, getRecordDate(record)), record);
    addToGroup(byDt, buildRouteKey(record.contratista, record.dt), record);
  });

  return { byDate, byDt };
}

function indexCheckinsByRoute(records: AdminCheckin[]) {
  const byDate = new Map<string, AdminCheckin>();
  const byDt = new Map<string, AdminCheckin>();

  records.forEach((record) => {
    const date = toDateKey(record.createdAt);
    const dateKey = buildRouteKey(record.contratista, record.dt, date);
    const dtKey = buildRouteKey(record.contratista, record.dt);
    if (dateKey && !byDate.has(dateKey)) byDate.set(dateKey, record);
    if (dtKey && !byDt.has(dtKey)) byDt.set(dtKey, record);
  });

  return { byDate, byDt };
}

function addToGroup<T>(groups: Map<string, T[]>, key: string, value: T) {
  if (!key) return;
  const current = groups.get(key);
  if (current) {
    current.push(value);
    return;
  }

  groups.set(key, [value]);
}

function buildRouteKey(contractor: string | undefined, dt: string | number | undefined, dateKey = "") {
  const contractorKey = normalizeContractor(contractor);
  const dtKey = normalizeDt(dt);
  if (!contractorKey || !dtKey) return "";
  return dateKey ? `${contractorKey}:${dtKey}:${dateKey}` : `${contractorKey}:${dtKey}`;
}

function summarizeRefusal(records: ModulacionRegistro[], totalCajasSalida = 0, cajasCheckin?: unknown) {
  const cajasRechazadas = records.reduce((total, record) => total + readNumber(record.totalCajas), 0);
  const cajasGestionadas = records.reduce((total, record) => total + readNumber(record.cajasGestionadas), 0);
  const pendientesModulacion = Math.max(cajasRechazadas - cajasGestionadas, 0);
  const cajasCheckinFinal = readOptionalNumber(cajasCheckin);
  const cajasPendientes = cajasCheckinFinal !== null ? Math.max(cajasCheckinFinal, 0) : pendientesModulacion;

  return {
    cajasRechazadas,
    cajasGestionadas,
    cajasPendientes,
    refusal: totalCajasSalida ? Number(((cajasPendientes / totalCajasSalida) * 100).toFixed(2)) : 0,
  };
}

function readVehicleBoxes(record: Vehiculo) {
  const source = record as Vehiculo & Record<string, unknown>;
  return normalizeCajasValue(readNumber(source.cajas));
}

function firstPositiveNumber(values: unknown[]) {
  for (const value of values) {
    const parsed = readNumber(value);
    if (parsed > 0) return parsed;
  }

  return 0;
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

function normalizeDt(value: string | number | undefined) {
  return String(value ?? "")
    .replace(/^DT-?/i, "")
    .replace(/\D/g, "");
}

function normalizeContractor(value: string | undefined) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function appendPuntoCoronaReportRecords(records: Vehiculo[], rows: PuntoCoronaReportRow[]) {
  const existingRouteKeys = new Set(records.map((record) => buildRouteKey(record.transportista, record.transporte, getVehicleDate(record))).filter(Boolean));
  const additions: Vehiculo[] = [];

  latestPuntoCoronaReports(rows).forEach((report) => {
    if (!isPuntoCoronaContractor(report.contractor)) return;

    const contractor = contractorLabel(report.contractor) || report.contractor;
    const operationalDate = toDateKey(report.operationalDate);
    if (!contractor || !operationalDate) return;

    groupPuntoCoronaRowsByDt(report.rows || []).forEach((routeRows, dt) => {
      const routeKey = buildRouteKey(contractor, dt, operationalDate);
      if (!routeKey || existingRouteKeys.has(routeKey)) return;

      additions.push(buildPuntoCoronaVehicleRecord(report, routeRows, dt, contractor, operationalDate));
      existingRouteKeys.add(routeKey);
    });
  });

  return additions.length ? [...records, ...additions] : records;
}

function latestPuntoCoronaReports(rows: PuntoCoronaReportRow[]) {
  const reportsByDate = new Map<string, AdminPuntoCoronaReport>();

  rows
    .map(normalizePuntoCoronaReport)
    .filter((report): report is AdminPuntoCoronaReport => Boolean(report))
    .forEach((report) => {
      const contractor = contractorLabel(report.contractor) || report.contractor;
      const date = toDateKey(report.operationalDate);
      const key = `${normalizeContractor(contractor)}:${date}`;
      if (!key || key === ":") return;

      const current = reportsByDate.get(key);
      if (!current || isPreferredPuntoCoronaReport(report, current)) reportsByDate.set(key, report);
    });

  return Array.from(reportsByDate.values());
}

function normalizePuntoCoronaReport(row: PuntoCoronaReportRow): AdminPuntoCoronaReport | null {
  if (!row.data) return null;

  return {
    ...row.data,
    contractor: contractorLabel(row.data.contractor || row.contractor) || readString(row.data.contractor || row.contractor),
    operationalDate: readString(row.data.operationalDate || row.operational_date),
    kind: row.data.kind || row.kind || "current",
    updatedAt: readString(row.updated_at),
  };
}

function isPreferredPuntoCoronaReport(candidate: AdminPuntoCoronaReport, current: AdminPuntoCoronaReport) {
  if (candidate.kind === "closure" && current.kind !== "closure") return true;
  if (candidate.kind !== "closure" && current.kind === "closure") return false;

  return readTimestamp(candidate.updatedAt || candidate.closedAt || candidate.uploadedAt) > readTimestamp(current.updatedAt || current.closedAt || current.uploadedAt);
}

function groupPuntoCoronaRowsByDt(rows: PuntoCoronaRouteRow[]) {
  const byDt = new Map<string, PuntoCoronaRouteRow[]>();

  rows.forEach((row) => {
    const dt = normalizeDt(row.dt || row.tourDisplayId);
    if (!dt) return;
    addToGroup(byDt, dt, row);
  });

  return byDt;
}

function buildPuntoCoronaVehicleRecord(
  report: AdminPuntoCoronaReport,
  rows: PuntoCoronaRouteRow[],
  dt: string,
  contractor: string,
  operationalDate: string,
): Vehiculo {
  const first = rows[0];
  const startedRows = rows.filter((row) => readString(row.status).toUpperCase() !== "NOT_STARTED");
  const cajasRechazadas = normalizeCajasTotal(rows.reduce((total, row) => total + readPuntoCoronaRefusedBoxes(row), 0));
  const clientes = readPuntoCoronaSeguimientoValue(rows, "seguimientoClientes") || rows.length;
  const visitados = readPuntoCoronaSeguimientoValue(rows, "seguimientoVisitados") || startedRows.length;
  const cajasSeguimiento = readPuntoCoronaSeguimientoValue(rows, "seguimientoCajas");
  const cajas = normalizeCajasTotal(cajasSeguimiento);
  const status = clientes && visitados >= clientes ? "Finalizado" : startedRows.length ? "En ruta" : "Pendiente por salir";
  const createdAt = report.closedAt || report.uploadedAt || report.updatedAt || `${operationalDate}T00:00:00.000Z`;

  return {
    recordId: `punto-corona:${normalizeContractor(contractor)}:${operationalDate}:${dt}`,
    cajasGestionadas: 0,
    cajasReportadas: cajasRechazadas,
    createdAt,
    date: operationalDate,
    mes: "",
    cd: "BAQ",
    transportista: contractor,
    llave: `punto-corona-${operationalDate}-${dt}`,
    transporte: dt,
    centro: "Punto Corona",
    codTransportista: "",
    fechaDt: operationalDate,
    fechaDespacho: operationalDate,
    vehiculo: first?.truckLicensePlate || "Sin placa",
    responsable: first?.driverName || "Sin responsable",
    territorio: "Punto Corona",
    viaje: "Punto Corona",
    bloque: "Punto Corona",
    cajas,
    hl: 0,
    clientes,
    visitados,
    horaSalida: "Pendiente",
    peso: 0,
    capacidad: 0,
    validadorPeso: "Pendiente",
    avanceRuta: `${percentage(visitados, clientes)}%`,
    status,
    horaLlegada: "Pendiente",
    tiempoRuta: "Pendiente",
    metaRelevo: "Pendiente",
    horaInicioRelevo: "Pendiente",
    clasificacionRelevo: "Pendiente",
    alertaSifPotencial: "Pendiente",
    relevador: "-",
    causalDesviado: "-",
    clasificacionOnTime: "Pendiente",
    recargue: "Pendiente",
    cajasRechazadas,
    cajasRefusalFinal: cajasRechazadas,
    refusal: cajas ? Number(((cajasRechazadas / cajas) * 100).toFixed(2)) : 0,
  };
}

function readPuntoCoronaSeguimientoValue(rows: PuntoCoronaRouteRow[], key: "seguimientoCajas" | "seguimientoClientes" | "seguimientoVisitados") {
  return firstPositiveNumber(rows.map((row) => row[key]));
}

function readPuntoCoronaRefusedBoxes(row: PuntoCoronaRouteRow) {
  const source = row as PuntoCoronaRouteRow & Record<string, unknown>;
  return normalizePuntoCoronaVolumeValue(firstPositiveNumber([
    source.refusedVolume,
    source.totalRefusedVol,
    source.total_refused_vol,
    source.volumenRechazado,
    source["volumen rechazado"],
    source.cajasRechazadas,
    source["cajas rechazadas"],
    source.cajasRefusal,
    source.refusal,
    source.rechazado,
  ]));
}

function readTimestamp(value: unknown) {
  const parsed = new Date(readString(value)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentage(value: number, total: number) {
  return total ? Number(((value / total) * 100).toFixed(2)) : 0;
}

function buildRefusalByComRows(modulaciones: ModulacionRegistro[], records: Vehiculo[]): AdminRefusalComRow[] {
  const vehicleByDtContractor = new Map(
    records.map((record) => [`${normalizeContractor(record.transportista)}:${normalizeDt(record.transporte)}:${getVehicleDate(record)}`, record]),
  );
  const fallbackVehicleByDtContractor = new Map(
    records.map((record) => [`${normalizeContractor(record.transportista)}:${normalizeDt(record.transporte)}`, record]),
  );

  return modulaciones.map((record) => {
    const contractor = contractorLabel(record.contratista) || record.contratista || "Sin contratista";
    const date = getRecordDate(record);
    const vehicle =
      vehicleByDtContractor.get(`${normalizeContractor(contractor)}:${normalizeDt(record.dt)}:${date}`) ||
      fallbackVehicleByDtContractor.get(`${normalizeContractor(contractor)}:${normalizeDt(record.dt)}`);
    const reportadas = readNumber(record.totalCajas);
    const gestionadas = readNumber(record.cajasGestionadas);

    return {
      causal: record.causal?.trim() || "Sin causal",
      contractor,
      codigoCliente: record.codigoCliente?.trim() || "Sin codigo",
      com: getCom(record, vehicle),
      date,
      dt: normalizeDt(record.dt),
      jefeVentas: getJefeVentas(record, vehicle),
      nombreCliente: record.nombreCliente?.trim() || "Cliente sin nombre",
      preventista: getPreventista(record),
      reportadas,
      gestionadas,
      refusalFinal: Math.max(reportadas - gestionadas, 0),
    };
  });
}

function getCom(record: ModulacionRegistro, vehicle: Vehiculo | undefined) {
  if (record.com?.trim()) return record.com.trim().toUpperCase();

  const candidates = [vehicle?.bloque, vehicle?.viaje, vehicle?.territorio].filter(Boolean) as string[];
  const found = candidates.find((value) => /^COM/i.test(value.trim()));
  if (found) return found.trim().toUpperCase();

  const code = String(record.codigoCliente || record.dt || "").replace(/\D/g, "");
  return code ? `COM${code.slice(-3).padStart(3, "0")}` : "Sin asignacion";
}

function getPreventista(record: ModulacionRegistro) {
  return record.preventistaNombre?.trim() || record.preventista?.trim() || "Sin preventista";
}

function getJefeVentas(record: ModulacionRegistro, vehicle: Vehiculo | undefined) {
  if (record.jefeComercial?.trim()) return record.jefeComercial.trim();

  return vehicle?.territorio && vehicle.territorio !== "Pendiente" ? vehicle.territorio : vehicle?.responsable || "Sin asignacion";
}

function getRecordDate(record: ModulacionRegistro) {
  return toDateKey(record.fechaDespacho || record.fechaDt || record.createdAt);
}

function getVehicleDate(record: Vehiculo) {
  return toDateKey(record.fechaDespacho || record.fechaDt || record.date || record.createdAt);
}

function toDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(Number);
    if ([day, month, year].every(Number.isFinite)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function fromModulacionListRow(row: ModulacionListRow): ModulacionRegistro {
  return {
    id: readString(row.id),
    contratista: readString(row.contractor) || readString(row.contratista),
    dt: readString(row.dt),
    fechaDespacho: readString(row.fechaDespacho),
    fechaDt: readString(row.fechaDt),
    codigoCliente: readString(row.codigoCliente),
    nombreCliente: readString(row.nombreCliente),
    telefonoCliente: readString(row.telefonoCliente),
    com: readString(row.com),
    jefeComercial: readString(row.jefeComercial),
    telefonoJefeComercial: readString(row.telefonoJefeComercial),
    preventista: readString(row.preventista),
    preventistaNombre: readString(row.preventistaNombre),
    telefonoPreventista: readString(row.telefonoPreventista),
    totalCajas: readString(row.totalCajas),
    cajasGestionadas: readString(row.cajasGestionadas),
    persona: readString(row.persona),
    personaNombre: readString(row.personaNombre),
    causal: readString(row.causal),
    comentario: readString(row.comentario),
    comentarioModulador: readString(row.comentarioModulador),
    imagenNombre: readString(row.imagenNombre),
    imagenVista: "",
    createdAt: readString(row.createdAt),
  };
}

function readString(value: unknown) {
  return String(value ?? "").trim();
}
