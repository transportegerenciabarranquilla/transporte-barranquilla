import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { contractorLabel, normalizeContractorName } from "../../../lib/contractors";
import { supabaseError, supabaseReadHeaders, supabaseRest } from "../../../lib/supabaseServer";

const PAGE_SIZE = 1000;
type Person = { CC?: string | number; NOMBRE?: string; CARGO?: string; CONTRATISTA?: string };
type VehicleRow = { record_id?: string; contractor?: string; data?: Record<string, unknown>; updated_at?: string };
type Evaluation = { id: string; created_at: string; cc: string; nombre: string; cargo: string; contractor: string; survey_role: string; questionnaire_version: number; answers: Array<{ id: string; question: string; answer: string }> };

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "Este módulo es exclusivo de People y administración." }, { status: 403 });
    const cc = normalizeCc(new URL(request.url).searchParams.get("cc"));
    if (!/^\d{5,15}$/.test(cc)) return NextResponse.json({ error: "Escribe una cédula válida de 5 a 15 dígitos." }, { status: 400 });

    const headers = supabaseReadHeaders(session.accessToken);
    const peopleParams = new URLSearchParams({ select: "*", order: "NOMBRE.asc" });
    const people = (await readAllPages<Person>("transporte_barranquilla", peopleParams, headers))
      .filter((person) => person.NOMBRE && normalizeCc(person.CC) === cc);
    if (!people.length) return NextResponse.json({ error: "No se encontró una persona con esa cédula." }, { status: 404 });

    const contractors = [...new Set(people.map((p) => contractorLabel(p.CONTRATISTA)).filter(Boolean))];
    const [vehicleResults, evaluationResult] = await Promise.all([
      Promise.allSettled(contractors.map((contractor) => readVehicles(cc, contractor, headers))),
      readEvaluations(cc, headers).then((value) => ({ value }), (error: unknown) => ({ error })),
    ]);
    const warnings: string[] = [];
    const vehicles = vehicleResults.flatMap((result) => {
      if (result.status === "fulfilled") return result.value;
      warnings.push("No se pudo cargar el historial de rutas.");
      console.error("Error leyendo seguimiento de persona", result.reason);
      return [];
    });
    const evaluations = "value" in evaluationResult ? evaluationResult.value : [];
    if (!("value" in evaluationResult)) {
      warnings.push("No se pudieron cargar las evaluaciones en ruta.");
      console.error("Error leyendo evaluaciones de persona", evaluationResult.error);
    }
    const scopedEvaluations = evaluations.filter((row) => contractors.some((name) => normalizeContractorName(name) === normalizeContractorName(row.contractor)));
    const scopedVehicles = vehicles.filter((row) => contractors.some((name) => normalizeContractorName(name) === normalizeContractorName(row.contractor)));
    return NextResponse.json({ people, seguimiento: scopedVehicles, evaluaciones: scopedEvaluations, warnings }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar el historial de la persona." }, { status: 500 });
  }
}

async function readVehicles(cc: string, contractor: string, headers: Record<string, string>) {
  const params = new URLSearchParams({
    select: "record_id,contractor,data,updated_at",
    or: `(contractor.eq.${contractor},data->>transportista.eq.${contractor})`,
    order: "updated_at.desc",
  });
  const rows = await readAllPages<VehicleRow>("seguimiento_vehiculos", params, headers);
  return rows.filter((row) => {
    const d = row.data || {};
    return ["cedulaResponsable", "cedulaAuxiliar1", "cedulaAuxiliar2", "cedulaAuxiliar3"].some((key) => String(d[key] || "").replace(/\D/g, "") === cc);
  }).map((row) => ({ recordId: row.record_id, contractor: row.contractor || row.data?.transportista, updatedAt: row.updated_at, ...row.data }));
}

async function readEvaluations(cc: string, headers: Record<string, string>) {
  const params = new URLSearchParams({ select: "id,created_at,cc,nombre,cargo,contractor,survey_role,questionnaire_version,answers", cc: `eq.${cc}`, order: "created_at.desc,id.desc" });
  return readAllPages<Evaluation>("people_route_evaluations", params, headers);
}

async function readAllPages<T>(table: string, base: URLSearchParams, headers: Record<string, string>) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams(base);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    const response = await fetch(supabaseRest(table, `?${params}`), { headers, cache: "no-store" });
    if (!response.ok) throw new Error(await supabaseError(response));
    const page = await response.json() as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function normalizeCc(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d+(?:\.\d+)?e\+?\d+$/i.test(raw)) {
    const expanded = Number(raw);
    if (Number.isSafeInteger(expanded)) return String(expanded);
  }
  return raw.replace(/\D/g, "");
}
