import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

type Session = { accessToken: string; email?: string; isPeople?: boolean; isAdmin?: boolean };
type StoredRow = { profile_id: string; data?: Partial<ImportManifest> };
type SheetSummary = { name: string; columns: string[]; rowCount: number };
type ImportManifest = {
  kind: "manifest";
  id: string;
  fileName: string;
  fileSize: number;
  sheetCount: number;
  rowCount: number;
  sheets: SheetSummary[];
  uploadedAt: string;
  uploadedBy: string;
};

const PREFIX = "nps-import:";
const MAX_FILE_SIZE = 30 * 1024 * 1024;
const ROWS_PER_CHUNK = 200;
const RECORDS_PER_REQUEST = 40;

export async function GET() {
  try {
    const session = await requirePeople();
    if (session instanceof NextResponse) return session;
    const params = new URLSearchParams({ select: "profile_id,data", profile_id: `like.${PREFIX}*`, order: "updated_at.desc" });
    const response = await fetch(supabaseRest("people_profiles", `?${params}`), { headers: readHeaders(session), cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    const rows = (await response.json().catch(() => [])) as StoredRow[];
    const imports = rows.map((row) => row.data).filter((data): data is ImportManifest => data?.kind === "manifest" && Boolean(data.id));
    return NextResponse.json({ imports });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar el consolidado NPS." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requirePeople();
  if (session instanceof NextResponse) return session;

  let importId = "";
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecciona un archivo de Excel." }, { status: 400 });
    if (!/\.(xlsx|xls)$/i.test(file.name)) return NextResponse.json({ error: "El archivo debe ser .xlsx o .xls." }, { status: 400 });
    if (!file.size || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "El archivo debe pesar menos de 30 MB." }, { status: 400 });

    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, raw: true });
    if (!workbook.SheetNames.length) return NextResponse.json({ error: "El Excel no contiene hojas para importar." }, { status: 400 });

    importId = crypto.randomUUID();
    const uploadedAt = new Date().toISOString();
    const summaries: SheetSummary[] = [];
    const databaseRows: Array<Record<string, unknown>> = [];
    let totalRows = 0;

    for (const sheetName of workbook.SheetNames) {
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true });
      const width = rawRows.reduce((maximum, row) => Math.max(maximum, Array.isArray(row) ? row.length : 0), 0);
      const headers = uniqueHeaders(Array.isArray(rawRows[0]) ? rawRows[0] : [], width);
      const rows = rawRows.slice(1).filter((row) => Array.isArray(row) && row.some((value) => value !== null && value !== "")).map((row) => Object.fromEntries(headers.map((header, index) => [header, normalizeCell((row as unknown[])[index])] )));
      summaries.push({ name: sheetName, columns: headers, rowCount: rows.length });
      totalRows += rows.length;

      for (let offset = 0; offset < rows.length; offset += ROWS_PER_CHUNK) {
        const index = Math.floor(offset / ROWS_PER_CHUNK);
        databaseRows.push({
          profile_id: `${PREFIX}${importId}:sheet:${safeId(sheetName)}:chunk:${String(index).padStart(5, "0")}`,
          contractor: "NPS",
          cc: null,
          data: { kind: "chunk", importId, sheetName, index, rows: rows.slice(offset, offset + ROWS_PER_CHUNK) },
          updated_at: uploadedAt,
        });
      }
    }

    const manifest: ImportManifest = { kind: "manifest", id: importId, fileName: file.name, fileSize: file.size, sheetCount: summaries.length, rowCount: totalRows, sheets: summaries, uploadedAt, uploadedBy: session.email || "People" };
    const headers = writeHeaders(session);
    for (let offset = 0; offset < databaseRows.length; offset += RECORDS_PER_REQUEST) {
      const response = await fetch(supabaseRest("people_profiles"), { method: "POST", headers, cache: "no-store", body: JSON.stringify(databaseRows.slice(offset, offset + RECORDS_PER_REQUEST)) });
      if (!response.ok) throw new Error(await supabaseError(response));
    }
    const manifestResponse = await fetch(supabaseRest("people_profiles"), {
      method: "POST", headers, cache: "no-store",
      body: JSON.stringify({ profile_id: `${PREFIX}${importId}:manifest`, contractor: "NPS", cc: null, data: manifest, updated_at: uploadedAt }),
    });
    if (!manifestResponse.ok) throw new Error(await supabaseError(manifestResponse));
    return NextResponse.json({ import: manifest }, { status: 201 });
  } catch (error) {
    if (importId) await cleanupImport(importId, session).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar el Excel en la base de datos." }, { status: 500 });
  }
}

async function requirePeople(): Promise<Session | NextResponse> {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  return session;
}

function uniqueHeaders(values: unknown[], width: number) {
  const used = new Map<string, number>();
  return Array.from({ length: width }, (_, index) => {
    const base = String(values[index] ?? "").trim() || `Columna ${index + 1}`;
    const occurrence = (used.get(base) || 0) + 1;
    used.set(base, occurrence);
    return occurrence === 1 ? base : `${base} (${occurrence})`;
  });
}

function normalizeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
  return String(value);
}

function safeId(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 50) || "hoja"; }
function readHeaders(session: Session) { return supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken); }
function writeHeaders(session: Session) { return supabaseAdminHeaders({ Prefer: "return=minimal" }) ?? supabaseUserHeaders(session.accessToken, { Prefer: "return=minimal" }); }
async function cleanupImport(id: string, session: Session) {
  const query = `?profile_id=like.${encodeURIComponent(`${PREFIX}${id}*`)}`;
  await fetch(supabaseRest("people_profiles", query), { method: "DELETE", headers: readHeaders(session), cache: "no-store" });
}
