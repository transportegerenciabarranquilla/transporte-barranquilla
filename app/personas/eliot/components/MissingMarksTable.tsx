import { AlertTriangle } from "lucide-react";
import { formatClock } from "../lib/time";
import type { CrewRole, TdRow } from "../lib/types";

const ROLE_META: Record<CrewRole, { label: string; accent: string; badge: string }> = {
  rr: { label: "Responsables RR", accent: "text-rose-600", badge: "bg-rose-50 text-rose-700" },
  aux: { label: "Auxiliares", accent: "text-violet-700", badge: "bg-violet-50 text-violet-700" },
  conductor: { label: "Conductores", accent: "text-amber-700", badge: "bg-amber-50 text-amber-700" },
};

const ROLES: CrewRole[] = ["rr", "aux", "conductor"];

export function MissingMarksTable({ rows }: { rows: TdRow[] }) {
  const missingByRole = Object.fromEntries(
    ROLES.map((role) => [
      role,
      rows
        .map((row) => ({ row, member: row.crew[role] }))
        .filter(({ member }) => member.validPerson && member.tdSeconds === null),
    ]),
  ) as Record<CrewRole, Array<{ row: TdRow; member: TdRow["crew"][CrewRole] }>>;

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {ROLES.map((role) => {
        const meta = ROLE_META[role];
        const entries = missingByRole[role];
        return (
          <section className="panel overflow-hidden" key={role}>
            <div className="flex items-start justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2.5">
              <div>
                <p className={`text-[9px] font-bold uppercase tracking-[0.14em] ${meta.accent}`}>{meta.label}</p>
                <h2 className="mt-0.5 text-sm font-bold text-[#2d1b4e]">Errores de marcación</h2>
              </div>
              <span className={`rounded-lg px-2 py-1 text-[9px] font-black ${meta.badge}`}>{entries.length} caso{entries.length === 1 ? "" : "s"}</span>
            </div>

            <div className="min-h-[305px] space-y-1.5 p-3">
              {entries.slice(0, 10).map(({ row, member }, index) => (
                <div className="grid grid-cols-[18px_minmax(0,1fr)] gap-1.5 rounded-lg px-1 py-1 hover:bg-red-50/50" key={`${row.id}:${role}`}>
                  <span className="pt-px text-right text-[9px] font-black text-slate-400">{index + 1}</span>
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-1.5 text-[10px] leading-3">
                      <span className="truncate font-bold text-slate-700" title={member.name}>{member.name}</span>
                      <span className="inline-flex shrink-0 items-center gap-1 font-black text-red-600"><AlertTriangle size={10} /> No marcó</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-red-100 ring-1 ring-red-200/70"><div className="h-full w-full rounded-full bg-red-500" /></div>
                    <div className="mt-0.5 flex items-center justify-between gap-1.5 text-[8px] leading-3 text-slate-500">
                      <span className="truncate" title={`${row.plate} · DT ${row.dt}`}>{row.plate || "Sin placa"} · DT {row.dt || "—"}</span>
                      <span className="shrink-0">Salida {formatClock(row.departureSeconds).slice(0, 5)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {!entries.length ? <div className="grid min-h-[250px] place-items-center px-4 text-center text-xs text-teal-700">No hay errores para este rol y filtro.</div> : null}
              {entries.length > 10 ? <p className="pt-2 text-center text-[9px] font-bold text-slate-400">Se muestran 10 de {entries.length} casos.</p> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
