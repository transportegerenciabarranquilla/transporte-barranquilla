import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../../lib/authServer";
import { PEOPLE_ROUTE_QUESTIONS } from "../../../../lib/peopleRouteQuestions";
import { validateEvaluationForm, type EvaluationRole } from "../../../../lib/peopleRouteEvaluation";
import { supabaseAdminHeaders, supabaseRest } from "../../../../lib/supabaseServer";

const TABLE = "people_route_questionnaires";
const isRole = (value: unknown): value is EvaluationRole => typeof value === "string" && ["conductor", "responsable", "auxiliar"].includes(value);
const unavailable = () => NextResponse.json({ error: "No se pudo acceder al almacenamiento de preguntas. Ejecuta supabase/people_route_questionnaires.sql en Supabase y verifica la clave de servidor. No se guardó ningún cambio." }, { status: 503 });

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "Solo People y administración pueden consultar las preguntas." }, { status: 403 });
    const role = new URL(request.url).searchParams.get("role");
    if (!isRole(role)) return NextResponse.json({ error: "Cargo inválido." }, { status: 400 });
    const headers = supabaseAdminHeaders();
    if (!headers) return unavailable();
    const response = await fetch(supabaseRest(TABLE, "?" + new URLSearchParams({ select: "questions,revision", role: "eq." + role, limit: "1" })), { headers, cache: "no-store" });
    if (!response.ok) return unavailable();
    const [saved] = await response.json();
    return NextResponse.json(saved || { questions: PEOPLE_ROUTE_QUESTIONS[role].questions, revision: null }, { headers: { "Cache-Control": "no-store" } });
  } catch { return unavailable(); }
}

export async function PUT(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "Solo People y administración pueden modificar las preguntas." }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (!body || !isRole(body.role) || !Array.isArray(body.questions) || !(body.revision === null || (typeof body.revision === "string" && /^[0-9a-f-]{36}$/i.test(body.revision)))) return NextResponse.json({ error: "Revisa el cargo y las preguntas." }, { status: 400 });
    let questions;
    try {
      const answers = Object.fromEntries(body.questions.map((question: { id?: string } | null) => [question?.id, "na"]));
      questions = validateEvaluationForm(body.role, body.questions, answers).questions;
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Preguntas inválidas." }, { status: 400 }); }
    const headers = supabaseAdminHeaders();
    if (!headers) return unavailable();
    const revision = crypto.randomUUID();
    const payload = { role: body.role, questions, revision, updated_by: session.userId, updated_at: new Date().toISOString() };
    const query = body.revision === null ? "" : "?" + new URLSearchParams({ role: "eq." + body.role, revision: "eq." + body.revision });
    const response = await fetch(supabaseRest(TABLE, query), { method: body.revision === null ? "POST" : "PATCH", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify(payload), cache: "no-store" });
    if (response.status === 409) return NextResponse.json({ error: "Otra persona guardó cambios. Vuelve a buscar la cédula para cargar las preguntas actuales." }, { status: 409 });
    if (!response.ok) return unavailable();
    const [saved] = await response.json();
    if (!saved || saved.revision !== revision) return NextResponse.json({ error: "Las preguntas cambiaron en otra sesión. Vuelve a buscar la cédula antes de editar." }, { status: 409 });
    return NextResponse.json({ questions: saved.questions, revision: saved.revision }, { headers: { "Cache-Control": "no-store" } });
  } catch { return unavailable(); }
}
