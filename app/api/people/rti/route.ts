import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { contractorLabel } from "../../../lib/contractors";
import { readServerCache } from "../../../lib/serverCache";
import { supabaseAdminHeaders, supabaseError, supabaseHeaders, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";
import { buildSkuBridge, isSkuUniverseContainer, positiveMatchingKeys, quantityDifference, summarizeQuantities, type RtiSummary, type SkuBridgeEntry } from "../../../personas/rti/rtiCalculation";

const TABLES = ["RACOCIMI1", "RACOCIMI2"] as const;
const PAGE_SIZE = 1_000;
const SUPABASE_TIMEOUT_MS = 30_000;
const LOOKUP_CONCURRENCY = 4;
const RTI_SOURCE_CACHE_MS = 5 * 60 * 1_000;

export async function GET(request: Request) {
  const requestStartedAt = performance.now();
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const params = new URL(request.url).searchParams;
    const requestedFrom = params.get("from");
    const requestedTo = params.get("to");
    const fromDate = normalizeDateParam(requestedFrom);
    const toDate = normalizeDateParam(requestedTo) || (fromDate ? bogotaToday() : "");
    const dateFilterActive = Boolean(fromDate || toDate);
    const responsibleFilter = params.get("responsible")?.trim() || "";
    const referenceFilter = params.get("reference")?.trim() || "";
    const carrierFilter = params.get("carrier")?.trim() || "";
    // Diagnóstico temporal: agregar ?debug=1 a la URL para ver en la consola
    // del servidor cómo se arma el RTI paso a paso (totales, llaves
    // coincidentes/sin coincidencia, filas inválidas). No afecta la
    // respuesta ni el cálculo, solo imprime logs.
    const debug = params.get("debug") === "1";
    const logDebug = (label: string, value: unknown) => {
      if (debug) console.log(`[RTI DEBUG] ${label}:`, value);
    };

    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const relatedHeaders = supabaseAdminHeaders() ?? supabaseHeaders();
    const sourceBundle = await readServerCache(`rti-source:${session.userId}:${debug ? "audit" : "operational"}`, RTI_SOURCE_CACHE_MS, async () => {
      const datasets = await Promise.all(TABLES.map((table) => readTable(table, headers)));
      const routeDts = Array.from(new Set(
        datasets.flatMap((rows) =>
          rows.flatMap((row) => routeVariants(readValue(row, ["Transporte", "Ruta", "DT"]))),
        ).filter(Boolean),
      ));
      const [skuResult, attendanceRows, seguimientoRows, registeredPeople, sqResult] = await Promise.all([
        readSkuCatalog(headers),
        readAttendanceManagers(relatedHeaders, routeDts),
        readSeguimientoManagers(headers, routeDts),
        readRegisteredPeople(relatedHeaders),
        debug ? readSqRoutes(headers) : Promise.resolve(emptySourceResult("SQ01", "Carga completa disponible únicamente con debug=1")),
      ]);
      return { datasets, routeDts, skuResult, attendanceRows, seguimientoRows, registeredPeople, sqResult };
    });
    const { datasets, routeDts, skuResult, attendanceRows, seguimientoRows, registeredPeople, sqResult } = sourceBundle;
    const sourceLoadedAt = performance.now();
    logDebug("RACOCIMI1 filas originales", datasets[0].length);
    logDebug("RACOCIMI2 filas originales", datasets[1].length);
    const skuRows = skuResult.rows;
    const sqRows = sqResult.rows;
    logDebug("Consulta SKU", skuResult.diagnostics);
    logDebug("Consulta SQ01", sqResult.diagnostics);
    const skuBridge = buildSkuBridge(skuRows.map(toSkuBridgeEntry));
    const skuByContainer = new Map<string, { descripcionEnvase: string; unidadesEnvase: number | null }>();
    skuBridge.byMaterial.forEach((sku) => {
      const current = skuByContainer.get(sku.envase);
      if (!current || (!current.descripcionEnvase && sku.descripcionEnvase)) {
        skuByContainer.set(sku.envase, {
          descripcionEnvase: sku.descripcionEnvase,
          unidadesEnvase: sku.unidadesEnvase,
        });
      }
    });
    const managerByRoute = new Map<string, string>();
    const dateByRoute = new Map<string, string>();
    const carrierByRoute = new Map<string, string>();
    const plateByRoute = new Map<string, string>();
    const returnDateByRoute = new Map<string, string>();
    // Fecha de despacho registrada en seguimiento_vehiculos, aparte de
    // dateByRoute (que mezcla SQ01/asistencias/seguimiento): esta es la
    // fuente que usa el Power BI de referencia para fechar tanto la salida
    // como el retorno, así que tiene prioridad sobre la fecha propia de
    // RACOCIMI1/2.
    const seguimientoDispatchDateByRoute = new Map<string, string>();
    sqRows.forEach((row) => {
      const routeKeys = routeVariants(readValue(row, ["Transporte", "Ruta", "DT"]));
      const date = normalizeSqDate(readValue(row, ["Creado el", "InPlanTran", "Fecha"]));
      const carrier = String(readValue(row, ["Nombre Transportista", "Transportista"]) || "").trim();
      const plate = String(readValue(row, ["Placa"]) || "").trim();
      routeKeys.forEach((dt) => {
        if (date && !dateByRoute.has(dt)) dateByRoute.set(dt, date);
        if (carrier && !carrierByRoute.has(dt)) carrierByRoute.set(dt, carrier);
        if (plate && !plateByRoute.has(dt)) plateByRoute.set(dt, plate);
      });
    });
    attendanceRows.forEach((row) => {
      const routeKeys = routeVariants(row.data?.dt);
      const manager = String(row.data?.nombreResponsable || "").trim();
      const date = normalizeDate(row.data?.createdAt);
      if (!routeKeys.length) return;
      routeKeys.forEach((dt) => {
        if (date && !dateByRoute.has(dt)) dateByRoute.set(dt, date);
      });
      if (!manager) return;
      routeKeys.forEach((dt) => {
        if (date && !managerByRoute.has(`${dt}:${date}`)) managerByRoute.set(`${dt}:${date}`, manager);
        if (!managerByRoute.has(dt)) managerByRoute.set(dt, manager);
      });
    });
    seguimientoRows.forEach((row) => {
      const routeKeys = routeVariants(row.dt);
      const manager = String(row.nombreResponsable || row.responsable || "").trim();
      const date = normalizeDate(row.fechaDespacho);
      if (!routeKeys.length) return;
      routeKeys.forEach((dt) => {
        if (date && !dateByRoute.has(dt)) dateByRoute.set(dt, date);
        if (date && !seguimientoDispatchDateByRoute.has(dt)) seguimientoDispatchDateByRoute.set(dt, date);
      });
      if (manager) {
        routeKeys.forEach((dt) => {
          if (date && !managerByRoute.has(`${dt}:${date}`)) managerByRoute.set(`${dt}:${date}`, manager);
          if (!managerByRoute.has(dt)) managerByRoute.set(dt, manager);
        });
      }
      // Se sabe que el vehículo retornó cuando su seguimiento queda en
      // "Finalizado"; statusUpdatedAt (o updated_at si falta) da el día real
      // de retorno, en vez de intentar leerlo de RACOCIMI2.
      if (row.status === "Finalizado") {
        const returnDate = normalizeDate(row.statusUpdatedAt) || normalizeDate(row.updatedAt);
        if (returnDate) routeKeys.forEach((dt) => {
          if (!returnDateByRoute.has(dt)) returnDateByRoute.set(dt, returnDate);
        });
      }
    });
    const contractorByManager = new Map<string, string>();
    registeredPeople.forEach((person) => {
      const manager = normalizePersonName(person.NOMBRE);
      const contractor = contractorLabel(String(person.CONTRATISTA || ""));
      if (manager && contractor && !contractorByManager.has(manager)) {
        contractorByManager.set(manager, contractor);
      }
    });
    const enrichedDatasets = datasets.map((rows, datasetIndex) =>
      rows.map((row) => {
        const materialOriginal = materialKey(row);
        const outboundSku = datasetIndex === 0 ? skuBridge.byMaterial.get(materialOriginal) : undefined;
        const skuMetadata = outboundSku ?? (datasetIndex === 1 ? skuByContainer.get(materialOriginal) : undefined);
        const normalizedContainer = datasetIndex === 0
          ? (outboundSku?.envase || (materialOriginal ? `UNMAPPED-${materialOriginal}` : ""))
          : materialOriginal;
        const product = skuMetadata?.descripcionEnvase || "";
        const route = normalizeRoute(readValue(row, ["Ruta"]));
        const transport = normalizeTransport(readValue(row, ["Transporte", "DT"])) || route;
        const dt = transport || route;
        const routeKeys = Array.from(new Set([
          ...routeVariants(transport),
          ...routeVariants(route),
        ]));
        const ownDate = normalizeDate(readOperationalDate(row));
        const trackingDate = routeKeys.map((key) => seguimientoDispatchDateByRoute.get(key)).find(Boolean) || "";
        const relatedDate = routeKeys.map((key) => dateByRoute.get(key)).find(Boolean) || "";
        const date = ownDate || trackingDate || relatedDate;
        const dateSource = ownDate ? "record" : trackingDate ? "tracking" : relatedDate ? "sq01-or-attendance" : "unresolved";
        const rowManager = String(readValue(row, ["Nombre RR", "Responsable", "Nombre responsable"]) || "").trim();
        const manager = rowManager ||
          routeKeys.map((key) => managerByRoute.get(`${key}:${date}`)).find(Boolean) ||
          (!date ? routeKeys.map((key) => managerByRoute.get(key)).find(Boolean) : "") ||
          "";
        const rowCarrier = String(readValue(row, ["Transportista", "Nombre Transportista"]) || "").trim();
        const contractor = rowCarrier || routeKeys.map((key) => carrierByRoute.get(key)).find(Boolean) || contractorByManager.get(normalizePersonName(manager)) || "";
        const plate = String(readValue(row, ["Placa"]) || "").trim() || routeKeys.map((key) => plateByRoute.get(key)).find(Boolean) || "";
        const vehicleReturnDate = routeKeys.map((key) => returnDateByRoute.get(key)).find(Boolean) || "";
        return {
          ...row,
          ...(transport ? { Transporte: transport } : {}),
          ...(route ? { Ruta: route } : {}),
          ...(materialOriginal ? { "Material original": materialOriginal } : {}),
          ...(normalizedContainer ? { "Envase normalizado": normalizedContainer, "Material/SKU": normalizedContainer } : {}),
          ...(skuMetadata?.unidadesEnvase !== null && skuMetadata?.unidadesEnvase !== undefined ? { "Unidades envase": skuMetadata.unidadesEnvase } : {}),
          ...(product ? { Producto: product, Envase: product, "Descripción": product, "Descripción de envase": product } : {}),
          ...(dt ? { DT: dt } : {}),
          ...(date ? { "Fecha despacho": date } : {}),
          "Fuente fecha": dateSource,
          ...(vehicleReturnDate ? { "Fecha retorno vehículo": vehicleReturnDate } : {}),
          ...(manager ? { "Nombre RR": manager } : {}),
          ...(contractor ? { Transportista: contractor } : {}),
          ...(plate ? { Placa: plate } : {}),
        };
      }),
    );
    // Fecha de despacho por llave, tomada siempre de RACOCIMI1: el retorno
    // (RACOCIMI2) suele registrarse días después, y si dejáramos que cada fila
    // representativa cargara su propia fecha, el reporte "por día" agruparía
    // el retorno bajo el día en que se procesó en vez del día en que salió.
    // También se usa para decidir si una fila de retorno entra en el rango
    // from/to solicitado: se filtra por la fecha en que salió el envase, no
    // por la fecha en que RACOCIMI2 registró el retorno.
    const dispatchDateByKey = new Map<string, string>();
    enrichedDatasets[0].forEach((row) => {
      const key = routeMaterialKey(row);
      const date = String(row["Fecha despacho"] ?? "").trim();
      if (key && date && !dispatchDateByKey.has(key)) dispatchDateByKey.set(key, date);
    });
    function inDateRange(date: string) {
      if (!fromDate && !toDate) return true;
      if (!date) return false;
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
      return true;
    }
    const resolvedOutboundDate = (row: Record<string, unknown>) => String(row["Fecha despacho"] ?? "").trim();
    const resolvedReturnedDate = (row: Record<string, unknown>) => dispatchDateByKey.get(routeMaterialKey(row)) || String(row["Fecha despacho"] ?? "").trim();
    const dateScopedOutbound = dateFilterActive
      ? enrichedDatasets[0].filter((row) => inDateRange(resolvedOutboundDate(row)))
      : enrichedDatasets[0];
    const dateScopedReturned = dateFilterActive
      ? enrichedDatasets[1].filter((row) => inDateRange(resolvedReturnedDate(row)))
      : enrichedDatasets[1];
    const attributesByKey = buildAttributesByKey(dateScopedOutbound, dateScopedReturned);
    const skuContainers = new Set(Array.from(skuBridge.byMaterial.values(), (value) => value.envase));
    const skuUniverseKeys = new Set(Array.from(attributesByKey.keys()).filter((key) => isSkuUniverseContainer(containerFromRouteMaterialKey(key), skuContainers)));
    const skuUniverseAttributes = Array.from(skuUniverseKeys, (key) => attributesByKey.get(key)).filter((value): value is RtiKeyAttributes => Boolean(value));
    const filterOptions = {
      responsible: distinctStrings(skuUniverseAttributes.map((value) => value.responsible)),
      reference: distinctStrings(skuUniverseAttributes.map((value) => value.reference)),
      carrier: distinctStrings(skuUniverseAttributes.map((value) => value.carrier)),
    };
    const allowedKeys = new Set(Array.from(attributesByKey, ([key, value]) => ({ key, value }))
      .filter(({ value }) =>
        (!responsibleFilter || comparablePerson(value.responsible) === comparablePerson(responsibleFilter)) &&
        (!referenceFilter || comparableText(value.reference) === comparableText(referenceFilter)) &&
        (!carrierFilter || comparableText(value.carrier) === comparableText(carrierFilter))
      )
      .map(({ key }) => key));
    const scopedOutbound = dateScopedOutbound.filter((row) => allowedKeys.has(routeMaterialKey(row)));
    const scopedReturned = dateScopedReturned.filter((row) => allowedKeys.has(routeMaterialKey(row)));
    const dateFilteredAt = performance.now();
    logDebug("Filtro de fecha", { requestedFrom, requestedTo, parsedFrom: fromDate, parsedTo: toDate, dateFilterActive });
    logDebug("Filas posteriores al filtro", { outbound: scopedOutbound.length, returned: scopedReturned.length });
    logDebug("Cantidades posteriores al filtro", { outbound: sumValidQuantities(scopedOutbound), returned: sumValidQuantities(scopedReturned) });
    if (debug) {
      const skuEnvases = new Set(Array.from(skuBridge.byMaterial.values(), (value) => value.envase));
      const returnedSkuEnvaseRows = scopedReturned.filter((row) => {
        const material = normalizeReference(readValue(row, ["Material original", "Material", "Material/SKU"]));
        return material.startsWith("350") && skuEnvases.has(material);
      });
      const diagnosticOutbound = sumValidQuantities(scopedOutbound);
      const diagnosticReturned = sumValidQuantities(returnedSkuEnvaseRows);
      logDebug("RESULTADO RACOCIMI2 350 vs SKU.Envase", {
        outboundRows: scopedOutbound.length,
        returnedRowsIncluded: returnedSkuEnvaseRows.length,
        returnedRowsExcluded: scopedReturned.length - returnedSkuEnvaseRows.length,
        outbound: diagnosticOutbound,
        returned: diagnosticReturned,
        rti: diagnosticOutbound ? Math.round((diagnosticReturned / diagnosticOutbound) * 1_000) / 10 : 0,
        skuEnvases: Array.from(skuEnvases).sort(),
      });
    }
    if (debug) {
      const outboundMissingKey = scopedOutbound.filter((row) => !routeMaterialKey(row)).length;
      const returnedMissingKey = scopedReturned.filter((row) => !routeMaterialKey(row)).length;
      const outboundInvalidQuantity = scopedOutbound.filter((row) => routeMaterialKey(row) && readCantidadReal(row) === null).length;
      const returnedInvalidQuantity = scopedReturned.filter((row) => routeMaterialKey(row) && readCantidadReal(row) === null).length;
      const outboundMissingDate = enrichedDatasets[0].filter((row) => !resolvedOutboundDate(row)).length;
      const returnedMissingDate = enrichedDatasets[1].filter((row) => !resolvedReturnedDate(row)).length;
      logDebug("Filas de salida sin llave (Ruta+Envase normalizado incompletos)", outboundMissingKey);
      logDebug("Filas de retorno sin llave (Ruta+Envase normalizado incompletos)", returnedMissingKey);
      logDebug("Filas de salida con 'Cantidad real' inválida/vacía (se excluyen de la suma)", outboundInvalidQuantity);
      logDebug("Filas de retorno con 'Cantidad real' inválida/vacía (se excluyen de la suma)", returnedInvalidQuantity);
      logDebug("Filas de salida sin fecha de despacho resuelta", outboundMissingDate);
      logDebug("Filas de retorno sin fecha de despacho resuelta", returnedMissingDate);
    }
    const outboundByRouteAndMaterial = sumQuantityByRouteAndMaterial(scopedOutbound);
    const returnedByRouteAndMaterial = sumQuantityByRouteAndMaterial(scopedReturned);
    if (debug) {
      const outboundGroupedTotal = Array.from(outboundByRouteAndMaterial.values()).reduce((sum, value) => sum + value, 0);
      const returnedGroupedTotal = Array.from(returnedByRouteAndMaterial.values()).reduce((sum, value) => sum + value, 0);
      logDebug("Estrategia de llave", "route+normalizedContainer");
      logDebug("Llaves distintas de salida (Ruta+Envase normalizado)", outboundByRouteAndMaterial.size);
      logDebug("Llaves distintas de retorno (Ruta+Envase normalizado)", returnedByRouteAndMaterial.size);
      logDebug("Total agrupado de salida (suma de Cantidad real por llave)", outboundGroupedTotal);
      logDebug("Total agrupado de retorno (suma de Cantidad real por llave)", returnedGroupedTotal);

      const matchedKeys = Array.from(outboundByRouteAndMaterial.keys()).filter((key) => returnedByRouteAndMaterial.has(key));
      const outboundOnlyKeys = Array.from(outboundByRouteAndMaterial.keys()).filter((key) => !returnedByRouteAndMaterial.has(key));
      const returnedOnlyKeys = Array.from(returnedByRouteAndMaterial.keys()).filter((key) => !outboundByRouteAndMaterial.has(key));
      logDebug("Llaves coincidentes (con salida y retorno)", matchedKeys.length);
      logDebug("Llaves solo con salida (retorno pendiente o aún no cargado)", outboundOnlyKeys.length);
      logDebug("Llaves solo con retorno (sin salida en el rango filtrado — revisar)", returnedOnlyKeys.length);
      if (returnedOnlyKeys.length) logDebug("Ejemplo de llaves de retorno sin salida", returnedOnlyKeys.slice(0, 5));

      // Valida el supuesto de que Transporte+Ruta+Material alcanza como llave
      // sin necesitar la fecha: si un mismo DT/ruta/material aparece con más
      // de una fecha de despacho distinta, el DT se está reutilizando entre
      // envíos diferentes y la llave debería incluir la fecha.
      const datesByKey = new Map<string, Set<string>>();
      scopedOutbound.forEach((row) => {
        const key = routeMaterialKey(row);
        const date = String(row["Fecha despacho"] ?? "").trim();
        if (!key || !date) return;
        const dates = datesByKey.get(key) ?? new Set<string>();
        dates.add(date);
        datesByKey.set(key, dates);
      });
      const keysWithMultipleDates = Array.from(datesByKey.entries()).filter(([, dates]) => dates.size > 1);
      logDebug("Llaves con más de una fecha de despacho (posible reuso de DT; si es > 0 la llave debe incluir fecha)", keysWithMultipleDates.length);
      if (keysWithMultipleDates.length) {
        logDebug("Ejemplo de llaves con fechas múltiples", keysWithMultipleDates.slice(0, 5).map(([key, dates]) => ({ key, dates: Array.from(dates) })));
      }
    }
    // Se parte de la estructura de RACOCIMI2 (retorno) y se trae desde
    // RACOCIMI1 la cantidad de envase que salió, cruzando por la llave.
    const representativeRows = new Map<string, Record<string, unknown>>();
    scopedOutbound.forEach((row) => {
      const key = routeMaterialKey(row);
      if (key && !representativeRows.has(key)) representativeRows.set(key, row);
    });
    // Se agregan los despachos que todavía no tienen ninguna fila de retorno,
    // para no perderlos del reporte (quedan con retorno en 0).
    scopedReturned.forEach((row) => {
      const key = routeMaterialKey(row);
      if (key && !representativeRows.has(key)) representativeRows.set(key, row);
    });
    const calculatedRti = Array.from(representativeRows).map(([key, row]) => {
      const outbound = outboundByRouteAndMaterial.get(key) ?? 0;
      const returned = returnedByRouteAndMaterial.get(key) ?? 0;
      const percentage = outbound ? (returned / outbound) * 100 : null;
      const dispatchDate = dispatchDateByKey.get(key) || String(row["Fecha despacho"] ?? "").trim();
      const parts = dateParts(dispatchDate);
      const attributes = attributesByKey.get(key);
      return {
        ...row,
        ...(attributes ? { "Nombre RR": attributes.responsible, "Descripción de envase": attributes.reference, Transportista: attributes.carrier } : {}),
        ...(dispatchDate ? { "Fecha despacho": dispatchDate } : {}),
        // Se sobrescriben Día/Mes/Año con los de la fecha de despacho para que
        // el agrupamiento por día del frontend no use por accidente columnas
        // Día/Mes/Año propias de RACOCIMI2 (que reflejarían el retorno).
        ...(parts ? { Día: parts.day, Mes: parts.month, Año: parts.year } : {}),
        "Cajas reales salida": outbound,
        "Cajas reales retorno": returned,
        "Diferencia envase retorno": quantityDifference(outbound, returned),
        ...(percentage !== null ? { "Porcentaje RTI": Math.round(percentage * 10) / 10 } : {}),
      };
    });

    // TEMPORAL:
    // Todo el dashboard RTI utiliza solo el universo SKU para mantener
    // consistencia entre el indicador y las visualizaciones mientras
    // se confirma la medida DAX de Power BI.
    const skuUniverseRecords = calculatedRti.filter((row) => isSkuUniverseContainer(normalizeReference(readValue(row, ["Envase normalizado", "Material/SKU", "Material", "Envase"])), skuContainers));
    const summary = { calculationMode: "skuMappedOnly" as const, ...summarizeCalculatedRows(skuUniverseRecords) };

    const structuredDebug = debug
      ? buildStructuredDebug({
          datasets,
          enrichedDatasets,
          scopedOutbound,
          scopedReturned,
          outboundByRouteAndMaterial,
          returnedByRouteAndMaterial,
          records: skuUniverseRecords,
          summary,
          skuRows,
          skuBridge,
          sqRows,
          sourceQueries: { sku: skuResult.diagnostics, sq01: sqResult.diagnostics },
          seguimientoRows,
          filters: {
            from: fromDate,
            to: toDate,
            responsible: responsibleFilter,
            reference: referenceFilter,
            carrier: carrierFilter,
          },
          trackingRows: seguimientoRows.length,
          requestedFrom,
          requestedTo,
          dateFilterActive,
          resolvedOutboundDate,
          resolvedReturnedDate,
          timings: { sourceLoadMs: sourceLoadedAt - requestStartedAt, dateResolutionAndFilterMs: dateFilteredAt - sourceLoadedAt },
        })
      : undefined;

    if (debug) {
      logDebug("Total final de salida (suma sobre calculatedRti)", summary.outboundTotal);
      logDebug("Total final de retorno (suma sobre calculatedRti)", summary.returnedTotal);
      logDebug("RTI final", `${summary.rtiPercentage}%`);
      logDebug("Escenario RACOCIMI2.Material 350 cruzado con SKU.Envase", structuredDebug?.rtiScenarios.racocimi2SkuEnvaseOnly);
    }

    return NextResponse.json({
      // El modo diagnóstico devuelve solo métricas/muestras. Serializar más
      // de cien mil registros junto al debug provocaba respuestas enormes y
      // era la causa más probable del 500 observado tras completar los logs.
      ...(!debug ? { records: skuUniverseRecords } : {}),
      summary,
      filterOptions,
      ...(structuredDebug ? { debug: structuredDebug } : {}),
      total: skuUniverseRecords.length,
      skuCatalogRows: skuRows.length,
      matchedRouteManagers: [...scopedOutbound, ...scopedReturned].filter((row) => row["Nombre RR"]).length,
      routeDtCount: routeDts.length,
    });
  } catch (error) {
    console.error("[RTI ERROR]", error);
    const details = process.env.NODE_ENV === "development" && error instanceof Error
      ? { message: error.message, stack: error.stack }
      : undefined;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron consultar los datos RTI.", ...(details ? { details } : {}) },
      { status: 500 },
    );
  }
}

function summarizeCalculatedRows(rows: Record<string, unknown>[]): RtiSummary {
  return summarizeQuantities(rows.map((row) => ({
    outbound: Number(row["Cajas reales salida"]) || 0,
    returned: Number(row["Cajas reales retorno"]) || 0,
  })));
}

function outputText(row: Record<string, unknown>, aliases: string[], fallback: string) {
  return String(readValue(row, aliases) || fallback).trim();
}

type RtiKeyAttributes = { responsible: string; reference: string; carrier: string };

function comparableText(value: string) {
  return normalizePersonName(value);
}

function comparablePerson(value: string) {
  const normalized = comparableText(value);
  return ["", "sin responsable", "s responsable", "no asignado", "sin asignar"].includes(normalized)
    ? "sin responsable"
    : normalized;
}

function responsibleLabel(value: unknown) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return comparablePerson(text) === "sin responsable" ? "Sin responsable" : text;
}

function attributesFromRow(row: Record<string, unknown>): RtiKeyAttributes {
  const description = outputText(row, ["Descripción de envase", "Descripcion envase"], "");
  return {
    responsible: responsibleLabel(readValue(row, ["Nombre RR", "Responsable", "Nombre responsable"])),
    reference: description || outputText(row, ["Envase normalizado", "Material/SKU", "Material", "Envase"], "Sin referencia"),
    carrier: outputText(row, ["Transportista", "Nombre Transportista"], "Sin transportista").replace(/\s+/g, " "),
  };
}

function buildAttributesByKey(outboundRows: Record<string, unknown>[], returnedRows: Record<string, unknown>[]) {
  const attributes = new Map<string, RtiKeyAttributes>();
  outboundRows.forEach((row) => {
    const key = routeMaterialKey(row);
    if (key && !attributes.has(key)) attributes.set(key, attributesFromRow(row));
  });
  returnedRows.forEach((row) => {
    const key = routeMaterialKey(row);
    if (!key || attributes.has(key)) return;
    attributes.set(key, attributesFromRow(row));
  });
  return attributes;
}

function distinctStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, "es-CO"));
}

function exactDuplicateStats(rows: Record<string, unknown>[]) {
  const seen = new Set<string>();
  let removed = 0;
  let amount = 0;
  rows.forEach((row) => {
    const signature = JSON.stringify(row);
    if (seen.has(signature)) {
      removed += 1;
      amount += readCantidadReal(row) ?? 0;
    } else {
      seen.add(signature);
    }
  });
  return { removed, amount };
}

function sumValidQuantities(rows: Record<string, unknown>[]) {
  return rows.reduce((sum, row) => sum + (readCantidadReal(row) ?? 0), 0);
}

function buildStructuredDebug(input: {
  datasets: Record<string, unknown>[][];
  enrichedDatasets: Record<string, unknown>[][];
  scopedOutbound: Record<string, unknown>[];
  scopedReturned: Record<string, unknown>[];
  outboundByRouteAndMaterial: Map<string, number>;
  returnedByRouteAndMaterial: Map<string, number>;
  records: Record<string, unknown>[];
  summary: RtiSummary;
  filters: { from: string; to: string; responsible: string; reference: string; carrier: string };
  trackingRows: number;
  skuRows: Record<string, unknown>[];
  skuBridge: ReturnType<typeof buildSkuBridge>;
  sqRows: Record<string, unknown>[];
  sourceQueries: { sku: SourceQueryDiagnostics; sq01: SourceQueryDiagnostics };
  seguimientoRows: Array<{ dt?: unknown; fechaDespacho?: unknown; responsable?: unknown; nombreResponsable?: unknown }>;
  requestedFrom: string | null;
  requestedTo: string | null;
  dateFilterActive: boolean;
  resolvedOutboundDate: (row: Record<string, unknown>) => string;
  resolvedReturnedDate: (row: Record<string, unknown>) => string;
  timings: { sourceLoadMs: number; dateResolutionAndFilterMs: number };
}) {
  const outboundKeys = Array.from(input.outboundByRouteAndMaterial.keys());
  const returnedKeys = Array.from(input.returnedByRouteAndMaterial.keys());
  const matchingKeys = outboundKeys.filter((key) => input.returnedByRouteAndMaterial.has(key));
  const outboundOnlyKeys = outboundKeys.filter((key) => !input.returnedByRouteAndMaterial.has(key));
  const returnedOnlyKeys = returnedKeys.filter((key) => !input.outboundByRouteAndMaterial.has(key));
  const outboundDuplicates = exactDuplicateStats(input.datasets[0]);
  const returnedDuplicates = exactDuplicateStats(input.datasets[1]);
  const debugStartedAt = performance.now();
  const datesByKey = new Map<string, Set<string>>();
  const managersByKey = new Map<string, Set<string>>();
  input.enrichedDatasets.forEach((rows) => rows.forEach((row) => {
    const key = routeMaterialKey(row);
    if (!key) return;
    const date = outputText(row, ["Fecha despacho"], "");
    const manager = outputText(row, ["Nombre RR"], "");
    if (date) (datesByKey.get(key) ?? datesByKey.set(key, new Set()).get(key))?.add(date);
    if (manager) (managersByKey.get(key) ?? managersByKey.set(key, new Set()).get(key))?.add(manager);
  }));
  const suspiciousRoutes = Array.from(new Set([...datesByKey.keys(), ...managersByKey.keys()]))
    .filter((key) => (datesByKey.get(key)?.size ?? 0) > 1 || (managersByKey.get(key)?.size ?? 0) > 1)
    .slice(0, 50)
    .map((key) => ({
      key,
      dates: Array.from(datesByKey.get(key) ?? []),
      responsibleNames: Array.from(managersByKey.get(key) ?? []),
      outbound: input.outboundByRouteAndMaterial.get(key) ?? 0,
      returned: input.returnedByRouteAndMaterial.get(key) ?? 0,
    }));
  const rawOutbound = sumValidQuantities(input.datasets[0]);
  const rawReturned = sumValidQuantities(input.datasets[1]);
  const groupedOutbound = Array.from(input.outboundByRouteAndMaterial.values()).reduce((sum, value) => sum + value, 0);
  const groupedReturned = Array.from(input.returnedByRouteAndMaterial.values()).reduce((sum, value) => sum + value, 0);
  let outboundRowsMapped = 0;
  let outboundQuantityMapped = 0;
  const unmapped = new Map<string, { rows: number; quantity: number }>();
  input.enrichedDatasets[0].forEach((row) => {
    const material = outputText(row, ["Material original"], "");
    const quantity = readCantidadReal(row) ?? 0;
    if (input.skuBridge.byMaterial.has(material)) {
      outboundRowsMapped += 1;
      outboundQuantityMapped += quantity;
    } else {
      const value = unmapped.get(material) ?? { rows: 0, quantity: 0 };
      value.rows += 1;
      value.quantity += quantity;
      unmapped.set(material, value);
    }
  });
  const beforeOutbound = sumQuantityByRouteAndMaterial(input.datasets[0]);
  const beforeReturned = sumQuantityByRouteAndMaterial(input.datasets[1]);
  const matchingBefore = Array.from(beforeOutbound.keys()).filter((key) => beforeReturned.has(key));
  const matchedOutbound = matchingKeys.reduce((sum, key) => sum + (input.outboundByRouteAndMaterial.get(key) ?? 0), 0);
  const matchedReturned = matchingKeys.reduce((sum, key) => sum + (input.returnedByRouteAndMaterial.get(key) ?? 0), 0);
  const rtiScenarios = buildRtiScenarios(
    input.scopedOutbound,
    input.scopedReturned,
    input.outboundByRouteAndMaterial,
    input.returnedByRouteAndMaterial,
    input.skuBridge,
  );
  const visibleConsistency = buildVisibleConsistency(input.records, input.summary);
  const sqAudit = auditSq01Paths(input.datasets, input.enrichedDatasets, input.sqRows, input.seguimientoRows);
  const outboundWithoutDate = input.enrichedDatasets[0].filter((row) => !input.resolvedOutboundDate(row));
  const returnedWithoutDate = input.enrichedDatasets[1].filter((row) => !input.resolvedReturnedDate(row));
  const countMissing = (datasetIndex: number, predicate: (row: Record<string, unknown>) => boolean) =>
    input.enrichedDatasets[datasetIndex].reduce((count, row) => count + Number(predicate(row)), 0);
  const dateSourceCounts = (datasetIndex: number) => input.enrichedDatasets[datasetIndex].reduce<Record<string, number>>((counts, row) => {
    const source = outputText(row, ["Fuente fecha"], "unresolved");
    counts[source] = (counts[source] ?? 0) + 1;
    return counts;
  }, {});
  return {
    filters: { ...input.filters, requestedFrom: input.requestedFrom, requestedTo: input.requestedTo, parsedFrom: input.filters.from, parsedTo: input.filters.to, dateFilterActive: input.dateFilterActive },
    keyStrategy: "route+normalizedContainer",
    source: { outboundRowsOriginal: input.datasets[0].length, returnedRowsOriginal: input.datasets[1].length, trackingRows: input.trackingRows },
    dateResolved: { outboundRows: input.enrichedDatasets[0].length - outboundWithoutDate.length, returnedRows: input.enrichedDatasets[1].length - returnedWithoutDate.length },
    dateSources: { priority: ["record", "tracking", "sq01-or-attendance"], outbound: dateSourceCounts(0), returned: dateSourceCounts(1), returnedFilterFallback: "matching outbound dispatch date, then returned resolved date" },
    dateFiltered: { outboundRows: input.scopedOutbound.length, returnedRows: input.scopedReturned.length, outboundQuantity: sumValidQuantities(input.scopedOutbound), returnedQuantity: sumValidQuantities(input.scopedReturned) },
    grouped: { outboundKeys: input.outboundByRouteAndMaterial.size, returnedKeys: input.returnedByRouteAndMaterial.size, outboundQuantity: groupedOutbound, returnedQuantity: groupedReturned },
    final: { outbound: input.summary.outboundTotal, returned: input.summary.returnedTotal, rti: input.summary.rtiPercentage },
    rtiScenarios,
    visibleConsistency,
    excludedWithoutResolvedDate: {
      outbound: { rows: outboundWithoutDate.length, quantity: sumValidQuantities(outboundWithoutDate) },
      returned: { rows: returnedWithoutDate.length, quantity: sumValidQuantities(returnedWithoutDate) },
      rows: outboundWithoutDate.length + returnedWithoutDate.length,
      quantity: sumValidQuantities(outboundWithoutDate) + sumValidQuantities(returnedWithoutDate),
    },
    columns: {
      racocimi1: Object.keys(input.datasets[0][0] ?? {}),
      racocimi2: Object.keys(input.datasets[1][0] ?? {}),
      sq01: Array.from(new Set(input.sqRows.flatMap((row) => Object.keys(row)))),
    },
    sourceQueries: input.sourceQueries,
    sku: { rowsLoaded: input.skuRows.length, uniqueMaterials: input.skuBridge.uniqueMaterials, duplicatedMaterials: input.skuBridge.duplicatedMaterials, materialsWithoutEnvase: input.skuBridge.materialsWithoutEnvase, mappedOutboundRows: outboundRowsMapped, unmappedOutboundRows: input.enrichedDatasets[0].length - outboundRowsMapped, conflicts: input.skuBridge.conflicts.slice(0, 20) },
    mapping: { outboundRows: input.enrichedDatasets[0].length, outboundRowsMapped, outboundRowsUnmapped: input.enrichedDatasets[0].length - outboundRowsMapped, outboundQuantityMapped, outboundQuantityUnmapped: rawOutbound - outboundQuantityMapped },
    ...sqAudit,
    invalid: {
      outboundRowsWithoutDate: outboundWithoutDate.length,
      returnedRowsWithoutDate: returnedWithoutDate.length,
      outboundQuantityWithoutDate: sumValidQuantities(outboundWithoutDate),
      returnedQuantityWithoutDate: sumValidQuantities(returnedWithoutDate),
      rowsWithoutRoute: countMissing(0, (row) => !normalizeRoute(readValue(row, ["Ruta"]))) + countMissing(1, (row) => !normalizeRoute(readValue(row, ["Ruta"]))),
      rowsWithoutMaterial: countMissing(0, (row) => !materialKey(row)) + countMissing(1, (row) => !materialKey(row)),
      rowsWithoutQuantity: countMissing(0, (row) => readCantidadReal(row) === null) + countMissing(1, (row) => readCantidadReal(row) === null),
      rowsWithoutTrackingMatch: countMissing(0, (row) => !outputText(row, ["Nombre RR"], "")) + countMissing(1, (row) => !outputText(row, ["Nombre RR"], "")),
    },
    duplicates: {
      removedFromRacocimi1: outboundDuplicates.removed,
      removedFromRacocimi2: returnedDuplicates.removed,
      outboundAmountRemoved: outboundDuplicates.amount,
      returnedAmountRemoved: returnedDuplicates.amount,
    },
    keys: {
      outboundKeys: outboundKeys.slice(0, 50),
      returnedKeys: returnedKeys.slice(0, 50),
      matchingKeys: matchingKeys.slice(0, 50),
      outboundOnlyKeys: outboundOnlyKeys.slice(0, 50),
      returnedOnlyKeys: returnedOnlyKeys.slice(0, 50),
      counts: { outbound: outboundKeys.length, returned: returnedKeys.length, matching: matchingKeys.length, outboundOnly: outboundOnlyKeys.length, returnedOnly: returnedOnlyKeys.length },
      comparison: { outboundKeysBeforeSku: beforeOutbound.size, outboundKeysAfterSku: outboundKeys.length, returnedKeys: returnedKeys.length, matchingBeforeSku: matchingBefore.length, matchingAfterSku: matchingKeys.length },
    },
    totals: {
      rawOutbound,
      rawReturned,
      filteredOutbound: sumValidQuantities(input.scopedOutbound),
      filteredReturned: sumValidQuantities(input.scopedReturned),
      groupedOutbound,
      groupedReturned,
      finalOutbound: input.summary.outboundTotal,
      finalReturned: input.summary.returnedTotal,
      currentTypeScriptRti: input.summary.rtiPercentage,
      daxEquivalentNumerator: null,
      daxEquivalentDenominator: null,
      daxEquivalentRti: null,
      daxStatus: "No calculable: no se proporcionaron las medidas DAX ni las relaciones del modelo.",
      outbound: groupedOutbound,
      returned: groupedReturned,
      matchedOutbound,
      matchedReturned,
      rti: groupedOutbound ? Math.round((groupedReturned / groupedOutbound) * 1_000) / 10 : 0,
    },
    exclusions: [
      { reason: "Filas fuera del periodo solicitado", rows: input.datasets[0].length + input.datasets[1].length - input.scopedOutbound.length - input.scopedReturned.length, outbound: rawOutbound - sumValidQuantities(input.scopedOutbound), returned: rawReturned - sumValidQuantities(input.scopedReturned) },
      { reason: "Llaves solo retorno (se conservan)", rows: returnedOnlyKeys.length, outbound: 0, returned: returnedOnlyKeys.reduce((sum, key) => sum + (input.returnedByRouteAndMaterial.get(key) ?? 0), 0) },
    ],
    suspiciousRoutes: suspiciousRoutes.slice(0, 20),
    unmappedMaterials: Array.from(unmapped, ([material, value]) => ({ material, description: "", ...value })).sort((left, right) => right.quantity - left.quantity).slice(0, 50),
    mappingExamples: input.enrichedDatasets[0].filter((row) => !outputText(row, ["Envase normalizado"], "").startsWith("UNMAPPED-")).slice(0, 20).map((row) => ({ materialOriginal: outputText(row, ["Material original"], ""), envaseNormalizado: outputText(row, ["Envase normalizado"], ""), route: outputText(row, ["Ruta"], ""), finalKey: routeMaterialKey(row) })),
    timings: { ...input.timings, debugBuildMs: performance.now() - debugStartedAt },
  };
}

function buildRtiScenarios(
  outboundRows: Record<string, unknown>[],
  returnedRows: Record<string, unknown>[],
  outboundByKey: Map<string, number>,
  returnedByKey: Map<string, number>,
  skuBridge: ReturnType<typeof buildSkuBridge>,
) {
  const percentage = (outbound: number, returned: number) => outbound
    ? Math.round((returned / outbound) * 1_000) / 10
    : 0;
  const excludedMaterials = (rows: Record<string, unknown>[], included: (row: Record<string, unknown>) => boolean) => {
    const values = new Map<string, { rows: number; quantity: number }>();
    rows.forEach((row) => {
      if (included(row)) return;
      const material = outputText(row, ["Material original", "Material", "Material/SKU"], "Sin material");
      const current = values.get(material) ?? { rows: 0, quantity: 0 };
      current.rows += 1;
      current.quantity += readCantidadReal(row) ?? 0;
      values.set(material, current);
    });
    return Array.from(values, ([material, value]) => ({ material, ...value }))
      .sort((left, right) => right.quantity - left.quantity);
  };
  const summarizeRows = (
    outboundIncluded: (row: Record<string, unknown>) => boolean,
    returnedIncluded: (row: Record<string, unknown>) => boolean,
  ) => {
    const includedOutbound = outboundRows.filter(outboundIncluded);
    const includedReturned = returnedRows.filter(returnedIncluded);
    const outbound = sumValidQuantities(includedOutbound);
    const returned = sumValidQuantities(includedReturned);
    return {
      includedRows: { outbound: includedOutbound.length, returned: includedReturned.length },
      excludedRows: { outbound: outboundRows.length - includedOutbound.length, returned: returnedRows.length - includedReturned.length },
      outbound,
      returned,
      rti: percentage(outbound, returned),
      excludedMaterials: {
        outbound: excludedMaterials(outboundRows, outboundIncluded),
        returned: excludedMaterials(returnedRows, returnedIncluded),
      },
    };
  };
  const validContainers = new Set(Array.from(skuBridge.byMaterial.values(), (value) => value.envase));
  const mappedOutbound = (row: Record<string, unknown>) => skuBridge.byMaterial.has(outputText(row, ["Material original"], ""));
  const relatedReturn = (row: Record<string, unknown>) => validContainers.has(normalizeReference(readValue(row, ["Envase normalizado", "Material/SKU", "Material", "Envase"])));
  const racocimi2SkuEnvase = (row: Record<string, unknown>) => {
    const material = normalizeReference(readValue(row, ["Material original", "Material", "Material/SKU"]));
    return material.startsWith("350") && validContainers.has(material);
  };
  const matchingKeys = positiveMatchingKeys(outboundByKey, returnedByKey);
  const matchingRow = (row: Record<string, unknown>) => matchingKeys.has(routeMaterialKey(row));
  const allOutbound = sumValidQuantities(outboundRows);
  const allReturned = sumValidQuantities(returnedRows);
  const matchingOutbound = Array.from(matchingKeys).reduce((sum, key) => sum + (outboundByKey.get(key) ?? 0), 0);
  const matchingReturned = Array.from(matchingKeys).reduce((sum, key) => sum + (returnedByKey.get(key) ?? 0), 0);
  const matchingRowsSummary = summarizeRows(matchingRow, matchingRow);
  return {
    allMaterials: {
      includedRows: { outbound: outboundRows.length, returned: returnedRows.length },
      excludedRows: { outbound: 0, returned: 0 },
      outbound: allOutbound,
      returned: allReturned,
      rti: percentage(allOutbound, allReturned),
      excludedMaterials: { outbound: [], returned: [] },
    },
    skuMappedOnly: summarizeRows(mappedOutbound, relatedReturn),
    // Diagnóstico solicitado: SKU filtra únicamente RACOCIMI2.Material por
    // coincidencia exacta contra SKU.Envase. No modifica el indicador visible.
    racocimi2SkuEnvaseOnly: {
      ...summarizeRows(() => true, racocimi2SkuEnvase),
      rule: "RACOCIMI2.Material startsWith 350 and exists in SKU.Envase; denominator keeps all outbound rows",
      supportedSkuEnvases: Array.from(validContainers).sort(),
    },
    matchingKeysOnly: {
      ...matchingRowsSummary,
      outbound: matchingOutbound,
      returned: matchingReturned,
      rti: percentage(matchingOutbound, matchingReturned),
      matchingKeys: matchingKeys.size,
    },
  };
}

function buildVisibleConsistency(records: Record<string, unknown>[], summary: RtiSummary) {
  const recordTotals = summarizeCalculatedRows(records);
  const aggregateDimension = (aliases: string[]) => {
    const groups = new Map<string, { outbound: number; returned: number }>();
    records.forEach((row) => {
      const key = outputText(row, aliases, "Sin valor");
      const current = groups.get(key) ?? { outbound: 0, returned: 0 };
      current.outbound += Number(row["Cajas reales salida"]) || 0;
      current.returned += Number(row["Cajas reales retorno"]) || 0;
      groups.set(key, current);
    });
    return Array.from(groups.values()).reduce((total, value) => ({
      outbound: total.outbound + value.outbound,
      returned: total.returned + value.returned,
    }), { outbound: 0, returned: 0 });
  };
  const responsible = aggregateDimension(["Nombre RR"]);
  const reference = aggregateDimension(["Descripción de envase", "Envase normalizado", "Material/SKU"]);
  const carrier = aggregateDimension(["Transportista"]);
  return {
    recordsOutbound: recordTotals.outboundTotal,
    recordsReturned: recordTotals.returnedTotal,
    summaryOutbound: summary.outboundTotal,
    summaryReturned: summary.returnedTotal,
    responsibleOutbound: responsible.outbound,
    responsibleReturned: responsible.returned,
    referenceOutbound: reference.outbound,
    referenceReturned: reference.returned,
    carrierOutbound: carrier.outbound,
    carrierReturned: carrier.returned,
  };
}

function auditSq01Paths(
  datasets: Record<string, unknown>[][],
  enrichedDatasets: Record<string, unknown>[][],
  sqRows: Record<string, unknown>[],
  trackingRows: Array<{ dt?: unknown; fechaDespacho?: unknown; responsable?: unknown; nombreResponsable?: unknown }>,
) {
  const trackingByDt = new Map<string, (typeof trackingRows)[number]>();
  trackingRows.forEach((row) => routeVariants(row.dt).forEach((dt) => {
    if (!trackingByDt.has(dt)) trackingByDt.set(dt, row);
  }));
  const sqByTransport = new Map<string, Record<string, unknown>[]>();
  sqRows.forEach((row) => {
    const transport = normalizeTransport(readValue(row, ["Transporte"]));
    if (!transport) return;
    const values = sqByTransport.get(transport) ?? [];
    values.push(row);
    sqByTransport.set(transport, values);
  });
  const sqDts = (row: Record<string, unknown>) => routeVariants(readValue(row, ["DT", "Ruta", "Transporte"]));
  const conflicts = Array.from(sqByTransport, ([transporte, rows]) => ({
    transporte,
    dts: Array.from(new Set(rows.flatMap(sqDts))),
    plates: Array.from(new Set(rows.map((row) => outputText(row, ["Placa"], "")).filter(Boolean))),
    dates: Array.from(new Set(rows.map((row) => normalizeDate(readOperationalDate(row))).filter(Boolean))),
    centers: Array.from(new Set(rows.map((row) => outputText(row, ["Centro", "Nombre Centro"], "")).filter(Boolean))),
    rows: rows.length,
  })).filter((item) => item.dts.length > 1);
  const counters = {
    sourceRows: 0, matchedDirectlyWithTracking: 0, matchedThroughSq01: 0, matchedByBoth: 0,
    onlyDirectTracking: 0, onlySq01: 0, differentDtBetweenSources: 0, unmatchedByEither: 0,
  };
  const quantities = { outboundMatchedDirectly: 0, returnedMatchedDirectly: 0, outboundMatchedThroughSq01: 0, returnedMatchedThroughSq01: 0 };
  const examples: Array<Record<string, unknown>> = [];
  const scenarioAccumulators = Array.from({ length: 3 }, () => ({
    rows: [0, 0],
    quantities: [0, 0],
    keys: [new Set<string>(), new Set<string>()],
    rowsWithoutResponsible: 0,
  }));
  const addScenarioRow = (scenario: number, dataset: number, row: Record<string, unknown>, responsible: boolean) => {
    const accumulator = scenarioAccumulators[scenario];
    accumulator.rows[dataset] += 1;
    accumulator.quantities[dataset] += readCantidadReal(row) ?? 0;
    const key = routeMaterialKey(row);
    if (key) accumulator.keys[dataset].add(key);
    if (!responsible) accumulator.rowsWithoutResponsible += 1;
  };
  datasets.forEach((rows, datasetIndex) => rows.forEach((row, rowIndex) => {
    counters.sourceRows += 1;
    const identifiers = routeVariants(readValue(row, ["Transporte", "Ruta", "DT"]));
    const directDt = identifiers.find((id) => trackingByDt.has(id)) || "";
    const transport = normalizeTransport(readValue(row, ["Transporte", "Ruta", "DT"]));
    const sqCandidates = sqByTransport.get(transport) ?? identifiers.flatMap((id) => sqByTransport.get(id) ?? []);
    const fromSq = Array.from(new Set(sqCandidates.flatMap(sqDts)));
    const sqDt = fromSq.find((dt) => trackingByDt.has(dt)) || fromSq[0] || "";
    const throughSq = Boolean(sqDt && trackingByDt.has(sqDt));
    const direct = Boolean(directDt);
    const quantity = readCantidadReal(row) ?? 0;
    if (direct) {
      counters.matchedDirectlyWithTracking += 1;
      if (datasetIndex === 0) quantities.outboundMatchedDirectly += quantity; else quantities.returnedMatchedDirectly += quantity;
    }
    if (throughSq) {
      counters.matchedThroughSq01 += 1;
      if (datasetIndex === 0) quantities.outboundMatchedThroughSq01 += quantity; else quantities.returnedMatchedThroughSq01 += quantity;
    }
    if (direct && throughSq) counters.matchedByBoth += 1;
    else if (direct) counters.onlyDirectTracking += 1;
    else if (throughSq) counters.onlySq01 += 1;
    else counters.unmatchedByEither += 1;
    if (direct && sqDt && directDt !== sqDt) counters.differentDtBetweenSources += 1;
    const enriched = enrichedDatasets[datasetIndex][rowIndex];
    const directTracking = trackingByDt.get(directDt);
    const sqTracking = trackingByDt.get(sqDt);
    if (direct) addScenarioRow(0, datasetIndex, enriched, Boolean(directTracking?.nombreResponsable || directTracking?.responsable));
    if (sqDt) addScenarioRow(1, datasetIndex, enriched, false);
    if (throughSq) addScenarioRow(2, datasetIndex, enriched, Boolean(sqTracking?.nombreResponsable || sqTracking?.responsable));
    if (examples.length < 20 && (!direct || !throughSq || directDt !== sqDt)) examples.push({
      transporte: transport, dtFromTracking: directDt, dtFromSq01: sqDt,
      date: normalizeDate(directTracking?.fechaDespacho || sqTracking?.fechaDespacho),
      route: outputText(row, ["Ruta"], ""),
      responsible: String(directTracking?.nombreResponsable || directTracking?.responsable || sqTracking?.nombreResponsable || sqTracking?.responsable || ""),
      result: direct && throughSq ? (directDt === sqDt ? "both-same" : "both-different") : direct ? "direct-only" : throughSq ? "sq01-only" : "unmatched",
    });
  }));
  const scenarios = scenarioAccumulators.map((value, index) => ({
    scenario: index + 1,
    outboundRows: value.rows[0],
    returnedRows: value.rows[1],
    matchingKeys: Array.from(value.keys[0]).filter((key) => value.keys[1].has(key)).length,
    outbound: value.quantities[0],
    returned: value.quantities[1],
    rti: value.quantities[0] ? Math.round((value.quantities[1] / value.quantities[0]) * 1_000) / 10 : 0,
    rowsWithoutResponsible: value.rowsWithoutResponsible,
  }));
  return {
    sq01: {
      rowsLoaded: sqRows.length,
      uniqueTransportes: sqByTransport.size,
      duplicatedTransportes: Array.from(sqByTransport.values()).filter((rows) => rows.length > 1).length,
      rowsWithoutDt: sqRows.filter((row) => !sqDts(row).length).length,
      conflictingTransportes: conflicts.slice(0, 20),
    },
    comparison: counters,
    quantities,
    scenarios,
    examples,
  };
}

type SourceQueryDiagnostics = {
  table: string;
  queryTemplate: string;
  firstQuery: string;
  lastQuery: string;
  pageSize: number;
  pagesLoaded: number;
  rowsLoaded: number;
  exactVisibleCount: number | null;
  statuses: number[];
  filters: string[];
  countScope: string;
};

function emptySourceResult(table: string, reason: string) {
  return {
    rows: [] as Record<string, unknown>[],
    diagnostics: {
      table,
      queryTemplate: reason,
      firstQuery: "",
      lastQuery: "",
      pageSize: PAGE_SIZE,
      pagesLoaded: 0,
      rowsLoaded: 0,
      exactVisibleCount: null,
      statuses: [],
      filters: [],
      countScope: reason,
    } satisfies SourceQueryDiagnostics,
  };
}

async function readPaginatedSource(table: string, headers: Record<string, string>) {
  const rows: Record<string, unknown>[] = [];
  const statuses: number[] = [];
  let exactVisibleCount: number | null = null;
  let firstQuery = "";
  let lastQuery = "";
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({ select: "*", offset: String(offset), limit: String(PAGE_SIZE) });
    const query = supabaseRest(table, `?${params.toString()}`);
    if (!firstQuery) firstQuery = query;
    lastQuery = query;
    const response = await fetchSupabase(query, {
      headers: { ...headers, Prefer: "count=exact" },
      cache: "no-store",
    });
    statuses.push(response.status);
    if (!response.ok) throw new Error(`${table}: ${await supabaseError(response)}`);
    const count = response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
    if (count) exactVisibleCount = Number(count);
    const page = (await response.json()) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE || (exactVisibleCount !== null && rows.length >= exactVisibleCount)) break;
  }
  const diagnostics: SourceQueryDiagnostics = {
    table,
    queryTemplate: `${supabaseRest(table)}?select=*&offset={offset}&limit=${PAGE_SIZE}`,
    firstQuery,
    lastQuery,
    pageSize: PAGE_SIZE,
    pagesLoaded: statuses.length,
    rowsLoaded: rows.length,
    exactVisibleCount,
    statuses,
    filters: [],
    countScope: "Conteo exacto visible para el rol autenticado; RLS puede ocultar filas si no se usa service_role.",
  };
  return { rows, diagnostics };
}

async function readSkuCatalog(headers: Record<string, string>) {
  // El nombre confirmado es exactamente SKU. No se usan eq, filtros de
  // fecha, head ni range implícito; la paginación es explícita.
  return readPaginatedSource("SKU", headers);
}

async function readRegisteredPeople(headers: Record<string, string>) {
  const params = new URLSearchParams({
    select: "NOMBRE,CONTRATISTA",
    order: "NOMBRE.asc",
    limit: "5000",
  });
  const response = await fetchSupabase(supabaseRest("transporte_barranquilla", `?${params.toString()}`), {
    headers,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Personas: ${await supabaseError(response)}`);
  return (await response.json().catch(() => [])) as Array<{
    NOMBRE?: unknown;
    CONTRATISTA?: unknown;
  }>;
}

async function readAttendanceManagers(headers: Record<string, string>, dts: string[]) {
  const chunks = chunkValues(dts, 200);
  const pages = await mapWithConcurrency(chunks, LOOKUP_CONCURRENCY, async (chunk) => {
    const params = new URLSearchParams({
      select: "contractor,data",
      "data->>dt": `in.(${chunk.join(",")})`,
      order: "updated_at.desc",
      limit: "10000",
    });
    const response = await fetchSupabase(supabaseRest("asistencias_ruta", `?${params.toString()}`), {
      headers,
      cache: "no-store",
    });
    return response.ok ? await response.json() : [];
  });
  return pages.flat() as Array<{
    contractor?: string;
    data?: {
      dt?: unknown;
      nombreResponsable?: unknown;
      createdAt?: unknown;
    };
  }>;
}

async function readSeguimientoManagers(headers: Record<string, string>, dts: string[]) {
  const chunks = chunkValues(dts, 200);
  const pages = await mapWithConcurrency(chunks, LOOKUP_CONCURRENCY, async (chunk) => {
    const params = new URLSearchParams({
      select: "dt:data->>transporte,fechaDespacho:data->>fechaDespacho,responsable:data->>responsable,nombreResponsable:data->>nombreResponsable,status:data->>status,statusUpdatedAt:data->>statusUpdatedAt,updatedAt:updated_at",
      "data->>transporte": `in.(${chunk.join(",")})`,
      order: "updated_at.desc",
      limit: "10000",
    });
    const response = await fetchSupabase(supabaseRest("seguimiento_vehiculos", `?${params.toString()}`), {
      headers,
      cache: "no-store",
    });
    return response.ok ? await response.json() : [];
  });
  return pages.flat() as Array<{
    dt?: unknown;
    fechaDespacho?: unknown;
    responsable?: unknown;
    nombreResponsable?: unknown;
    status?: unknown;
    statusUpdatedAt?: unknown;
    updatedAt?: unknown;
  }>;
}

async function readSqRoutes(headers: Record<string, string>) {
  // Antes se filtraba SQ01.Transporte con los últimos diez dígitos de Ruta
  // antes de demostrar que ambos campos compartían dominio. Ese in.(...) era
  // la causa de rowsLoaded=0. Se carga la tabla exacta SQ01 sin filtros y el
  // análisis de relaciones se hace posteriormente con Maps locales.
  return readPaginatedSource("SQ01", headers);
}

function chunkValues(values: string[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, index * size + size));
}

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, task: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

async function readTable(table: string, headers: Record<string, string>) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({ select: "*", offset: String(offset), limit: String(PAGE_SIZE) });
    const response = await fetchSupabase(supabaseRest(table, `?${params.toString()}`), {
      headers,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`${table}: ${await supabaseError(response)}`);
    const page = (await response.json()) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchSupabase(input: string, init: RequestInit) {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("Supabase tardó demasiado en responder.");
    }
    throw error;
  }
}

function normalizeReference(value: unknown) {
  return String(value ?? "").trim().replace(/^0+/, "").toUpperCase();
}

function normalizePersonName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeDt(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

function rightmostDt(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return normalizeDt(digits);
}

function normalizeTransport(value: unknown) {
  return normalizeReference(value);
}

function normalizeRoute(value: unknown) {
  return rightmostDt(value);
}

function routeVariants(value: unknown) {
  // "Quitar los 10" es quitar el prefijo "10" (p.ej. 108008722178 -> 8008722178,
  // los últimos 10 dígitos), no los primeros 10 caracteres como conteo.
  const full = normalizeDt(value);
  if (!full) return [];
  const short = full.length > 10 ? normalizeDt(full.slice(-10)) : full;
  return Array.from(new Set([full, short].filter(Boolean)));
}

function normalizeDate(value: unknown) {
  if (!value) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    // Fechas seriales de Excel (sistema 1900).
    const excelDate = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    return excelDate.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const colombianDate = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s|$)/);
  if (colombianDate) {
    const [, day, month, year] = colombianDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const isoDate = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : "";
}

function normalizeSqDate(value: unknown) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s|$)/);
  if (match) {
    const [, month, day, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return normalizeDate(value);
}

function readValue(row: Record<string, unknown>, aliases: string[]) {
  // Se respeta el orden de prioridad de "aliases" (el más preferido primero) en
  // vez del orden de columnas de la fila, y se salta un alias si su valor está
  // vacío, para no quedarnos con la primera columna que calce por casualidad.
  const byNormalizedName = new Map<string, unknown>();
  Object.entries(row).forEach(([column, value]) => {
    const normalized = normalizeColumn(column);
    if (!byNormalizedName.has(normalized)) byNormalizedName.set(normalized, value);
  });
  for (const alias of aliases) {
    const value = byNormalizedName.get(normalizeColumn(alias));
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function routeMaterialKey(row: Record<string, unknown>) {
  // RACOCIMI1 ya trae aquí el Envase normalizado mediante SKU; RACOCIMI2
  // usa directamente su código de envase real.
  const route = normalizeRoute(readValue(row, ["Ruta"]));
  const transport = normalizeTransport(readValue(row, ["Transporte", "DT"])) || route;
  const container = normalizeReference(readValue(row, ["Envase normalizado", "Material/SKU", "Material", "Envase"]));
  return transport && route && container ? `${transport}:${route}:${container}` : "";
}

function containerFromRouteMaterialKey(key: string) {
  const separator = key.lastIndexOf(":");
  return separator >= 0 ? key.slice(separator + 1) : "";
}

function toSkuBridgeEntry(row: Record<string, unknown>): SkuBridgeEntry {
  return {
    material: normalizeReference(readValue(row, ["Material"])),
    envase: normalizeReference(readValue(row, ["Envase"])),
    descripcionEnvase: String(readValue(row, ["Descripcion envase", "Descripción envase"]) || "").trim(),
    unidadesEnvase: parseNumericValue(readValue(row, ["Unidades envase"])),
  };
}

function materialKey(row: Record<string, unknown>) {
  return normalizeReference(readValue(row, ["Material/SKU", "Material", "Referencia", "SKU"]));
}

function sumQuantityByRouteAndMaterial(rows: Record<string, unknown>[]) {
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const key = routeMaterialKey(row);
    const quantity = readCantidadReal(row);
    if (!key || quantity === null) return;
    totals.set(key, (totals.get(key) || 0) + quantity);
  });
  return totals;
}

function readCantidadReal(row: Record<string, unknown>) {
  return parseNumericValue(readValue(row, ["Cantidad real"]));
}

function normalizeDateParam(value: string | null) {
  if (!value) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function bogotaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

function dateParts(dateIso: string) {
  const match = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

function readOperationalDate(row: Record<string, unknown>) {
  const explicit = readValue(row, [
    "Fecha despacho",
    "Fecha de despacho",
    "Fecha de contabilización",
    "Fecha contabilización",
    "Fecha de entrada",
    "Fecha entrada",
    "Fecha documento",
    "Fecha de documento",
    "Fecha",
    "Date",
  ]);
  if (explicit !== undefined && explicit !== null && explicit !== "") return explicit;
  return Object.entries(row).find(([column, value]) =>
    normalizeColumn(column).includes("fecha") && value !== undefined && value !== null && value !== "",
  )?.[1];
}

function normalizeColumn(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseNumericValue(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  const numericText = text.replace(/[^\d,.-]/g, "");
  const hasComma = numericText.includes(",");
  const hasDot = numericText.includes(".");
  let normalized = numericText;
  if (hasComma && hasDot) {
    const decimalSeparator = numericText.lastIndexOf(",") > numericText.lastIndexOf(".") ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = numericText.replaceAll(thousandsSeparator, "").replace(decimalSeparator, ".");
  } else if (hasComma) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(numericText)
      ? numericText.replaceAll(",", "")
      : numericText.replace(",", ".");
  } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(numericText)) {
    normalized = numericText.replaceAll(".", "");
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}
