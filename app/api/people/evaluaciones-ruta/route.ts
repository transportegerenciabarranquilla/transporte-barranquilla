import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { contractorLabel } from "../../../lib/contractors";
import { evaluationRole, validateEvaluationAnswers, type EvaluationPerson } from "../../../lib/peopleRouteEvaluation";
import { PEOPLE_ROUTE_QUESTIONS, PEOPLE_ROUTE_QUESTIONNAIRE_VERSION } from "../../../lib/peopleRouteQuestions";
import { supabaseAdminHeaders, supabaseError, supabaseReadHeaders, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

const TABLE = "people_route_evaluations";
const validCc = (value: unknown) => typeof value === "string" && /^\d{5,15}$/.test(value);

async function findPeople(cc: string, accessToken: string): Promise<EvaluationPerson[]> {
  const params = new URLSearchParams({ select: "CC,NOMBRE,CARGO,CONTRATISTA", CC: `eq.${cc}`, limit: "100" });
  const response = await fetch(supabaseRest("transporte_barranquilla", `?${params}`), { headers: supabaseReadHeaders(accessToken), cache: "no-store" });
  if (!response.ok) throw new Error(await supabaseError(response));
  const records = await response.json() as Array<{ NOMBRE?: string; CARGO?: string; CONTRATISTA?: string }>;
  const people = new Map<string, EvaluationPerson>();
  for (const record of records) {
    const nombre = String(record.NOMBRE || "").trim();
    const cargo = String(record.CARGO || "").trim();
    const contratista = contractorLabel(record.CONTRATISTA);
    if (!nombre || !contratista) continue;
    const key = JSON.stringify([cc, nombre, cargo, contratista]);
    people.set(key, { key, cc, nombre, cargo, contratista, role: evaluationRole(cargo) });
  }
  return [...people.values()];
}

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "Este módulo es exclusivo de People y administración." }, { status: 403 });
    const cc = new URL(request.url).searchParams.get("cc");
    if (!validCc(cc)) return NextResponse.json({ error: "Escribe una cédula válida de 5 a 15 dígitos." }, { status: 400 });
    const people = await findPeople(cc!, session.accessToken);
    if (!people.length) return NextResponse.json({ error: "No se encontró una persona con esa cédula. Revisa el número o actualiza el personal en People." }, { status: 404 });
    return NextResponse.json({ people });
  } catch {
    return NextResponse.json({ error: "No se pudo consultar la persona. Intenta de nuevo." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "Este módulo es exclusivo de People y administración." }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (!body || !validCc(body.cc) || typeof body.personKey !== "string" || typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) {
      return NextResponse.json({ error: "Busca y selecciona una persona antes de guardar." }, { status: 400 });
    }
    const people = await findPeople(body.cc, session.accessToken);
    const person = people.find(item => item.key === body.personKey);
    if (!person) return NextResponse.json({ error: "Los datos de la persona cambiaron. Vuelve a consultar su cédula." }, { status: 409 });
    if (!person.role) return NextResponse.json({ error: "El cargo registrado no tiene un formulario asignado. Actualiza el cargo en People." }, { status: 400 });
    let answers;
    try { answers = validateEvaluationAnswers(person.role, body.answers); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Respuestas inválidas." }, { status: 400 }); }
    const payload = {
      id: body.id, cc: person.cc, nombre: person.nombre, cargo: person.cargo, contractor: person.contratista,
      person_key: person.key, survey_role: person.role, questionnaire_version: PEOPLE_ROUTE_QUESTIONNAIRE_VERSION,
      answers: PEOPLE_ROUTE_QUESTIONS[person.role].questions.map(question => ({ id: question.id, question: question.text, answer: answers[question.id] })),
      created_by: session.userId,
    };
    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const response = await fetch(supabaseRest(TABLE), { method: "POST", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify(payload), cache: "no-store" });
    if (response.status === 409) {
      // Un reintento tras una respuesta perdida no debe duplicar la evaluación.
      const params = new URLSearchParams({ select: "id,created_at,created_by,person_key,answers", id: `eq.${body.id}`, limit: "1" });
      const previous = await fetch(supabaseRest(TABLE, `?${params}`), { headers, cache: "no-store" });
      const saved = previous.ok ? (await previous.json())[0] : null;
      if (saved && saved.created_by === session.userId && saved.person_key === person.key && saved.answers.length === payload.answers.length && saved.answers.every((item: { id: string; answer: string }) => answers[item.id] === item.answer)) {
        return NextResponse.json({ id: saved.id, createdAt: saved.created_at });
      }
      return NextResponse.json({ error: "Esta evaluación ya existe con otras respuestas. Inicia una nueva evaluación." }, { status: 409 });
    }
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      const missing = details.code === "PGRST205" || details.code === "42P01";
      return NextResponse.json({ error: missing ? "Falta habilitar el almacenamiento de evaluaciones en Supabase. Contacta al administrador; tus respuestas siguen en el formulario." : "No se pudo guardar la evaluación. Tus respuestas siguen en el formulario; intenta de nuevo." }, { status: 503 });
    }
    const saved = (await response.json())[0];
    if (!saved?.id) throw new Error("No se confirmó el guardado.");
    return NextResponse.json({ id: saved.id, createdAt: saved.created_at }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "No se pudo guardar la evaluación. Conservamos tus respuestas; intenta de nuevo." }, { status: 500 });
  }
}
