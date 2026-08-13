import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../../lib/authServer";
import { normalizeContractorName } from "../../../../lib/contractors";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../../lib/supabaseServer";

type Status = { available: boolean; useInZki: boolean };

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session || (!session.isPeople && !session.isAdmin)) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
  const [platesResponse, capacitiesResponse, profilesResponse] = await Promise.all([
    fetch(supabaseRest("placas", "?select=*&limit=3000"), { headers, cache: "no-store" }),
    fetch(supabaseRest("capacidad_carga", "?select=*&limit=3000"), { headers, cache: "no-store" }),
    fetch(supabaseRest("people_profiles", "?select=profile_id,data&profile_id=like.zki-vehicle:*"), { headers, cache: "no-store" }),
  ]);
  if (!platesResponse.ok) return NextResponse.json({ error: `Tabla placas: ${await supabaseError(platesResponse)}` }, { status: platesResponse.status });
  const plateRows = await platesResponse.json() as Record<string, unknown>[];
  if (!plateRows.length) {
    return NextResponse.json({ error: "La tabla placas no devolvió registros. Ejecuta supabase/placas_access.sql para habilitar su lectura a People y Admin." }, { status: 403 });
  }
  const capacityRows = capacitiesResponse.ok ? await capacitiesResponse.json() as Record<string, unknown>[] : [];
  const profileRows = profilesResponse.ok ? await profilesResponse.json() as Array<{ profile_id: string; data?: { available?: boolean; useInZki?: boolean; logistics?: boolean } }> : [];
  const statuses = new Map(profileRows.map((row) => [row.profile_id.replace("zki-vehicle:", ""), { available: row.data?.available !== false, useInZki: row.data?.useInZki ?? row.data?.logistics ?? false }]));
  const capacities = new Map(capacityRows.map((row) => [normalizePlate(read(row, ["placa", "vehiculo", "vehicle", "plate", "vh"])), readNumber(row, ["capacidad", "capacidad_carga", "peso", "carga"])]));
  const vehicleEntries = plateRows.map((row): [string, { plate: string; contractor: string; capacity: number; available: boolean; useInZki: boolean }] => {
    const plate = normalizePlate(read(row, ["Tractor", "placa", "vehiculo", "vehicle", "plate", "vh"]));
    const contractor = contractorLabel(read(row, ["Nombre 1", "transportista", "transportadora", "contratista", "empresa", "carrier"]));
    const saved = statuses.get(plate);
    return [plate, { plate, contractor, capacity: capacities.get(plate) || 0, available: saved?.available ?? true, useInZki: saved?.useInZki ?? contractor === "Logisticos" }];
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
function normalizePlate(value: unknown) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^vh/, ""); }
function contractorLabel(value: string) {
  const key = normalizeContractorName(value);
  if (key.includes("logistic") || key.includes("logisticaintegral")) return "Logisticos";
  if (key.includes("surti")) return "Surti Cervezas";
  if (key.includes("distribuciones") || key.includes("transporterg") || key.includes("puntocorona")) return "Punto Corona";
  return value || "Sin transportista";
}
