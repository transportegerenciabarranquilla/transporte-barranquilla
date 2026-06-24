import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../lib/authServer";
import { supabaseAdminHeaders, supabaseHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "capacidad_carga";

export async function GET(request: Request) {
  try {
    const placa = new URL(request.url).searchParams.get("placa") || "";
    const normalizedPlate = normalizePlate(placa);
    if (!normalizedPlate) return NextResponse.json({ capacidad: null });

    const session = await getAuthenticatedSession();
    const response = await fetch(supabaseRest(TABLE, "?select=*"), {
      headers: supabaseAdminHeaders() ?? (session ? supabaseUserHeaders(session.accessToken) : supabaseHeaders()),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return NextResponse.json({ capacidad: null, error: body.message || body.error || `Supabase respondio ${response.status}` }, { status: response.status });
    }

    const rows = (await response.json().catch(() => [])) as Record<string, unknown>[];
    const match = rows.map((row) => getSearchableRows(row)).find((sources) => {
      return sources.some((source) => normalizePlate(readPlate(source)) === normalizedPlate);
    });

    if (!match) return NextResponse.json({ capacidad: null });

    const capacidad = firstFiniteNumber(match.map(readCapacity));

    return NextResponse.json({ capacidad: Number.isFinite(capacidad) ? capacidad : null });
  } catch {
    return NextResponse.json({ capacidad: null });
  }
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
