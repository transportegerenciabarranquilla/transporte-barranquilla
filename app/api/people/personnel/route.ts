import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { contractorLabel, isOperationalContractor, normalizeContractorName } from "../../../lib/contractors";
import { clearServerCache } from "../../../lib/serverCache";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

const TABLE = "transporte_barranquilla";
type InputPerson = { cc?: unknown; nombre?: unknown; cargo?: unknown; contratista?: unknown; celular?: unknown; correo?: unknown };
type Person = { cc: string; nombre: string; cargo: string; contratista: string; celular: string; correo: string };
type ExistingRow = { CC: string; CONTRATISTA: string };

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!isOperationalContractor(session.contractor)) return NextResponse.json({ error: "Módulo exclusivo de contratistas." }, { status: 403 });
    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const rows: Array<ExistingRow & { NOMBRE: string; CARGO: string; CELULAR?: string; CORREO?: string }> = [];
    for (let offset = 0; ; offset += 1000) {
      const params = new URLSearchParams({ select: "CC,NOMBRE,CARGO,CONTRATISTA,CELULAR,CORREO", order: "NOMBRE.asc", limit: "1000", offset: String(offset) });
      const response = await fetch(supabaseRest(TABLE, `?${params}`), { headers, cache: "no-store" });
      if (!response.ok) throw new Error(await supabaseError(response));
      const page = (await response.json()) as typeof rows;
      rows.push(...page.filter((row) => normalizeContractorName(contractorLabel(row.CONTRATISTA)) === normalizeContractorName(session.contractor)));
      if (page.length < 1000) break;
    }
    return NextResponse.json({ contractor: session.contractor, people: rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo cargar el personal." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin && !isOperationalContractor(session.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const body = await request.json() as { people?: InputPerson[] };
    if (!Array.isArray(body.people) || body.people.length < 1 || body.people.length > 100) {
      return NextResponse.json({ error: "Envía entre 1 y 100 personas por lote." }, { status: 400 });
    }
    const people = new Map<string, Person>();
    for (const [index, input] of body.people.entries()) {
      const cc = String(input.cc ?? "").replace(/\D/g, "");
      const nombre = String(input.nombre ?? "").trim();
      const cargo = String(input.cargo ?? "").trim();
      const contratista = contractorLabel(String(input.contratista ?? ""));
      const celular = String(input.celular ?? "").trim();
      const correo = String(input.correo ?? "").trim();
      if (!/^\d{5,15}$/.test(cc) || !/\p{L}/u.test(nombre) || !isOperationalContractor(contratista)) {
        return NextResponse.json({ error: `Fila ${index + 1}: cédula, nombre o contratista inválidos.` }, { status: 400 });
      }
      if (!session.isPeople && !session.isAdmin && normalizeContractorName(contratista) !== normalizeContractorName(session.contractor)) {
        return NextResponse.json({ error: `Fila ${index + 1}: solo puedes guardar personal de ${session.contractor}.` }, { status: 403 });
      }
      people.set(`${normalizeContractorName(contratista)}:${cc}`, { cc, nombre, cargo, contratista, celular, correo });
    }

    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const uniquePeople = Array.from(people.values());
    const ids = Array.from(new Set(uniquePeople.map((person) => person.cc)));
    const params = new URLSearchParams({ select: "CC,CONTRATISTA", CC: `in.(${ids.map((id) => `"${id}"`).join(",")})`, limit: "1000" });
    const lookup = await fetch(supabaseRest(TABLE, `?${params}`), { headers, cache: "no-store" });
    if (!lookup.ok) throw new Error(await supabaseError(lookup));
    const existingRows = (await lookup.json()) as ExistingRow[];
    const updates: Array<{ person: Person; existing: ExistingRow }> = [];
    const inserts: Record<string, string>[] = [];
    for (const person of uniquePeople) {
      const existing = existingRows.find((row) => row.CC === person.cc && normalizeContractorName(contractorLabel(row.CONTRATISTA)) === normalizeContractorName(person.contratista));
      if (existing) updates.push({ person, existing });
      else inserts.push({ CC: person.cc, NOMBRE: person.nombre, CARGO: person.cargo, CONTRATISTA: person.contratista, CELULAR: person.celular, CORREO: person.correo });
    }
    let updated = 0;
    for (let index = 0; index < updates.length; index += 10) {
      const results = await Promise.all(updates.slice(index, index + 10).map(async ({ person, existing }) => {
        const filters = new URLSearchParams({ CC: `eq.${person.cc}`, CONTRATISTA: `eq.${existing.CONTRATISTA}` });
        const response = await fetch(supabaseRest(TABLE, `?${filters}`), {
          method: "PATCH", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify(personValues(person)), cache: "no-store",
        });
        if (!response.ok) return `${person.cc}: ${await supabaseError(response)}`;
        const changed = await response.json() as ExistingRow[];
        return changed.length ? "" : `${person.cc}: Supabase no actualizó la fila`;
      }));
      updated += results.filter((result) => !result).length;
      const failure = results.find(Boolean);
      if (failure) {
        clearPeopleCache();
        return NextResponse.json({ error: `No se pudo actualizar ${failure}. Se actualizaron ${updated} personas antes del error.`, created: 0, updated }, { status: 500 });
      }
    }
    if (inserts.length) {
      const response = await fetch(supabaseRest(TABLE), {
        method: "POST", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify(inserts), cache: "no-store",
      });
      if (!response.ok) {
        clearPeopleCache();
        return NextResponse.json({ error: `No se pudieron agregar ${inserts.length} personas: ${await supabaseError(response)}. Se actualizaron ${updated} personas.`, created: 0, updated }, { status: response.status });
      }
    }
    const created = inserts.length;
    clearPeopleCache();
    return NextResponse.json({ created, updated, total: created + updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar el personal." }, { status: 500 });
  }
}

function personValues(person: Person) {
  const values: Record<string, string> = { NOMBRE: person.nombre, CONTRATISTA: person.contratista };
  if (person.cargo) values.CARGO = person.cargo;
  if (person.celular) values.CELULAR = person.celular;
  if (person.correo) values.CORREO = person.correo;
  return values;
}

export async function DELETE(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin && !isOperationalContractor(session.contractor)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    const body = await request.json() as { cc?: unknown; contratista?: unknown };
    const cc = String(body.cc ?? "").replace(/\D/g, "");
    const contratista = contractorLabel(String(body.contratista ?? ""));
    if (!/^\d{5,15}$/.test(cc) || !isOperationalContractor(contratista)) {
      return NextResponse.json({ error: "Cédula o contratista inválidos." }, { status: 400 });
    }
    if (!session.isPeople && !session.isAdmin && normalizeContractorName(contratista) !== normalizeContractorName(session.contractor)) {
      return NextResponse.json({ error: `Solo puedes eliminar personal de ${session.contractor}.` }, { status: 403 });
    }
    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const params = new URLSearchParams({ select: "CC,CONTRATISTA", CC: `eq.${cc}` });
    const lookup = await fetch(supabaseRest(TABLE, `?${params}`), { headers, cache: "no-store" });
    if (!lookup.ok) throw new Error(await supabaseError(lookup));
    const matches = ((await lookup.json()) as ExistingRow[]).filter((row) => normalizeContractorName(contractorLabel(row.CONTRATISTA)) === normalizeContractorName(contratista));
    let deleted = 0;
    for (const match of matches) {
      const filters = new URLSearchParams({ select: "CC", CC: `eq.${cc}`, CONTRATISTA: `eq.${match.CONTRATISTA}` });
      const response = await fetch(supabaseRest(TABLE, `?${filters}`), { method: "DELETE", headers: { ...headers, Prefer: "return=representation" }, cache: "no-store" });
      if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
      deleted += ((await response.json()) as ExistingRow[]).length;
    }
    if (matches.length && !deleted) return NextResponse.json({ error: "Supabase no eliminó a la persona. Revisa la política DELETE del padrón." }, { status: 403 });
    const profileId = `${normalizeContractorName(contratista)}:${cc}`;
    const profileResponse = await fetch(supabaseRest("people_profiles", `?${new URLSearchParams({ profile_id: `eq.${profileId}` })}`), { method: "DELETE", headers, cache: "no-store" });
    clearPeopleCache();
    if (!profileResponse.ok) return NextResponse.json({ error: `Se borró del padrón, pero no el perfil: ${await supabaseError(profileResponse)}` }, { status: profileResponse.status });
    return NextResponse.json({ deleted });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo eliminar a la persona." }, { status: 500 });
  }
}

function clearPeopleCache() {
  clearServerCache("supabase:personas:");
  clearServerCache("supabase:people-summary:");
}
