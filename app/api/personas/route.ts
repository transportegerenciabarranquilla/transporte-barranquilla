import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../lib/authServer";
import { canAccessContractor } from "../../lib/adminScope";
import { cachedJsonFetch } from "../../lib/serverCache";
import { contractorLabel, normalizeContractorName } from "../../lib/contractors";
import { isRrRole } from "../../lib/rrRole";
import { supabaseAdminHeaders, supabaseHeaders, supabaseRest } from "../../lib/supabaseServer";

const PEOPLE_CACHE_TTL_MS = 10 * 60 * 1000;
const PEOPLE_SELECT = "CC,NOMBRE,CARGO,CONTRATISTA,CELULAR";
const PUBLIC_PERSON_SELECT = "NOMBRE,CARGO,CONTRATISTA";

type PersonaRow = {
  CC?: string | number;
  NOMBRE?: string;
  CARGO?: string;
  CONTRATISTA?: string;
  CELULAR?: string | number;
};

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const rawCc = searchParams.get("cc");
    let contractor = searchParams.get("contratista")?.trim();
    const cargo = searchParams.get("cargo")?.trim();
    const query = searchParams.get("q")?.trim();
    const shouldListAll = searchParams.get("listar") === "1" || searchParams.get("all") === "1";
    const cc = rawCc?.replace(/\D/g, "").trim();

    if (!cc) {
      if (query || shouldListAll || cargo) {
        const session = await getAuthenticatedSession({ allowSiteAdmin: true });
        if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
        if (!session.isAdmin && !session.isPeople) contractor = session.contractor;
        if (session.isSiteAdmin && (!contractor || !canAccessContractor(session, contractor))) {
          return NextResponse.json({ error: "Contratista no autorizado." }, { status: 403 });
        }
      }
      if (query && query.length < 3) return NextResponse.json({ personas: [] });
      if (query) return searchPersonas(query, contractor);
      if (shouldListAll) return listPersonas(contractor);
      if (cargo) return listPersonasByCargo(cargo, contractor);
      return NextResponse.json({ persona: null });
    }

    const session = await getAuthenticatedSession({ allowSiteAdmin: true });
    if (session && !session.isAdmin && !session.isPeople) {
      if (contractor && !sameContractor(contractor, session.contractor)) {
        return NextResponse.json({
          error: `Tu sesión corresponde a ${contractorLabel(session.contractor)}, pero seleccionaste ${contractorLabel(contractor)}. Selecciona el contratista de tu cuenta o inicia sesión con la cuenta correspondiente.`,
        }, { status: 403 });
      }
      contractor = session.contractor;
    }
    if (session?.isSiteAdmin && (!contractor || !canAccessContractor(session, contractor))) {
      return NextResponse.json({ error: "Contratista no autorizado." }, { status: 403 });
    }
    const params = new URLSearchParams({
      select: session ? PEOPLE_SELECT : PUBLIC_PERSON_SELECT,
      CC: `eq.${cc}`,
      limit: "20",
    });
    // Una misma contratista puede venir de la tabla maestra con variantes
    // históricas (por ejemplo, "HL Logistica" y "HL Logisticos"). Buscar por
    // cédula y comparar el nombre canónico evita rechazar a la persona.
    const rows = await readPersonas(params, true);
    const persona = contractor
      ? rows.find((row) => sameContractor(row.CONTRATISTA, contractor))
      : rows[0];
    const normalizedPersona = persona
      ? { ...persona, CONTRATISTA: contractorLabel(persona.CONTRATISTA) || persona.CONTRATISTA }
      : null;
    const publicPersona = !session && normalizedPersona
      ? contractor
        ? { NOMBRE: normalizedPersona.NOMBRE, CARGO: normalizedPersona.CARGO, CONTRATISTA: normalizedPersona.CONTRATISTA }
        : { NOMBRE: normalizedPersona.NOMBRE }
      : normalizedPersona;
    return NextResponse.json({ persona: publicPersona, isRR: isRrRole(normalizedPersona?.CARGO) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error buscando la persona." },
      { status: 500 },
    );
  }
}

async function searchPersonas(query: string, contractor: string | undefined) {
  const cleanDigits = query.replace(/\D/g, "");
  const cleanQuery = sanitizeSearchValue(query);
  const orFilters = [`NOMBRE.ilike.*${cleanQuery}*`];
  if (cleanDigits) orFilters.push(`CC.ilike.*${cleanDigits}*`);

  const params = new URLSearchParams({
    select: PEOPLE_SELECT,
    or: `(${orFilters.join(",")})`,
    order: "NOMBRE.asc",
    limit: "30",
  });
  if (contractor) params.set("CONTRATISTA", `eq.${contractor}`);

  return NextResponse.json({ personas: await readPersonas(params) });
}

async function listPersonas(contractor: string | undefined) {
  const params = new URLSearchParams({
    select: PEOPLE_SELECT,
    order: "NOMBRE.asc",
    limit: "100",
  });
  if (contractor) params.set("CONTRATISTA", `eq.${contractor}`);

  return NextResponse.json({ personas: await readPersonas(params) });
}

async function listPersonasByCargo(cargo: string, contractor: string | undefined) {
  const normalizedCargo = normalizeText(cargo);
  const params = new URLSearchParams({
    select: PEOPLE_SELECT,
    order: "NOMBRE.asc",
    limit: "100",
  });
  const shouldFilterJornadaLocally = normalizedCargo.includes("jornada") || normalizedCargo.includes("relev");
  if (shouldFilterJornadaLocally) {
    params.set("or", "(CARGO.ilike.*jornada*,CARGO.ilike.*relev*)");
  } else {
    params.set("CARGO", `ilike.*${sanitizeSearchValue(cargo)}*`);
  }
  if (contractor) params.set("CONTRATISTA", `eq.${contractor}`);

  const personas = await readPersonas(params);
  const filteredPersonas = shouldFilterJornadaLocally
    ? personas.filter((persona) => {
        const cargoText = normalizeText(persona?.CARGO);
        return cargoText.includes("jornada laboral") || cargoText.includes("jornada") || cargoText.includes("relev") || cargoText.includes("relevo");
      })
    : personas;

  return NextResponse.json({ personas: filteredPersonas });
}

async function readPersonas(params: URLSearchParams, fresh = false) {
  const url = supabaseRest("transporte_barranquilla", `?${params.toString()}`);
  if (fresh) {
    const response = await fetch(url, { headers: supabaseAdminHeaders() ?? supabaseHeaders(), cache: "no-store" });
    if (!response.ok) throw new Error(`No se pudo consultar personal (${response.status}).`);
    return await response.json() as PersonaRow[];
  }
  return cachedJsonFetch<PersonaRow[]>(`supabase:personas:${url}`, PEOPLE_CACHE_TTL_MS, url, {
    headers: supabaseAdminHeaders() ?? supabaseHeaders(),
  });
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sameContractor(left: unknown, right: unknown) {
  return normalizeContractorName(contractorLabel(String(left ?? ""))) === normalizeContractorName(contractorLabel(String(right ?? "")));
}

function sanitizeSearchValue(value: string) {
  return value.replace(/[,*()]/g, " ").trim();
}
