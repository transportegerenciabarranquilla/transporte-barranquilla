import { scopeQuery } from "../../lib/adminScope";
import { NextResponse } from "next/server";
import type { ModulacionRegistro } from "../../lib/modulacionStorage";
import { writeAuditLog } from "../../lib/auditLog";
import { getAuthenticatedSession } from "../../lib/authServer";
import { isOperationalContractor, normalizeContractorName } from "../../lib/contractors";
import { cachedJsonFetch, clearServerCache } from "../../lib/serverCache";
import { supabaseAdminHeaders, supabaseError, supabaseHeaders, supabaseReadHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "modulaciones_ruta";
const SEGUIMIENTO_TABLE = "seguimiento_vehiculos";
// Una modulacion se consulta inmediatamente despues de guardarla. Mantener
// esta respuesta en cache hacia que el formulario mostrara el registro y la
// siguiente lectura volviera a una lista vacia durante 45 segundos.
const LIST_CACHE_TTL_MS = 0;
const LIST_PAGE_SIZE = 1_000;
const LIST_SELECT =
  "contractor,id:data->>id,contratista:data->>contratista,dt:data->>dt,fechaDespacho:data->>fechaDespacho,fechaDt:data->>fechaDt,codigoCliente:data->>codigoCliente,nombreCliente:data->>nombreCliente,telefonoCliente:data->>telefonoCliente,com:data->>com,jefeComercial:data->>jefeComercial,telefonoJefeComercial:data->>telefonoJefeComercial,preventista:data->>preventista,preventistaNombre:data->>preventistaNombre,telefonoPreventista:data->>telefonoPreventista,totalCajas:data->>totalCajas,cajasGestionadas:data->>cajasGestionadas,gestionCompletadaAt:data->>gestionCompletadaAt,persona:data->>persona,personaNombre:data->>personaNombre,causal:data->>causal,origenReubicacion:data->>origenReubicacion,comentario:data->>comentario,comentarioModulador:data->>comentarioModulador,imagenNombre:data->>imagenNombre,createdAt:data->>createdAt";

export async function GET() {
  try {
    const session = await getAuthenticatedSession({ allowSiteAdmin: true });
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });

    const params = new URLSearchParams(
      session.isAdmin
        ? { select: LIST_SELECT, order: "updated_at.desc" }
        // No filtramos por el texto de contractor en PostgREST. Las filas de
        // HL existen con las variantes "HL Logistica" y "HL Logisticos";
        // ese filtro exacto devolvia cero aunque Supabase acabara de aceptar
        // el insert. RLS limita primero las filas que el usuario puede leer y
        // abajo aplicamos el alcance canonico de la contratista.
        : { select: LIST_SELECT, order: "updated_at.desc" },
    );
    const rows: ModulacionListRow[] = [];
    scopeQuery(params, session);
    const headers = supabaseReadHeaders(session.accessToken);
    for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
      const pageParams = new URLSearchParams(params);
      pageParams.set("limit", String(LIST_PAGE_SIZE));
      pageParams.set("offset", String(offset));

    const url = supabaseRest(TABLE, `?${pageParams.toString()}`);
      const page = await cachedJsonFetch<ModulacionListRow[]>(
        `supabase:${TABLE}:list:${session.isAdmin ? "admin" : session.contractor}:${offset}:${url}`,
        LIST_CACHE_TTL_MS,
        url,
        { headers },
      );
      rows.push(...page);
      if (page.length < LIST_PAGE_SIZE) break;
    }
    return NextResponse.json({
      records: rows
        .map((row) => fromListRow(row))
        .filter((record) => session.isAdmin || normalizeContractorName(record.contratista) === normalizeContractorName(session.contractor)),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando modulaciones." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (session?.isAdmin) return NextResponse.json({ error: "El administrador solo consulta las modulaciones globales." }, { status: 403 });
    const { records } = (await request.json()) as { records: ModulacionRegistro[] };
    if (!Array.isArray(records)) return NextResponse.json({ error: "records debe ser una lista." }, { status: 400 });

    const isPublicSubmission = !session && records.length === 1 && Boolean(records[0]?.contratista);
    const contractor = isPublicSubmission ? records[0]?.contratista : session?.contractor || records[0]?.contratista;
    if (!isOperationalContractor(contractor)) {
      return NextResponse.json({ error: "Contratista no válido." }, { status: 400 });
    }
    if (records.some((record) => record.contratista && normalizeContractorName(record.contratista) !== normalizeContractorName(contractor))) {
      return NextResponse.json({ error: `Solo puedes guardar modulaciones de ${contractor}.` }, { status: 403 });
    }
    if (isPublicSubmission) {
      const dtValidationError = await validatePublicDt(contractor, records[0]);
      if (dtValidationError) return NextResponse.json({ error: dtValidationError }, { status: 400 });
    }

    const existingById = !isPublicSubmission && session
      ? await readExistingModulaciones(session.accessToken, contractor, records.map((record) => record.id))
      : new Map<string, ModulacionRegistro>();
    const rows = records.map((record) => ({
      modulation_id: record.id,
      contractor,
      data: restoreExistingImage({ ...record, contratista: contractor }, existingById.get(record.id)),
      updated_at: new Date().toISOString(),
    }));
    const response = await fetch(supabaseRest(TABLE, isPublicSubmission ? "" : "?on_conflict=modulation_id"), {
      method: "POST",
      headers: getWriteHeaders(session?.accessToken, isPublicSubmission),
      body: JSON.stringify(rows),
      cache: "no-store",
    });
    if (!response.ok) {
      const errorMessage = await supabaseError(response);
      if (/permission denied/i.test(errorMessage) && !supabaseAdminHeaders()) {
        return NextResponse.json(
          {
            error:
              "Supabase nego permisos para modulaciones_ruta. Agrega SUPABASE_SERVICE_ROLE_KEY en el servidor o ejecuta la migracion de permisos/RLS para anon.",
          },
          { status: response.status },
        );
      }

      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }
    clearServerCache(`supabase:${TABLE}:`);
    clearServerCache("supabase:people-summary:");
    clearServerCache("supabase:admin-seguimiento:");

    await writeAuditLog({
      action: "modulacion_guardada",
      contractor,
      details: {
        records: records.length,
        dts: records.map((record) => record.dt).slice(0, 30),
        clientes: records.map((record) => record.codigoCliente).slice(0, 30),
      },
      module: "modulacion",
      recordId: records.map((record) => record.id).slice(0, 5).join(","),
      request,
      session,
    });

    if (isPublicSubmission || !session) return NextResponse.json({ records: rows.map((row) => toListRecord(row.data)) });

    return NextResponse.json({ records: rows.map((row) => toListRecord(row.data)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando modulaciones." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
    if (session.isAdmin) return NextResponse.json({ error: "El administrador solo consulta las modulaciones globales." }, { status: 403 });

    const { ids } = (await request.json()) as { ids?: string[] };
    const cleanIds = Array.from(new Set((ids ?? []).map((id) => String(id ?? "").trim()).filter(Boolean)));
    if (!cleanIds.length) return NextResponse.json({ error: "Debes enviar al menos una modulacion para eliminar." }, { status: 400 });

    const idFilter = cleanIds.map((id) => `"${id.replaceAll('"', '\\"')}"`).join(",");
    const params = new URLSearchParams({ contractor: modulationContractorFilter(session.contractor) });
    params.set("modulation_id", `in.(${idFilter})`);

    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      method: "DELETE",
      headers: supabaseUserHeaders(session.accessToken, { Prefer: "return=minimal" }),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    clearServerCache(`supabase:${TABLE}:`);
    clearServerCache("supabase:people-summary:");
    clearServerCache("supabase:admin-seguimiento:");

    await writeAuditLog({
      action: "modulacion_eliminada",
      contractor: session.contractor,
      details: { ids: cleanIds },
      module: "modulacion",
      recordId: cleanIds.slice(0, 5).join(","),
      request,
      session,
    });

    return NextResponse.json({ ok: true, ids: cleanIds });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error eliminando modulaciones." }, { status: 500 });
  }
}

function getWriteHeaders(accessToken: string | undefined, isPublicSubmission: boolean) {
  const prefer = isPublicSubmission ? { Prefer: "return=minimal" } : { Prefer: "resolution=merge-duplicates,return=minimal" };
  if (isPublicSubmission) return supabaseAdminHeaders(prefer) || supabaseHeaders(prefer);
  return supabaseAdminHeaders(prefer) || (accessToken ? supabaseUserHeaders(accessToken, prefer) : supabaseHeaders(prefer));
}

function modulationContractorFilter(contractor: string) {
  return normalizeContractorName(contractor) === "hllogisticos"
    ? "in.(\"HL Logisticos\",\"HL Logistica\",\"HL Logísticos\")"
    : `eq.${contractor}`;
}

async function readExistingModulaciones(accessToken: string, contractor: string, ids: string[]) {
  if (!ids.length) return new Map<string, ModulacionRegistro>();

  const idFilter = ids.map((id) => `"${id.replaceAll('"', '\\"')}"`).join(",");
  const params = new URLSearchParams({ select: "modulation_id,data", contractor: modulationContractorFilter(contractor) });
  params.set("modulation_id", `in.(${idFilter})`);
  const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
    headers: supabaseUserHeaders(accessToken),
    cache: "no-store",
  });
  if (!response.ok) return new Map<string, ModulacionRegistro>();

  const rows = (await response.json().catch(() => [])) as { modulation_id: string; data: ModulacionRegistro }[];
  return new Map(rows.map((row) => [row.modulation_id, row.data]));
}

function toListRecord(record: ModulacionRegistro) {
  return {
    ...record,
    imagenVista: "",
  };
}

type ModulacionListRow = Partial<Record<keyof ModulacionRegistro, unknown>> & { contractor?: string };

function fromListRow(row: ModulacionListRow): ModulacionRegistro {
  return {
    id: readString(row.id),
    contratista: readString(row.contractor) || readString(row.contratista),
    dt: readString(row.dt),
    fechaDespacho: readString(row.fechaDespacho),
    fechaDt: readString(row.fechaDt),
    codigoCliente: readString(row.codigoCliente),
    nombreCliente: readString(row.nombreCliente),
    telefonoCliente: readString(row.telefonoCliente),
    com: readString(row.com),
    jefeComercial: readString(row.jefeComercial),
    telefonoJefeComercial: readString(row.telefonoJefeComercial),
    preventista: readString(row.preventista),
    preventistaNombre: readString(row.preventistaNombre),
    telefonoPreventista: readString(row.telefonoPreventista),
    totalCajas: readString(row.totalCajas),
    cajasGestionadas: readString(row.cajasGestionadas),
    gestionCompletadaAt: readString(row.gestionCompletadaAt) || undefined,
    persona: readString(row.persona),
    personaNombre: readString(row.personaNombre),
    causal: readString(row.causal),
    origenReubicacion: normalizeOrigenReubicacion(row.origenReubicacion),
    comentario: readString(row.comentario),
    comentarioModulador: readString(row.comentarioModulador),
    imagenNombre: readString(row.imagenNombre),
    imagenVista: "",
    createdAt: readString(row.createdAt),
  };
}

function readString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeOrigenReubicacion(value: unknown): ModulacionRegistro["origenReubicacion"] {
  const normalized = readString(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized === "logistica") return "Logística";
  if (normalized === "ventas") return "Ventas";
  return undefined;
}

async function validatePublicDt(contractor: string, record: ModulacionRegistro | undefined) {
  const dt = normalizeDt(record?.dt);
  if (!dt) return "Ingresa un DT valido.";

  const params = new URLSearchParams({
   select: "data",
    contractor: `eq.${contractor}`,
    "data->>transporte": `ilike.*${dt}*`,
   order: "updated_at.desc",
    limit: "50",
  });
  const response = await fetch(supabaseRest(SEGUIMIENTO_TABLE, `?${params.toString()}`), {
    headers: supabaseAdminHeaders() ?? supabaseHeaders(),
    cache: "no-store",
  });
  if (!response.ok) return "No se pudo validar el DT antes de guardar.";

  const rows = (await response.json().catch(() => [])) as {
    data?: { transporte?: string | number; fechaDespacho?: string; fechaDt?: string; date?: string; createdAt?: string };
  }[];
  const hasValidDt = rows.some((row) => {
    const data = row.data;
    if (normalizeDt(data?.transporte) !== dt) return false;
    return [data?.fechaDespacho, data?.fechaDt, data?.date, data?.createdAt].some((date) => toBogotaDateKey(date) === getTodayKey());
  });
  return hasValidDt ? "" : "El DT no esta validado o no esta cargado para hoy.";
}

function normalizeDt(value: string | number | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/^DT-?/i, "")
    .replace(/^(?:R\d+)?S(?=\d)/i, "")
    .replace(/\D/g, "");
}

function getTodayKey() {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Bogota",
    year: "numeric",
  }).formatToParts(new Date());
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function toBogotaDateKey(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Bogota",
    year: "numeric",
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

function restoreExistingImage(record: ModulacionRegistro, existing: ModulacionRegistro | undefined) {
  if (record.imagenVista || !existing?.imagenVista) return record;

  return {
    ...record,
    imagenVista: existing.imagenVista,
    imagenNombre: record.imagenNombre || existing.imagenNombre,
  };
}
