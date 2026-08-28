import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { normalizeContractorName } from "../../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

const TABLE = "preventa_clientes";
const ALLOWED = ["logisticos"];
const aliases = {
  code: ["cliente", "codigo cliente", "codigo del cliente", "codigo", "cod cliente", "customer code"],
  name: ["nombre cliente", "nombre del cliente", "nombre", "razon social", "nombre del establecimiento", "establecimiento"],
  refusals: ["rechazos", "veces rechazado", "cantidad rechazos", "numero de rechazos", "rechazos anteriores", "refusal"],
};

type ProductLine = { order: string; customer_order: string; material: string; product: string; boxes: number; hectoliters: number; net_value: number; gross_weight: number };

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
    const form = await request.formData();
    const file = form.get("file");
    const requested = String(form.get("contractor") || session.contractor);
    if (session.isAdmin) return NextResponse.json({ error: "Preventa esta disponible solo para Logisticos." }, { status: 403 });
    const contractor = session.contractor;
    if (!ALLOWED.includes(normalizeContractorName(contractor))) return NextResponse.json({ error: "Preventa esta disponible solo para Logisticos." }, { status: 403 });
    if (!session.isAdmin && normalizeContractorName(requested) !== normalizeContractorName(session.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    if (!(file instanceof File) || !/\.(xlsx|xls)$/i.test(file.name)) return NextResponse.json({ error: "Selecciona un archivo Excel .xlsx o .xls." }, { status: 400 });
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "El archivo supera 20 MB." }, { status: 413 });
    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const raw = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }) : [];
    if (!raw.length) return NextResponse.json({ error: "El Excel no contiene clientes." }, { status: 400 });
    const headers = Object.keys(raw[0]);
    const find = (names: string[]) => headers.find((header) => names.includes(normalize(header)));
    const columns = { code: find(aliases.code), name: find(aliases.name), refusals: find(aliases.refusals) };
    if (!columns.code || !columns.name) return NextResponse.json({ error: "El Excel debe incluir las columnas Cliente y Nombre." }, { status: 400 });
    const batchId = createHash("sha256").update(Buffer.from(bytes)).digest("hex").slice(0, 20);
    const databaseHeaders = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const clientHistory = await readClientHistory(databaseHeaders, contractor);
    const grouped = new Map<string, { name: string; products: ProductLine[] }>();
    raw.forEach((item) => {
      const code = String(item[columns.code!] ?? "").trim();
      if (!code) return;
      const key = code.toLowerCase();
      const current = grouped.get(key) || { name: String(item[columns.name!] ?? "").trim(), products: [] };
      current.products.push({ order: readCell(item, headers, ["documento"]), customer_order: readCell(item, headers, ["no ped cli", "no ped cliente", "pedido cliente"]), material: readCell(item, headers, ["material"]), product: readCell(item, headers, ["material 1", "producto", "descripcion material"]), boxes: readNumber(item, headers, ["cajas"]), hectoliters: readNumber(item, headers, ["hectolitro", "hectolitros"]), net_value: readNumber(item, headers, ["valor neto"]), gross_weight: readNumber(item, headers, ["peso bruto"]) });
      grouped.set(key, current);
    });
    const rows = Array.from(grouped.entries()).map(([key, client]) => ({ contractor, batch_id: batchId, batch_name: file.name, client_code: key, client_name: client.name, previous_refusals: clientHistory.get(key)?.refusals || 0, products: mergeProductLines(client.products) }));
    if (!rows.length) return NextResponse.json({ error: "No se encontraron filas validas." }, { status: 400 });
    const extra = { Prefer: "resolution=merge-duplicates,return=minimal" };
    const response = await fetch(supabaseRest(TABLE, "?on_conflict=contractor,batch_id,client_code"), { method: "POST", headers: supabaseAdminHeaders(extra) ?? supabaseUserHeaders(session.accessToken, extra), body: JSON.stringify(rows), cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    return NextResponse.json({ imported: rows.length, batchId, fileName: file.name });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo importar el Excel." }, { status: 500 });
  }
}

async function readClientHistory(headers: Record<string, string>, contractor: string) {
  const totals = new Map<string, { refusals: number }>();
  const pageSize = 1_000;
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({ select: "client_code:data->>codigoCliente", contractor: `eq.${contractor}`, limit: String(pageSize), offset: String(offset) });
    const response = await fetch(supabaseRest("modulaciones_ruta", `?${params}`), { headers, cache: "no-store" });
    if (!response.ok) throw new Error(await supabaseError(response));
    const page = await response.json() as { client_code?: string }[];
    page.forEach((row) => {
      const code = String(row.client_code || "").trim().toLowerCase();
      if (!code) return;
      const current = totals.get(code);
      totals.set(code, { refusals: (current?.refusals || 0) + 1 });
    });
    if (page.length < pageSize) break;
  }
  return totals;
}
function readCell(row: Record<string, unknown>, headers: string[], aliases: string[]) { const header = headers.find((item) => aliases.includes(normalize(item))); return String(header ? row[header] ?? "" : "").trim(); }
function readNumber(row: Record<string, unknown>, headers: string[], aliases: string[]) { const value = Number(readCell(row, headers, aliases).replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".").replace(/[^\d.-]/g, "")); return Number.isFinite(value) ? value : 0; }
function mergeProductLines(lines: ProductLine[]) { const grouped = new Map<string, ProductLine>(); lines.forEach((line) => { const key = `${line.order}:${line.customer_order}:${line.material}:${line.product}`; const current = grouped.get(key); grouped.set(key, current ? { ...current, boxes: current.boxes + line.boxes, hectoliters: current.hectoliters + line.hectoliters, net_value: current.net_value + line.net_value, gross_weight: current.gross_weight + line.gross_weight } : line); }); return Array.from(grouped.values()); }

function normalize(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}
