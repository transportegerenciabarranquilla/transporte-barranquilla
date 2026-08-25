import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../../lib/authServer";
import { normalizeContractorName } from "../../../../lib/contractors";
import { readServerCache } from "../../../../lib/serverCache";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../../lib/supabaseServer";
import { readZkiCrewRows } from "../crewTable";

type Person = { id: string; name: string; role: "RR" | "Líder de Ruta" | "Conductor" | "Auxiliar"; available: boolean; contractor: string; minimumClients?: number; maximumClients?: number };
type PersonProfile = { available?: boolean; minimumClients?: number; maximumClients?: number };

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session || (!session.isPeople && !session.isAdmin)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
  const [peopleResponse, profilesResponse, attendances, crewRows] = await Promise.all([
    fetch(supabaseRest("transporte_barranquilla", "?select=CC,NOMBRE,CARGO,CONTRATISTA&order=NOMBRE.asc&limit=2000"), { headers, cache: "no-store" }),
    fetch(supabaseRest("people_profiles", "?select=profile_id,data&profile_id=like.zki-person:*"), { headers, cache: "no-store" }),
    readExternalResponsibleAttendances(headers),
    readZkiCrewRows(headers),
  ]);
  if (!peopleResponse.ok) return NextResponse.json({ error: await supabaseError(peopleResponse) }, { status: peopleResponse.status });
  const people = await peopleResponse.json() as Record<string, unknown>[];
  const profiles = profilesResponse.ok ? await profilesResponse.json() as Array<{ profile_id: string; data?: PersonProfile }> : [];
  const externalAttendanceCounts = new Map<string, number>();
  attendances.forEach((row) => {
    const contractor = normalizeContractorName(row.contractor);
    const id = String(row.cedulaResponsable || "").replace(/\D/g, "");
    if (!id || !contractor || contractor === "logisticos") return;
    externalAttendanceCounts.set(id, (externalAttendanceCounts.get(id) || 0) + 1);
  });
  const profileById = new Map(profiles.map((row) => [row.profile_id.replace("zki-person:", ""), row.data || {}]));
  const logisticsPeople = people
    .map(toPerson)
    .filter((person): person is Person => Boolean(person))
    .filter((person) => normalizeContractorName(person.contractor) === "logisticos")
    .filter((person) => person.role !== "Conductor")
    .filter((person) => !["RR", "Líder de Ruta"].includes(person.role) || (externalAttendanceCounts.get(person.id) || 0) < 2);
  const drivers = crewRows.flatMap((row): Person[] => row.driver && row.driverId
    ? [{ id: row.driverId, name: row.driver, role: "Conductor", available: true, contractor: "Logisticos" }]
    : []);
  const uniquePeople = [...new Map([...logisticsPeople, ...drivers].map((person) => [person.id, person])).values()];
  const records = uniquePeople
    .map((person) => {
      const profile = profileById.get(person.id);
      return { ...person, available: profile?.available !== false, minimumClients: profile?.minimumClients, maximumClients: profile?.maximumClients };
    });
  return NextResponse.json({ records });
}

type ResponsibleAttendance = { contractor?: string; cedulaResponsable?: string };

function readExternalResponsibleAttendances(headers: Record<string, string>) {
  return readServerCache<ResponsibleAttendance[]>("zki:external-responsible-attendances", 60_000, async () => {
    // Proyección angosta: evita descargar el JSON completo del histórico.
    const params = new URLSearchParams({
      select: "contractor,cedulaResponsable:data->>cedulaResponsable",
      contractor: "not.ilike.*logistic*",
      limit: "10000",
    });
    const query = `?${params.toString()}`;
    const response = await fetch(supabaseRest("asistencias_ruta", query), { headers, cache: "no-store" });
    if (!response.ok) return [];
    return await response.json() as ResponsibleAttendance[];
  });
}

export async function PUT(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session || (!session.isPeople && !session.isAdmin)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const person = await request.json() as Person;
  const id = String(person.id || "").replace(/\D/g, "");
  if (!id) return NextResponse.json({ error: "La cédula es obligatoria." }, { status: 400 });
  const headers = supabaseAdminHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }) ?? supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" });
  const hasRange = Number.isFinite(person.minimumClients) && Number.isFinite(person.maximumClients);
  const minimumClients = hasRange ? Math.max(0, Number(person.minimumClients)) : undefined;
  const maximumClients = hasRange ? Math.max(Number(minimumClients), Number(person.maximumClients)) : undefined;
  const data: PersonProfile = { available: person.available !== false };
  if (hasRange) Object.assign(data, { minimumClients, maximumClients });
  const response = await fetch(supabaseRest("people_profiles", "?on_conflict=profile_id"), { method: "POST", headers, body: JSON.stringify({ profile_id: `zki-person:${id}`, contractor: person.contractor || "People", cc: id, data, updated_at: new Date().toISOString() }), cache: "no-store" });
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
  const role = roleText.includes("conductor")
    ? "Conductor"
    : roleText.includes("auxiliar")
      ? "Auxiliar"
      : roleText.includes("lider") && roleText.includes("ruta")
        ? "Líder de Ruta"
        : roleText === "rr" || roleText.includes("responsable")
          ? "RR"
          : null;
  const id = String(row.CC || "").replace(/\D/g, "");
  if (!role || !id) return null;
  return { id, name: String(row.NOMBRE || "Sin nombre"), role, available: true, contractor: String(row.CONTRATISTA || "") };
}
function normalize(value: string) { return normalizeContractorName(value).replace(/responsablederuta|responsabledereparto/, "responsable"); }
