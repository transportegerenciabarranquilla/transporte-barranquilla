import { NextResponse } from "next/server";
import type { ModulacionRegistro } from "../../lib/modulacionStorage";
import { getAuthenticatedSession } from "../../lib/authServer";
import { normalizeContractorName } from "../../lib/contractors";
import { supabaseError, supabaseHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";

const TABLE = "modulaciones_ruta";
const PUBLIC_CONTRACTORS = ["logisticos", "puntocorona", "surticervezas"];
const LIST_SELECT =
  "contractor,id:data->>id,contratista:data->>contratista,dt:data->>dt,fechaDespacho:data->>fechaDespacho,fechaDt:data->>fechaDt,codigoCliente:data->>codigoCliente,nombreCliente:data->>nombreCliente,telefonoCliente:data->>telefonoCliente,com:data->>com,jefeComercial:data->>jefeComercial,telefonoJefeComercial:data->>telefonoJefeComercial,preventista:data->>preventista,preventistaNombre:data->>preventistaNombre,telefonoPreventista:data->>telefonoPreventista,totalCajas:data->>totalCajas,cajasGestionadas:data->>cajasGestionadas,persona:data->>persona,personaNombre:data->>personaNombre,causal:data->>causal,comentario:data->>comentario,comentarioModulador:data->>comentarioModulador,imagenNombre:data->>imagenNombre,createdAt:data->>createdAt";

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });

    const params = new URLSearchParams(
      session.isAdmin
        ? { select: LIST_SELECT, order: "updated_at.desc" }
        : { select: LIST_SELECT, contractor: `eq.${session.contractor}`, order: "updated_at.desc" },
    );
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      headers: supabaseUserHeaders(session.accessToken),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });

    const rows = (await response.json()) as ModulacionListRow[];
    return NextResponse.json({
      records: rows.map((row) => fromListRow(row)),
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
    if (!contractor || !PUBLIC_CONTRACTORS.includes(normalizeContractorName(contractor))) {
      return NextResponse.json({ error: "Contratista no válido." }, { status: 400 });
    }
    if (records.some((record) => record.contratista && normalizeContractorName(record.contratista) !== normalizeContractorName(contractor))) {
      return NextResponse.json({ error: `Solo puedes guardar modulaciones de ${contractor}.` }, { status: 403 });
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
    const response = await fetch(supabaseRest(TABLE, "?on_conflict=modulation_id"), {
      method: "POST",
      headers: !isPublicSubmission && session
        ? supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" })
        : supabaseHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(rows),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });

    if (isPublicSubmission || !session) return NextResponse.json({ records: rows.map((row) => toListRecord(row.data)) });

    return NextResponse.json({ records: rows.map((row) => toListRecord(row.data)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando modulaciones." }, { status: 500 });
  }
}

async function readExistingModulaciones(accessToken: string, contractor: string, ids: string[]) {
  if (!ids.length) return new Map<string, ModulacionRegistro>();

  const idFilter = ids.map((id) => `"${id.replaceAll('"', '\\"')}"`).join(",");
  const params = new URLSearchParams({ select: "modulation_id,data", contractor: `eq.${contractor}` });
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
    persona: readString(row.persona),
    personaNombre: readString(row.personaNombre),
    causal: readString(row.causal),
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

function restoreExistingImage(record: ModulacionRegistro, existing: ModulacionRegistro | undefined) {
  if (record.imagenVista || !existing?.imagenVista) return record;

  return {
    ...record,
    imagenVista: existing.imagenVista,
    imagenNombre: record.imagenNombre || existing.imagenNombre,
  };
}
