import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthenticatedSession } from "../../../../lib/authServer";
import { clearServerCache } from "../../../../lib/serverCache";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../../lib/supabaseServer";

const TABLES = ["RACOCIMI1", "RACOCIMI2"] as const;
const INSERT_SIZE = 300;
const DELETE_ROUTE_BATCH_SIZE = 100;

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const formData = await request.formData();
    const targetTable = String(formData.get("targetTable") || "").toUpperCase();
    if (!TABLES.includes(targetTable as (typeof TABLES)[number])) {
      return NextResponse.json({ error: "Selecciona RACOCIMI1 o RACOCIMI2 antes de subir el Excel." }, { status: 400 });
    }

    const files = formData.getAll("file").filter((entry): entry is File => entry instanceof File);
    if (!files.length) return NextResponse.json({ error: "Selecciona un archivo Excel." }, { status: 400 });
    for (const file of files) {
      if (!/\.(xlsx|xls)$/i.test(file.name)) return NextResponse.json({ error: `${file.name}: el archivo debe ser .xlsx o .xls.` }, { status: 400 });
      if (file.size > 30 * 1024 * 1024) return NextResponse.json({ error: `${file.name}: supera el límite de 30 MB.` }, { status: 413 });
    }

    const table = targetTable as (typeof TABLES)[number];
    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const results: Array<{ table: string; sheet: string; fileName: string; rows: number }> = [];
    const incomingRows: Record<string, unknown>[] = [];

    for (const file of files) {
      const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true, type: "array" });
      if (!workbook.SheetNames.length) return NextResponse.json({ error: `${file.name}: el Excel no contiene hojas.` }, { status: 400 });

      for (const sheetName of workbook.SheetNames) {
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
          defval: null,
          raw: true,
        });
        const rows = rawRows.map(normalizeRow).filter((row) => Object.values(row).some((value) => value !== null && value !== ""));
        incomingRows.push(...rows);
        results.push({ table, sheet: sheetName, fileName: file.name, rows: rows.length });
      }
    }

    const uniqueRows = deduplicateRows(incomingRows);
    const routes = Array.from(new Set(uniqueRows.map(routeValue).filter(Boolean)));
    if (!uniqueRows.length) return NextResponse.json({ error: "El Excel no contiene filas para importar." }, { status: 400 });
    if (!routes.length) {
      return NextResponse.json({ error: "El Excel no contiene la columna Ruta/DT necesaria para reemplazar la carga sin duplicarla." }, { status: 400 });
    }

    // RACOCIMI no contiene una fecha o mes propio. Para conservar el
    // histórico sin duplicar una recarga, se reemplazan solo las rutas/DT
    // incluidas en el nuevo Excel y se dejan intactas las demás rutas.
    const deletedRows = await clearRoutes(table, headers, routes);
    await insertRows(table, headers, uniqueRows);

    clearServerCache("rti-source:");
    clearServerCache("rti-response:");
    return NextResponse.json({
      fileNames: files.map((file) => file.name),
      replacedTables: [table],
      inserted: uniqueRows.length,
      deletedRows,
      replacedRoutes: routes.length,
      duplicateRowsDiscarded: incomingRows.length - uniqueRows.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo importar el Excel." },
      { status: 500 },
    );
  }
}

async function clearRoutes(table: string, headers: Record<string, string>, routes: string[]) {
  let deletedRows = 0;
  for (let index = 0; index < routes.length; index += DELETE_ROUTE_BATCH_SIZE) {
    const values = routes.slice(index, index + DELETE_ROUTE_BATCH_SIZE).map(postgrestQuotedValue);
    const params = new URLSearchParams({ Ruta: `in.(${values.join(",")})` });
    const response = await fetch(supabaseRest(table, `?${params}`), {
      method: "DELETE",
      headers: { ...headers, Prefer: "count=exact,return=minimal" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`${table}: no se pudieron reemplazar las rutas existentes (${await supabaseError(response)})`);
    deletedRows += parseContentRangeCount(response.headers.get("content-range")) || 0;
  }
  return deletedRows;
}

function postgrestQuotedValue(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function parseContentRangeCount(value: string | null) {
  const count = value?.match(/\/(\d+)$/)?.[1];
  return count ? Number(count) : undefined;
}

async function insertRows(table: string, headers: Record<string, string>, rows: Record<string, unknown>[]) {
  for (let index = 0; index < rows.length; index += INSERT_SIZE) {
    const response = await fetch(supabaseRest(table), {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify(rows.slice(index, index + INSERT_SIZE)),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`${table}: ${await supabaseError(response)}`);
  }
}

function normalizeRow(rawRow: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(rawRow)
      // SheetJS usa __EMPTY, __EMPTY_1, etc. cuando encuentra columnas sin
      // encabezado. Esas claves no existen en RACOCIMI y Supabase las rechaza.
      .filter(([header]) => !isGeneratedEmptyHeader(header))
      .map(([header, value]) => [canonicalHeader(header), normalizeCell(value)]),
  );
}

function isGeneratedEmptyHeader(header: string) {
  return /^__EMPTY(?:_\d+)?$/i.test(header.trim());
}

function canonicalHeader(header: string) {
  const cleaned = header.trim().replace(/\s+/g, " ");
  // Algunos reportes SAP abrevian "Cantidad real" como "Ctd.real".
  // Supabase exige que las claves del JSON coincidan exactamente con las
  // columnas de RACOCIMI1/2, así que unificamos el nombre antes de insertar.
  if (normalizeHeader(cleaned) === "ctd.real") return "Cantidad real";
  return cleaned;
}

function routeValue(row: Record<string, unknown>) {
  const entry = Object.entries(row).find(([column]) => ["ruta", "dt", "transporte"].includes(normalizeHeader(column)));
  return String(entry?.[1] ?? "").trim();
}

function deduplicateRows(rows: Record<string, unknown>[]) {
  const unique = new Map<string, Record<string, unknown>>();
  rows.forEach((row) => {
    const fingerprint = JSON.stringify(Object.entries(row).sort(([left], [right]) => left.localeCompare(right)));
    if (!unique.has(fingerprint)) unique.set(fingerprint, row);
  });
  return Array.from(unique.values());
}

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function normalizeCell(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  return typeof value === "string" ? value.trim() : value;
}
