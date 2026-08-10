import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthenticatedSession } from "../../../../lib/authServer";

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecciona un Excel." }, { status: 400 });
    if (!/\.(xlsx|xls|csv|txt)$/i.test(file.name)) return NextResponse.json({ error: "El archivo debe ser .xlsx, .xls, .csv o .txt." }, { status: 400 });
    if (file.size > 30 * 1024 * 1024) return NextResponse.json({ error: "El archivo supera 30 MB." }, { status: 413 });

    const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true, type: "array" });
    const rows = workbook.SheetNames.flatMap((name) =>
      XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], { defval: null, raw: true }),
    ).map(normalizeRow).filter((row) => Object.values(row).some((value) => value !== null && value !== ""));
    if (!rows.length) return NextResponse.json({ error: "El Excel no contiene registros." }, { status: 400 });
    // Este Excel contiene los viajes que se van a planear. No se inserta en
    // ZKI porque ZKI es la fuente histórica cliente-RR usada para los cruces.
    return NextResponse.json({ rows, received: rows.length, fileName: file.name });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo importar ZKI." }, { status: 500 });
  }
}

function normalizeRow(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().replace(/\s+/g, " "), normalizeCell(value)]));
}

function normalizeCell(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  return typeof value === "string" ? value.trim() : value;
}
