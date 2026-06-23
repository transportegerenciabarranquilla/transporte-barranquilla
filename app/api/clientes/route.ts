import { NextResponse } from "next/server";
import { supabaseHeaders, supabaseRest } from "../../lib/supabaseServer";

type ClienteRow = Record<string, unknown>;

const TABLE = "clientes";
const CODE_COLUMNS = [
  "codigo",
  "codigo_cliente",
  "codigoCliente",
  "cod_cliente",
  "codCliente",
  "cliente_codigo",
  "clienteCodigo",
  "id_cliente",
  "cliente_id",
  "nit",
  "CODIGO",
  "CODIGO_CLIENTE",
  "COD_CLIENTE",
  "CODIGOCLIENTE",
  "CODCLIENTE",
  "Codigo",
  "Código",
  "COD CLIENTE",
  "CODIGO CLIENTE",
  "CLIENTE",
];
const NAME_HINTS = ["nombre", "cliente", "razon", "razón", "establecimiento"];
const COM_HINTS = ["com"];
const PREVENTISTA_KEYS = ["CodigoZona_Principal", "codigozona_principal", "codigoZonaPrincipal", "CODIGOZONA_PRINCIPAL", "CODIGO_ZONA_PRINCIPAL"];
const PREVENTISTA_HINTS = ["codigozonaprincipal", "preventista"];
const JEFE_HINTS = ["jefe", "comercial", "ventas"];

export async function GET(request: Request) {
  try {
    const codigo = new URL(request.url).searchParams.get("codigo")?.replace(/\D/g, "").trim();
    if (!codigo) return NextResponse.json({ cliente: null });

    const row = await findClienteByCodigo(codigo);
    return NextResponse.json({ cliente: row ? normalizeCliente(row, codigo) : null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error buscando el cliente." },
      { status: 500 },
    );
  }
}

async function findClienteByCodigo(codigo: string) {
  const direct = await findByKnownColumns(codigo);
  if (direct) return direct;

  return findByScanningRows(codigo);
}

async function findByKnownColumns(codigo: string) {
  for (const column of CODE_COLUMNS) {
    const params = new URLSearchParams({
      select: "*",
      [column]: `eq.${codigo}`,
      limit: "1",
    });
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      headers: supabaseHeaders(),
      cache: "no-store",
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) continue;
    if (Array.isArray(body) && body[0]) return body[0] as ClienteRow;
  }

  return null;
}

async function findByScanningRows(codigo: string) {
  const params = new URLSearchParams({ select: "*", limit: "5000" });
  const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
    headers: supabaseHeaders(),
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(body)) return null;

  const rows = body as ClienteRow[];
  return (
    rows.find((row) => rowMatchesCodigo(row, codigo, true)) ||
    rows.find((row) => rowMatchesCodigo(row, codigo, false)) ||
    null
  );
}

function rowMatchesCodigo(row: ClienteRow, codigo: string, codeColumnsOnly: boolean) {
  return Object.entries(row).some(([key, value]) => {
    const text = String(value ?? "");
    const digits = text.replace(/\D/g, "");
    if (digits !== codigo) return false;

    return !codeColumnsOnly || isCodeKey(key);
  });
}

function normalizeCliente(row: ClienteRow, codigo: string) {
  return {
    codigo: valueByKnownKeys(row, CODE_COLUMNS) || codigo,
    nombre: valueByHints(row, NAME_HINTS, [codigo]) || valueByFirstText(row, [codigo]),
    com: valueByHints(row, COM_HINTS),
    jefeComercial: valueByHints(row, JEFE_HINTS),
    preventista: valueByKnownKeys(row, PREVENTISTA_KEYS) || valueByHints(row, PREVENTISTA_HINTS),
  };
}

function valueByKnownKeys(row: ClienteRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (isPresent(value)) return String(value).trim();
  }

  return "";
}

function valueByHints(row: ClienteRow, hints: string[], excludeValues: string[] = []) {
  const exclude = new Set(excludeValues.map(normalizeText));

  for (const [key, value] of Object.entries(row)) {
    if (!isPresent(value)) continue;

    const normalizedKey = normalizeText(key);
    if (!hints.some((hint) => normalizedKey.includes(normalizeText(hint)))) continue;

    const text = String(value).trim();
    if (exclude.has(normalizeText(text))) continue;
    return text;
  }

  return "";
}

function valueByFirstText(row: ClienteRow, excludeValues: string[] = []) {
  const exclude = new Set(excludeValues.map(normalizeText));

  for (const value of Object.values(row)) {
    if (!isPresent(value)) continue;
    const text = String(value).trim();
    if (!/[a-záéíóúñ]/i.test(text)) continue;
    if (exclude.has(normalizeText(text))) continue;
    return text;
  }

  return "";
}

function isCodeKey(key: string) {
  const normalized = normalizeText(key);
  return normalized.includes("cod") || normalized.includes("codigo") || normalized.includes("cliente") || normalized === "id";
}

function isPresent(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
