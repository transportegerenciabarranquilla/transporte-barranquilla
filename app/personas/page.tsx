"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
  stats: {
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
  history: PersonHistory[];
  isLocal?: boolean;
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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [draft, setDraft] = useState<DraftPerson>(emptyDraft);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    fetch("/api/session/session", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        const allowed = Boolean(body?.session?.isPeople || body?.session?.isAdmin);
        setIsAllowed(allowed);
        if (!allowed) throw new Error("No tienes permiso para entrar a People.");
        return Promise.all([
          fetch("/api/people/summary", { cache: "no-store" }),
          fetch("/api/people/profiles", { cache: "no-store" }),
        ]);
      })
      .then(async ([summaryResponse, profilesResponse]) => {
        const summaryBody = await summaryResponse.json().catch(() => ({}));
        if (!summaryResponse.ok) throw new Error(summaryBody.error || "No se pudo cargar People.");
        setGroups(summaryBody.contractors || []);

        const profilesBody = await profilesResponse.json().catch(() => ({}));
        if (!profilesResponse.ok) throw new Error(profilesBody.error || "No se pudieron cargar fotos de People.");
        applyProfiles(profilesBody.profiles || []);
      })
      .catch((caughtError) => setError(caughtError instanceof Error ? caughtError.message : "Error cargando People."))
      .finally(() => setIsLoading(false));
  }, []);

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
  }, [selectedContractor, query]);

  const filteredPeople = useMemo(() => {
    const needle = normalizeText(query);
    if (!needle) return selectedGroup?.people || [];

    return (selectedGroup?.people || []).filter((person) =>
      normalizeText(`${person.nombre} ${person.cc} ${person.cargo}`).includes(needle),
    );
  }, [query, selectedGroup]);
  const visiblePeople = filteredPeople.slice(0, visibleCount);
  const hasMorePeople = visibleCount < filteredPeople.length;

  const selectedPerson = useMemo(() => {
    return filteredPeople.find((person) => person.cc === selectedCc) || filteredPeople[0] || null;
  }, [filteredPeople, selectedCc]);

  useEffect(() => {
    if (selectedPerson && selectedPerson.cc !== selectedCc) setSelectedCc(selectedPerson.cc);
  }, [selectedPerson, selectedCc]);

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

  const totals = useMemo(
    () => ({
      people: mergedGroups.reduce((total, group) => total + group.total, 0),
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

        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <Metric label="Trabajadores" value={totals.people} />
          <Metric label="HL movidos" value={formatHl(totals.hectoliters)} />
          <Metric label="Gestionadas" value={totals.managed} />
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
              }}
              type="button"
            >
              <p className="text-sm font-semibold text-slate-500">Contratista</p>
              <h2 className="mt-1 text-xl font-semibold text-[#10223d]">{group.name}</h2>
              <p className="mt-4 text-3xl font-semibold text-[#7c3aed]">{group.total}</p>
              <p className="text-sm text-slate-500">personas visibles</p>
            </button>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <section className="rounded-lg border border-white/70 bg-white/86 p-4 shadow-sm backdrop-blur">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{selectedContractor}</p>
                <h2 className="text-xl font-semibold text-[#10223d]">Trabajadores</h2>
              </div>
              <input
                className="h-11 rounded-md border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-[#7c3aed]"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar nombre, cedula o cargo"
                value={query}
              />
            </div>

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
                  <div className="grid grid-cols-2 gap-2.5">
                    <StickerStat label="HL movidos" value={formatHl(hlMoved(selectedPerson))} />
                    <StickerStat label="Visitados" value={selectedPerson.stats.visitasRango || 0} />
                    <StickerStat label="En rango" value={selectedPerson.stats.enRango || 0} tone="green" />
                    <StickerStat label="Fuera rango" value={selectedPerson.stats.fueraRango || 0} tone="red" />
                    <StickerStat label="% rango" value={formatPercent(selectedPerson.stats.porcentajeRango)} tone="violet" />
                    <StickerStat label="Tiempo prom." value={selectedPerson.stats.tiempoPromedioRuta || "Sin dato"} />
                    <StickerStat label="Ultimo DT" value={selectedPerson.stats.ultimoDt || "-"} />
                    <StickerStat label="Gestionadas" value={managedCount(selectedPerson)} tone="amber" />
                  </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <label className="cursor-pointer rounded-md border border-[#7c3aed]/25 bg-[#f5f3ff] px-3 py-1.5 text-xs font-semibold text-[#5b21b6] transition hover:bg-[#ede9fe]">
                    Subir foto
                    <input accept="image/*" className="hidden" onChange={(event) => handlePhoto(selectedPerson, event.target.files?.[0] || null)} type="file" />
                  </label>
                  <button className="rounded-md border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100" onClick={() => removePerson(selectedPerson)} type="button">
                    Quitar
                  </button>
                  </div>
                </div>
              </section>
            ) : null}
            
            <form className="rounded-lg border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur" onSubmit={handleAddPerson}>
              <h2 className="text-lg font-semibold text-[#10223d]">Nueva persona</h2>
              <div className="mt-4 space-y-3">
                <input className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[#7c3aed]" onChange={(event) => setDraft({ ...draft, cc: event.target.value })} placeholder="Cedula" value={draft.cc} />
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
