import { NextResponse } from "next/server";
import { supabaseAdminHeaders, supabaseHeaders, supabaseRest } from "../../lib/supabaseServer";

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
const COM_KEYS = ["COM", "com", "Com", "codigo_com", "CODIGO_COM", "codigoCom", "CodigoCom"];
const COM_HINTS = ["codigo_com", "codigocom"];
const PREVENTISTA_KEYS = [
  "CodigoZona_Principal",
  "codigozona_principal",
  "codigoZonaPrincipal",
  "CODIGOZONA_PRINCIPAL",
  "CODIGO_ZONA_PRINCIPAL",
  "PREVENTISTA",
  "Preventista",
  "preventista",
];
const JEFE_KEYS = [
  "JefeVentas",
  "jefeVentas",
  "jefeventas",
  "JEFE_VENTAS",
  "Jefe_Ventas",
  "jefe_ventas",
  "Jefe de ventas",
  "JEFE DE VENTAS",
  "jefe de ventas",
  "Jefe_De_Ventas",
  "JEFE_DE_VENTAS",
  "jefe_comercial",
  "Jefe comercial",
  "JEFE COMERCIAL",
  "JefeComercial",
  "JEFE_COMERCIAL",
  "JefeVenta",
  "jefeVenta",
  "JEFEVENTA",
];
const PREVENTISTA_HINTS = ["codigozonaprincipal", "preventista"];
const PREVENTISTA_NAME_KEYS = [
  "nombre_preventista",
  "NOMBRE_PREVENTISTA",
  "NombrePreventista",
  "nombrePreventista",
  "preventista_nombre",
  "PREVENTISTA_NOMBRE",
  "Nombre preventista",
  "NOMBRE PREVENTISTA",
  "vendedor",
  "VENDEDOR",
];
const PREVENTISTA_NAME_HINTS = ["nombrepreventista", "preventistanombre", "vendedor"];
const JEFE_HINTS = ["jefeventas", "jefecomercial", "jefe", "comercial", "ventas"];
const PHONE_KEYS = [
  "telefono",
  "teléfono",
  "TELEFONO",
  "TELÉFONO",
  "celular",
  "CELULAR",
  "phone",
  "PHONE",
  "telefono_cliente",
  "TELEFONO_CLIENTE",
  "TelefonoCliente",
  "telefono1",
  "telefono_1",
  "TELEFONO1",
  "TELEFONO_1",
  "tel",
  "TEL",
  "celular1",
  "celular_1",
  "CELULAR1",
  "CELULAR_1",
  "movil",
  "MOVIL",
];
const PHONE_HINTS = ["telefono", "celular", "movil", "phone"];
const JEFE_PHONE_KEYS = [
  "telefono_jefe",
  "TELEFONO_JEFE",
  "telefono_jefe_comercial",
  "TELEFONO_JEFE_COMERCIAL",
  "telefono_jefe_ventas",
  "TELEFONO_JEFE_VENTAS",
  "celular_jefe",
  "CELULAR_JEFE",
  "celular_jefe_comercial",
  "CELULAR_JEFE_COMERCIAL",
  "celular_jefe_ventas",
  "CELULAR_JEFE_VENTAS",
  "TelefonoJefe",
  "TelefonoJefeComercial",
  "TelefonoJefeVentas",
  "CelularJefe",
  "CelularJefeComercial",
  "CelularJefeVentas",
];
const JEFE_PHONE_HINTS = ["telefonojefe", "celularjefe", "moviljefe", "phonejefe", "jefetelefono", "jefecelular"];
const PREVENTISTA_PHONE_KEYS = [
  "telefono_preventista",
  "TELEFONO_PREVENTISTA",
  "TelefonoPreventista",
  "telefonoPreventista",
  "celular_preventista",
  "CELULAR_PREVENTISTA",
  "CelularPreventista",
  "celularPreventista",
  "telefono_vendedor",
  "TELEFONO_VENDEDOR",
  "celular_vendedor",
  "CELULAR_VENDEDOR",
];
const PREVENTISTA_PHONE_HINTS = ["telefonopreventista", "celularpreventista", "movilpreventista", "phonepreventista", "telefonovendedor", "celularvendedor"];
const SCAN_PAGE_SIZE = 1000;
const MAX_SCAN_PAGES = 200;

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
      headers: supabaseAdminHeaders() ?? supabaseHeaders(),
      cache: "no-store",
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) continue;
    if (Array.isArray(body) && body[0]) return body[0] as ClienteRow;
  }

  return null;
}

async function findByScanningRows(codigo: string) {
  let fallback: ClienteRow | null = null;

  for (let page = 0; page < MAX_SCAN_PAGES; page += 1) {
    const from = page * SCAN_PAGE_SIZE;
    const to = from + SCAN_PAGE_SIZE - 1;
    const params = new URLSearchParams({ select: "*" });
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      headers: {
        ...(supabaseAdminHeaders() ?? supabaseHeaders()),
        Range: `${from}-${to}`,
      },
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(body)) return fallback;

    const rows = body as ClienteRow[];
    const direct = rows.find((row) => rowMatchesCodigo(row, codigo, true));
    if (direct) return direct;
    fallback ||= rows.find((row) => rowMatchesCodigo(row, codigo, false)) || null;
    if (rows.length < SCAN_PAGE_SIZE) return fallback;
  }

  return fallback;
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
    com: valueByKnownKeys(row, COM_KEYS) || valueByHints(row, COM_HINTS),
    jefeComercial: valueByKnownKeys(row, JEFE_KEYS) || valueByHints(row, JEFE_HINTS),
    preventista: valueByKnownKeys(row, PREVENTISTA_KEYS) || valueByHints(row, PREVENTISTA_HINTS),
    preventistaNombre: valueByKnownKeys(row, PREVENTISTA_NAME_KEYS) || valueByHints(row, PREVENTISTA_NAME_HINTS),
    telefono: valueByKnownKeys(row, PHONE_KEYS) || valueByPhoneHints(row, PHONE_HINTS),
    telefonoJefeComercial: valueByKnownKeys(row, JEFE_PHONE_KEYS) || valueByPhoneHints(row, JEFE_PHONE_HINTS),
    telefonoPreventista: valueByKnownKeys(row, PREVENTISTA_PHONE_KEYS) || valueByPhoneHints(row, PREVENTISTA_PHONE_HINTS),
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

function valueByPhoneHints(row: ClienteRow, hints: string[]) {
  for (const [key, value] of Object.entries(row)) {
    if (!isPresent(value)) continue;

    const normalizedKey = normalizeText(key);
    if (!hints.some((hint) => normalizedKey.includes(normalizeText(hint)))) continue;

    const text = String(value).trim();
    const digits = text.replace(/\D/g, "");
    if (digits.length < 7) continue;
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
