import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";
import type { CrewMember, CrewRole, PinRecord, TdRow, TdSnapshot, TdStatus } from "../../../personas/eliot/lib/types";

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

export async function GET(request: Request) {
  try {
    const session = await getPeopleSession();
    if (session instanceof NextResponse) return session;
    const headers = supabaseUserHeaders(session.accessToken);
    const resource = new URL(request.url).searchParams.get("resource");

    if (resource === "settings") {
      const response = await fetch(supabaseRest("td_user_settings", "?select=pin_salt,pin_hash&limit=1"), { headers, cache: "no-store" });
      if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
      const rows = (await response.json().catch(() => [])) as Array<{ pin_salt: string; pin_hash: string }>;
      const row = rows[0];
      return NextResponse.json({ pin: row ? { salt: row.pin_salt, hash: row.pin_hash } : null });
    }

    const snapshotResponse = await fetch(
      supabaseRest("td_snapshots", "?select=id,file_name,file_hash,operational_date,uploaded_at,closed_at,warnings&order=uploaded_at.desc"),
      { headers, cache: "no-store" },
    );
    if (!snapshotResponse.ok) return NextResponse.json({ error: await supabaseError(snapshotResponse) }, { status: snapshotResponse.status });
    const snapshots = (await snapshotResponse.json().catch(() => [])) as SnapshotRecord[];
    if (!snapshots.length) return NextResponse.json({ snapshots: [] });

    const [routeResponse, crewResponse] = await Promise.all([
      fetch(supabaseRest("td_routes", "?select=*"), { headers, cache: "no-store" }),
      fetch(supabaseRest("td_crew_members", "?select=*"), { headers, cache: "no-store" }),
    ]);
    if (!routeResponse.ok) return NextResponse.json({ error: await supabaseError(routeResponse) }, { status: routeResponse.status });
    if (!crewResponse.ok) return NextResponse.json({ error: await supabaseError(crewResponse) }, { status: crewResponse.status });

    const routes = (await routeResponse.json().catch(() => [])) as RouteRecord[];
    const crew = (await crewResponse.json().catch(() => [])) as CrewRecord[];
    return NextResponse.json({ snapshots: hydrateSnapshots(snapshots, routes, crew) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando atrasos." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getPeopleSession();
    if (session instanceof NextResponse) return session;
    const body = (await request.json()) as { snapshot?: TdSnapshot; pin?: PinRecord };
    const headers = supabaseUserHeaders(session.accessToken);

    if (body.pin) {
      const response = await fetch(supabaseRest("td_user_settings", "?on_conflict=owner_id"), {
        method: "POST",
        headers: supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify({ owner_id: session.userId, pin_salt: body.pin.salt, pin_hash: body.pin.hash, updated_at: new Date().toISOString() }),
        cache: "no-store",
      });
      if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
      return NextResponse.json({ pin: body.pin });
    }

    const snapshot = body.snapshot;
    if (!snapshot?.id || !Array.isArray(snapshot.rows)) return NextResponse.json({ error: "El corte no es valido." }, { status: 400 });
    const snapshotResponse = await fetch(supabaseRest("td_snapshots", "?on_conflict=id"), {
      method: "POST",
      headers: supabaseUserHeaders(session.accessToken, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({
        id: snapshot.id,
        owner_id: session.userId,
        file_name: snapshot.fileName,
        file_hash: snapshot.fileHash,
        operational_date: snapshot.operationalDate,
        uploaded_at: snapshot.uploadedAt,
        closed_at: snapshot.closedAt ?? null,
        warnings: snapshot.warnings,
      }),
      cache: "no-store",
    });
    if (!snapshotResponse.ok) return NextResponse.json({ error: await supabaseError(snapshotResponse) }, { status: snapshotResponse.status });

    const cleanResponse = await fetch(supabaseRest("td_routes", `?snapshot_id=eq.${encodeURIComponent(snapshot.id)}`), {
      method: "DELETE",
      headers,
      cache: "no-store",
    });
    if (!cleanResponse.ok) return NextResponse.json({ error: await supabaseError(cleanResponse) }, { status: cleanResponse.status });

    if (snapshot.rows.length) {
      const routeResponse = await fetch(supabaseRest("td_routes"), {
        method: "POST",
        headers,
        body: JSON.stringify(snapshot.rows.map((row) => toRouteRecord(snapshot.id, session.userId, row))),
        cache: "no-store",
      });
      if (!routeResponse.ok) return NextResponse.json({ error: await supabaseError(routeResponse) }, { status: routeResponse.status });

      const crewResponse = await fetch(supabaseRest("td_crew_members"), {
        method: "POST",
        headers,
        body: JSON.stringify(snapshot.rows.flatMap((row) => Object.values(row.crew).map((member) => toCrewRecord(snapshot.id, row.id, session.userId, member)))),
        cache: "no-store",
      });
      if (!crewResponse.ok) return NextResponse.json({ error: await supabaseError(crewResponse) }, { status: crewResponse.status });

      const [savedRoutesResponse, savedCrewResponse] = await Promise.all([
        fetch(supabaseRest("td_routes", `?select=id&snapshot_id=eq.${encodeURIComponent(snapshot.id)}`), {
          headers: supabaseUserHeaders(session.accessToken),
          cache: "no-store",
        }),
        fetch(supabaseRest("td_crew_members", `?select=route_id&snapshot_id=eq.${encodeURIComponent(snapshot.id)}`), {
          headers: supabaseUserHeaders(session.accessToken),
          cache: "no-store",
        }),
      ]);
      if (!savedRoutesResponse.ok || !savedCrewResponse.ok) {
        await removeIncompleteSnapshot(snapshot.id, session.accessToken);
        const failedResponse = !savedRoutesResponse.ok ? savedRoutesResponse : savedCrewResponse;
        return NextResponse.json({ error: await supabaseError(failedResponse) }, { status: failedResponse.status });
      }
      const savedRoutes = (await savedRoutesResponse.json().catch(() => [])) as unknown[];
      const savedCrew = (await savedCrewResponse.json().catch(() => [])) as unknown[];
      const expectedCrew = snapshot.rows.length * 3;
      if (savedRoutes.length !== snapshot.rows.length || savedCrew.length !== expectedCrew) {
        await removeIncompleteSnapshot(snapshot.id, session.accessToken);
        return NextResponse.json(
          {
            error: `La carga quedó incompleta y fue revertida. Rutas: ${savedRoutes.length}/${snapshot.rows.length}; tripulantes: ${savedCrew.length}/${expectedCrew}.`,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando atrasos." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getPeopleSession();
    if (session instanceof NextResponse) return session;
    const params = new URL(request.url).searchParams;
    const resource = params.get("resource");
    const id = params.get("id");
    const table = resource === "settings" ? "td_user_settings" : "td_snapshots";
    const query = resource === "settings" ? "?owner_id=not.is.null" : id ? `?id=eq.${encodeURIComponent(id)}` : "?id=not.is.null";
    const response = await fetch(supabaseRest(table, query), {
      method: "DELETE",
      headers: supabaseUserHeaders(session.accessToken),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error eliminando atrasos." }, { status: 500 });
  }
}

async function getPeopleSession() {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Debes iniciar sesion." }, { status: 401 });
  if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  return session;
}

function hydrateSnapshots(snapshots: SnapshotRecord[], routes: RouteRecord[], crew: CrewRecord[]): TdSnapshot[] {
  const crewByRoute = new Map<string, Partial<Record<CrewRole, CrewMember>>>();
  crew.forEach((member) => {
    const key = `${member.snapshot_id}:${member.route_id}`;
    crewByRoute.set(key, { ...crewByRoute.get(key), [member.role]: toCrewMember(member) });
  });
  return snapshots.map((snapshot) => ({
    id: snapshot.id,
    fileName: snapshot.file_name,
    fileHash: snapshot.file_hash,
    operationalDate: snapshot.operational_date,
    uploadedAt: snapshot.uploaded_at,
    closedAt: snapshot.closed_at ?? undefined,
    warnings: Array.isArray(snapshot.warnings) ? snapshot.warnings.filter((value): value is string => typeof value === "string") : [],
    rows: routes.filter((route) => route.snapshot_id === snapshot.id).map((route) => toTdRow(route, crewByRoute.get(`${snapshot.id}:${route.id}`) || {})),
  }));
}

function toTdRow(route: RouteRecord, crew: Partial<Record<CrewRole, CrewMember>>): TdRow {
  const empty = (role: CrewRole): CrewMember => ({ role, name: "", document: "", arrivalSeconds: null, tdSeconds: null, status: "sin-marcacion", validPerson: false });
  return {
    id: route.id, dt: route.dt, trip: route.trip, plate: route.plate, responsible: route.responsible,
    dispatchDate: route.dispatch_date ?? "", dtDate: route.dt_date ?? "", routeStatus: route.route_status,
    clients: Number(route.clients), visited: Number(route.visited), boxes: Number(route.boxes), hectoliters: Number(route.hectoliters),
    departureSeconds: route.departure_seconds, lateDepartureCause: route.late_departure_cause,
    lateDepartureComment: route.late_departure_comment, routeArrival: route.route_arrival, routeTime: route.route_time,
    plannedTime: route.planned_time, territory: route.territory, carrier: route.carrier,
    crew: { rr: crew.rr ?? empty("rr"), aux: crew.aux ?? empty("aux"), conductor: crew.conductor ?? empty("conductor") },
  };
}

function toCrewMember(member: CrewRecord): CrewMember {
  return { role: member.role, name: member.name, document: member.document, arrivalSeconds: member.arrival_seconds, tdSeconds: member.td_seconds, status: member.status, validPerson: member.valid_person };
}

function toRouteRecord(snapshotId: string, ownerId: string, row: TdRow) {
  return {
    snapshot_id: snapshotId, id: row.id, owner_id: ownerId, dt: row.dt, trip: row.trip, plate: row.plate, responsible: row.responsible,
    dispatch_date: nullableDate(row.dispatchDate), dt_date: nullableDate(row.dtDate), route_status: row.routeStatus,
    clients: row.clients, visited: row.visited, boxes: row.boxes, hectoliters: row.hectoliters,
    departure_seconds: row.departureSeconds, late_departure_cause: row.lateDepartureCause,
    late_departure_comment: row.lateDepartureComment, route_arrival: row.routeArrival, route_time: row.routeTime,
    planned_time: row.plannedTime, territory: row.territory, carrier: row.carrier,
  };
}

function toCrewRecord(snapshotId: string, routeId: string, ownerId: string, member: CrewMember) {
  return { snapshot_id: snapshotId, route_id: routeId, owner_id: ownerId, role: member.role, name: member.name, document: member.document, arrival_seconds: member.arrivalSeconds, td_seconds: member.tdSeconds, status: member.status, valid_person: member.validPerson };
}

function nullableDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

async function removeIncompleteSnapshot(id: string, accessToken: string) {
  await fetch(supabaseRest("td_snapshots", `?id=eq.${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: supabaseUserHeaders(accessToken),
    cache: "no-store",
  });
}
