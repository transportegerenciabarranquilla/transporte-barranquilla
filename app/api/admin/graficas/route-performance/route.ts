import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../../lib/authServer";
import { parseRoutePerformanceFile as parseFile, readRoutePerformanceFile } from "../../../../lib/routePerformanceFile";
import { supabaseAdminHeaders, supabaseError, supabaseRest } from "../../../../lib/supabaseServer";

const TABLE = "graficas_route_performance_files";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type StoredFile = {
  id: string;
  file_name: string;
  file_base64: string;
  row_count: number;
  created_at: string;
};

function serverHeaders(extra?: Record<string, string>) {
  const headers = supabaseAdminHeaders(extra);
  if (!headers) throw new Error("Falta configurar la clave de servidor de Supabase para guardar el Excel.");
  return headers;
}

async function storageError(response: Response) {
  if (response.status === 404) {
    return "Falta crear la tabla de Excel. Ejecuta supabase/route_performance_files.sql en Supabase SQL Editor.";
  }
  return supabaseError(response);
}

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session?.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    return NextResponse.json(await readRoutePerformanceFile());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo cargar el Excel guardado." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session?.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !/\.(xlsx|xls)$/i.test(file.name) || file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Selecciona un Excel .xlsx o .xls de máximo 10 MB." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = await parseFile(buffer);
    const response = await fetch(supabaseRest(TABLE, "?select=id,file_name,row_count,created_at"), {
      method: "POST",
      headers: serverHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify({
        file_name: file.name.slice(0, 255),
        file_base64: buffer.toString("base64"),
        row_count: rows.length,
        uploaded_by: session.userId,
      }),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await storageError(response) }, { status: response.status });
    const saved = ((await response.json()) as StoredFile[])[0];
    if (!saved?.id || saved.row_count !== rows.length) {
      return NextResponse.json({ error: "Supabase no confirmó el archivo guardado." }, { status: 409 });
    }
    try {
      return NextResponse.json(await readRoutePerformanceFile());
    } catch {
      return NextResponse.json({ error: "El Excel se guardó, pero no se pudo recargar el historial. Recarga la página; no necesitas subirlo otra vez." }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar el Excel." }, { status: 500 });
  }
}
