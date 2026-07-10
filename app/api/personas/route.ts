import { NextResponse } from "next/server";
import { cachedJsonFetch } from "../../lib/serverCache";
import { supabaseAdminHeaders, supabaseHeaders, supabaseRest } from "../../lib/supabaseServer";

const PEOPLE_CACHE_TTL_MS = 10 * 60 * 1000;
const PEOPLE_SELECT = "CC,NOMBRE,CARGO,CONTRATISTA";

type PersonaRow = {
  CC?: string | number;
  NOMBRE?: string;
  CARGO?: string;
  CONTRATISTA?: string;
};

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const rawCc = searchParams.get("cc");
    const contractor = searchParams.get("contratista")?.trim();
    const cargo = searchParams.get("cargo")?.trim();
    const query = searchParams.get("q")?.trim();
    const shouldListAll = searchParams.get("listar") === "1" || searchParams.get("all") === "1";
    const cc = rawCc?.replace(/\D/g, "").trim();

    if (!cc) {
      if (query) return searchPersonas(query, contractor);
      if (shouldListAll) return listPersonas(contractor);
      if (cargo) return listPersonasByCargo(cargo, contractor);
      return NextResponse.json({ persona: null });
    }

    const params = new URLSearchParams({
      select: PEOPLE_SELECT,
      CC: `eq.${cc}`,
      limit: "1",
    });
    if (contractor) params.set("CONTRATISTA", `eq.${contractor}`);

    const rows = await readPersonas(params);
    return NextResponse.json({ persona: rows[0] ?? null });
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

function readPersonas(params: URLSearchParams) {
  const url = supabaseRest("transporte_barranquilla", `?${params.toString()}`);
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

function sanitizeSearchValue(value: string) {
  return value.replace(/[,*()]/g, " ").trim();
}
