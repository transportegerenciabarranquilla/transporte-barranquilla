import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { contractorLabel, isOperationalContractor, normalizeContractorName } from "../../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

type PeopleProfile = {
  cc: string;
  nombre?: string;
  cargo?: string;
  contratista: string;
  photo?: string;
  isLocal?: boolean;
  removed?: boolean;
};

type ProfileRow = {
  profile_id: string;
  contractor?: string;
  cc?: string;
  data: PeopleProfile;
};

const TABLE = "people_profiles";

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const params = new URLSearchParams({ select: "profile_id,contractor,cc,data", order: "updated_at.desc" });
    params.set("and", "(profile_id.not.like.nps:*,profile_id.not.like.attendance:*)");
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), { headers, cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });

    const rows = (await response.json().catch(() => [])) as ProfileRow[];
    return NextResponse.json({ profiles: rows.filter(isPersonProfile).map((row) => ({ ...row.data, contratista: row.contractor || row.data.contratista })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando perfiles." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const { profiles } = (await request.json()) as { profiles?: PeopleProfile[] };
    if (!Array.isArray(profiles)) return NextResponse.json({ error: "profiles debe ser una lista." }, { status: 400 });

    const rows = Array.from(new Map(profiles.filter((profile) => profile && isOperationalContractor(profile.contratista) && /^\d+$/.test(String(profile.cc || "").replace(/\D/g, ""))).map((profile) => {
      const normalized = normalizeProfile(profile);
      const row = {
        profile_id: personKey(normalized),
        contractor: normalized.contratista,
        cc: normalized.cc,
        data: normalized,
        updated_at: new Date().toISOString(),
      };
      return [row.profile_id, row] as const;
    })).values());

    if (rows.length) {
      const response = await fetch(supabaseRest(TABLE, "?on_conflict=profile_id"), {
        method: "POST",
        headers:
          supabaseAdminHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }) ??
          supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(rows),
        cache: "no-store",
      });
      if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    }

    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const params = new URLSearchParams({ select: "profile_id,contractor,cc,data", order: "updated_at.desc" });
    params.set("and", "(profile_id.not.like.nps:*,profile_id.not.like.attendance:*)");
    const savedResponse = await fetch(supabaseRest(TABLE, `?${params.toString()}`), { headers, cache: "no-store" });
    if (!savedResponse.ok) return NextResponse.json({ error: await supabaseError(savedResponse) }, { status: savedResponse.status });

    const savedRows = (await savedResponse.json().catch(() => [])) as ProfileRow[];
    return NextResponse.json({ profiles: savedRows.filter(isPersonProfile).map((row) => ({ ...row.data, contratista: row.contractor || row.data.contratista })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando perfiles." }, { status: 500 });
  }
}

function normalizeProfile(profile: PeopleProfile): PeopleProfile {
  return {
    ...profile,
    cc: String(profile.cc || "").replace(/\D/g, ""),
    contratista: contractorLabel(profile.contratista),
    nombre: String(profile.nombre || "").trim(),
    cargo: String(profile.cargo || "").trim(),
  };
}

function personKey(profile: Pick<PeopleProfile, "cc" | "contratista">) {
  return `${normalizeContractorName(profile.contratista)}:${String(profile.cc || "").replace(/\D/g, "")}`;
}

function isPersonProfile(row: ProfileRow) {
  const cc = String(row.cc || row.data?.cc || "").replace(/\D/g, "");
  const contratista = row.contractor || row.data?.contratista || "";
  return isOperationalContractor(contratista) && /^\d+$/.test(cc) && row.profile_id === personKey({ cc, contratista });
}
