import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { contractorLabel } from "../../../lib/contractors";
import { evaluationRole, validateEvaluationForm, type EvaluationPerson } from "../../../lib/peopleRouteEvaluation";
import { PEOPLE_ROUTE_QUESTIONNAIRE_VERSION } from "../../../lib/peopleRouteQuestions";
import { supabaseAdminHeaders, supabaseError, supabaseReadHeaders, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";
import * as XLSX from "xlsx";
import { buildRouteAnalytics, type RouteEvaluationRecord } from "../../../lib/peopleRouteAnalytics";
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
    const params = new URL(request.url).searchParams;
    if (params.get("view") === "history") {
      const cc = params.get("cc") || "";
      const offset = params.get("offset") || "0";
      if ((cc && !validCc(cc)) || !/^\d{1,7}$/.test(offset)) return NextResponse.json({ error: "Revisa la cédula o la página solicitada." }, { status: 400 });
      const query = new URLSearchParams({ select: "id,created_at,cc,nombre,cargo,contractor,survey_role,questionnaire_version,answers", order: "created_at.desc,id.desc", limit: "26", offset });
      if (cc) query.set("cc", `eq.${cc}`);
      const response = await fetch(supabaseRest(TABLE, `?${query}`), { headers: supabaseReadHeaders(session.accessToken), cache: "no-store" });
      if (!response.ok) return NextResponse.json({ error: "No se pudieron cargar los registros." }, { status: 503 });
      const records = await response.json() as RouteEvaluationRecord[];
      return NextResponse.json({ records: records.slice(0, 25), hasMore: records.length > 25 }, { headers: { "Cache-Control": "no-store" } });
    }
    if (params.get("view") === "analytics") {
      const filters = { from: params.get("from") || "", to: params.get("to") || "", contractor: params.get("contractor") || "", role: params.get("role") || "" };
      const validDate = (value: string) => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
      if (!validDate(filters.from) || !validDate(filters.to) || (filters.from && filters.to && filters.from > filters.to) || (filters.role && !["conductor", "responsable", "auxiliar"].includes(filters.role))) {
        return NextResponse.json({ error: "Revisa las fechas y el cargo seleccionados." }, { status: 400 });
      }
      return NextResponse.json(buildRouteAnalytics(await readEvaluations(session.accessToken), filters), { headers: { "Cache-Control": "no-store" } });
    }
    if (new URL(request.url).searchParams.get("export") === "excel") {
      return await exportEvaluationsExcel(session.accessToken);
    }
    const cc = new URL(request.url).searchParams.get("cc");
    if (!validCc(cc)) return NextResponse.json({ error: "Escribe una cédula válida de 5 a 15 dígitos." }, { status: 400 });
    const people = await findPeople(cc!, session.accessToken);
    if (!people.length) return NextResponse.json({ error: "No se encontró una persona con esa cédula. Revisa el número o actualiza el personal en People." }, { status: 404 });
    return NextResponse.json({ people });
  } catch {
    const exporting = new URL(request.url).searchParams.get("export") === "excel";
    const analytics = new URL(request.url).searchParams.get("view") === "analytics";
    const history = new URL(request.url).searchParams.get("view") === "history";
    return NextResponse.json({ error: exporting ? "No se pudo generar el Excel. Intenta de nuevo." : analytics ? "No se pudieron cargar las gráficas. Comprueba que el almacenamiento de evaluaciones esté habilitado e intenta de nuevo." : history ? "No se pudieron cargar los registros. Intenta de nuevo." : "No se pudo consultar la persona. Intenta de nuevo." }, { status: 500 });
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
    let form;
    try { form = validateEvaluationForm(person.role, body.questions, body.answers); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Respuestas inválidas." }, { status: 400 }); }
    const payload = {
      id: body.id, cc: person.cc, nombre: person.nombre, cargo: person.cargo, contractor: person.contratista,
      person_key: person.key, survey_role: person.role, questionnaire_version: PEOPLE_ROUTE_QUESTIONNAIRE_VERSION,
      answers: form.questions.map(question => ({ id: question.id, question: question.text, answer: form.answers[question.id] })),
      created_by: session.userId,
    };
    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const response = await fetch(supabaseRest(TABLE), { method: "POST", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify(payload), cache: "no-store" });
    if (response.status === 409) {
      // Un reintento tras una respuesta perdida no debe duplicar la evaluación.
      const params = new URLSearchParams({ select: "id,created_at,created_by,person_key,answers", id: `eq.${body.id}`, limit: "1" });
      const previous = await fetch(supabaseRest(TABLE, `?${params}`), { headers, cache: "no-store" });
      const saved = previous.ok ? (await previous.json())[0] : null;
      if (saved && saved.created_by === session.userId && saved.person_key === person.key && Array.isArray(saved.answers) && saved.answers.length === payload.answers.length && saved.answers.every((item: { id: string; question: string; answer: string }, index: number) => item.id === payload.answers[index].id && item.question === payload.answers[index].question && item.answer === payload.answers[index].answer)) {
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

export async function PATCH(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "Solo People y administración pueden editar evaluaciones." }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) || !body.answers || typeof body.answers !== "object" || Array.isArray(body.answers) || !Array.isArray(body.previousAnswers)) {
      return NextResponse.json({ error: "Selecciona una evaluación y responde todas las preguntas." }, { status: 400 });
    }
    const query = new URLSearchParams({ select: "id,answers,survey_role", id: `eq.${body.id}`, limit: "1" });
    const previous = await fetch(supabaseRest(TABLE, `?${query}`), { headers: supabaseReadHeaders(session.accessToken), cache: "no-store" });
    if (!previous.ok) return NextResponse.json({ error: "No se pudo consultar la evaluación." }, { status: 503 });
    const saved = (await previous.json())[0] as Pick<RouteEvaluationRecord, "id" | "answers" | "survey_role"> | undefined;
    if (!saved) return NextResponse.json({ error: "Esta evaluación ya no está disponible." }, { status: 404 });
    if (JSON.stringify(saved.answers) !== JSON.stringify(body.previousAnswers)) return NextResponse.json({ error: "Otra persona modificó esta evaluación. Cancela y actualiza los registros antes de editarla nuevamente." }, { status: 409 });
    let answers: RouteEvaluationRecord["answers"];
    if (body.questions === undefined) {
      // Compatibilidad con clientes anteriores: solo modifican respuestas.
      if (Object.keys(body.answers).length !== saved.answers.length || saved.answers.some(item => !["si", "no", "na"].includes(body.answers[item.id]))) {
        return NextResponse.json({ error: "Responde todas las preguntas con Sí, No o N/A." }, { status: 400 });
      }
      answers = saved.answers.map(item => ({ ...item, answer: body.answers[item.id] }));
    } else {
      try {
        const form = validateEvaluationForm(saved.survey_role, body.questions, body.answers, saved.answers.map(item => item.id));
        answers = form.questions.map(question => ({ id: question.id, question: question.text, answer: form.answers[question.id] }));
      } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Revisa las preguntas y respuestas." }, { status: 400 }); }
    }
    const updateQuery = new URLSearchParams({ id: `eq.${body.id}`, answers: `eq.${JSON.stringify(saved.answers)}`, select: "id" });
    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const response = await fetch(supabaseRest(TABLE, `?${updateQuery}`), {
      method: "PATCH", headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ answers }), cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: "No se pudieron guardar los cambios. Revisa los permisos de actualización de evaluaciones en Supabase." }, { status: 503 });
    const updated = await response.json();
    if (!updated.length) return NextResponse.json({ error: "El registro cambió o no tienes permiso de actualización. Cancela y actualiza los registros." }, { status: 409 });
    return NextResponse.json({ id: updated[0].id });
  } catch {
    return NextResponse.json({ error: "No se pudo editar la evaluación. Tus cambios siguen disponibles." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) return NextResponse.json({ error: "Solo People y administración pueden eliminar evaluaciones." }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) || !Array.isArray(body.previousAnswers)) {
      return NextResponse.json({ error: "Selecciona una evaluación guardada para eliminar." }, { status: 400 });
    }
    const query = new URLSearchParams({ select: "id,answers", id: `eq.${body.id}`, limit: "1" });
    const previous = await fetch(supabaseRest(TABLE, `?${query}`), { headers: supabaseReadHeaders(session.accessToken), cache: "no-store" });
    if (!previous.ok) return NextResponse.json({ error: "No se pudo consultar la evaluación." }, { status: 503 });
    const saved = (await previous.json())[0] as Pick<RouteEvaluationRecord, "id" | "answers"> | undefined;
    if (!saved) return NextResponse.json({ error: "Esta evaluación ya no está disponible." }, { status: 404 });
    if (JSON.stringify(saved.answers) !== JSON.stringify(body.previousAnswers)) return NextResponse.json({ error: "La evaluación cambió. Actualiza los registros antes de eliminarla." }, { status: 409 });
    const deleteQuery = new URLSearchParams({ id: `eq.${body.id}`, answers: `eq.${JSON.stringify(saved.answers)}`, select: "id" });
    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    const response = await fetch(supabaseRest(TABLE, `?${deleteQuery}`), { method: "DELETE", headers: { ...headers, Prefer: "return=representation" }, cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: "No se pudo eliminar la evaluación. Revisa los permisos de eliminación en Supabase." }, { status: 503 });
    const deleted = await response.json();
    if (!deleted.length) return NextResponse.json({ error: "El registro cambió o no tienes permiso para eliminarlo. Actualiza los registros." }, { status: 409 });
    return NextResponse.json({ id: deleted[0].id }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo eliminar la evaluación. Intenta de nuevo." }, { status: 500 });
  }
}

async function readEvaluations(accessToken: string): Promise<RouteEvaluationRecord[]> {
  const records: RouteEvaluationRecord[] = [];
  const cutoff = new Date().toISOString();
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      select: "id,created_at,cc,nombre,cargo,contractor,survey_role,questionnaire_version,answers",
      created_at: `lte.${cutoff}`,
      order: "created_at.asc,id.asc",
      limit: "500",
      offset: String(offset),
    });

    const response = await fetch(supabaseRest(TABLE, `?${params}`), {
      headers: supabaseReadHeaders(accessToken),
      cache: "no-store",
    });

    if (!response.ok) throw new Error("No se pudieron consultar las evaluaciones.");

    const batch = (await response.json()) as RouteEvaluationRecord[];
    if (!batch.length) break;

    records.push(...batch);
    offset += batch.length;
  }
  return records;
}

async function exportEvaluationsExcel(accessToken: string) {
  let records: RouteEvaluationRecord[];
  try { records = await readEvaluations(accessToken); }
  catch { return NextResponse.json({ error: "No se pudieron consultar las evaluaciones." }, { status: 503 }); }

  if (!records.length) {
    return NextResponse.json(
      { error: "Todavía no hay evaluaciones guardadas para exportar." },
      { status: 404 },
    );
  }

  const dateFormatter = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Bogota",
  });

  const labels = { si: "Sí", no: "No", na: "N/A" };

  const summary = records.map((record) => ({
    "ID evaluación": record.id,
    Fecha: dateFormatter.format(new Date(record.created_at)),
    Cédula: record.cc,
    Nombre: record.nombre,
    Cargo: record.cargo,
    Contratista: record.contractor,
    "Total preguntas": record.answers.length,
    Sí: record.answers.filter((item) => item.answer === "si").length,
    No: record.answers.filter((item) => item.answer === "no").length,
    "N/A": record.answers.filter((item) => item.answer === "na").length,
  }));

  const details = records.flatMap((record) =>
    record.answers.map((item) => ({
      "ID evaluación": record.id,
      Fecha: dateFormatter.format(new Date(record.created_at)),
      Cédula: record.cc,
      Nombre: record.nombre,
      Cargo: record.cargo,
      Contratista: record.contractor,
      Pregunta: item.question,
      Respuesta: labels[item.answer] ?? item.answer,
    })),
  );

  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.json_to_sheet(summary);
  const detailsSheet = XLSX.utils.json_to_sheet(details);
  summarySheet["!cols"] = [38, 24, 18, 36, 28, 28, 18, 10, 10, 10].map(wch => ({ wch }));
  detailsSheet["!cols"] = [38, 24, 18, 36, 28, 28, 100, 14].map(wch => ({ wch }));
  for (const sheet of [summarySheet, detailsSheet]) {
    if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
  }
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Evaluaciones");
  XLSX.utils.book_append_sheet(workbook, detailsSheet, "Respuestas");

  const bytes = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    compression: true,
  }) as ArrayBuffer;

  return new Response(bytes, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="evaluaciones-en-ruta.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
