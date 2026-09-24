import { scopeQuery } from "../../lib/adminScope";
import { scopedWrite } from "../../lib/scopedWrite";
import { NextResponse } from "next/server";
import type { AsistenciaRegistro } from "../../lib/asistenciaStorage";
import type { Vehiculo } from "../../seguimiento/types";
import { getVehicleRecordKey } from "../../seguimiento/utils";
import { writeAuditLog } from "../../lib/auditLog";
import { getAuthenticatedSession } from "../../lib/authServer";
import { isSecurityOwnerEmail, normalizeContractorName } from "../../lib/contractors";
import { cachedJsonFetch, clearServerCache } from "../../lib/serverCache";
import { supabaseAdminHeaders, supabaseError, supabaseHeaders, supabaseReadHeaders, supabaseRest, supabaseUserHeaders } from "../../lib/supabaseServer";
import { dedupeUpsertRows } from "../../lib/seguimientoUpsert";

const TABLE = "seguimiento_vehiculos";
const CAPACITY_TABLE = "capacidad_carga";
const LIST_CACHE_TTL_MS = 30_000;
// Asistencia se registra durante la operación y debe reflejarse enseguida en
// Seguimiento. En instancias serverless, invalidar otra instancia no borra su
// caché local, por lo que un minuto podía dejar rutas "Sin responsable".
const RELATED_CACHE_TTL_MS = 0;
const PAGE_SIZE = 1_000;
type AuthenticatedSession = NonNullable<Awaited<ReturnType<typeof getAuthenticatedSession>>>;
const PUBLIC_CONTRACTORS: Record<string, string> = {
  logisticos: "Logisticos",
  puntocorona: "Punto Corona",
  surticervezas: "Surti Cervezas",
  hllogisticos: "HL Logisticos",
  logisticosarenosa: "Logisticos Arenosa",
  coronaarenosa: "Punto Corona Arenosa",
  puntocoronaarenosa: "Punto Corona Arenosa",
};

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession({ allowSiteAdmin: true });
    const searchParams = new URL(request.url).searchParams;
    const requestedContractor = searchParams.get("contratista");
    const requestedDt = normalizeDt(searchParams.get("dt") || "");
    const requestedDate = searchParams.get("fecha") || searchParams.get("date") || "";
    const publicContractor = PUBLIC_CONTRACTORS[normalizeContractorName(requestedContractor)];

    if (!session && !publicContractor) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });

    // Admin y People consultan el contratista seleccionado en el formulario.
    // Antes People caía en session.contractor ("People") y nunca encontraba
    // las rutas del contratista elegido, por lo que el formulario mostraba el
    // registro de asistencia como "Placa pendiente".
    const contractor = (session?.isAdmin || session?.isPeople) && publicContractor
      ? publicContractor
      : session?.contractor || publicContractor;
    // People necesita consultar todos los contratistas para cruzar el DT de
    // asistencia con el VH de salida en la auditoría ZKI.
    const isGlobalAdminQuery = Boolean((session?.isAdmin || session?.isPeople) && !publicContractor);
    // El enlace público también necesita leer las rutas que RLS oculta
    // al rol anónimo. El contratista permitido se valida arriba y filterRows
    // limita los registros devueltos al contratista solicitado.
    const readHeaders = session
      ? supabaseReadHeaders(session.accessToken)
      : supabaseAdminHeaders() ?? supabaseHeaders();
    const readScope = session ? `user:${session.userId}` : "public";
    const listTtl = session && !session.isAdmin && !session.isPeople ? 0 : LIST_CACHE_TTL_MS;
    const canScanAllRows = Boolean(supabaseAdminHeaders());
    const params = new URLSearchParams(
      isGlobalAdminQuery || canScanAllRows
        ? { select: "record_id,contractor,data", order: "updated_at.desc" }
        : { select: "record_id,contractor,data", contractor: `eq.${contractor}`, order: "updated_at.desc" },
    );
    if (session) scopeQuery(params, session);
    // El campo puede estar guardado como "DT-123" o con espacios/separadores.
    // La coincidencia normalizada se confirma abajo para no aceptar parciales.
    if (requestedDt) params.set("data->>transporte", `ilike.*${requestedDt}*`);
    if (requestedDate) params.set("data->>fechaDespacho", `eq.${requestedDate}`);
    let rows = await readPagedRowsCached<{ record_id: string; contractor?: string; data: Vehiculo | null }>(
      TABLE,
      params,
      `supabase:${TABLE}:list:${readScope}:${contractor || "all"}:dt:${requestedDt || "all"}`,
      listTtl,
      readHeaders,
    );
    const filterRows = (sourceRows: typeof rows) => sourceRows
        .filter((row): row is typeof row & { data: Vehiculo } => Boolean(row.data))
        .filter((row) => !requestedDt || normalizeDt(String(row.data?.transporte ?? "")) === requestedDt)
        .filter((row) => {
          if (isGlobalAdminQuery) return true;
          const contractorKey = normalizeContractorName(contractor);
          return [row.data.transportista, row.contractor].map(normalizeContractorName).includes(contractorKey);
        })
        .map((row) => ({ ...row.data, recordId: row.record_id, transportista: row.contractor || row.data.transportista || "" }));
    let matchedRows = filterRows(rows);
    // Algunas cargas guardan el DT en un formato que PostgREST no encuentra
    // con el filtro JSON ilike. Reintenta por contratista y compara el DT
    // normalizado aquí antes de declarar que la ruta no tiene placa.
    if (!matchedRows.length && requestedDt) {
      const broadParams = new URLSearchParams(params);
      broadParams.delete("data->>transporte");
      broadParams.delete("data->>fechaDespacho");
      rows = await readPagedRowsCached<{ record_id: string; contractor?: string; data: Vehiculo | null }>(
        TABLE,
        broadParams,
        `supabase:${TABLE}:list:${readScope}:${contractor || "all"}:fallback`,
        listTtl,
        readHeaders,
      );
      matchedRows = filterRows(rows);
    }
    const records = removeDuplicateDtRecords(matchedRows);
    const withCapacities = await applyDatabaseCapacities(records, session?.accessToken);
    return NextResponse.json({ records: await applyAttendanceToVehicles(withCapacities, session?.accessToken, session?.isAdmin || session?.isPeople ? undefined : contractor) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando seguimiento." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (session.isAdmin) return NextResponse.json({ error: "El administrador solo consulta el seguimiento global." }, { status: 403 });
    const { records } = (await request.json()) as { records: Vehiculo[] };
    if (!Array.isArray(records)) return NextResponse.json({ error: "records debe ser una lista." }, { status: 400 });

    const scopedRecords = await applyAttendanceToVehicles(
      removeDuplicateDtRecords(
        await applyDatabaseCapacities(
          records.map((record) => ({
            ...record,
            transportista: session.contractor,
          })),
          session.accessToken,
        ),
      ),
      session.accessToken,
      session.contractor,
    );

    let rows = scopedRecords.map((record, index) => {
      const recordId = getSeguimientoRecordId(record, session.contractor, index);
      const storedRecord = { ...record };
      delete storedRecord.dispatchDateChanged;

      return {
        record_id: recordId,
        contractor: session.contractor,
        data: { ...storedRecord, recordId },
        updated_at: new Date().toISOString(),
      };
    });
    rows = dedupeUpsertRows(await preservePersistedRouteProgress(rows, session.contractor, session.accessToken));
    if (rows.length) {
      const writeError = await scopedWrite(TABLE, "record_id", rows, getWriteHeaders(session.accessToken), { legacyOwnerField: "transportista" });
      clearServerCache(`supabase:${TABLE}:`);
      clearServerCache("supabase:people-summary:");
      clearServerCache("supabase:admin-seguimiento:");
      if (writeError) return writeError;
    }

    // Guardar o volver a importar nunca elimina filas. Los DT solo se borran
    // mediante DELETE, después de una confirmacion expresa en la interfaz.

    const savedParams = new URLSearchParams({ select: "record_id,data", contractor: `eq.${session.contractor}`, order: "updated_at.desc" });
    const savedRows = await readPagedRows<{ record_id: string; data: Vehiculo }>(TABLE, savedParams, supabaseReadHeaders(session.accessToken));
    await writeAuditLog({
      action: "seguimiento_guardado",
      contractor: session.contractor,
      details: {
        records: records.length,
        dts: scopedRecords.map((record) => record.transporte).slice(0, 30),
      },
      module: "seguimiento",
      recordId: rows.map((row) => row.record_id).slice(0, 5).join(","),
      request,
      session,
    });
    const savedRecords = await applyDatabaseCapacities(
      removeDuplicateDtRecords(savedRows.map((row) => ({ ...row.data, recordId: row.record_id }))),
      session.accessToken,
    );
    return NextResponse.json({ records: await applyAttendanceToVehicles(savedRecords, session.accessToken, session.contractor) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error guardando seguimiento." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (session.isAdmin) return NextResponse.json({ error: "El administrador solo consulta el seguimiento global." }, { status: 403 });

    const body = (await request.json()) as { recordId?: string; changes?: Partial<Vehiculo> };
    const recordId = String(body.recordId || "").trim();
    const changes = body.changes;
    const hasSupportedChange = changes && (
      changes.visitados !== undefined ||
      changes.transporte !== undefined ||
      changes.status !== undefined ||
      changes.liquidado !== undefined ||
      changes.vehiculo !== undefined ||
      changes.vehiculoAnterior !== undefined ||
      changes.capacidad !== undefined ||
      changes.validadorPeso !== undefined
    );
    if (!recordId || !changes || !hasSupportedChange) {
      return NextResponse.json({ error: "Falta el registro o el cambio a guardar." }, { status: 400 });
    }
    for (const field of ["transporte", "vehiculo", "vehiculoAnterior"] as const) {
      const value = changes[field];
      if (value === undefined) continue;
      if (typeof value !== "string" || value.length > 80 || (field !== "vehiculoAnterior" && !value.trim())) {
        return NextResponse.json({ error: "El DT y las placas deben contener valores válidos." }, { status: 400 });
      }
      changes[field] = field === "transporte" ? value.trim() : value.trim().toUpperCase();
    }

    const params = new URLSearchParams({
      select: "contractor,data",
      record_id: `eq.${recordId}`,
      limit: "1",
    });
    const currentResponse = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      headers: supabaseReadHeaders(session.accessToken),
      cache: "no-store",
    });
    if (!currentResponse.ok) return NextResponse.json({ error: await supabaseError(currentResponse) }, { status: currentResponse.status });
    const currentRows = (await currentResponse.json()) as { contractor: string | null; data: Vehiculo }[];
    const stored = currentRows[0];
    const current = stored?.data;
    if (!current) return NextResponse.json({ error: "No se encontró la ruta en Supabase." }, { status: 404 });

    // Los históricos pueden tener contractor NULL. Solo en ese caso se usa
    // el transportista persistido, nunca el que envíe el cliente.
    const owner = stored.contractor ?? current.transportista;
    if (!owner || normalizeContractorName(owner) !== normalizeContractorName(session.contractor)) {
      return NextResponse.json({ error: "No puedes modificar registros de otra contratista." }, { status: 403 });
    }

    if (changes.visitados !== undefined) {
      if (!Number.isInteger(changes.visitados) || changes.visitados < 0 || changes.visitados > current.clientes) {
        return NextResponse.json({ error: `Los visitados deben ser un entero entre 0 y ${current.clientes}.` }, { status: 400 });
      }
      if ((current.status === "Finalizado" || hasStoredTime(current.horaLlegada)) && changes.visitados !== current.clientes) {
        return NextResponse.json({ error: "La ruta está finalizada. Cámbiala a En ruta antes de corregir los visitados." }, { status: 409 });
      }
      // La corrección manual no depende del reloj del navegador.
      const previousTime = Date.parse(current.visitadosUpdatedAt || "");
      changes.visitadosUpdatedAt = new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
    }

    if (changes.transporte !== undefined && normalizeDt(changes.transporte) !== normalizeDt(current.transporte)) {
      if (!normalizeDt(changes.transporte)) {
        return NextResponse.json({ error: "Ingresa un DT válido." }, { status: 400 });
      }
      const owners = [...new Set([owner, session.contractor])];
      const ownerFilters = owners.flatMap((value) => [
        `contractor.eq.${JSON.stringify(value)}`,
        `and(contractor.is.null,data->>transportista.eq.${JSON.stringify(value)})`,
      ]);
      const candidates = await readPagedRows<{ record_id: string; data: Vehiculo }>(TABLE, new URLSearchParams({
        select: "record_id,data",
        or: `(${ownerFilters.join(",")})`,
      }), supabaseReadHeaders(session.accessToken));
      const date = routeDateValue(current.fechaDespacho || current.date || current.createdAt);
      if (candidates.some((row) => row.record_id !== recordId && row.data &&
        normalizeDt(row.data.transporte) === normalizeDt(changes.transporte) &&
        routeDateValue(row.data.fechaDespacho || row.data.date || row.data.createdAt) === date)) {
        return NextResponse.json({ error: "Ya existe ese DT para esta fecha. Usa otro DT para evitar que se oculte uno de los viajes." }, { status: 409 });
      }
    }

    const data = {
      ...current,
      ...changes,
      recordId,
      ...(changes.status !== undefined ? { statusUpdatedAt: changes.statusUpdatedAt || new Date().toISOString() } : {}),
      ...(changes.liquidado !== undefined ? { liquidadoUpdatedAt: changes.liquidadoUpdatedAt || new Date().toISOString() } : {}),
      transportista: session.contractor,
    };
    const updateParams = new URLSearchParams({
      contractor: stored.contractor === null ? "is.null" : `eq.${stored.contractor}`,
      record_id: `eq.${recordId}`,
      select: "record_id,data",
    });
    if (stored.contractor === null) updateParams.set("data->>transportista", `eq.${owner}`);
    const updateResponse = await fetch(supabaseRest(TABLE, `?${updateParams.toString()}`), {
      method: "PATCH",
      headers: getWriteHeaders(session.accessToken, { Prefer: "return=representation" }),
      body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      cache: "no-store",
    });
    if (!updateResponse.ok) return NextResponse.json({ error: await supabaseError(updateResponse) }, { status: updateResponse.status });
    const updatedRows = (await updateResponse.json()) as { record_id: string; data?: Vehiculo }[];
    if (updatedRows.length !== 1 || updatedRows[0].record_id !== recordId) {
      return NextResponse.json({ error: "No se confirmó el guardado de la ruta. Recarga e intenta nuevamente." }, { status: 409 });
    }

    clearServerCache(`supabase:${TABLE}:`);
    clearServerCache("supabase:people-summary:");
    clearServerCache("supabase:admin-seguimiento:");
    if (changes.visitados !== undefined && updatedRows[0].data?.visitados !== changes.visitados) {
      return NextResponse.json({ error: "La base de datos no confirmó la cantidad de clientes visitados." }, { status: 409 });
    }
    return NextResponse.json({ record: { ...(updatedRows[0].data || data), recordId } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar el estado." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isAdmin || !isSecurityOwnerEmail(session.email)) {
      return NextResponse.json({ error: "Los DT son permanentes. Solo saul808c@gmail.com puede autorizar una eliminación." }, { status: 403 });
    }

    const body = (await request.json()) as {
      contractor?: string;
      ids?: string[];
      routes?: Array<Pick<Vehiculo, "transporte" | "vehiculo" | "fechaDespacho">>;
    };
    const targetContractor = String(body.contractor || "").trim();
    if (!targetContractor || !normalizeContractorName(targetContractor)) {
      return NextResponse.json({ error: "La aprobación debe indicar expresamente el contratista del DT." }, { status: 400 });
    }
    const recordIds = Array.from(new Set((body.ids || []).map((id) => String(id).trim()).filter(Boolean)));
    if (!recordIds.length) return NextResponse.json({ error: "Falta el registro que se debe borrar." }, { status: 400 });
    if (recordIds.length > 100) return NextResponse.json({ error: "Solo se pueden borrar hasta 100 registros por operación." }, { status: 400 });

    // La vista agrupa las filas duplicadas de un mismo DT. Si se elimina solo
    // el record_id visible, una copia antigua reaparece en el siguiente GET.
    const currentParams = new URLSearchParams({ select: "record_id,data", contractor: `eq.${targetContractor}` });
    const currentRows = await readPagedRows<{ record_id: string; data: Vehiculo }>(
      TABLE,
      currentParams,
      supabaseUserHeaders(session.accessToken),
    );
    const requestedIds = new Set(recordIds);
    const requestedRouteKeys = new Set((body.routes || []).map((route) => deletionRouteKey(route)).filter(Boolean));
    const requestedRows = currentRows.filter(
      (row) => requestedIds.has(row.record_id) || requestedRouteKeys.has(deletionRouteKey(row.data)),
    );
    if (!requestedRows.length) {
      return NextResponse.json({ error: "El DT ya no existe o no se pudo encontrar en Supabase." }, { status: 404 });
    }

    const requestedKeys = new Set(requestedRows.map((row) => deletionRouteKey(row.data)).filter(Boolean));
    const idsToDelete = Array.from(
      new Set(
        currentRows
          .filter((row) => requestedIds.has(row.record_id) || requestedKeys.has(deletionRouteKey(row.data)))
          .map((row) => row.record_id),
      ),
    );

    const deleteError = await deleteSeguimientoRows(
      idsToDelete,
      targetContractor,
      session.accessToken,
      request,
      session,
      "Eliminación manual desde Seguimiento",
    );
    if (deleteError) return NextResponse.json({ error: deleteError }, { status: 500 });

    const verificationRows = await readPagedRows<{ record_id: string }>(
      TABLE,
      new URLSearchParams({ select: "record_id", contractor: `eq.${targetContractor}` }),
      supabaseUserHeaders(session.accessToken),
    );
    const remainingIds = new Set(verificationRows.map((row) => row.record_id));
    if (idsToDelete.some((recordId) => remainingIds.has(recordId))) {
      return NextResponse.json({ error: "Supabase no confirmo el borrado completo del DT. Intenta nuevamente." }, { status: 409 });
    }

    return NextResponse.json({ deleted: idsToDelete.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo borrar el DT." }, { status: 500 });
  }
}

async function preservePersistedRouteProgress<T extends { record_id: string; data: Vehiculo; updated_at: string }>(
  rows: T[],
  contractor: string,
  accessToken: string,
) {
  if (!rows.length) return rows;

  const params = new URLSearchParams({ select: "record_id,data", contractor: `eq.${contractor}` });
  const persistedRows = await readPagedRows<{ record_id: string; data: Vehiculo }>(TABLE, params, supabaseUserHeaders(accessToken)).catch(() => []);
  if (!persistedRows.length) return rows;
  const persistedById = new Map(persistedRows.map((row) => [row.record_id, row.data]));

  return rows.map((row) => {
    const persisted = persistedById.get(row.record_id);
    if (!persisted) return row;

    const incomingClientesTime = Date.parse(row.data.clientesUpdatedAt || "");
    const persistedClientesTime = Date.parse(persisted.clientesUpdatedAt || "");
    const incomingClientesIsNewer =
      Number.isFinite(incomingClientesTime) &&
      (!Number.isFinite(persistedClientesTime) || incomingClientesTime > persistedClientesTime);
    const clientes = incomingClientesIsNewer
      ? Math.max(Number(row.data.clientes || 0), 0)
      : Math.max(Number(row.data.clientes || 0), Number(persisted.clientes || 0));
    const incomingVisitadosTime = Date.parse(row.data.visitadosUpdatedAt || "");
    const persistedVisitadosTime = Date.parse(persisted.visitadosUpdatedAt || "");
    const incomingVisitadosIsNewer =
      Number.isFinite(incomingVisitadosTime) &&
      (!Number.isFinite(persistedVisitadosTime) || incomingVisitadosTime > persistedVisitadosTime);
    const hasVisitadosTimestamp = Number.isFinite(incomingVisitadosTime) || Number.isFinite(persistedVisitadosTime);
    const visitados = Math.min(
      clientes,
      hasVisitadosTimestamp
        ? Math.max(Number(incomingVisitadosIsNewer ? row.data.visitados : persisted.visitados) || 0, 0)
        : Math.max(Number(row.data.visitados || 0), Number(persisted.visitados || 0)),
    );
    const persistedFinished = persisted.status === "Finalizado" || hasStoredTime(persisted.horaLlegada);
    const incomingStatusTime = Date.parse(row.data.statusUpdatedAt || "");
    const persistedStatusTime = Date.parse(persisted.statusUpdatedAt || "");
    const incomingStatusIsNewer =
      Number.isFinite(incomingStatusTime) &&
      (!Number.isFinite(persistedStatusTime) || incomingStatusTime > persistedStatusTime);
    const persistedStatusIsNewer =
      Number.isFinite(persistedStatusTime) &&
      (!Number.isFinite(incomingStatusTime) || persistedStatusTime > incomingStatusTime);
    const preservePersistedStatus = persistedStatusIsNewer || (persistedFinished && !incomingStatusIsNewer);
    const incomingDispatchDateTime = Date.parse(row.data.dispatchDateUpdatedAt || "");
    const persistedDispatchDateTime = Date.parse(persisted.dispatchDateUpdatedAt || "");
    const preservePersistedDispatchDate =
      Number.isFinite(persistedDispatchDateTime) &&
      (!Number.isFinite(incomingDispatchDateTime) || persistedDispatchDateTime > incomingDispatchDateTime);

    return {
      ...row,
      data: {
        ...row.data,
        clientes,
        clientesUpdatedAt: incomingClientesIsNewer
          ? row.data.clientesUpdatedAt
          : persisted.clientesUpdatedAt || row.data.clientesUpdatedAt,
        visitados,
        visitadosUpdatedAt: incomingVisitadosIsNewer
          ? row.data.visitadosUpdatedAt
          : persisted.visitadosUpdatedAt || row.data.visitadosUpdatedAt,
        ...(preservePersistedStatus
          ? {
              status: persistedFinished ? "Finalizado" : persisted.status,
              statusUpdatedAt: persisted.statusUpdatedAt,
              recargue: persisted.recargue || row.data.recargue,
              horaSalida: persisted.horaSalida || row.data.horaSalida,
              horaLlegada: persisted.horaLlegada || row.data.horaLlegada,
              tiempoRuta: persisted.tiempoRuta || row.data.tiempoRuta,
            }
          : {}),
        ...(preservePersistedDispatchDate
          ? {
              fechaDespacho: persisted.fechaDespacho,
              date: persisted.date,
              dispatchDateUpdatedAt: persisted.dispatchDateUpdatedAt,
            }
          : {}),
      },
    };
  });
}

function hasStoredTime(value: string | undefined) {
  return Boolean(value && value !== "Pendiente" && value !== "-");
}

/* Legacy deletion helpers are intentionally kept unreachable as migration
 * documentation. Saving/importing must never invoke them. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function deletePreviousDtCopies(
  changedRecords: { record: Vehiculo; recordId: string }[],
  contractor: string,
  accessToken: string,
  request: Request,
  session: AuthenticatedSession,
) {
  if (!changedRecords.length) return "";

  const headers = getWriteHeaders(accessToken, { Prefer: "return=representation" });
  const uniqueRecords = new Map<string, { dt: string; recordId: string }>();
  changedRecords.forEach(({ record, recordId }) => {
    const dt = String(record.transporte || "").trim();
    if (dt && recordId) uniqueRecords.set(`${dt}:${recordId}`, { dt, recordId });
  });

  for (const { dt, recordId } of uniqueRecords.values()) {
    const params = new URLSearchParams({
      contractor: `eq.${contractor}`,
      "data->>transporte": `eq.${dt}`,
      record_id: `neq.${recordId}`,
    });
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      method: "DELETE",
      headers,
      cache: "no-store",
    });
    if (!response.ok) return await supabaseError(response);
    const deletedRows = await response.json() as Array<{ record_id?: string; data?: Vehiculo }>;
    for (const row of deletedRows) await logDeletedDt(row, contractor, "Copia anterior eliminada por cambio de fecha", request, session);
  }

  clearServerCache(`supabase:${TABLE}:`);
  clearServerCache("supabase:people-summary:");
  clearServerCache("supabase:admin-seguimiento:");
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getSupersededRecordIds(records: Vehiculo[], rows: { record_id: string }[]) {
  const activeIds = new Set(rows.map((row) => row.record_id));

  return Array.from(
    new Set(
      records
        .map((record, index) => {
          const previousId = String(record.recordId || "").trim();
          return previousId && previousId !== rows[index]?.record_id && !activeIds.has(previousId) ? previousId : "";
        })
        .filter(Boolean),
    ),
  );
}

async function deleteSeguimientoRows(recordIds: string[], contractor: string, accessToken: string, request: Request, session: AuthenticatedSession, reason: string) {
  if (!recordIds.length) return "";

  // DELETE nunca utiliza la service role: Supabase debe evaluar el JWT del
  // propietario de seguridad y su política RLS antes de borrar una fila.
  const headers = supabaseUserHeaders(accessToken, { Prefer: "return=representation" });
  for (const recordId of recordIds) {
    const params = new URLSearchParams({ contractor: `eq.${contractor}`, record_id: `eq.${recordId}` });
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      method: "DELETE",
      headers,
      cache: "no-store",
    });
    if (!response.ok) return await supabaseError(response);
    const deletedRows = await response.json() as Array<{ record_id?: string; data?: Vehiculo }>;
    for (const row of deletedRows) await logDeletedDt(row, contractor, reason, request, session);
  }

  clearServerCache(`supabase:${TABLE}:`);
  clearServerCache("supabase:people-summary:");
  clearServerCache("supabase:admin-seguimiento:");
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function deleteRemovedSeguimientoRows(keepIds: string[], contractor: string, accessToken: string, submittedDates: Set<string>, request: Request, session: AuthenticatedSession) {
  if (!submittedDates.size) return "";

  const currentParams = new URLSearchParams({ select: "record_id,data", contractor: `eq.${contractor}` });
  const headers = getWriteHeaders(accessToken);
  const current = await readPagedRows<{ record_id: string; data: Vehiculo }>(TABLE, currentParams, headers);
  const keep = new Set(keepIds);
  const removed = current
    .filter((row) => submittedDates.has(routeDateValue(row.data?.fechaDespacho || row.data?.date || row.data?.createdAt)))
    .filter((row) => !keep.has(row.record_id));
    if (!removed.length) return "";

  for (const row of removed) {
    const params = new URLSearchParams({
      contractor: `eq.${contractor}`,
      record_id: `eq.${row.record_id}`,
    });
    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      method: "DELETE",
      headers,
      cache: "no-store",
    });

    if (!response.ok) return await supabaseError(response);
    await logDeletedDt(row, contractor, "Eliminación manual desde Seguimiento", request, session);
  }
  clearServerCache(`supabase:${TABLE}:`);
  clearServerCache("supabase:people-summary:");
  clearServerCache("supabase:admin-seguimiento:");

  return "";
}

async function logDeletedDt(row: { record_id?: string; data?: Vehiculo }, contractor: string, reason: string, request: Request, session: AuthenticatedSession) {
  const vehicle = row.data || ({} as Vehiculo);
  await writeAuditLog({
    action: "seguimiento_eliminado",
    contractor,
    details: {
      dt: String(vehicle.transporte || ""),
      fechaDespacho: String(vehicle.fechaDespacho || vehicle.date || ""),
      placa: String(vehicle.vehiculo || ""),
      motivo: reason,
      prioridad: "alta",
      eliminadoEn: new Date().toISOString(),
    },
    module: "seguimiento",
    recordId: String(row.record_id || vehicle.recordId || ""),
    request,
    session,
  });
}

function getWriteHeaders(accessToken: string, extra: Record<string, string> = {}) {
  return supabaseAdminHeaders(extra) ?? supabaseUserHeaders(accessToken, extra);
}

function removeDuplicateDtRecords(records: Vehiculo[]) {
  const movedRouteDates = new Map<string, Set<string>>();
  records.forEach((record) => {
    if (!record.dispatchDateUpdatedAt) return;
    const routeKey = getMovedRouteKey(record);
    const dateKey = routeDateValue(record.fechaDespacho || record.date || record.createdAt);
    if (!routeKey || !dateKey) return;

    const dates = movedRouteDates.get(routeKey) || new Set<string>();
    dates.add(dateKey);
    movedRouteDates.set(routeKey, dates);
  });

  const recordsByRoute = new Map<string, Vehiculo>();
  const recordsWithoutRoute: Vehiculo[] = [];

  records.filter((record) => {
    if (record.dispatchDateUpdatedAt) return true;
    const movedDates = movedRouteDates.get(getMovedRouteKey(record));
    if (!movedDates?.size) return true;
    const dateKey = routeDateValue(record.fechaDespacho || record.date || record.createdAt);
    return !dateKey || movedDates.has(dateKey);
  }).forEach((record) => {
    const dt = normalizeDt(record.transporte);
    const fallbackKey = getVehicleRecordKey(record);
    if (!dt && (!fallbackKey || fallbackKey.endsWith("-sin-fecha"))) {
      recordsWithoutRoute.push(record);
      return;
    }

    const contractorKey = normalizeContractorName(record.transportista);
    const dateKey = routeDateValue(record.fechaDespacho || record.date || record.createdAt);
    const uniqueKey = `${contractorKey}:${dt || fallbackKey}:${dateKey || "sin-fecha"}`;
    const current = recordsByRoute.get(uniqueKey);
    if (!current) {
      recordsByRoute.set(uniqueKey, record);
      return;
    }

    // En escrituras, la fila que acaba de cambiar de fecha siempre gana.
    // En lecturas las filas llegan por updated_at desc, por eso se conserva
    // la primera (la mas reciente) y se impide mostrar el mismo DT dos dias.
    if (record.dispatchDateChanged && !current.dispatchDateChanged) {
      recordsByRoute.set(uniqueKey, mergeDuplicateVehicle(current, record));
    } else if (!hasRealVehiclePlate(current.vehiculo) && hasRealVehiclePlate(record.vehiculo)) {
      // Una edición reciente puede tener el dato de placa vacío o pendiente;
      // conserva la placa de la otra fila del mismo DT y fecha.
      recordsByRoute.set(uniqueKey, { ...current, vehiculo: record.vehiculo });
    }
  });

  return [...recordsWithoutRoute, ...recordsByRoute.values()];
}

function getMovedRouteKey(record: Pick<Vehiculo, "transporte" | "vehiculo">) {
  const dt = normalizeDt(record.transporte);
  const plate = normalizePlate(record.vehiculo);
  return dt || plate;
}

function deletionRouteKey(record: Partial<Pick<Vehiculo, "transporte" | "vehiculo" | "fechaDespacho" | "date" | "createdAt">> | undefined) {
  if (!record) return "";
  const dt = normalizeDt(record.transporte);
  const plate = String(record.vehiculo || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const date = routeDateValue(record.fechaDespacho || record.date || record.createdAt);
  return date && (dt || plate) ? `${dt || plate}:${date}` : "";
}

function getSeguimientoRecordId(record: Vehiculo, contractor: string, index: number) {
  const routeKey = getVehicleRecordKey(record);
  const contractorKey = normalizeContractorName(contractor);
  const existingId = String(record.recordId || "").trim();

  // La identidad de una ruta no debe cambiar cuando se edita una fecha. Un
  // record_id existente siempre identifica la fila de Supabase a actualizar.
  if (existingId) return existingId;

  if (routeKey && !routeKey.endsWith("-sin-fecha")) return `seguimiento:${contractorKey}:${routeKey}`;
  return existingId || `seguimiento:${contractorKey}:${routeKey || "sin-ruta"}:${index}`;
}

function mergeDuplicateVehicle(current: Vehiculo, next: Vehiculo) {
  const currentClientesTime = Date.parse(current.clientesUpdatedAt || "");
  const nextClientesTime = Date.parse(next.clientesUpdatedAt || "");
  const freshestClientesRecord =
    Number.isFinite(currentClientesTime) || Number.isFinite(nextClientesTime)
      ? !Number.isFinite(currentClientesTime) || (Number.isFinite(nextClientesTime) && nextClientesTime > currentClientesTime)
        ? next
        : current
      : undefined;
  const clientes = freshestClientesRecord
    ? Math.max(Number(freshestClientesRecord.clientes || 0), 0)
    : Math.max(Number(current.clientes || 0), Number(next.clientes || 0));
  const currentVisitadosTime = Date.parse(current.visitadosUpdatedAt || "");
  const nextVisitadosTime = Date.parse(next.visitadosUpdatedAt || "");
  const freshestVisitadosRecord =
    Number.isFinite(currentVisitadosTime) || Number.isFinite(nextVisitadosTime)
      ? !Number.isFinite(currentVisitadosTime) || (Number.isFinite(nextVisitadosTime) && nextVisitadosTime > currentVisitadosTime)
        ? next
        : current
      : undefined;
  const visitados = freshestVisitadosRecord
    ? Math.max(Number(freshestVisitadosRecord.visitados || 0), 0)
    : Math.max(Number(current.visitados || 0), Number(next.visitados || 0));

  return {
    ...current,
    ...next,
    clientes,
    clientesUpdatedAt: freshestClientesRecord?.clientesUpdatedAt,
    visitadosUpdatedAt: freshestVisitadosRecord?.visitadosUpdatedAt,
    visitados: Math.min(visitados, clientes || visitados),
  };
}

async function applyAttendanceToVehicles(records: Vehiculo[], accessToken: string | undefined, contractor?: string) {
  if (!records.length) return records;

  const attendanceIndex = await readAttendanceIndex(accessToken, contractor);
  if (!attendanceIndex.byContractorDtAndDate.size && !attendanceIndex.latestByContractorDt.size) return records;

  return records.map((vehicle) => {
    const contractorKey = normalizeContractorName(vehicle.transportista || contractor);
    const dt = normalizeDt(vehicle.transporte);
    if (!contractorKey || !dt) return vehicle;

    const dispatchDate = routeDateValue(vehicle.fechaDespacho || vehicle.date || vehicle.createdAt);
    const attendance =
      attendanceIndex.byContractorDtAndDate.get(`${contractorKey}:${dt}:${dispatchDate}`) ||
      attendanceIndex.latestByContractorDt.get(`${contractorKey}:${dt}`);
    if (!attendance) return vehicle;

    const attendanceResponsible = attendance.nombreResponsable || (attendance.cedulaResponsable ? `CC ${attendance.cedulaResponsable}` : "");

    return {
      ...vehicle,
      cedulaResponsable: attendance.cedulaResponsable || vehicle.cedulaResponsable,
      cedulaAuxiliar1: attendance.cedulaAuxiliar1 || vehicle.cedulaAuxiliar1,
      cedulaAuxiliar2: attendance.cedulaAuxiliar2 || vehicle.cedulaAuxiliar2,
      nombreResponsable: attendance.nombreResponsable || vehicle.nombreResponsable,
      nombreAuxiliar1: attendance.nombreAuxiliar1 || vehicle.nombreAuxiliar1,
      nombreAuxiliar2: attendance.nombreAuxiliar2 || vehicle.nombreAuxiliar2,
      responsable: shouldFillResponsible(vehicle.responsable) ? attendanceResponsible || vehicle.responsable : vehicle.responsable,
    };
  });
}

async function readAttendanceIndex(accessToken: string | undefined, contractor?: string) {
  const byContractorDtAndDate = new Map<string, AsistenciaRegistro>();
  const latestByContractorDt = new Map<string, AsistenciaRegistro>();
  const params = new URLSearchParams({ select: "contractor,data", order: "updated_at.desc" });
  // No filtrar aquí por texto literal: hay filas históricas de HL con
  // "HL Logistica" y otras con "HL Logisticos". El filtro seguro se aplica
  // abajo con normalizeContractorName, después de leer las filas permitidas.

  const rows = await readPagedRowsCached<{ contractor?: string; data: AsistenciaRegistro }>(
    "asistencias_ruta",
    params,
    `supabase:asistencias_ruta:index:${contractor || "all"}`,
    RELATED_CACHE_TTL_MS,
    supabaseAdminHeaders() ?? (accessToken ? supabaseReadHeaders(accessToken) : supabaseHeaders()),
  ).catch(() => []);
  rows.forEach((row) => {
    const record = { ...row.data, contratista: row.contractor || row.data.contratista };
    const contractorKey = normalizeContractorName(record.contratista);
    const dt = normalizeDt(record.dt);
    if (!contractorKey || !dt) return;

    const createdDate = routeDateValue(record.createdAt);
    const dateKey = createdDate ? `${contractorKey}:${dt}:${createdDate}` : "";
    const existingForDate = dateKey ? byContractorDtAndDate.get(dateKey) : undefined;
    if (dateKey && (!existingForDate || isNewerAttendance(record, existingForDate))) {
      byContractorDtAndDate.set(dateKey, record);
    }

    const latestKey = `${contractorKey}:${dt}`;
    const existing = latestByContractorDt.get(latestKey);
    if (!existing || isNewerAttendance(record, existing)) {
      latestByContractorDt.set(latestKey, record);
    }
  });

  return { byContractorDtAndDate, latestByContractorDt };
}

function isNewerAttendance(next: AsistenciaRegistro, current: AsistenciaRegistro) {
  return new Date(next.createdAt).getTime() > new Date(current.createdAt).getTime();
}

function shouldFillResponsible(value: string | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return !normalized || ["0", "-", "n/a", "na", "pendiente", "sin responsable", "sinresponsable"].includes(normalized);
}

function routeDateValue(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value.includes("/")) {
    const [day, month, year] = value.split("/").map(Number);
    if ([day, month, year].every(Number.isFinite)) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

async function readPagedRows<T>(table: string, baseParams: URLSearchParams, headers: Record<string, string>) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams(baseParams);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    const response = await fetch(supabaseRest(table, `?${params.toString()}`), { headers, cache: "no-store" });
    if (!response.ok) throw new Error(await supabaseError(response));
    const page = (await response.json()) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function readPagedRowsCached<T>(table: string, baseParams: URLSearchParams, cachePrefix: string, ttlMs: number, headers: Record<string, string>) {
  if (ttlMs <= 0) return readPagedRows<T>(table, baseParams, headers);
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams(baseParams);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    const url = supabaseRest(table, `?${params.toString()}`);
    const page = await cachedJsonFetch<T[]>(`${cachePrefix}:offset:${offset}:${url}`, ttlMs, url, { headers });
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function applyDatabaseCapacities(records: Vehiculo[], accessToken?: string) {
  if (!records.length) return records;

  const capacityByPlate = await readCapacityByPlate(accessToken);
  if (!capacityByPlate.size) return records;

  return records.map((record) => {
    const capacity = capacityByPlate.get(normalizePlate(record.vehiculo));
    return typeof capacity === "number" ? { ...record, capacidad: capacity } : record;
  });
}

async function readCapacityByPlate(accessToken?: string) {
  const params = new URLSearchParams({ select: "*" });
  const url = supabaseRest(CAPACITY_TABLE, `?${params.toString()}`);
  const rows = await cachedJsonFetch<Record<string, unknown>[]>(
    `supabase:${CAPACITY_TABLE}:all:${url}`,
    10 * 60 * 1000,
    url,
    { headers: supabaseAdminHeaders() ?? (accessToken ? supabaseUserHeaders(accessToken) : supabaseHeaders()) },
  ).catch(() => []);
  const capacities = new Map<string, number>();

  rows.forEach((row) => {
    const sources = getSearchableRows(row);
    const plate = normalizePlate(sources.map(readPlate).find(Boolean));
    const capacity = firstFiniteNumber(sources.map(readCapacity));

    if (!plate || !Number.isFinite(capacity)) return;
    capacities.set(plate, capacity);
  });

  return capacities;
}

function valueByKnownKeys(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }

  return valueByHints(row, keys);
}

function valueByHints(row: Record<string, unknown>, hints: string[]) {
  const normalizedHints = hints.map(normalizeKey);

  for (const [key, value] of Object.entries(row)) {
    if (value === undefined || value === null || String(value).trim() === "") continue;

    const normalizedKey = normalizeKey(key);
    if (normalizedHints.some((hint) => normalizedKey.includes(hint) || hint.includes(normalizedKey))) return String(value).trim();
  }

  return "";
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getSearchableRows(row: Record<string, unknown>) {
  const rows = [row];

  Object.values(row).forEach((value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) rows.push(value as Record<string, unknown>);
  });

  return rows;
}

function readPlate(row: Record<string, unknown>) {
  return valueByKnownKeys(row, ["placa", "PLACA", "Placa", "vehiculo", "VEHICULO", "Vehiculo", "vehículo", "Vehículo", "vehicle", "plate", "vh", "VH"]);
}

function readCapacity(row: Record<string, unknown>) {
  return numberValue(
    valueByKnownKeys(row, [
      "capacidad",
      "CAPACIDAD",
      "Capacidad",
      "capacidad_carga",
      "CAPACIDAD_CARGA",
      "capacidadCarga",
      "CapacidadCarga",
      "capacidad de carga",
      "Capacidad de carga",
      "carga",
      "CARGA",
      "Carga",
      "peso",
      "PESO",
      "Peso",
    ]),
  );
}

function firstFiniteNumber(values: number[]) {
  return values.find((value) => Number.isFinite(value)) ?? Number.NaN;
}

function normalizeKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizePlate(value: string | undefined) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");

  return normalized.replace(/^vh/, "");
}

function normalizeDt(value: string | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/^DT-?/i, "")
    .replace(/^(?:R\d+)?S(?=\d)/i, "")
    .replace(/\D/g, "");
}

function hasRealVehiclePlate(value: string | undefined) {
  const normalized = String(value || "").trim().toLocaleLowerCase("es-CO");
  return Boolean(normalized && !["sin placa", "placa pendiente", "validado por asistencia", "pendiente", "-"].includes(normalized));
}
