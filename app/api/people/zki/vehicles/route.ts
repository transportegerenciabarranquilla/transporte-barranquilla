import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../../lib/authServer";
import { normalizeContractorName } from "../../../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../../lib/supabaseServer";
import { normalizePlate, readZkiCrewRows, ZKI_CREW_TABLE } from "../crewTable";

type Status = { available: boolean; useInZki: boolean };

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session || (!session.isPeople && !session.isAdmin)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
  const [plateRows, capacitiesResponse, profilesResponse] = await Promise.all([
    readZkiCrewRows(headers),
    fetch(supabaseRest("capacidad_carga", "?select=*&limit=3000"), { headers, cache: "no-store" }),
    fetch(supabaseRest("people_profiles", "?select=profile_id,data&profile_id=like.zki-vehicle:*"), { headers, cache: "no-store" }),
  ]);
  if (!plateRows.length) {
    return NextResponse.json({ error: `La tabla ${ZKI_CREW_TABLE} no devolvió registros.` }, { status: 403 });
  }
  const capacityRows = capacitiesResponse.ok ? await capacitiesResponse.json() as Record<string, unknown>[] : [];
  const profileRows = profilesResponse.ok ? await profilesResponse.json() as Array<{ profile_id: string; data?: { available?: boolean; useInZki?: boolean; logistics?: boolean } }> : [];
  const statuses = new Map(profileRows.map((row) => [row.profile_id.replace("zki-vehicle:", ""), { available: row.data?.available !== false, useInZki: row.data?.useInZki ?? row.data?.logistics ?? false }]));
  const capacityEntries = capacityRows.map((row): [string, number] => [
    normalizePlate(read(row, ["placa", "Placa Asignada", "vehiculo", "vehicle", "plate", "vh", "Tractor"])),
    readNumber(row, ["Peso Máximo", "Peso Maximo", "Peso máximo kg", "Capacidad peso", "capacidad", "capacidad_carga", "CapacidadCarga", "Capacidad de carga", "peso", "carga"]),
  ]).filter(([plate]) => Boolean(plate));
  const capacities = new Map<string, number>(capacityEntries);
  const vehicleEntries = plateRows.map((row): [string, { plate: string; contractor: string; capacity: number; available: boolean; useInZki: boolean }] => {
    const plate = row.plate;
    const contractor = "Logisticos";
    const plateCapacity = 0;
    const saved = statuses.get(plate);
    return [plate, { plate, contractor, capacity: plateCapacity || capacities.get(plate) || 0, available: saved?.available ?? true, useInZki: saved?.useInZki ?? contractor === "Logisticos" }];
  }).filter(([plate]) => Boolean(plate));
  const records = [...new Map(vehicleEntries).values()];
  return NextResponse.json({ records });
}

export async function PUT(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session || (!session.isPeople && !session.isAdmin)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const body = await request.json() as { plate?: string; contractor?: string; available?: boolean; useInZki?: boolean };
  const plate = normalizePlate(body.plate);
  if (!plate) return NextResponse.json({ error: "La placa es obligatoria." }, { status: 400 });
  const status: Status = { available: body.available !== false, useInZki: body.useInZki === true };
  const headers = supabaseAdminHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }) ?? supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" });
  const response = await fetch(supabaseRest("people_profiles", "?on_conflict=profile_id"), { method: "POST", headers, body: JSON.stringify({ profile_id: `zki-vehicle:${plate}`, contractor: body.contractor || "", data: status, updated_at: new Date().toISOString() }), cache: "no-store" });
  if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
  return NextResponse.json({ ok: true });
}

function read(row: Record<string, unknown>, aliases: string[]) {
  const sources = [row, ...Object.values(row).filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value))];
  for (const source of sources) {
    const entries = Object.entries(source);
    for (const alias of aliases) {
      const match = entries.find(([key]) => normalizeContractorName(key) === normalizeContractorName(alias));
      if (match && match[1] != null && String(match[1]).trim()) return String(match[1]).trim();
    }
  }
  return "";
}
function readNumber(row: Record<string, unknown>, aliases: string[]) { const value = Number(read(row, aliases).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")); return Number.isFinite(value) ? value : 0; }
