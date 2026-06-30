import { NextResponse } from "next/server";
import type { Vehiculo } from "../../seguimiento/types";
import { writeAuditLog } from "../../lib/auditLog";
import { getAuthenticatedSession } from "../../lib/authServer";
import { normalizeContractorName } from "../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "seguimiento_vehiculos";
const CAPACITY_TABLE = "capacidad_carga";
const PUBLIC_CONTRACTORS: Record<string, string> = {
  logisticos: "Logisticos",
  puntocorona: "Punto Corona",
  surticervezas: "Surti Cervezas",
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
      headers: session ? supabaseUserHeaders(session.accessToken) : supabaseHeaders(),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });

    const rows = (await response.json()) as { contractor?: string; data: Vehiculo }[];
    const records = rows.map((row) => ({ ...row.data, transportista: row.contractor || row.data.transportista }));
    return NextResponse.json({ records: await applyDatabaseCapacities(records, session?.accessToken) });
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

    const scopedRecords = await applyDatabaseCapacities(
      records.map((record) => ({
        ...record,
        transportista: session.contractor,
      })),
      session.accessToken,
    );

    const rows = scopedRecords.map((record, index) => ({
      record_id: record.recordId || `${record.transporte}-${record.fechaDespacho || record.fechaDt}-${index}`,
      contractor: session.contractor,
      data: record,
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

    const keepIds = new Set(rows.map((row) => row.record_id));
    const currentParams = new URLSearchParams({ select: "record_id", contractor: `eq.${session.contractor}` });
    const currentResponse = await fetch(supabaseRest(TABLE, `?${currentParams.toString()}`), {
      headers: supabaseUserHeaders(session.accessToken),
      cache: "no-store",
    });
    if (currentResponse.ok) {
      const current = (await currentResponse.json()) as { record_id: string }[];
      const removed = current.map((row) => row.record_id).filter((id) => !keepIds.has(id));
      if (removed.length) {
        const filter = removed.map((id) => `"${id.replaceAll('"', '\\"')}"`).join(",");
        await fetch(supabaseRest(TABLE, `?record_id=in.(${encodeURIComponent(filter)})&contractor=eq.${encodeURIComponent(session.contractor)}`), {
          method: "DELETE",
          headers: supabaseUserHeaders(session.accessToken),
          cache: "no-store",
        });
      }
    }

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
    return NextResponse.json({ records: await applyDatabaseCapacities(savedRows.map((row) => row.data), session.accessToken) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando seguimiento." }, { status: 500 });
  }
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
