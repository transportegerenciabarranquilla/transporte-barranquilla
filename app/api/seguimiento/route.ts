import { NextResponse } from "next/server";
import type { AsistenciaRegistro } from "../../lib/asistenciaStorage";
import type { Vehiculo } from "../../seguimiento/types";
import { getVehicleRecordKey } from "../../seguimiento/utils";
import { writeAuditLog } from "../../lib/auditLog";
import { getAuthenticatedSession } from "../../lib/authServer";
import { normalizeContractorName } from "../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseHeaders, supabaseReadHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "seguimiento_vehiculos";
const CAPACITY_TABLE = "capacidad_carga";
const PUBLIC_CONTRACTORS: Record<string, string> = {
  logisticos: "Logisticos",
  puntocorona: "Punto Corona",
  surticervezas: "Surti Cervezas",
  logisticosarenosa: "Logisticos Arenosa",
  coronaarenosa: "Punto Corona Arenosa",
  puntocoronaarenosa: "Punto Corona Arenosa",
};

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    const searchParams = new URL(request.url).searchParams;
    const requestedContractor = searchParams.get("contratista");
    const requestedDt = normalizeDt(searchParams.get("dt") || "");
    const requestedDate = searchParams.get("fecha") || searchParams.get("date") || "";
    const publicContractor = PUBLIC_CONTRACTORS[normalizeContractorName(requestedContractor)];

    if (!session && !publicContractor) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });

    const contractor = session?.contractor || publicContractor;
    const params = new URLSearchParams(
      session?.isAdmin
        ? { select: "contractor,data", order: "updated_at.desc" }
        : { select: "data", contractor: `eq.${contractor}`, order: "updated_at.desc" },
    );
    if (requestedDt) params.set("data->>transporte", `eq.${requestedDt}`);
    if (requestedDate) params.set("data->>fechaDespacho", `eq.${requestedDate}`);
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      headers: session ? supabaseReadHeaders(session.accessToken) : supabaseHeaders(),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });

    const rows = (await response.json()) as { contractor?: string; data: Vehiculo }[];
    const records = removeDuplicateDtRecords(rows.map((row) => ({ ...row.data, transportista: row.contractor || row.data.transportista })));
    const withCapacities = await applyDatabaseCapacities(records, session?.accessToken);
    return NextResponse.json({ records: await applyAttendanceToVehicles(withCapacities, session?.accessToken, session?.isAdmin ? undefined : contractor) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando seguimiento." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (session.isAdmin) return NextResponse.json({ error: "El administrador solo consulta el seguimiento global." }, { status: 403 });
    const { records } = (await request.json()) as { records: Vehiculo[] };
    if (!Array.isArray(records)) return NextResponse.json({ error: "records debe ser una lista." }, { status: 400 });

    const scopedRecords = await applyAttendanceToVehicles(
      removeDuplicateDtRecords(
        await applyDatabaseCapacities(
          records.map((record) => ({
            ...record,
            transportista: session.contractor,
          })),
          session.accessToken,
        ),
      ),
      session.accessToken,
      session.contractor,
    );

    const rows = scopedRecords.map((record, index) => ({
      record_id: getSeguimientoRecordId(record, session.contractor, index),
      contractor: session.contractor,
      data: { ...record, recordId: getSeguimientoRecordId(record, session.contractor, index) },
      updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const upsert = await fetch(supabaseRest(TABLE, "?on_conflict=record_id"), {
        method: "POST",
        headers: supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(rows),
        cache: "no-store",
      });
      if (!upsert.ok) return NextResponse.json({ error: await supabaseError(upsert) }, { status: upsert.status });
    }

    const deleteError = await deleteRemovedSeguimientoRows(rows.map((row) => row.record_id), session.contractor, session.accessToken);
    if (deleteError) return NextResponse.json({ error: deleteError }, { status: 500 });

    const savedParams = new URLSearchParams({ select: "data", contractor: `eq.${session.contractor}`, order: "updated_at.desc" });
    const savedResponse = await fetch(supabaseRest(TABLE, `?${savedParams.toString()}`), {
      headers: supabaseUserHeaders(session.accessToken),
      cache: "no-store",
    });
    if (!savedResponse.ok) return NextResponse.json({ error: await supabaseError(savedResponse) }, { status: savedResponse.status });

    const savedRows = (await savedResponse.json()) as { data: Vehiculo }[];
    await writeAuditLog({
      action: "seguimiento_guardado",
      contractor: session.contractor,
      details: {
        records: records.length,
        dts: scopedRecords.map((record) => record.transporte).slice(0, 30),
      },
      module: "seguimiento",
      recordId: rows.map((row) => row.record_id).slice(0, 5).join(","),
      request,
      session,
    });
    const savedRecords = await applyDatabaseCapacities(removeDuplicateDtRecords(savedRows.map((row) => row.data)), session.accessToken);
    return NextResponse.json({ records: await applyAttendanceToVehicles(savedRecords, session.accessToken, session.contractor) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando seguimiento." }, { status: 500 });
  }
}

async function deleteRemovedSeguimientoRows(keepIds: string[], contractor: string, accessToken: string) {
  const currentParams = new URLSearchParams({ select: "record_id", contractor: `eq.${contractor}` });
  const headers = getWriteHeaders(accessToken);
  const currentResponse = await fetch(supabaseRest(TABLE, `?${currentParams.toString()}`), {
    headers,
    cache: "no-store",
  });
  if (!currentResponse.ok) return await supabaseError(currentResponse);

  const current = (await currentResponse.json()) as { record_id: string }[];
  const keep = new Set(keepIds);
  const removed = current.map((row) => row.record_id).filter((id) => !keep.has(id));
  if (!removed.length) return "";

  for (const recordId of removed) {
    const params = new URLSearchParams({
      contractor: `eq.${contractor}`,
      record_id: `eq.${recordId}`,
    });
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      method: "DELETE",
      headers,
      cache: "no-store",
    });

    if (!response.ok) return await supabaseError(response);
  }

  return "";
}

function getWriteHeaders(accessToken: string) {
  return supabaseAdminHeaders() ?? supabaseUserHeaders(accessToken);
}

function removeDuplicateDtRecords(records: Vehiculo[]) {
  const recordsByRoute = new Map<string, Vehiculo>();
  const recordsWithoutRoute: Vehiculo[] = [];

  records.forEach((record) => {
    const routeKey = getVehicleRecordKey(record);
    if (!routeKey || routeKey.endsWith("-sin-fecha")) {
      recordsWithoutRoute.push(record);
      return;
    }

    const contractorKey = normalizeContractorName(record.transportista);
    const uniqueKey = `${contractorKey}:${routeKey}`;
    const current = recordsByRoute.get(uniqueKey);
    recordsByRoute.delete(uniqueKey);
    recordsByRoute.set(uniqueKey, current ? mergeDuplicateVehicle(current, record) : record);
  });

  return [...recordsWithoutRoute, ...recordsByRoute.values()];
}

function getSeguimientoRecordId(record: Vehiculo, contractor: string, index: number) {
  const routeKey = getVehicleRecordKey(record);
  const contractorKey = normalizeContractorName(contractor);

  if (routeKey && !routeKey.endsWith("-sin-fecha")) return `seguimiento:${contractorKey}:${routeKey}`;
  return record.recordId || `seguimiento:${contractorKey}:${routeKey || "sin-ruta"}:${index}`;
}

function mergeDuplicateVehicle(current: Vehiculo, next: Vehiculo) {
  const clientes = next.clientes > 0 ? next.clientes : current.clientes;
  const visitados = Math.max(Number(current.visitados || 0), Number(next.visitados || 0));

  return {
    ...current,
    ...next,
    clientes,
    visitados: Math.min(visitados, clientes || visitados),
  };
}

async function applyAttendanceToVehicles(records: Vehiculo[], accessToken: string | undefined, contractor?: string) {
  if (!records.length) return records;

  const attendanceIndex = await readAttendanceIndex(accessToken, contractor);
  if (!attendanceIndex.byContractorDtAndDate.size && !attendanceIndex.latestByContractorDt.size) return records;

  return records.map((vehicle) => {
    const contractorKey = normalizeContractorName(vehicle.transportista || contractor);
    const dt = normalizeDt(vehicle.transporte);
    if (!contractorKey || !dt) return vehicle;

    const dispatchDate = routeDateValue(vehicle.fechaDespacho || vehicle.date || vehicle.createdAt);
    const attendance =
      attendanceIndex.byContractorDtAndDate.get(`${contractorKey}:${dt}:${dispatchDate}`) ||
      attendanceIndex.latestByContractorDt.get(`${contractorKey}:${dt}`);
    if (!attendance) return vehicle;

    const attendanceResponsible = attendance.nombreResponsable || (attendance.cedulaResponsable ? `CC ${attendance.cedulaResponsable}` : "");

    return {
      ...vehicle,
      cedulaResponsable: attendance.cedulaResponsable || vehicle.cedulaResponsable,
      cedulaAuxiliar1: attendance.cedulaAuxiliar1 || vehicle.cedulaAuxiliar1,
      cedulaAuxiliar2: attendance.cedulaAuxiliar2 || vehicle.cedulaAuxiliar2,
      nombreResponsable: attendance.nombreResponsable || vehicle.nombreResponsable,
      nombreAuxiliar1: attendance.nombreAuxiliar1 || vehicle.nombreAuxiliar1,
      nombreAuxiliar2: attendance.nombreAuxiliar2 || vehicle.nombreAuxiliar2,
      responsable: shouldFillResponsible(vehicle.responsable) ? attendanceResponsible || vehicle.responsable : vehicle.responsable,
    };
  });
}

async function readAttendanceIndex(accessToken: string | undefined, contractor?: string) {
  const byContractorDtAndDate = new Map<string, AsistenciaRegistro>();
  const latestByContractorDt = new Map<string, AsistenciaRegistro>();
  const params = new URLSearchParams({ select: "contractor,data", order: "updated_at.desc" });
  if (contractor) params.set("contractor", `eq.${contractor}`);

  const response = await fetch(supabaseRest("asistencias_ruta", `?${params.toString()}`), {
    headers: supabaseAdminHeaders() ?? (accessToken ? supabaseReadHeaders(accessToken) : supabaseHeaders()),
    cache: "no-store",
  });
  if (!response.ok) return { byContractorDtAndDate, latestByContractorDt };

  const rows = (await response.json().catch(() => [])) as { contractor?: string; data: AsistenciaRegistro }[];
  rows.forEach((row) => {
    const record = { ...row.data, contratista: row.contractor || row.data.contratista };
    const contractorKey = normalizeContractorName(record.contratista);
    const dt = normalizeDt(record.dt);
    if (!contractorKey || !dt) return;

    const createdDate = routeDateValue(record.createdAt);
    const dateKey = createdDate ? `${contractorKey}:${dt}:${createdDate}` : "";
    const existingForDate = dateKey ? byContractorDtAndDate.get(dateKey) : undefined;
    if (dateKey && (!existingForDate || isNewerAttendance(record, existingForDate))) {
      byContractorDtAndDate.set(dateKey, record);
    }

    const latestKey = `${contractorKey}:${dt}`;
    const existing = latestByContractorDt.get(latestKey);
    if (!existing || isNewerAttendance(record, existing)) {
      latestByContractorDt.set(latestKey, record);
    }
  });

  return { byContractorDtAndDate, latestByContractorDt };
}

function isNewerAttendance(next: AsistenciaRegistro, current: AsistenciaRegistro) {
  return new Date(next.createdAt).getTime() > new Date(current.createdAt).getTime();
}

function shouldFillResponsible(value: string | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return !normalized || ["0", "-", "n/a", "na", "pendiente", "sin responsable", "sinresponsable"].includes(normalized);
}

function routeDateValue(value: string | undefined) {
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

async function applyDatabaseCapacities(records: Vehiculo[], accessToken?: string) {
  if (!records.length) return records;

  const capacityByPlate = await readCapacityByPlate(accessToken);
  if (!capacityByPlate.size) return records;

  return records.map((record) => {
    const capacity = capacityByPlate.get(normalizePlate(record.vehiculo));
    return typeof capacity === "number" ? { ...record, capacidad: capacity } : record;
  });
}

async function readCapacityByPlate(accessToken?: string) {
  const params = new URLSearchParams({ select: "*" });
  const response = await fetch(supabaseRest(CAPACITY_TABLE, `?${params.toString()}`), {
    headers: supabaseAdminHeaders() ?? (accessToken ? supabaseUserHeaders(accessToken) : supabaseHeaders()),
    cache: "no-store",
  });
  if (!response.ok) return new Map<string, number>();

  const rows = (await response.json().catch(() => [])) as Record<string, unknown>[];
  const capacities = new Map<string, number>();

  rows.forEach((row) => {
    const sources = getSearchableRows(row);
    const plate = normalizePlate(sources.map(readPlate).find(Boolean));
    const capacity = firstFiniteNumber(sources.map(readCapacity));

    if (!plate || !Number.isFinite(capacity)) return;
    capacities.set(plate, capacity);
  });

  return capacities;
}

function valueByKnownKeys(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }

  return valueByHints(row, keys);
}

function valueByHints(row: Record<string, unknown>, hints: string[]) {
  const normalizedHints = hints.map(normalizeKey);

  for (const [key, value] of Object.entries(row)) {
    if (value === undefined || value === null || String(value).trim() === "") continue;

    const normalizedKey = normalizeKey(key);
    if (normalizedHints.some((hint) => normalizedKey.includes(hint) || hint.includes(normalizedKey))) return String(value).trim();
  }

  return "";
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getSearchableRows(row: Record<string, unknown>) {
  const rows = [row];

  Object.values(row).forEach((value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) rows.push(value as Record<string, unknown>);
  });

  return rows;
}

function readPlate(row: Record<string, unknown>) {
  return valueByKnownKeys(row, ["placa", "PLACA", "Placa", "vehiculo", "VEHICULO", "Vehiculo", "vehículo", "Vehículo", "vehicle", "plate", "vh", "VH"]);
}

function readCapacity(row: Record<string, unknown>) {
  return numberValue(
    valueByKnownKeys(row, [
      "capacidad",
      "CAPACIDAD",
      "Capacidad",
      "capacidad_carga",
      "CAPACIDAD_CARGA",
      "capacidadCarga",
      "CapacidadCarga",
      "capacidad de carga",
      "Capacidad de carga",
      "carga",
      "CARGA",
      "Carga",
      "peso",
      "PESO",
      "Peso",
    ]),
  );
}

function firstFiniteNumber(values: number[]) {
  return values.find((value) => Number.isFinite(value)) ?? Number.NaN;
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizePlate(value: string | undefined) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");

  return normalized.replace(/^vh/, "");
}

function normalizeDt(value: string | undefined) {
  return String(value ?? "")
    .replace(/^DT-?/i, "")
    .replace(/\D/g, "");
}
