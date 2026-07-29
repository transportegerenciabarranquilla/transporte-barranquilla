import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthenticatedSession } from "../../../../lib/authServer";
import { clearServerCache } from "../../../../lib/serverCache";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../../lib/supabaseServer";

const TABLE = "NPS";
const REQUIRED_COLUMNS = ["Vendor Account ID", "Survey Completed Date", "Score"];
const PAGE_SIZE = 1_000;
const INSERT_SIZE = 400;

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecciona un archivo Excel." }, { status: 400 });
    if (!/\.(xlsx|xls)$/i.test(file.name)) return NextResponse.json({ error: "El archivo debe ser .xlsx o .xls." }, { status: 400 });
    if (file.size > 30 * 1024 * 1024) return NextResponse.json({ error: "El archivo supera el límite de 30 MB." }, { status: 413 });

    const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true, type: "array" });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) return NextResponse.json({ error: "El Excel no contiene hojas." }, { status: 400 });
    const excelRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: null, raw: true });
    if (!excelRows.length) return NextResponse.json({ error: "La primera hoja no contiene registros." }, { status: 400 });

    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const allowedColumns = await readTableColumns(headers);
    const excelHeaderMap = new Map(
      Object.keys(excelRows[0]).map((header) => [normalizeHeader(header), header]),
    );
    const missing = REQUIRED_COLUMNS.filter((column) => !excelHeaderMap.has(normalizeHeader(column)));
    if (missing.length) {
      return NextResponse.json({ error: `Faltan columnas obligatorias: ${missing.join(", ")}.` }, { status: 400 });
    }
    const importColumns = allowedColumns.filter((column) => excelHeaderMap.has(normalizeHeader(column)));

    const mappedRows = excelRows.map((rawRow) => {
      const row: Record<string, unknown> = {};
      importColumns.forEach((column) => {
        const sourceHeader = excelHeaderMap.get(normalizeHeader(column));
        if (!sourceHeader) return;
        row[column] = normalizeCell(rawRow[sourceHeader], column);
      });
      return row;
    }).filter((row) => REQUIRED_COLUMNS.every((column) => row[column] !== null && row[column] !== ""));

    if (!mappedRows.length) return NextResponse.json({ error: "No se encontraron filas válidas para importar." }, { status: 400 });

    const existing = await readExistingRows(headers, allowedColumns);
    const signatures = new Set<string>();
    const pending: Record<string, unknown>[] = [];
    let repeatedInFile = 0;

    mappedRows.forEach((row) => {
      const rowSignature = signature(row, importColumns);
      if (signatures.has(rowSignature)) {
        repeatedInFile += 1;
        return;
      }
      signatures.add(rowSignature);
      pending.push(row);
    });

    const importedDates = new Set(pending.map((row) => String(row["Survey Completed Date"] || "")).filter(Boolean));
    const backupRows = existing.filter((row) => importedDates.has(normalizeDate(row["Survey Completed Date"])));

    await deleteRowsForDates(headers, importedDates);
    try {
      await insertRows(headers, pending);
    } catch (error) {
      await deleteRowsForDates(headers, importedDates);
      await insertRows(headers, backupRows);
      throw error;
    }

    clearServerCache("supabase:nps-");
    return NextResponse.json({
      fileName: file.name,
      inserted: pending.length,
      received: excelRows.length,
      replaced: backupRows.length,
      skipped: repeatedInFile,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo importar el Excel." },
      { status: 500 },
    );
  }
}

async function deleteRowsForDates(headers: Record<string, string>, dates: Set<string>) {
  if (!dates.size) return;
  const params = new URLSearchParams({
    "Survey Completed Date": `in.(${Array.from(dates).join(",")})`,
  });
  const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
    method: "DELETE",
    headers: { ...headers, Prefer: "return=minimal" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await supabaseError(response));
}

async function insertRows(headers: Record<string, string>, rows: Record<string, unknown>[]) {
  for (let index = 0; index < rows.length; index += INSERT_SIZE) {
    const response = await fetch(supabaseRest(TABLE), {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify(rows.slice(index, index + INSERT_SIZE)),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(await supabaseError(response));
  }
}

async function readTableColumns(headers: Record<string, string>) {
  const response = await fetch(supabaseRest(TABLE, "?select=*&limit=1"), { headers, cache: "no-store" });
  if (!response.ok) throw new Error(await supabaseError(response));
  const rows = (await response.json()) as Record<string, unknown>[];
  if (!rows[0]) throw new Error("La tabla NPS está vacía y no fue posible detectar sus columnas.");
  return Object.keys(rows[0]);
}

async function readExistingRows(headers: Record<string, string>, columns: string[]) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({ select: columns.join(","), offset: String(offset), limit: String(PAGE_SIZE) });
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), { headers, cache: "no-store" });
    if (!response.ok) throw new Error(await supabaseError(response));
    const page = (await response.json()) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

function normalizeHeader(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function normalizeCell(value: unknown, column: string) {
  if (value === undefined || value === null || value === "") return null;
  if (column === "Survey Completed Date") return normalizeDate(value);
  if (column === "Score") {
    const score = Number(String(value).replace(",", "."));
    return Number.isFinite(score) ? score : null;
  }
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value.trim() : value;
}

function normalizeDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = String(value).trim();
  const dayFirst = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dayFirst) return `${dayFirst[3]}-${dayFirst[2].padStart(2, "0")}-${dayFirst[1].padStart(2, "0")}`;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : text;
}

function signature(row: Record<string, unknown>, columns: string[]) {
  return columns.map((column) => {
    const value = normalizeCell(row[column], column);
    return value === null ? "" : String(value).trim().toLocaleLowerCase("es");
  }).join("\u001f");
}
