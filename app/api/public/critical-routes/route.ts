import { NextResponse } from "next/server";
import { supabaseAdminHeaders, supabaseError, supabaseHeaders, supabaseRest } from "../../../lib/supabaseServer";
import { isRrRole } from "../../../lib/rrRole";
import { encodeCoordinateDetails, readCoordinateRecord } from "../../../lib/coordinateRecords";

export async function GET(request: Request) {
  try {
    // La vista TV de ubicaciones no depende del catálogo de barrios.
    if (new URL(request.url).searchParams.get("scope") === "coordinates") {
      const hazards: Record<string, unknown>[] = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const params = new URLSearchParams({ select: "*", activo: "eq.true", order: "id.desc", limit: String(pageSize), offset: String(offset) });
        const response = await fetch(supabaseRest("ruta_criticas_riesgos", `?${params}`), { cache: "no-store", headers: supabaseHeaders() });
        if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
        const page = await response.json();
        if (!Array.isArray(page)) throw new Error("La respuesta de ubicaciones no es válida.");
        hazards.push(...page);
        if (page.length < pageSize) break;
      }
      const records = hazards.map(readCoordinateRecord);
      const legacyIds = [...new Set(records.filter((row) => !row.nombreRr || !row.contratista).map((row) => row.tipo).filter((cc) => /^\d+$/.test(cc)))];
      let enrichmentWarning = "";
      for (let offset = 0; offset < legacyIds.length; offset += 100) {
        const ids = legacyIds.slice(offset, offset + 100);
        try {
          const params = new URLSearchParams({ select: "CC,NOMBRE,CONTRATISTA", CC: `in.(${ids.join(",")})`, limit: "1000" });
          const response = await fetch(supabaseRest("transporte_barranquilla", `?${params}`), { cache: "no-store", headers: supabaseAdminHeaders() ?? supabaseHeaders() });
          if (!response.ok) throw new Error("No se pudo consultar personal.");
          const people = await response.json() as { CC: string | number; NOMBRE?: string; CONTRATISTA?: string }[];
          const byId = new Map(people.map((person) => [String(person.CC), person]));
          records.forEach((row) => {
            const person = byId.get(row.tipo);
            if (person) { row.nombreRr ||= person.NOMBRE || ""; row.contratista ||= person.CONTRATISTA || ""; }
          });
        } catch { enrichmentWarning = "Algunos registros antiguos no pudieron completar los datos del RR y la contratista."; }
      }
      return NextResponse.json({ hazards: records, warning: enrichmentWarning });
    }
    const params = new URLSearchParams({ select: "*", limit: "200" });
    const response = await fetch(supabaseRest("ruta_criticas", `?${params}`), {
      cache: "no-store",
      headers: supabaseHeaders(),
    });

    if (!response.ok) {
      return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    }

    const rows = (await response.json().catch(() => [])) as Array<Record<string, unknown>>;
    const neighborhoods = rows
      .map((row, index) => ({
        id: Number(row["#"] ?? index + 1),
        route: String(row.RUTA ?? "").trim(),
        distributionCenter: String(row.CD ?? "").trim(),
      }))
      .filter((row) => row.route)
      .sort((a, b) => a.id - b.id);

    const hazardResponse = await fetch(supabaseRest("ruta_criticas_riesgos", "?select=id,ruta,tipo,descripcion,latitud,longitud,activo&activo=eq.true&order=id.desc"), { cache: "no-store", headers: supabaseHeaders() });
    const hazards = hazardResponse.ok ? await hazardResponse.json().catch(() => []) : [];
    return NextResponse.json({ neighborhoods, hazards: Array.isArray(hazards) ? hazards.map(readCoordinateRecord) : [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar los barrios." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const route = String(body.route ?? "").trim().slice(0, 120);
    const type = String(body.type ?? "").trim().slice(0, 120);
    const isCoordinateForm = new URL(request.url).searchParams.get("scope") === "coordinates";
    let description = isCoordinateForm ? "Ubicación del cliente registrada mediante GPS." : String(body.description ?? "").trim().slice(0, 240);
    const customerCode = String(body.customerCode ?? "").trim();
    if (isCoordinateForm && !/^\d{1,40}$/.test(customerCode)) return NextResponse.json({ error: "Ingresa un código de cliente válido." }, { status: 400 });
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    if (!route || !description || !type || body.latitude == null || body.longitude == null || String(body.latitude).trim() === "" || String(body.longitude).trim() === "" || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return NextResponse.json({ error: "Completa correctamente el reporte." }, { status: 400 });
    }
    const hazardTypes = ["cables_bajos", "via_danada", "inundacion", "cierre", "peligro"];
    if (isCoordinateForm || !hazardTypes.includes(type)) {
      if (!/^\d+$/.test(type)) return NextResponse.json({ error: "Ingresa una cédula RR válida." }, { status: 400 });
      const params = new URLSearchParams({ select: "CC,CARGO,NOMBRE,CONTRATISTA", CC: `eq.${type}`, limit: "1" });
      const peopleResponse = await fetch(supabaseRest("transporte_barranquilla", `?${params}`), { cache: "no-store", headers: supabaseAdminHeaders() ?? supabaseHeaders() });
      if (!peopleResponse.ok) return NextResponse.json({ error: "No se pudo validar el cargo del RR. Intenta nuevamente." }, { status: 503 });
      const people = await peopleResponse.json();
      if (!Array.isArray(people) || !isRrRole(people[0]?.CARGO)) return NextResponse.json({ error: "La cédula no pertenece a un RR registrado. No se permite guardar la coordenada." }, { status: 403 });
      if (isCoordinateForm) description = encodeCoordinateDetails({ codigoCliente: customerCode, nombreRr: String(people[0].NOMBRE || ""), contratista: String(people[0].CONTRATISTA || ""), createdAt: new Date().toISOString() });
    }
    const response = await fetch(supabaseRest("ruta_criticas_riesgos"), {
      method: "POST", cache: "no-store", headers: supabaseHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify({ ruta: route, tipo: type, descripcion: description, latitud: latitude, longitud: longitude, activo: true }),
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    const saved = await response.json();
    if (!Array.isArray(saved) || !saved[0]?.id) throw new Error("No se recibió la confirmación de guardado de la coordenada.");
    return NextResponse.json({ hazard: readCoordinateRecord(saved[0]) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar el reporte." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Coordenada inválida." }, { status: 400 });
    }

    const response = await fetch(supabaseRest("ruta_criticas_riesgos", `?id=eq.${id}`), {
      method: "DELETE",
      cache: "no-store",
      headers: supabaseHeaders(),
    });

    if (!response.ok) {
      return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo eliminar la coordenada." }, { status: 500 });
  }
}
