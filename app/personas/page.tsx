"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Activity, CalendarDays, Download, EllipsisVertical, Filter, Search, TrendingDown, TrendingUp, UsersRound, X } from "lucide-react";
import { Icon } from "../components/Icon";

type PersonHistory = {
  type: string;
  date: string;
  title: string;
  detail: string;
};

type Person = {
  cc: string;
  nombre: string;
  cargo: string;
  contratista: string;
  stats: PersonStats;
  previousStats?: PersonStats;
  history: PersonHistory[];
  isLocal?: boolean;
};

type PersonStats = {
    rutas: number;
    modulaciones: number;
    reubicaciones: number;
    gestionadas?: number;
    hectolitros?: number;
    visitasRango?: number;
    enRango?: number;
    fueraRango?: number;
    porcentajeRango?: number;
    tiempoPromedioRuta: string;
    ultimoDt: string;
};

type ContractorGroup = {
  name: string;
  total: number;
  people: Person[];
};

type DraftPerson = {
  cc: string;
  nombre: string;
  cargo: string;
  contratista: string;
};

type PeopleProfile = {
  cc: string;
  nombre?: string;
  cargo?: string;
  contratista: string;
  photo?: string;
  isLocal?: boolean;
  removed?: boolean;
};

const CONTRACTORS = ["Logisticos", "Surti Cervezas", "Punto Corona"];
const PAGE_SIZE = 10;
type PeopleSort = "nombre" | "rutas" | "hl" | "rango" | "gestionadas";

const emptyDraft: DraftPerson = {
  cc: "",
  nombre: "",
  cargo: "",
  contratista: "Logisticos",
};

export default function PeoplePage() {
  const router = useRouter();
  const [groups, setGroups] = useState<ContractorGroup[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [localPeople, setLocalPeople] = useState<Person[]>([]);
  const [removedPeople, setRemovedPeople] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<PeopleProfile[]>([]);
  const [selectedContractor, setSelectedContractor] = useState("Logisticos");
  const [selectedCc, setSelectedCc] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("Todos");
  const [activityOnly, setActivityOnly] = useState(false);
  const [sortBy, setSortBy] = useState<PeopleSort>("nombre");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [draft, setDraft] = useState<DraftPerson>(emptyDraft);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAllowed, setIsAllowed] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setIsRefreshing(true);
    fetch("/api/session/session", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (cancelled) throw new DOMException("Request cancelled", "AbortError");
        const allowed = Boolean(body?.session?.isPeople || body?.session?.isAdmin);
        setIsAllowed(allowed);
        if (!allowed) throw new Error("No tienes permiso para entrar a People.");
        const params = new URLSearchParams();
        if (rangeFrom) params.set("from", rangeFrom);
        if (rangeTo) params.set("to", rangeTo);
        const summaryUrl = params.size ? `/api/people/summary?${params}` : "/api/people/summary";
        return Promise.all([
          fetch(summaryUrl, { cache: "no-store", signal: controller.signal }),
          fetch("/api/people/profiles", { cache: "no-store", signal: controller.signal }),
        ]);
      })
      .then(async ([summaryResponse, profilesResponse]) => {
        if (cancelled) return;
        const summaryBody = await summaryResponse.json().catch(() => ({}));
        if (!summaryResponse.ok) throw new Error(summaryBody.error || "No se pudo cargar People.");
        setGroups(summaryBody.contractors || []);

        const profilesBody = await profilesResponse.json().catch(() => ({}));
        if (!profilesResponse.ok) throw new Error(profilesBody.error || "No se pudieron cargar fotos de People.");
        applyProfiles(profilesBody.profiles || []);
        setError("");
      })
      .catch((caughtError) => {
        if (!cancelled && (!(caughtError instanceof Error) || caughtError.name !== "AbortError")) setError(caughtError instanceof Error ? caughtError.message : "Error cargando People.");
      })
      .finally(() => { if (!cancelled) { setIsLoading(false); setIsRefreshing(false); } });
    return () => { cancelled = true; controller.abort(); };
  }, [rangeFrom, rangeTo]);

  const mergedGroups = useMemo(() => {
    const removed = new Set(removedPeople);
    const byContractor = new Map(groups.map((group) => [group.name, group.people]));

    return CONTRACTORS.map((contractor) => {
      const remote = byContractor.get(contractor) || [];
      const local = localPeople.filter((person) => person.contratista === contractor);
      const people = dedupePeople([...local, ...remote]).filter((person) => !removed.has(personKey(person)));
      return { name: contractor, total: people.length, people };
    });
  }, [groups, localPeople, removedPeople]);

  const selectedGroup = mergedGroups.find((group) => group.name === selectedContractor) || mergedGroups[0];

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activityOnly, query, roleFilter, selectedContractor, sortBy]);

  const availableRoles = useMemo(
    () => Array.from(new Set((selectedGroup?.people || []).map((person) => person.cargo.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es")),
    [selectedGroup],
  );

  const filteredPeople = useMemo(() => {
    const needle = normalizeText(query);
    const matches = (selectedGroup?.people || []).filter((person) => {
      const matchesQuery = !needle || normalizeText(`${person.nombre} ${person.cc} ${person.cargo}`).includes(needle);
      const matchesRole = roleFilter === "Todos" || person.cargo === roleFilter;
      const matchesActivity = !activityOnly || person.stats.rutas > 0 || person.stats.modulaciones > 0;
      return matchesQuery && matchesRole && matchesActivity;
    });

    return [...matches].sort((left, right) => {
      if (sortBy === "rutas") return right.stats.rutas - left.stats.rutas || left.nombre.localeCompare(right.nombre, "es");
      if (sortBy === "hl") return hlMoved(right) - hlMoved(left) || left.nombre.localeCompare(right.nombre, "es");
      if (sortBy === "rango") return Number(right.stats.porcentajeRango || 0) - Number(left.stats.porcentajeRango || 0) || left.nombre.localeCompare(right.nombre, "es");
      if (sortBy === "gestionadas") return managedCount(right) - managedCount(left) || left.nombre.localeCompare(right.nombre, "es");
      return left.nombre.localeCompare(right.nombre, "es");
    });
  }, [activityOnly, query, roleFilter, selectedGroup, sortBy]);
  const visiblePeople = filteredPeople.slice(0, visibleCount);
  const hasMorePeople = visibleCount < filteredPeople.length;

  const selectedPerson = useMemo(() => {
    return filteredPeople.find((person) => person.cc === selectedCc) || filteredPeople[0] || null;
  }, [filteredPeople, selectedCc]);

  useEffect(() => {
    if (selectedPerson && selectedPerson.cc !== selectedCc) setSelectedCc(selectedPerson.cc);
  }, [selectedPerson, selectedCc]);

  useEffect(() => {
    setHistoryExpanded(false);
    setProfileMenuOpen(false);
  }, [selectedCc]);

  function handleAddPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanDraft = {
      cc: draft.cc.trim(),
      nombre: draft.nombre.trim(),
      cargo: draft.cargo.trim(),
      contratista: draft.contratista,
    };
    if (!cleanDraft.cc || !cleanDraft.nombre) {
      setError("La cedula y el nombre son obligatorios.");
      return;
    }

    const newPerson: Person = {
      ...cleanDraft,
      isLocal: true,
      stats: { rutas: 0, modulaciones: 0, reubicaciones: 0, hectolitros: 0, visitasRango: 0, enRango: 0, fueraRango: 0, porcentajeRango: 0, tiempoPromedioRuta: "Sin dato", ultimoDt: "" },
      history: [],
    };
    const nextPeople = [newPerson, ...localPeople.filter((person) => personKey(person) !== personKey(newPerson))];
    setLocalPeople(nextPeople);
    void saveProfiles(upsertProfiles(profiles, personToProfile(newPerson)));
    setSelectedContractor(cleanDraft.contratista);
    setSelectedCc(cleanDraft.cc);
    setDraft(emptyDraft);
    setError("");
  }

  function removePerson(person: Person) {
    const key = personKey(person);
    if (person.isLocal) {
      const nextPeople = localPeople.filter((item) => personKey(item) !== key);
      setLocalPeople(nextPeople);
      void saveProfiles(upsertProfiles(profiles, { ...personToProfile(person), removed: true }));
      return;
    }

    const nextRemoved = Array.from(new Set([...removedPeople, key]));
    setRemovedPeople(nextRemoved);
    void saveProfiles(upsertProfiles(profiles, { ...personToProfile(person), removed: true }));
  }

  function handlePhoto(person: Person, file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const nextPhotos = { ...photos, [personKey(person)]: String(reader.result || "") };
      setPhotos(nextPhotos);
      void saveProfiles(upsertProfiles(profiles, { ...personToProfile(person), photo: String(reader.result || "") }));
    };
    reader.readAsDataURL(file);
  }

  function applyProfiles(nextProfiles: PeopleProfile[]) {
    setProfiles(nextProfiles);
    setPhotos(Object.fromEntries(nextProfiles.filter((profile) => profile.photo && !profile.removed).map((profile) => [profileKey(profile), profile.photo || ""])));
    setLocalPeople(nextProfiles.filter((profile) => profile.isLocal && !profile.removed).map(profileToPerson));
    setRemovedPeople(nextProfiles.filter((profile) => profile.removed).map(profileKey));
  }

  async function saveProfiles(nextProfiles: PeopleProfile[]) {
    try {
      const response = await fetch("/api/people/profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profiles: nextProfiles }),
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo guardar en Supabase.");
      applyProfiles(body.profiles || nextProfiles);
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "No se pudo guardar en Supabase.");
    }
  }

  async function exportFilteredPeople() {
    if (!filteredPeople.length) return;
    try {
      const XLSX = await import("xlsx");
      const rows = filteredPeople.map((person) => ({
        Cédula: person.cc,
        Nombre: person.nombre,
        Cargo: person.cargo,
        Contratista: person.contratista,
        Rutas: person.stats.rutas,
        "HL movidos": hlMoved(person),
        "Cajas reubicadas": managedCount(person),
        "Visitas en rango": person.stats.enRango || 0,
        "Visitas fuera de rango": person.stats.fueraRango || 0,
        "% en rango": Number(person.stats.porcentajeRango || 0) / 100,
        "Tiempo promedio": person.stats.tiempoPromedioRuta || "Sin dato",
        "Último DT": person.stats.ultimoDt || "",
      }));
      const sheet = XLSX.utils.json_to_sheet(rows);
      for (let row = 2; row <= rows.length + 1; row += 1) {
        if (sheet[`J${row}`]) sheet[`J${row}`].z = "0.00%";
      }
      sheet["!cols"] = [{ wch: 16 }, { wch: 34 }, { wch: 24 }, { wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 20 }, { wch: 18 }, { wch: 22 }, { wch: 13 }, { wch: 16 }, { wch: 16 }];
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Personas");
      XLSX.writeFile(book, `personas-${normalizeText(selectedContractor).replace(/\s+/g, "-")}.xlsx`);
    } catch {
      setError("No se pudo exportar el listado de personas.");
    }
  }

  function setQuickPeriod(period: "today" | "week" | "month" | "history") {
    if (period === "history") { setRangeFrom(""); setRangeTo(""); return; }
    const today = localDateKey();
    setRangeTo(today);
    setRangeFrom(period === "today" ? today : period === "week" ? shiftDateKey(today, -6) : `${today.slice(0, 7)}-01`);
  }

  const totals = useMemo(
    () => ({
      people: mergedGroups.reduce((total, group) => total + group.total, 0),
      routes: mergedGroups.flatMap((group) => group.people).reduce((total, person) => total + person.stats.rutas, 0),
      hectoliters: mergedGroups.flatMap((group) => group.people).reduce((total, person) => total + hlMoved(person), 0),
      managed: mergedGroups.flatMap((group) => group.people).reduce((total, person) => total + managedCount(person), 0),
    }),
    [mergedGroups],
  );

  if (isLoading) return <main className="min-h-screen bg-[#f4f7fb]" />;

  if (!isAllowed) {
    return (
      <main className="min-h-screen px-6 py-10 text-slate-900">
        <section className="mx-auto max-w-xl rounded-lg border border-red-100 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-600">Acceso restringido</p>
          <h1 className="mt-3 text-2xl font-semibold text-[#10223d]">Modulo People no disponible</h1>
          <p className="mt-2 text-sm text-slate-600">{error || "Este modulo solo esta habilitado para people@transporte.com."}</p>
          <button className="mt-5 rounded-md bg-[#10223d] px-4 py-2 text-sm font-semibold text-white" onClick={() => router.push("/")} type="button">
            Volver
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen text-slate-900">
      <header className="sticky top-0 z-20 border-b border-white/60 bg-white/82 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <button className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] hover:bg-slate-100" onClick={() => router.push("/")} type="button">
            <Icon name="arrow" />
          </button>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#7c3aed]">People Transporte</p>
            <h1 className="text-2xl font-semibold text-[#10223d]">Control de personas</h1>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        {error ? <p className="mb-4 rounded-md border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</p> : null}

        <section className="relative mb-5 overflow-hidden rounded-2xl bg-[linear-gradient(125deg,#10223d_0%,#1e3a8a_58%,#6d28d9_100%)] p-5 text-white shadow-[0_18px_45px_rgba(30,58,138,.2)] sm:p-7">
          <div className="absolute -right-16 -top-20 h-60 w-60 rounded-full bg-cyan-300/15 blur-2xl" />
          <div className="relative grid gap-5 xl:grid-cols-[1fr_auto] xl:items-end">
            <div className="max-w-xl"><span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.18em] text-cyan-100"><UsersRound size={13} />Panel de talento operativo</span><h2 className="mt-4 text-2xl font-black sm:text-3xl">Personas, actividad y desempeño en un solo lugar</h2><p className="mt-2 text-sm leading-6 text-blue-100/80">Consulta el histórico completo o analiza un periodo específico. Los indicadores operativos responden al rango seleccionado.</p></div>
            <div className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-md">
              <div className="mb-2 flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-xs font-bold"><CalendarDays size={15} />Periodo</span>{isRefreshing ? <span className="text-[10px] font-semibold text-cyan-200">Actualizando…</span> : <span className="text-[10px] text-blue-100/70">{rangeLabel(rangeFrom, rangeTo)}</span>}</div>
              <div className="grid gap-2 sm:grid-cols-2"><label className="text-[9px] font-bold uppercase tracking-wider text-blue-100/70">Desde<input className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-white px-3 text-sm font-semibold text-[#10223d]" max={rangeTo || undefined} onChange={(event) => setRangeFrom(event.target.value)} type="date" value={rangeFrom} /></label><label className="text-[9px] font-bold uppercase tracking-wider text-blue-100/70">Hasta<input className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-white px-3 text-sm font-semibold text-[#10223d]" min={rangeFrom || undefined} onChange={(event) => setRangeTo(event.target.value)} type="date" value={rangeTo} /></label></div>
              <div className="mt-3 grid grid-cols-4 gap-1 rounded-lg bg-slate-950/20 p-1"><PeriodButton active={rangeFrom === localDateKey() && rangeTo === localDateKey()} label="Hoy" onClick={() => setQuickPeriod("today")} /><PeriodButton active={rangeFrom === shiftDateKey(localDateKey(), -6) && rangeTo === localDateKey()} label="7 días" onClick={() => setQuickPeriod("week")} /><PeriodButton active={rangeFrom === `${localDateKey().slice(0, 7)}-01` && rangeTo === localDateKey()} label="Mes" onClick={() => setQuickPeriod("month")} /><PeriodButton active={!rangeFrom && !rangeTo} label="Histórico" onClick={() => setQuickPeriod("history")} /></div>
            </div>
          </div>
        </section>

        <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Trabajadores" value={totals.people} />
          <Metric label="Asignaciones de ruta" value={totals.routes.toLocaleString("es-CO")} />
          <Metric label="HL movidos" value={formatHl(totals.hectoliters)} />
          <Metric label="Cajas reubicadas" value={totals.managed.toLocaleString("es-CO")} />
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          {mergedGroups.map((group) => (
            <button
              className={`rounded-lg border p-5 text-left shadow-sm transition hover:-translate-y-0.5 ${
                selectedContractor === group.name ? "border-[#7c3aed] bg-[#f5f3ff]" : "border-slate-200 bg-white/88"
              }`}
              key={group.name}
              onClick={() => {
                setSelectedContractor(group.name);
                setSelectedCc("");
                setRoleFilter("Todos");
              }}
              type="button"
            >
              <p className="text-sm font-semibold text-slate-500">Contratista</p>
              <h2 className="mt-1 text-xl font-semibold text-[#10223d]">{group.name}</h2>
              <p className="mt-4 text-3xl font-semibold text-[#7c3aed]">{group.total}</p>
              <p className="text-sm text-slate-500">personas visibles</p>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-200/70 pt-3">
                <ContractorMiniStat label="Rutas" value={contractorStats(group).routes} />
                <ContractorMiniStat label="HL" value={formatCompact(contractorStats(group).hl)} />
                <ContractorMiniStat label="Rango" value={formatPercent(contractorStats(group).range)} />
              </div>
            </button>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <section className="rounded-lg border border-white/70 bg-white/86 p-4 shadow-sm backdrop-blur">
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{selectedContractor}</p>
                <h2 className="text-xl font-semibold text-[#10223d]">Trabajadores</h2>
              </div>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#10223d] px-3 text-xs font-semibold text-white disabled:opacity-50" disabled={!filteredPeople.length} onClick={() => void exportFilteredPeople()} type="button"><Download size={15} />Exportar ({filteredPeople.length})</button>
            </div>

            <div className="mb-4 grid gap-2 md:grid-cols-[minmax(220px,1fr)_minmax(150px,.55fr)_minmax(160px,.55fr)_auto]">
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input aria-label="Buscar personas" className="h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-9 text-sm outline-none transition focus:border-[#7c3aed]" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre, cédula o cargo" value={query} />{query ? <button aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded hover:bg-slate-100" onClick={() => setQuery("")} type="button"><X size={14} /></button> : null}</div>
              <select aria-label="Filtrar por cargo" className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#7c3aed]" onChange={(event) => setRoleFilter(event.target.value)} value={roleFilter}><option>Todos</option>{availableRoles.map((role) => <option key={role}>{role}</option>)}</select>
              <select aria-label="Ordenar personas" className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#7c3aed]" onChange={(event) => setSortBy(event.target.value as PeopleSort)} value={sortBy}><option value="nombre">Orden: nombre</option><option value="rutas">Más rutas</option><option value="hl">Más HL</option><option value="rango">Mejor rango</option><option value="gestionadas">Más cajas reubicadas</option></select>
              <button aria-pressed={activityOnly} className={`inline-flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-xs font-semibold ${activityOnly ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600"}`} onClick={() => setActivityOnly((value) => !value)} type="button"><Filter size={15} />Con actividad</button>
            </div>
            <p className="mb-3 text-xs font-medium text-slate-500">{filteredPeople.length} de {selectedGroup?.total || 0} personas</p>

            <div className="overflow-hidden rounded-lg border border-slate-200">
              {visiblePeople.map((person) => (
                <button
                  className={`flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-[#f8f7ff] ${
                    selectedPerson?.cc === person.cc ? "bg-[#f5f3ff] ring-1 ring-inset ring-[#7c3aed]" : "bg-white"
                  }`}
                  key={personKey(person)}
                  onClick={() => setSelectedCc(person.cc)}
                  type="button"
                >
                  <Avatar image={photos[personKey(person)]} name={person.nombre} compact />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#10223d]">{person.nombre}</p>
                    <p className="truncate text-xs text-slate-500">CC {person.cc || "-"} - {person.cargo || "Sin cargo"}</p>
                  </div>
                  <div className="hidden min-w-[300px] grid-cols-3 gap-2 text-center md:grid">
                    <ListStat label="HL" value={formatHl(hlMoved(person))} />
                    <ListStat label="Rango" value={person.stats.enRango || 0} />
                    <ListStat label="Tiempo" value={person.stats.tiempoPromedioRuta || "Sin dato"} />
                  </div>
                  <div className="text-right md:hidden">
                    <p className="text-xs font-semibold text-[#10223d]">{formatHl(hlMoved(person))} HL</p>
                    <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">Rango {person.stats.enRango || 0}</p>
                  </div>
                </button>
              ))}
              {!visiblePeople.length ? <div className="px-5 py-12 text-center"><Search className="mx-auto text-slate-300" size={30} /><p className="mt-3 text-sm font-semibold text-slate-600">No encontramos personas con estos filtros.</p><button className="mt-3 text-xs font-semibold text-violet-700" onClick={() => { setQuery(""); setRoleFilter("Todos"); setActivityOnly(false); }} type="button">Limpiar filtros</button></div> : null}
            </div>
            {hasMorePeople ? (
              <div className="mt-4 flex justify-center">
                <button
                  className="rounded-md border border-[#7c3aed]/25 bg-[#f5f3ff] px-4 py-2 text-sm font-semibold text-[#5b21b6] transition hover:bg-[#ede9fe]"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                  type="button"
                >
                  Ver mas ({filteredPeople.length - visibleCount})
                </button>
              </div>
            ) : null}
          </section>

          <aside className="space-y-4">
            {selectedPerson ? (
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.13)]">
                <div className="relative bg-[#10223d] px-4 pb-4 pt-3 text-white">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#f5bd19] via-[#7c3aed] to-[#0f7c58]" />
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/58"></p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#f5bd19]">{selectedPerson.contratista}</p>
                    </div>
                    <div className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-right">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/50">Rutas</p>
                      <p className="text-lg font-black leading-none">{selectedPerson.stats.rutas}</p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[84px_1fr] sm:items-end">
                    <Avatar image={photos[personKey(selectedPerson)]} name={selectedPerson.nombre} sticker />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-black leading-tight text-white">{selectedPerson.nombre}</h2>
                      <p className="mt-1 text-xs font-semibold leading-5 text-white/68">CC {selectedPerson.cc || "Sin cedula"} - {selectedPerson.cargo || "Sin cargo"}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <StickerPill label="HL" value={formatHl(hlMoved(selectedPerson))} />
                        <StickerPill label="Rango" value={formatPercent(selectedPerson.stats.porcentajeRango)} />
                        <StickerPill label="DT" value={selectedPerson.stats.ultimoDt || "-"} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-b from-white to-slate-50 p-4">
                  <div className="mb-3 flex items-center gap-2 rounded-md border border-violet-100 bg-violet-50/80 px-2.5 py-2 text-xs font-semibold text-[#10223d]"><CalendarDays className="shrink-0 text-violet-500" size={15} /><span className="truncate">{rangeLabel(rangeFrom, rangeTo)}</span></div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <StickerStat label="HL movidos" value={formatHl(hlMoved(selectedPerson))} />
                    <StickerStat label="Clientes visitados" value={selectedPerson.stats.visitasRango || 0} />
                    <StickerStat label="Rutas realizadas" value={selectedPerson.stats.rutas} tone="violet" />
                    <StickerStat label="Modulaciones" value={selectedPerson.stats.modulaciones} />
                    <StickerStat label="Tiempo prom." value={selectedPerson.stats.tiempoPromedioRuta || "Sin dato"} />
                    <StickerStat label="Cajas reubicadas" value={managedCount(selectedPerson)} tone="amber" />
                  </div>

                  <ComplianceCard stats={selectedPerson.stats} />
                  <PerformanceComparison current={selectedPerson.stats} previous={selectedPerson.previousStats} rangeFrom={rangeFrom} rangeTo={rangeTo} />

                  <ActivityTimeline expanded={historyExpanded} items={selectedPerson.history} onToggle={() => setHistoryExpanded((value) => !value)} />

                <div className="mt-4 flex items-center gap-2">
                  <label className="cursor-pointer rounded-md border border-[#7c3aed]/25 bg-[#f5f3ff] px-3 py-1.5 text-xs font-semibold text-[#5b21b6] transition hover:bg-[#ede9fe]">
                    Subir foto
                    <input accept="image/*" className="hidden" onChange={(event) => handlePhoto(selectedPerson, event.target.files?.[0] || null)} type="file" />
                  </label>
                  <div className="relative ml-auto">
                    <button aria-expanded={profileMenuOpen} aria-label="Opciones de persona" className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50" onClick={() => setProfileMenuOpen((value) => !value)} type="button"><EllipsisVertical size={17} /></button>
                    {profileMenuOpen ? <div className="absolute bottom-full right-0 z-10 mb-2 w-44 rounded-md border border-slate-200 bg-white p-1.5 shadow-xl"><button className="w-full rounded px-3 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50" onClick={() => { setProfileMenuOpen(false); if (window.confirm(`¿Quitar a ${selectedPerson.nombre} del módulo People?`)) removePerson(selectedPerson); }} type="button">Quitar persona</button></div> : null}
                  </div>
                  </div>
                </div>
              </section>
            ) : null}
            
            <form className="rounded-lg border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur" onSubmit={handleAddPerson}>
              <h2 className="text-lg font-semibold text-[#10223d]">Nueva persona</h2>
              <div className="mt-4 space-y-3">
                <input className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[#7c3aed]" onChange={(event) => setDraft({ ...draft, cc: event.target.value })} placeholder="Cedula" value={draft.cc} />
                <input className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[#7c3aed]" onChange={(event) => setDraft({ ...draft, nombre: event.target.value })} placeholder="Nombre completo" value={draft.nombre} />
                <input className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[#7c3aed]" onChange={(event) => setDraft({ ...draft, cargo: event.target.value })} placeholder="Cargo" value={draft.cargo} />
                <select className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[#7c3aed]" onChange={(event) => setDraft({ ...draft, contratista: event.target.value })} value={draft.contratista}>
                  {CONTRACTORS.map((contractor) => (
                    <option key={contractor} value={contractor}>
                      {contractor}
                    </option>
                  ))}
                </select>
              </div>
              <button className="mt-4 w-full rounded-md bg-[#10223d] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1264ff]" type="submit">
                Agregar persona
              </button>
            </form>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/70 bg-white/88 p-5 shadow-sm backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}

function PeriodButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={`rounded-md px-2 py-2 text-[10px] font-bold transition ${active ? "bg-white text-[#10223d] shadow-sm" : "text-blue-100/80 hover:bg-white/10 hover:text-white"}`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function ContractorMiniStat({ label, value }: { label: string; value: string | number }) {
  return <div><p className="truncate text-sm font-black text-[#10223d]">{value}</p><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p></div>;
}

function contractorStats(group: ContractorGroup) {
  const inRange = group.people.reduce((total, person) => total + Number(person.stats.enRango || 0), 0);
  const outOfRange = group.people.reduce((total, person) => total + Number(person.stats.fueraRango || 0), 0);
  const visits = inRange + outOfRange;
  return {
    routes: group.people.reduce((total, person) => total + Number(person.stats.rutas || 0), 0),
    hl: group.people.reduce((total, person) => total + hlMoved(person), 0),
    range: visits ? (inRange / visits) * 100 : 0,
  };
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1, notation: "compact" }).format(Number(value || 0));
}

function formatHistoryDate(value: string) {
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return value || "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Bogota" }).format(parsed);
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDateKey(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function rangeLabel(from: string, to: string) {
  if (!from && !to) return "Histórico completo";
  if (from && to && from === to) return formatPeriodDate(from);
  if (!from) return `Hasta ${formatPeriodDate(to)}`;
  if (!to) return `Desde ${formatPeriodDate(from)}`;
  return `${formatPeriodDate(from)} – ${formatPeriodDate(to)}`;
}

function formatPeriodDate(value: string) {
  if (!value) return "";
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Bogota" }).format(parsed);
}

function ComplianceCard({ stats }: { stats: PersonStats }) {
  const evaluated = Number(stats.enRango || 0) + Number(stats.fueraRango || 0);
  const total = Math.max(Number(stats.visitasRango || 0), evaluated);
  const percentage = Math.min(Math.max(Number(stats.porcentajeRango || 0), 0), 100);

  return (
    <section className="mt-3 rounded-lg border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-3">
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Cumplimiento de rango</p><p className="mt-1 text-sm font-bold text-[#10223d]">{stats.enRango || 0} de {total} visitas · {formatPercent(percentage)}</p></div>
        <span className="text-2xl font-black text-emerald-600">{formatPercent(percentage)}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all" style={{ width: `${percentage}%` }} /></div>
      <div className="mt-2 flex justify-between text-[10px] font-semibold"><span className="text-emerald-700">{stats.enRango || 0} en rango</span><span className="text-red-500">{stats.fueraRango || 0} fuera de rango</span></div>
    </section>
  );
}

function PerformanceComparison({ current, previous, rangeFrom, rangeTo }: { current: PersonStats; previous?: PersonStats; rangeFrom: string; rangeTo: string }) {
  return (
    <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">Desempeño del período</p><p className="mt-0.5 text-[10px] text-slate-400">{previous ? `Vs. ${previousRangeLabel(rangeFrom, rangeTo)}` : "Selecciona un rango para comparar"}</p></div>{previous ? <span className="rounded bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500">PERÍODO ANTERIOR</span> : null}</div>
      <div className="mt-3 space-y-3">
        <ComparisonRow current={current.rutas} label="Rutas" previous={previous?.rutas} />
        <ComparisonRow current={hlMovedFromStats(current)} decimals={1} label="HL" previous={previous ? hlMovedFromStats(previous) : undefined} />
        <ComparisonRow current={Number(current.porcentajeRango || 0)} decimals={1} isPercentage label="Cumplimiento" previous={previous ? Number(previous.porcentajeRango || 0) : undefined} />
      </div>
    </section>
  );
}

function ComparisonRow({ current, decimals = 0, isPercentage = false, label, previous }: { current: number; decimals?: number; isPercentage?: boolean; label: string; previous?: number }) {
  const comparable = previous !== undefined;
  const maximum = Math.max(current, previous || 0, 1);
  const delta = comparable ? current - previous : 0;
  const currentLabel = `${current.toLocaleString("es-CO", { maximumFractionDigits: decimals })}${isPercentage ? "%" : ""}`;
  const previousLabel = comparable ? `${previous.toLocaleString("es-CO", { maximumFractionDigits: decimals })}${isPercentage ? "%" : ""}` : "—";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px]"><span className="font-bold text-slate-600">{label}</span><span className="flex items-center gap-2"><b className="text-[#10223d]">{currentLabel}</b>{comparable ? <DeltaBadge delta={delta} isPercentage={isPercentage} previous={previous} /> : null}</span></div>
      <div className="space-y-1"><div className="h-1.5 overflow-hidden rounded-full bg-violet-50"><div className="h-full rounded-full bg-violet-600" style={{ width: `${(current / maximum) * 100}%` }} /></div>{comparable ? <div className="flex items-center gap-2"><div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-300" style={{ width: `${(previous / maximum) * 100}%` }} /></div><span className="w-12 text-right text-[8px] font-semibold text-slate-400">{previousLabel}</span></div> : null}</div>
    </div>
  );
}

function DeltaBadge({ delta, isPercentage, previous }: { delta: number; isPercentage: boolean; previous: number }) {
  const positive = delta > 0;
  const negative = delta < 0;
  const label = isPercentage ? `${delta > 0 ? "+" : ""}${delta.toLocaleString("es-CO", { maximumFractionDigits: 1 })} pts` : previous ? `${delta > 0 ? "+" : ""}${((delta / previous) * 100).toLocaleString("es-CO", { maximumFractionDigits: 0 })}%` : delta > 0 ? "Nuevo" : "0%";
  return <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[8px] font-black ${positive ? "bg-emerald-50 text-emerald-700" : negative ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"}`}>{positive ? <TrendingUp size={10} /> : negative ? <TrendingDown size={10} /> : null}{label}</span>;
}

function ActivityTimeline({ expanded, items, onToggle }: { expanded: boolean; items: PersonHistory[]; onToggle: () => void }) {
  const visibleItems = items.slice(0, expanded ? 8 : 4);
  return (
    <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><Activity className="text-violet-600" size={16} /><h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-600">Actividad reciente</h3></div>{items.length > 4 ? <button className="text-[10px] font-bold text-violet-700 hover:underline" onClick={onToggle} type="button">{expanded ? "Ver menos" : `Ver todas (${items.length})`}</button> : null}</div>
      {visibleItems.length ? <div className="mt-3 space-y-3">{visibleItems.map((item, index) => { const tone = activityTone(item); return <div className={`border-l-2 pl-3 ${tone.border}`} key={`${item.type}-${item.date}-${index}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><span className={`mb-1 inline-flex rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${tone.badge}`}>{activityLabel(item)}</span><p className="truncate text-xs font-semibold text-[#10223d]">{item.title}</p></div><time className="shrink-0 text-[9px] font-semibold text-slate-400">{formatHistoryDate(item.date)}</time></div><p className="mt-0.5 text-[10px] leading-4 text-slate-500">{item.detail}</p></div>; })}</div> : <p className="mt-3 text-xs text-slate-500">Esta persona todavía no tiene actividad registrada.</p>}
    </section>
  );
}

function activityTone(item: PersonHistory) {
  const value = normalizeText(`${item.type} ${item.detail}`);
  if (value.includes("finalizado")) return { badge: "bg-emerald-50 text-emerald-700", border: "border-emerald-300" };
  if (value.includes("modulacion")) return { badge: "bg-amber-50 text-amber-700", border: "border-amber-300" };
  if (value.includes("en ruta")) return { badge: "bg-blue-50 text-blue-700", border: "border-blue-300" };
  return { badge: "bg-violet-50 text-violet-700", border: "border-violet-300" };
}

function activityLabel(item: PersonHistory) {
  const detail = normalizeText(item.detail);
  if (detail.includes("finalizado")) return "Finalizada";
  if (detail.includes("en ruta")) return "En ruta";
  return item.type;
}

function previousRangeLabel(from: string, to: string) {
  if (!from && !to) return "período anterior";
  const normalizedFrom = from || to;
  const normalizedTo = to || from;
  const fromDate = new Date(`${normalizedFrom}T12:00:00`);
  const toDate = new Date(`${normalizedTo}T12:00:00`);
  const durationDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
  const previousTo = shiftDateKey(normalizedFrom, -1);
  return rangeLabel(shiftDateKey(previousTo, -durationDays + 1), previousTo);
}

function hlMovedFromStats(stats: PersonStats) {
  return Number(stats.hectolitros || 0);
}

function Avatar({ compact = false, image, name, large = false, sticker = false }: { compact?: boolean; image?: string; name: string; large?: boolean; sticker?: boolean }) {
  const size = sticker ? "h-20 w-20 text-3xl" : large ? "h-20 w-20 text-2xl" : compact ? "h-9 w-9 text-sm" : "h-12 w-12 text-base";
  const pixels = sticker ? 80 : large ? 80 : compact ? 36 : 48;
  const frame = sticker ? "rounded-lg ring-[3px] ring-white/90 shadow-[0_12px_26px_rgba(0,0,0,0.24)]" : "rounded-lg ring-1 ring-slate-200";

  return image ? (
    <Image alt={name} className={`${size} ${frame} shrink-0 object-cover`} height={pixels} src={image} width={pixels} />
  ) : (
    <div className={`${size} ${frame} grid shrink-0 place-items-center bg-gradient-to-br from-[#10223d] to-[#7c3aed] font-black text-white`}>
      {initials(name)}
    </div>
  );
}

function ListStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="truncate text-xs font-semibold text-[#10223d]">{value}</p>
      <p className="text-[9px] uppercase tracking-[0.1em] text-slate-400">{label}</p>
    </div>
  );
}

function managedCount(person: Person) {
  return Number(person.stats.gestionadas ?? person.stats.reubicaciones ?? 0);
}

function hlMoved(person: Person) {
  return Number(person.stats.hectolitros || 0);
}

function formatHl(value: number) {
  return Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 1 });
}

function formatPercent(value: number | undefined) {
  return `${Number(value || 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })}%`;
}

function StickerPill({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/82">
      <span className="text-white/48">{label}</span>
      <span className="text-white">{value}</span>
    </span>
  );
}

function StickerStat({ label, tone = "slate", value }: { label: string; tone?: "amber" | "green" | "red" | "slate" | "violet"; value: string | number }) {
  const styles = {
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    red: "border-red-100 bg-red-50 text-red-700",
    slate: "border-slate-200 bg-white text-[#10223d]",
    violet: "border-violet-100 bg-violet-50 text-violet-700",
  };

  return (
    <div className={`min-h-16 rounded-md border p-2.5 ${styles[tone]}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-60">{label}</p>
      <p className="mt-1 break-words text-lg font-black leading-tight">{value}</p>
    </div>
  );
}

function personKey(person: Pick<Person, "cc" | "contratista">) {
  return `${normalizeText(person.contratista)}:${String(person.cc || "").replace(/\D/g, "")}`.toLowerCase();
}

function profileKey(profile: Pick<PeopleProfile, "cc" | "contratista">) {
  return `${normalizeText(profile.contratista)}:${String(profile.cc || "").replace(/\D/g, "")}`.toLowerCase();
}

function personToProfile(person: Person): PeopleProfile {
  return {
    cc: person.cc,
    nombre: person.nombre,
    cargo: person.cargo,
    contratista: person.contratista,
    isLocal: Boolean(person.isLocal),
  };
}

function profileToPerson(profile: PeopleProfile): Person {
  return {
    cc: profile.cc,
    nombre: profile.nombre || "Sin nombre",
    cargo: profile.cargo || "Sin cargo",
    contratista: profile.contratista,
    isLocal: Boolean(profile.isLocal),
    stats: { rutas: 0, modulaciones: 0, reubicaciones: 0, hectolitros: 0, visitasRango: 0, enRango: 0, fueraRango: 0, porcentajeRango: 0, tiempoPromedioRuta: "Sin dato", ultimoDt: "" },
    history: [],
  };
}

function upsertProfiles(profiles: PeopleProfile[], profile: PeopleProfile) {
  const key = profileKey(profile);
  const current = profiles.find((item) => profileKey(item) === key);
  const merged = { ...current, ...profile };
  return [merged, ...profiles.filter((item) => profileKey(item) !== key)];
}

function dedupePeople(people: Person[]) {
  const byKey = new Map<string, Person>();

  people.forEach((person) => {
    const key = personKey(person);
    if (!key.endsWith(":")) {
      const current = byKey.get(key);
      byKey.set(key, mergePerson(current, person));
      return;
    }

    byKey.set(`${key}:${normalizeText(person.nombre)}:${byKey.size}`, person);
  });

  return Array.from(byKey.values());
}

function mergePerson(current: Person | undefined, next: Person) {
  if (!current) return next;
  const history = [...current.history, ...next.history].slice(0, 10);

  return {
    ...next,
    nombre: next.nombre || current.nombre,
    cargo: next.cargo || current.cargo,
    isLocal: current.isLocal || next.isLocal,
    stats: {
      rutas: Math.max(current.stats.rutas, next.stats.rutas),
      modulaciones: Math.max(current.stats.modulaciones, next.stats.modulaciones),
      reubicaciones: Math.max(current.stats.reubicaciones, next.stats.reubicaciones),
      gestionadas: Math.max(managedCount(current), managedCount(next)),
      hectolitros: Math.max(hlMoved(current), hlMoved(next)),
      visitasRango: Math.max(current.stats.visitasRango || 0, next.stats.visitasRango || 0),
      enRango: Math.max(current.stats.enRango || 0, next.stats.enRango || 0),
      fueraRango: Math.max(current.stats.fueraRango || 0, next.stats.fueraRango || 0),
      porcentajeRango: Math.max(current.stats.porcentajeRango || 0, next.stats.porcentajeRango || 0),
      tiempoPromedioRuta: next.stats.tiempoPromedioRuta !== "Sin dato" ? next.stats.tiempoPromedioRuta : current.stats.tiempoPromedioRuta,
      ultimoDt: next.stats.ultimoDt || current.stats.ultimoDt,
    },
    history,
  };
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function initials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "P"
  );
}
