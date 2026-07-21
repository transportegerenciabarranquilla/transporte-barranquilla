import { getAuthenticatedSupabaseClient } from "./supabase";
import type { CrewMember, CrewRole, TdRow, TdSnapshot, TdStatus } from "./types";

type SnapshotRecord = {
  id: string;
  file_name: string;
  file_hash: string;
  operational_date: string;
  uploaded_at: string;
  closed_at: string | null;
  warnings: unknown;
};

type RouteRecord = {
  snapshot_id: string;
  id: string;
  dt: string;
  trip: string;
  plate: string;
  responsible: string;
  dispatch_date: string | null;
  dt_date: string | null;
  route_status: string;
  clients: number;
  visited: number;
  boxes: number;
  hectoliters: number;
  departure_seconds: number | null;
  late_departure_cause: string;
  late_departure_comment: string;
  route_arrival: string;
  route_time: string;
  planned_time: string;
  territory: string;
  carrier: string;
};

type CrewRecord = {
  snapshot_id: string;
  route_id: string;
  role: CrewRole;
  name: string;
  document: string;
  arrival_seconds: number | null;
  td_seconds: number | null;
  status: TdStatus;
  valid_person: boolean;
};

export async function listCloudSnapshots(): Promise<TdSnapshot[]> {
  const client = await getAuthenticatedSupabaseClient();
  const { data: snapshotData, error: snapshotError } = await client
    .from("td_snapshots")
    .select("id,file_name,file_hash,operational_date,uploaded_at,closed_at,warnings")
    .order("uploaded_at", { ascending: false });

  if (snapshotError) throw cloudError("consultar los cortes", snapshotError.message);
  const snapshotRecords = (snapshotData ?? []) as SnapshotRecord[];
  if (!snapshotRecords.length) return [];

  const snapshotIds = snapshotRecords.map((snapshot) => snapshot.id);
  const [{ data: routeData, error: routeError }, { data: crewData, error: crewError }] = await Promise.all([
    client.from("td_routes").select("*").in("snapshot_id", snapshotIds),
    client.from("td_crew_members").select("*").in("snapshot_id", snapshotIds),
  ]);

  if (routeError) throw cloudError("consultar las rutas", routeError.message);
  if (crewError) throw cloudError("consultar las tripulaciones", crewError.message);

  const routes = (routeData ?? []) as RouteRecord[];
  const crew = (crewData ?? []) as CrewRecord[];
  const crewByRoute = new Map<string, Partial<Record<CrewRole, CrewMember>>>();
  crew.forEach((member) => {
    const key = `${member.snapshot_id}:${member.route_id}`;
    const group = crewByRoute.get(key) ?? {};
    group[member.role] = {
      role: member.role,
      name: member.name,
      document: member.document,
      arrivalSeconds: member.arrival_seconds,
      tdSeconds: member.td_seconds,
      status: member.status,
      validPerson: member.valid_person,
    };
    crewByRoute.set(key, group);
  });

  return snapshotRecords.map((snapshot) => ({
    id: snapshot.id,
    fileName: snapshot.file_name,
    fileHash: snapshot.file_hash,
    operationalDate: snapshot.operational_date,
    uploadedAt: snapshot.uploaded_at,
    closedAt: snapshot.closed_at ?? undefined,
    warnings: Array.isArray(snapshot.warnings) ? snapshot.warnings.filter((item): item is string => typeof item === "string") : [],
    rows: routes
      .filter((route) => route.snapshot_id === snapshot.id)
      .map((route) => toTdRow(route, crewByRoute.get(`${snapshot.id}:${route.id}`) ?? {})),
  }));
}

export async function saveCloudSnapshot(snapshot: TdSnapshot) {
  const client = await getAuthenticatedSupabaseClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  const ownerId = userData.user?.id;
  if (userError || !ownerId) throw cloudError("identificar al administrador", userError?.message ?? "Sesión no disponible");

  const { error: snapshotError } = await client.from("td_snapshots").upsert({
    id: snapshot.id,
    owner_id: ownerId,
    file_name: snapshot.fileName,
    file_hash: snapshot.fileHash,
    operational_date: snapshot.operationalDate,
    uploaded_at: snapshot.uploadedAt,
    closed_at: snapshot.closedAt ?? null,
    warnings: snapshot.warnings,
  });
  if (snapshotError) throw cloudError("guardar el corte", snapshotError.message);

  const { error: cleanError } = await client
    .from("td_routes")
    .delete()
    .eq("snapshot_id", snapshot.id);
  if (cleanError) throw cloudError("actualizar las rutas", cleanError.message);

  if (!snapshot.rows.length) return;
  const routeRecords = snapshot.rows.map((row) => ({
    snapshot_id: snapshot.id,
    id: row.id,
    owner_id: ownerId,
    dt: row.dt,
    trip: row.trip,
    plate: row.plate,
    responsible: row.responsible,
    dispatch_date: nullableDate(row.dispatchDate),
    dt_date: nullableDate(row.dtDate),
    route_status: row.routeStatus,
    clients: row.clients,
    visited: row.visited,
    boxes: row.boxes,
    hectoliters: row.hectoliters,
    departure_seconds: row.departureSeconds,
    late_departure_cause: row.lateDepartureCause,
    late_departure_comment: row.lateDepartureComment,
    route_arrival: row.routeArrival,
    route_time: row.routeTime,
    planned_time: row.plannedTime,
    territory: row.territory,
    carrier: row.carrier,
  }));
  const { error: routesError } = await client.from("td_routes").insert(routeRecords);
  if (routesError) throw cloudError("guardar las rutas", routesError.message);

  const crewRecords = snapshot.rows.flatMap((row) =>
    Object.values(row.crew).map((member) => ({
      snapshot_id: snapshot.id,
      route_id: row.id,
      owner_id: ownerId,
      role: member.role,
      name: member.name,
      document: member.document,
      arrival_seconds: member.arrivalSeconds,
      td_seconds: member.tdSeconds,
      status: member.status,
      valid_person: member.validPerson,
    })),
  );
  const { error: crewError } = await client.from("td_crew_members").insert(crewRecords);
  if (crewError) throw cloudError("guardar las tripulaciones", crewError.message);
}

export async function deleteCloudSnapshot(id: string) {
  const client = await getAuthenticatedSupabaseClient();
  const { error } = await client.from("td_snapshots").delete().eq("id", id);
  if (error) throw cloudError("eliminar el corte", error.message);
}

export async function clearCloudSnapshots() {
  const client = await getAuthenticatedSupabaseClient();
  const { data } = await client.auth.getUser();
  if (!data.user) return;
  const { error } = await client.from("td_snapshots").delete().eq("owner_id", data.user.id);
  if (error) throw cloudError("eliminar los datos", error.message);
}

function toTdRow(route: RouteRecord, crew: Partial<Record<CrewRole, CrewMember>>): TdRow {
  return {
    id: route.id,
    dt: route.dt,
    trip: route.trip,
    plate: route.plate,
    responsible: route.responsible,
    dispatchDate: route.dispatch_date ?? "",
    dtDate: route.dt_date ?? "",
    routeStatus: route.route_status,
    clients: Number(route.clients),
    visited: Number(route.visited),
    boxes: Number(route.boxes),
    hectoliters: Number(route.hectoliters),
    departureSeconds: route.departure_seconds,
    lateDepartureCause: route.late_departure_cause,
    lateDepartureComment: route.late_departure_comment,
    routeArrival: route.route_arrival,
    routeTime: route.route_time,
    plannedTime: route.planned_time,
    territory: route.territory,
    carrier: route.carrier,
    crew: {
      rr: crew.rr ?? emptyMember("rr"),
      aux: crew.aux ?? emptyMember("aux"),
      conductor: crew.conductor ?? emptyMember("conductor"),
    },
  };
}

function emptyMember(role: CrewRole): CrewMember {
  return { role, name: "", document: "", arrivalSeconds: null, tdSeconds: null, status: "sin-marcacion", validPerson: false };
}

function nullableDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function cloudError(action: string, detail: string) {
  return new Error(`No fue posible ${action} en Supabase: ${detail}`);
}
