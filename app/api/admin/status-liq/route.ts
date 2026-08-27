import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { normalizeContractorName } from "../../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";
import type { Vehiculo } from "../../../seguimiento/types";

const TABLE = "status-liq";

type StatusLiqRow = { DT: number | string; "Hora liquidacion": string };

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session?.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const [statusResponse, seguimientoResponse] = await Promise.all([
      fetch(supabaseRest(TABLE, "?select=*"), { headers, cache: "no-store" }),
      fetch(supabaseRest("seguimiento_vehiculos", "?select=contractor,data,updated_at&limit=5000&order=updated_at.desc"), { headers, cache: "no-store" }),
    ]);
    if (!statusResponse.ok) return NextResponse.json({ error: await supabaseError(statusResponse) }, { status: statusResponse.status });
    if (!seguimientoResponse.ok) return NextResponse.json({ error: await supabaseError(seguimientoResponse) }, { status: seguimientoResponse.status });
    const seguimientoRows = await seguimientoResponse.json() as Array<{ contractor?: string; data?: Vehiculo; updated_at?: string }>;
    return NextResponse.json({
      records: await statusResponse.json(),
      seguimiento: normalizeSeguimientoRows(seguimientoRows),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar status-liq." }, { status: 500 });
  }
}

function normalizeSeguimientoRows(rows: Array<{ contractor?: string; data?: Vehiculo; updated_at?: string }>) {
  const latestByDtAndDate = new Map<string, Vehiculo>();
  rows.forEach((row) => {
    if (!row.data) return;
    const liquidationMarkedAt = row.data.liquidadoUpdatedAt || (row.data.liquidado === true ? row.updated_at : "");
    if (!liquidationMarkedAt || Number.isNaN(new Date(liquidationMarkedAt).getTime())) return;
    const contractorKeys = [row.data.transportista, row.contractor].map(normalizeContractorName);
    if (!contractorKeys.includes("logisticos")) return;
    const contractor = "Logisticos";
    const dt = String(row.data.transporte || "").replace(/\D/g, "");
    const date = toBogotaDate(liquidationMarkedAt);
    if (!dt || !date) return;
    const key = `${dt}:${date}`;
    const current = latestByDtAndDate.get(key);
    if (!current || liquidationMarkedAt > String(current.liquidadoUpdatedAt)) {
      latestByDtAndDate.set(key, { ...row.data, liquidadoUpdatedAt: liquidationMarkedAt, transportista: contractor });
    }
  });
  return Array.from(latestByDtAndDate.values());
}

function toBogotaDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed);
}

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session?.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecciona un archivo Excel." }, { status: 400 });
    if (!/\.(xlsx|xls)$/i.test(file.name)) return NextResponse.json({ error: "El archivo debe ser .xlsx o .xls." }, { status: 400 });

    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) return NextResponse.json({ error: "El Excel no contiene hojas." }, { status: 400 });
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: "", raw: false });
    const rows = parseRows(rawRows);
    if (!rows.length) return NextResponse.json({ error: "No se encontraron DT y horas de liquidación válidos." }, { status: 400 });

    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const deleteResponse = await fetch(supabaseRest(TABLE, "?DT=not.is.null"), { method: "DELETE", headers, cache: "no-store" });
    if (!deleteResponse.ok) return NextResponse.json({ error: await supabaseError(deleteResponse) }, { status: deleteResponse.status });

    const insertResponse = await fetch(supabaseRest(TABLE), {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify(rows),
      cache: "no-store",
    });
    if (!insertResponse.ok) return NextResponse.json({ error: await supabaseError(insertResponse) }, { status: insertResponse.status });
    return NextResponse.json({ records: await insertResponse.json(), imported: rows.length, fileName: file.name });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo importar el Excel de status-liq." }, { status: 500 });
  }
}

function parseRows(rawRows: Record<string, unknown>[]): StatusLiqRow[] {
  const byDt = new Map<string, StatusLiqRow>();
  rawRows.forEach((row) => {
    const entries = new Map(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));
    const dt = String(entries.get("dt") ?? "").replace(/\D/g, "");
    const time = normalizeTime(entries.get("horaliquidacion"));
    if (!dt || !time) return;
    byDt.set(dt, { DT: Number(dt), "Hora liquidacion": time });
  });
  return Array.from(byDt.values());
}

function normalizeHeader(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function normalizeTime(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [value.getHours(), value.getMinutes(), value.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
  }
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (hour > 23 || minute > 59 || second > 59) return "";
  return [hour, minute, second].map((part) => String(part).padStart(2, "0")).join(":");
}
