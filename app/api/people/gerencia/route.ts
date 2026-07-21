import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { supabaseAdminHeaders, supabaseError, supabaseHeaders, supabaseRest } from "../../../lib/supabaseServer";

type PersonRow = {
  CC?: string;
  NOMBRE?: string;
  CARGO?: string;
  CONTRATISTA?: string;
};

type SeguimientoRow = {
  contractor?: string;
  transporte?: string;
  vehiculo?: string;
  fechaDespacho?: string;
  fechaDt?: string;
  status?: string;
  horaSalida?: string;
  horaLlegada?: string;
};

type AttendanceRow = {
  contractor?: string;
  dt?: string;
  llave?: string;
  createdAt?: string;
  cedulaResponsable?: string;
  cedulaAuxiliar1?: string;
  cedulaAuxiliar2?: string;
};

const SEGUIMIENTO_SELECT = "contractor,transporte:data->>transporte,vehiculo:data->>vehiculo,fechaDespacho:data->>fechaDespacho,fechaDt:data->>fechaDt,status:data->>status,horaSalida:data->>horaSalida,horaLlegada:data->>horaLlegada";
const ATTENDANCE_SELECT = "contractor,dt:data->>dt,llave:data->>llave,createdAt:data->>createdAt,cedulaResponsable:data->>cedulaResponsable,cedulaAuxiliar1:data->>cedulaAuxiliar1,cedulaAuxiliar2:data->>cedulaAuxiliar2";

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    if (!session.isPeople && !session.isAdmin) {
      return NextResponse.json({ error: "No tienes permiso para consultar Gerencia." }, { status: 403 });
    }

    const headers = supabaseAdminHeaders() ?? supabaseHeaders();
    const [people, seguimientoRows, attendanceRows] = await Promise.all([
      readRows<PersonRow>("transporte_barranquilla", "select=CC,NOMBRE,CARGO,CONTRATISTA&order=NOMBRE.asc&limit=1500", headers),
      readRows<SeguimientoRow>("seguimiento_vehiculos", new URLSearchParams({ select: SEGUIMIENTO_SELECT, order: "updated_at.desc", limit: "3000" }).toString(), headers),
      readRows<AttendanceRow>("asistencias_ruta", new URLSearchParams({ select: ATTENDANCE_SELECT, order: "updated_at.desc", limit: "3000" }).toString(), headers),
    ]);

    const contractors = Array.from(
      people.reduce((groups, person) => {
        const name = String(person.CONTRATISTA || "Sin contratista").trim() || "Sin contratista";
        const group = groups.get(name) || [];
        group.push({
          cc: String(person.CC || "").trim(),
          nombre: String(person.NOMBRE || "").trim(),
          cargo: String(person.CARGO || "").trim(),
          contratista: name,
        });
        groups.set(name, group);
        return groups;
      }, new Map<string, { cc: string; nombre: string; cargo: string; contratista: string }[]>()),
      ([name, groupedPeople]) => ({ name, people: groupedPeople }),
    );

    const seguimiento = seguimientoRows.map((row) => ({ ...row, contractor: String(row.contractor || "") }));
    const asistencias = attendanceRows.map((row) => ({ ...row, contratista: String(row.contractor || "") }));

    return NextResponse.json(
      {
        contractors,
        seguimiento,
        asistencias,
        sourceCounts: { people: people.length, seguimiento: seguimiento.length, asistencias: asistencias.length },
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo cargar Gerencia." }, { status: 500 });
  }
}

async function readRows<T>(table: string, query: string, headers: Record<string, string>) {
  const response = await fetch(supabaseRest(table, `?${query}`), { headers, cache: "no-store" });
  if (!response.ok) throw new Error(await supabaseError(response));
  return (await response.json()) as T[];
}
