import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthenticatedSession } from "../../../../lib/authServer";
import { clearServerCache } from "../../../../lib/serverCache";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../../lib/supabaseServer";

const TABLES = ["RACOCIMI1", "RACOCIMI2"] as const;
const INSERT_SIZE = 300;

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const formData = await request.formData();
    const files = formData.getAll("file").filter((entry): entry is File => entry instanceof File);
    if (!files.length) return NextResponse.json({ error: "Selecciona un archivo Excel." }, { status: 400 });
    for (const file of files) {
      if (!/\.(xlsx|xls)$/i.test(file.name)) return NextResponse.json({ error: `${file.name}: el archivo debe ser .xlsx o .xls.` }, { status: 400 });
      if (file.size > 30 * 1024 * 1024) return NextResponse.json({ error: `${file.name}: supera el límite de 30 MB.` }, { status: 413 });
    }

    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const results: Array<{ table: string; sheet: string; fileName: string; inserted: number; deleted?: number }> = [];
    // Un solo mapa para TODO el lote de archivos de esta petición: cada
    // tabla se borra una única vez por carga, sin importar cuántos archivos
    // del lote apunten a la misma tabla. Antes cada archivo se enviaba en
    // una petición HTTP separada y cada una traía su propio Map, así que el
    // segundo archivo volvía a borrar (y perdía) lo que el primero acababa
    // de insertar en la misma tabla.
    const clearedTables = new Map<string, number | undefined>();

    for (const file of files) {
      const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true, type: "array" });
      if (!workbook.SheetNames.length) return NextResponse.json({ error: `${file.name}: el Excel no contiene hojas.` }, { status: 400 });

      const targets = uploadTargets(file.name, workbook.SheetNames);
      for (const { table, sheetName } of targets) {
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
          defval: null,
          raw: true,
        });
        const rows = rawRows.map(normalizeRow).filter((row) => Object.values(row).some((value) => value !== null && value !== ""));
        if (!rows.length) {
          results.push({ table, sheet: sheetName, fileName: file.name, inserted: 0 });
          continue;
        }
        let deleted: number | undefined;
        if (!clearedTables.has(table)) {
          deleted = await clearTable(table, headers);
          clearedTables.set(table, deleted);
        } else {
          deleted = clearedTables.get(table);
        }
        await insertRows(table, headers, rows);
        results.push({ table, sheet: sheetName, fileName: file.name, inserted: rows.length, deleted });
      }
    }

    clearServerCache("rti-source:");
    return NextResponse.json({
      fileNames: files.map((file) => file.name),
      replacedTables: Array.from(clearedTables.keys()),
      inserted: results.reduce((total, result) => total + result.inserted, 0),
      deletedRows: Array.from(clearedTables.values()).reduce((total: number, count) => total + (count || 0), 0),
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo importar el Excel." },
      { status: 500 },
    );
  }
}

function uploadTargets(fileName: string, sheetNames: string[]) {
  if (sheetNames.length === 1) {
    return [{ table: tableFromFileName(fileName), sheetName: sheetNames[0] }];
  }
  return sheetNames.slice(0, TABLES.length).map((sheetName, index) => ({
    table: TABLES[index],
    sheetName,
  }));
}

function tableFromFileName(fileName: string): (typeof TABLES)[number] {
  const normalized = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (/\b(3|III)\b|JULIO\s*3|JULIO\s*\(3\)|\(\s*3\s*\)/.test(normalized)) return "RACOCIMI2";
  return "RACOCIMI1";
}

async function clearTable(table: string, headers: Record<string, string>) {
  const response = await fetch(supabaseRest(table, "?Ruta=not.is.null"), {
    method: "DELETE",
    headers: { ...headers, Prefer: "count=exact,return=minimal" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${table}: no se pudo borrar la carga anterior (${await supabaseError(response)})`);
  return parseContentRangeCount(response.headers.get("content-range"));
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
    Object.entries(rawRow).map(([header, value]) => [header.trim().replace(/\s+/g, " "), normalizeCell(value)]),
  );
}

function normalizeCell(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  return typeof value === "string" ? value.trim() : value;
}
