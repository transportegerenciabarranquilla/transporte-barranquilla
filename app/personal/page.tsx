"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiQuery } from "../lib/apiQuery";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Search, Trash2, Upload, UserPlus } from "lucide-react";

type Person = { CC: string; NOMBRE: string; CARGO: string; CONTRATISTA: string; CELULAR?: string; CORREO?: string };
type Draft = { cc: string; nombre: string; cargo: string; celular: string; correo: string };
const emptyDraft: Draft = { cc: "", nombre: "", cargo: "", celular: "", correo: "" };

export default function PersonalPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [query, setQuery] = useState("");
  const search = useDebouncedValue(query);
  const [pagination, setPagination] = useState({ search: "", page: 1 });
  const page = pagination.search === search ? pagination.page : 1;
  const client = useQueryClient();
  const list = useQuery({
    queryKey: ["personnel", search, page],
    queryFn: ({ signal }) => apiQuery<{ contractor: string; people: Person[]; total: number | null; hasMore: boolean }>(`/api/people/personnel?${new URLSearchParams({ q: search, page: String(page), pageSize: "50" })}`, signal),
    placeholderData: keepPreviousData,
  });
  const contractor = list.data?.contractor || "";
  const people = list.data?.people || [];
  const loading = list.isPending;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() { await client.invalidateQueries({ queryKey: ["personnel"] }); }
  const visible = people;

  async function saveBatch(rows: Array<Draft & { contratista: string }>) {
    let created = 0;
    let updated = 0;
    for (let index = 0; index < rows.length; index += 100) {
      const response = await fetch("/api/people/personnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ people: rows.slice(index, index + 100) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `La carga se detuvo tras guardar ${created + updated} personas.`);
      created += Number(body.created || 0);
      updated += Number(body.updated || 0);
    }
    return { created, updated };
  }

  async function submitPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await saveBatch([{ ...draft, contratista: contractor }]);
      await refresh();
      setDraft(emptyDraft);
      setMessage("Persona guardada. Ya puede registrar asistencia.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar la persona.");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheets = workbook.SheetNames.map((name) => XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], { defval: "", raw: false }));
      const source = sheets.filter((sheet) => sheet.length && Object.keys(sheet[0]).some((key) => ["cc", "cedula", "identificacion", "numerodedocumento", "documento"].includes(normalize(key)))).sort((left, right) => right.length - left.length)[0] || [];
      const rows = source.map((row) => {
        const columns = Object.fromEntries(Object.entries(row).map(([key, value]) => [normalize(key), String(value ?? "").trim()]));
        return {
          cc: columns.cc || columns.cedula || columns.identificacion || columns.numerodedocumento || columns.documento || "",
          nombre: columns.nombre || columns.nombrecompleto || columns.apellidosynombres || columns.nombresyapellidos || "",
          cargo: columns.cargo || columns.nombrecargo || "",
          celular: columns.celular || columns.telefono || "",
          correo: columns.correo || columns.email || "",
          contratista: columns.contratista || columns.transportista || columns.empresa || contractor,
        };
      }).filter((row) => /^\d{5,15}$/.test(row.cc.replace(/\D/g, "")) && /\p{L}/u.test(row.nombre));
      const skipped = source.length - rows.length;
      if (!rows.length) throw new Error("La hoja no tiene personas. Usa la plantilla con CC y NOMBRE.");
      const result = await saveBatch(rows);
      await refresh();
      setMessage(`${result.created} personas agregadas y ${result.updated} actualizadas. ${skipped ? `Se omitieron ${skipped} filas sin cédula o nombre válido. ` : ""}Las demás permanecen en la base.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo importar el archivo.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([["CC", "NOMBRE", "CARGO", "CONTRATISTA", "CELULAR", "CORREO"]]);
    sheet["!cols"] = [{ wch: 18 }, { wch: 35 }, { wch: 28 }, { wch: 25 }, { wch: 18 }, { wch: 35 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Personal");
    XLSX.writeFile(workbook, `plantilla-personal-${normalize(contractor)}.xlsx`);
  }

  async function removePerson(person: Person) {
    if (!window.confirm(`¿Eliminar a ${person.NOMBRE} del padrón de ${contractor}?`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/people/personnel", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cc: person.CC, contratista: contractor }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo eliminar la persona.");
      await refresh();
      setMessage("Persona eliminada del padrón.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo eliminar la persona.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-5 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <button className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#10223d]" onClick={() => router.push("/")} type="button"><ArrowLeft size={17} /> Volver al portal</button>
        <div className="rounded-2xl bg-[#10223d] p-6 text-white"><p className="text-xs font-semibold uppercase tracking-[.16em] text-cyan-200">{contractor || "Personal"}</p><h1 className="mt-2 text-3xl font-bold">Personal de mi contratista</h1><p className="mt-2 text-sm text-slate-200">Agrega, actualiza e importa las personas que podrán registrar asistencia.</p></div>
        {error || list.error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error || list.error?.message}<button type="button" onClick={() => void list.refetch()} className="ml-3 underline">Reintentar consulta</button></p> : null}
        {message ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{message}</p> : null}
        {loading ? <p className="mt-6 text-sm text-slate-500">Cargando personal...</p> : contractor ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_350px]">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Equipo registrado</h2><p className="text-sm text-slate-500">{list.data?.total ?? people.length} personas {list.isFetching && <span role="status">· Actualizando...</span>}</p></div><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input className="h-10 rounded-lg border border-slate-200 pl-9 pr-3 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre, cédula o cargo" value={query} /></label></div>
              <div className="max-h-[720px] divide-y overflow-y-auto rounded-lg border border-slate-200">{visible.map((person) => <div className="flex items-center gap-3 p-3" key={`${person.CONTRATISTA}:${person.CC}`}><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{person.NOMBRE}</p><p className="text-xs text-slate-500">CC {person.CC} · {person.CARGO || "Sin cargo"}</p></div><button className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50" disabled={busy} onClick={() => setDraft({ cc: person.CC, nombre: person.NOMBRE, cargo: person.CARGO || "", celular: person.CELULAR || "", correo: person.CORREO || "" })} type="button">Editar</button><button aria-label={`Eliminar a ${person.NOMBRE}`} className="rounded-md p-2 text-red-600 hover:bg-red-50 disabled:opacity-50" disabled={busy} onClick={() => void removePerson(person)} type="button"><Trash2 size={16} /></button></div>)}{!visible.length ? <p className="p-5 text-center text-sm text-slate-500">No hay personas para esta búsqueda.</p> : null}</div>
              <div className="mt-4 flex items-center justify-between gap-3 text-sm"><button type="button" disabled={page === 1 || list.isFetching} onClick={() => setPagination({ search, page: page - 1 })} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-40">Anterior</button><span className="text-xs text-slate-500">Página {page} · hasta 50 personas</span><button type="button" disabled={!list.data?.hasMore || list.isFetching} onClick={() => setPagination({ search, page: page + 1 })} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-40">Siguiente</button></div>
            </section>
            <aside className="space-y-4">
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 text-lg font-semibold"><UserPlus size={19} /> {draft.cc ? "Agregar o actualizar" : "Nueva persona"}</h2><form className="mt-4 space-y-3" onSubmit={submitPerson}><input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" inputMode="numeric" onChange={(event) => setDraft({ ...draft, cc: event.target.value.replace(/\D/g, "") })} placeholder="Cédula" required value={draft.cc} /><input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setDraft({ ...draft, nombre: event.target.value })} placeholder="Nombre completo" required value={draft.nombre} /><input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setDraft({ ...draft, cargo: event.target.value })} placeholder="Cargo" value={draft.cargo} /><input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setDraft({ ...draft, celular: event.target.value })} placeholder="Celular (opcional)" value={draft.celular} /><input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setDraft({ ...draft, correo: event.target.value })} placeholder="Correo (opcional)" type="email" value={draft.correo} /><button className="h-10 w-full rounded-lg bg-[#10223d] text-sm font-semibold text-white disabled:opacity-50" disabled={busy} type="submit">{busy ? "Guardando..." : "Guardar persona"}</button></form></section>
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Importar plantilla</h2><p className="mt-1 text-xs text-slate-500">Sube una persona, varias o el padrón completo. Se actualizan coincidencias por cédula y contratista.</p><label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 py-3 text-sm font-semibold text-white"><Upload size={17} /> {busy ? "Procesando..." : "Subir Excel o CSV"}<input accept=".xlsx,.xls,.csv" className="hidden" disabled={busy} onChange={importFile} type="file" /></label><button className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold" onClick={() => void downloadTemplate()} type="button"><Download size={16} /> Descargar plantilla</button><p className="mt-2 text-xs text-slate-500">La columna CONTRATISTA puede quedar vacía: se asignará {contractor}.</p></section>
            </aside>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}
