import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { isEffectiveRestEmail } from "../../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseRest } from "../../../lib/supabaseServer";

type FaceProfileRow = {
  document: string;
  person_name: string;
  descriptors: number[][];
  photo_data_url?: string | null;
  updated_at?: string;
};

const TABLE = "effective_rest_face_profiles";
const MAX_SAMPLES = 5;
const DESCRIPTOR_SIZE = 128;
const MAX_PHOTO_LENGTH = 700_000;

export async function GET() {
  const access = await authorize();
  if (access.response) return access.response;
  try {
    const params = new URLSearchParams({ select: "document,person_name,descriptors,updated_at", order: "person_name.asc", limit: "500" });
    const response = await fetch(supabaseRest(TABLE, `?${params}`), { headers: access.headers, cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    const rows = (await response.json().catch(() => [])) as FaceProfileRow[];
    return NextResponse.json({ profiles: rows.map(publicProfile) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron consultar los rostros." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const access = await authorize();
  if (access.response) return access.response;
  try {
    const body = (await request.json()) as { document?: string; name?: string; descriptor?: unknown; photo?: string };
    const document = String(body.document || "").replace(/\D/g, "");
    const name = String(body.name || "").trim().slice(0, 180);
    const descriptor = normalizeDescriptor(body.descriptor);
    const photo = String(body.photo || "");
    if (!/^\d{1,15}$/.test(document) || !name || !descriptor) return NextResponse.json({ error: "La cédula, el nombre y la muestra facial son obligatorios." }, { status: 400 });
    if (photo && (!photo.startsWith("data:image/jpeg;base64,") || photo.length > MAX_PHOTO_LENGTH)) return NextResponse.json({ error: "La foto de referencia no tiene un formato o tamaño válido." }, { status: 400 });

    const query = new URLSearchParams({ select: "document,person_name,descriptors", document: `eq.${document}`, limit: "1" });
    const currentResponse = await fetch(supabaseRest(TABLE, `?${query}`), { headers: access.headers, cache: "no-store" });
    if (!currentResponse.ok) return NextResponse.json({ error: await supabaseError(currentResponse) }, { status: currentResponse.status });
    const current = ((await currentResponse.json().catch(() => [])) as FaceProfileRow[])[0];
    const descriptors = [...normalizeDescriptors(current?.descriptors), descriptor].slice(-MAX_SAMPLES);
    const row = { document, person_name: name, descriptors, ...(photo ? { photo_data_url: photo } : {}), updated_at: new Date().toISOString() };
    const saveResponse = await fetch(supabaseRest(TABLE, "?on_conflict=document"), {
      method: "POST",
      headers: { ...access.headers, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(row),
      cache: "no-store",
    });
    if (!saveResponse.ok) return NextResponse.json({ error: await supabaseError(saveResponse) }, { status: saveResponse.status });
    const saved = ((await saveResponse.json().catch(() => [])) as FaceProfileRow[])[0] || row;
    return NextResponse.json({ profile: publicProfile(saved) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar el rostro." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const access = await authorize();
  if (access.response) return access.response;
  try {
    const body = (await request.json()) as { documents?: string[] };
    const documents = Array.from(new Set((body.documents || []).map((value) => String(value).replace(/\D/g, "")).filter((value) => /^\d{1,15}$/.test(value))));
    if (!documents.length) return NextResponse.json({ error: "No se indicó ningún perfil facial." }, { status: 400 });
    for (const document of documents) {
      const params = new URLSearchParams({ document: `eq.${document}` });
      const response = await fetch(supabaseRest(TABLE, `?${params}`), { method: "DELETE", headers: access.headers, cache: "no-store" });
      if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    }
    return NextResponse.json({ deleted: documents.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron borrar los rostros." }, { status: 500 });
  }
}

async function authorize() {
  const session = await getAuthenticatedSession({ allowEffectiveRest: true });
  if (!session) return { response: NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 }), headers: null };
  if (!isEffectiveRestEmail(session.email)) return { response: NextResponse.json({ error: "No autorizado." }, { status: 403 }), headers: null };
  const headers = supabaseAdminHeaders();
  if (!headers) return { response: NextResponse.json({ error: "Falta configurar el acceso privado a Supabase." }, { status: 503 }), headers: null };
  return { response: null, headers };
}

function normalizeDescriptor(value: unknown) {
  if (!Array.isArray(value) || value.length !== DESCRIPTOR_SIZE) return null;
  const numbers = value.map(Number);
  return numbers.every(Number.isFinite) ? numbers : null;
}

function normalizeDescriptors(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeDescriptor).filter((item): item is number[] => Boolean(item)).slice(-MAX_SAMPLES);
}

function publicProfile(row: FaceProfileRow) {
  return { document: String(row.document || ""), name: String(row.person_name || ""), descriptors: normalizeDescriptors(row.descriptors), updatedAt: row.updated_at || "" };
}
