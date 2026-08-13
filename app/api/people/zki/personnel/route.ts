import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../../lib/authServer";
import { normalizeContractorName } from "../../../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../../lib/supabaseServer";

type Person = { id: string; name: string; role: "RR" | "Conductor" | "Auxiliar"; available: boolean; contractor: string };

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session || (!session.isPeople && !session.isAdmin)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
  const [peopleResponse, profilesResponse] = await Promise.all([
    fetch(supabaseRest("transporte_barranquilla", "?select=CC,NOMBRE,CARGO,CONTRATISTA&order=NOMBRE.asc&limit=2000"), { headers, cache: "no-store" }),
    fetch(supabaseRest("people_profiles", "?select=profile_id,data&profile_id=like.zki-person:*"), { headers, cache: "no-store" }),
  ]);
  if (!peopleResponse.ok) return NextResponse.json({ error: await supabaseError(peopleResponse) }, { status: peopleResponse.status });
  const people = await peopleResponse.json() as Record<string, unknown>[];
  const profiles = profilesResponse.ok ? await profilesResponse.json() as Array<{ profile_id: string; data?: { available?: boolean } }> : [];
  const availability = new Map(profiles.map((row) => [row.profile_id.replace("zki-person:", ""), row.data?.available !== false]));
  const logisticsPeople = people
    .map(toPerson)
    .filter((person): person is Person => Boolean(person))
    .filter((person) => normalizeContractorName(person.contractor) === "logisticos");
  const uniquePeople = [...new Map(logisticsPeople.map((person) => [person.id, person])).values()];
  const records = uniquePeople
    .map((person) => ({ ...person, available: availability.get(person.id) ?? true }));
  return NextResponse.json({ records });
}

export async function PUT(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session || (!session.isPeople && !session.isAdmin)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const person = await request.json() as Person;
  const id = String(person.id || "").replace(/\D/g, "");
  if (!id) return NextResponse.json({ error: "La cédula es obligatoria." }, { status: 400 });
  const headers = supabaseAdminHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }) ?? supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" });
  const response = await fetch(supabaseRest("people_profiles", "?on_conflict=profile_id"), { method: "POST", headers, body: JSON.stringify({ profile_id: `zki-person:${id}`, contractor: person.contractor || "People", cc: id, data: { available: person.available !== false }, updated_at: new Date().toISOString() }), cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session || (!session.isPeople && !session.isAdmin)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const person = await request.json() as Person;
  const id = String(person.id || "").replace(/\D/g, "");
  if (!id || !person.name?.trim()) return NextResponse.json({ error: "Cédula y nombre son obligatorios." }, { status: 400 });
  const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
  const existing = await fetch(supabaseRest("transporte_barranquilla", `?select=CC&CC=eq.${id}&limit=1`), { headers, cache: "no-store" });
  if (existing.ok && ((await existing.json()) as unknown[]).length) return NextResponse.json({ error: "Ya existe una persona con esa cédula." }, { status: 409 });
  const response = await fetch(supabaseRest("transporte_barranquilla"), { method: "POST", headers: { ...headers, Prefer: "return=minimal" }, body: JSON.stringify({ CC: id, NOMBRE: person.name.trim(), CARGO: person.role, CONTRATISTA: "Logisticos" }), cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
  return NextResponse.json({ person: { ...person, id, contractor: "Logisticos", available: true } });
}

export async function DELETE(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session || (!session.isPeople && !session.isAdmin)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id")?.replace(/\D/g, "") || "";
  if (!id) return NextResponse.json({ error: "La cédula es obligatoria." }, { status: 400 });
  const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
  const response = await fetch(supabaseRest("transporte_barranquilla", `?CC=eq.${id}`), { method: "DELETE", headers, cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
  await fetch(supabaseRest("people_profiles", `?profile_id=eq.${encodeURIComponent(`zki-person:${id}`)}`), { method: "DELETE", headers, cache: "no-store" });
  return NextResponse.json({ ok: true });
}

function toPerson(row: Record<string, unknown>): Person | null {
  const roleText = normalize(String(row.CARGO || ""));
  const role = roleText.includes("conductor") ? "Conductor" : roleText.includes("auxiliar") ? "Auxiliar" : roleText === "rr" || roleText.includes("responsable") || roleText.includes("liderderuta") ? "RR" : null;
  const id = String(row.CC || "").replace(/\D/g, "");
  if (!role || !id) return null;
  return { id, name: String(row.NOMBRE || "Sin nombre"), role, available: true, contractor: String(row.CONTRATISTA || "") };
}
function normalize(value: string) { return normalizeContractorName(value).replace(/responsablederuta|responsabledereparto/, "responsable"); }
