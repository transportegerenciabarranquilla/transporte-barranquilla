import { NextResponse } from "next/server";
import { supabaseAdminHeaders, supabaseHeaders, supabaseRest } from "../../lib/supabaseServer";

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
      select: "CC,NOMBRE,CARGO,CONTRATISTA",
      CC: `eq.${cc}`,
      limit: "1",
    });
    if (contractor) params.set("CONTRATISTA", `eq.${contractor}`);
    const response = await fetch(
      supabaseRest("transporte_barranquilla", `?${params.toString()}`),
      {
        headers: supabaseAdminHeaders() ?? supabaseHeaders(),
        cache: "no-store",
      }
    );
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            body?.message ||
            body?.error ||
            `Supabase respondió ${response.status}.`,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      persona: Array.isArray(body) ? body[0] ?? null : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error buscando la persona.",
      },
      { status: 500 }
    );
  }
}

async function searchPersonas(query: string, contractor: string | undefined) {
  const cleanDigits = query.replace(/\D/g, "");
  const cleanQuery = sanitizeSearchValue(query);
  const orFilters = [`NOMBRE.ilike.*${cleanQuery}*`];
  if (cleanDigits) orFilters.push(`CC.ilike.*${cleanDigits}*`);

  const params = new URLSearchParams({
    select: "CC,NOMBRE,CARGO,CONTRATISTA",
    or: `(${orFilters.join(",")})`,
    order: "NOMBRE.asc",
    limit: "30",
  });
  if (contractor) params.set("CONTRATISTA", `eq.${contractor}`);

  const response = await fetch(supabaseRest("transporte_barranquilla", `?${params.toString()}`), {
    headers: supabaseAdminHeaders() ?? supabaseHeaders(),
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          body?.message ||
          body?.error ||
          `Supabase respondiÃ³ ${response.status}.`,
      },
      { status: response.status },
    );
  }

  return NextResponse.json({ personas: Array.isArray(body) ? body : [] });
}

async function listPersonas(contractor: string | undefined) {
  const params = new URLSearchParams({
    select: "CC,NOMBRE,CARGO,CONTRATISTA",
    order: "NOMBRE.asc",
    limit: "100",
  });
  if (contractor) params.set("CONTRATISTA", `eq.${contractor}`);

  const response = await fetch(supabaseRest("transporte_barranquilla", `?${params.toString()}`), {
    headers: supabaseAdminHeaders() ?? supabaseHeaders(),
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          body?.message ||
          body?.error ||
          `Supabase respondiÃ³ ${response.status}.`,
      },
      { status: response.status },
    );
  }

  return NextResponse.json({ personas: Array.isArray(body) ? body : [] });
}

async function listPersonasByCargo(cargo: string, contractor: string | undefined) {
  const normalizedCargo = cargo
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const params = new URLSearchParams({
    select: "CC,NOMBRE,CARGO,CONTRATISTA",
    order: "NOMBRE.asc",
    limit: "100",
  });
  const shouldFilterJornadaLocally = normalizedCargo.includes("jornada") || normalizedCargo.includes("relev");
  if (shouldFilterJornadaLocally) {
    params.set("or", "(CARGO.ilike.*jornada*,CARGO.ilike.*relev*)");
  } else {
    params.set("CARGO", `ilike.*${cargo}*`);
  }
  if (contractor) params.set("CONTRATISTA", `eq.${contractor}`);

  const response = await fetch(supabaseRest("transporte_barranquilla", `?${params.toString()}`), {
    headers: supabaseAdminHeaders() ?? supabaseHeaders(),
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          body?.message ||
          body?.error ||
          `Supabase respondiÃ³ ${response.status}.`,
      },
      { status: response.status },
    );
  }

  const personas = Array.isArray(body) ? body : [];
  const filteredPersonas = shouldFilterJornadaLocally
    ? personas.filter((persona) => {
        const cargoText = normalizeText(persona?.CARGO);
        return cargoText.includes("jornada laboral") || cargoText.includes("jornada") || cargoText.includes("relev") || cargoText.includes("relevo");
      })
    : personas;

  return NextResponse.json({ personas: filteredPersonas });
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
