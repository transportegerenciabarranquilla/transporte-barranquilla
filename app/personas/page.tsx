"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

const CONTRACTORS = ["Logisticos", "Surti Cervezas", "Punto Corona"];
const PHOTO_KEY = "people.photos.v1";
const LOCAL_PEOPLE_KEY = "people.local.v1";
const REMOVED_PEOPLE_KEY = "people.removed.v1";
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
  const [selectedContractor, setSelectedContractor] = useState("Logisticos");
  const [selectedCc, setSelectedCc] = useState("");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [draft, setDraft] = useState<DraftPerson>(emptyDraft);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    setPhotos(readJson<Record<string, string>>(PHOTO_KEY, {}));
    setLocalPeople(readJson<Person[]>(LOCAL_PEOPLE_KEY, []));
    setRemovedPeople(readJson<string[]>(REMOVED_PEOPLE_KEY, []));
  }, []);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        const allowed = Boolean(body?.session?.isPeople || body?.session?.isAdmin);
        setIsAllowed(allowed);
        if (!allowed) throw new Error("No tienes permiso para entrar a People.");
        return fetch("/api/people/summary", { cache: "no-store" });
      })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "No se pudo cargar People.");
        setGroups(body.contractors || []);
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
      stats: { rutas: 0, modulaciones: 0, reubicaciones: 0, tiempoPromedioRuta: "Sin dato", ultimoDt: "" },
      history: [],
    };
    const nextPeople = [newPerson, ...localPeople.filter((person) => personKey(person) !== personKey(newPerson))];
    setLocalPeople(nextPeople);
    writeJson(LOCAL_PEOPLE_KEY, nextPeople);
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
      writeJson(LOCAL_PEOPLE_KEY, nextPeople);
      return;
    }

    const nextRemoved = Array.from(new Set([...removedPeople, key]));
    setRemovedPeople(nextRemoved);
    writeJson(REMOVED_PEOPLE_KEY, nextRemoved);
  }

  function handlePhoto(person: Person, file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const nextPhotos = { ...photos, [personKey(person)]: String(reader.result || "") };
      setPhotos(nextPhotos);
      writeJson(PHOTO_KEY, nextPhotos);
    };
    reader.readAsDataURL(file);
  }

  const totals = useMemo(
    () => ({
      people: mergedGroups.reduce((total, group) => total + group.total, 0),
      modulations: mergedGroups.flatMap((group) => group.people).reduce((total, person) => total + person.stats.modulaciones, 0),
      relocations: mergedGroups.flatMap((group) => group.people).reduce((total, person) => total + person.stats.reubicaciones, 0),
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
          <Metric label="Modulaciones" value={totals.modulations} />
          <Metric label="Reubicaciones" value={totals.relocations} />
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

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visiblePeople.map((person) => (
                <button
                  className={`rounded-lg border p-4 text-left transition hover:border-[#7c3aed]/50 ${
                    selectedPerson?.cc === person.cc ? "border-[#7c3aed] bg-[#f5f3ff]" : "border-slate-200 bg-white"
                  }`}
                  key={personKey(person)}
                  onClick={() => setSelectedCc(person.cc)}
                  type="button"
                >
                  <div className="flex items-center gap-3">
                    <Avatar image={photos[personKey(person)]} name={person.nombre} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#10223d]">{person.nombre}</p>
                      <p className="truncate text-xs text-slate-500">{person.cargo || "Sin cargo"}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <MiniStat label="Mod" value={person.stats.modulaciones} />
                    <MiniStat label="Reub" value={person.stats.reubicaciones} />
                    <MiniStat label="Ult. DT" value={person.stats.ultimoDt || "-"} />
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
              <section className="rounded-lg border border-white/70 bg-white/90 p-5 shadow-sm backdrop-blur">
                <div className="flex items-start gap-4">
                  <Avatar image={photos[personKey(selectedPerson)]} name={selectedPerson.nombre} large />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c3aed]">{selectedPerson.contratista}</p>
                    <h2 className="mt-1 text-xl font-semibold text-[#10223d]">{selectedPerson.nombre}</h2>
                    <p className="text-sm text-slate-500">CC {selectedPerson.cc || "Sin cedula"} · {selectedPerson.cargo || "Sin cargo"}</p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <DetailStat label="Ultimo DT" value={selectedPerson.stats.ultimoDt || "-"} />
                  <DetailStat label="Modulaciones" value={selectedPerson.stats.modulaciones} />
                  <DetailStat label="Reubicaciones" value={selectedPerson.stats.reubicaciones} />
                  <DetailStat label="Cargo" value={selectedPerson.cargo || "-"} />
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <label className="cursor-pointer rounded-md border border-[#7c3aed]/25 bg-[#f5f3ff] px-3 py-2 text-sm font-semibold text-[#5b21b6]">
                    Subir foto
                    <input accept="image/*" className="hidden" onChange={(event) => handlePhoto(selectedPerson, event.target.files?.[0] || null)} type="file" />
                  </label>
                  <button className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" onClick={() => removePerson(selectedPerson)} type="button">
                    Quitar
                  </button>
                </div>

                <div className="mt-6">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Historial</h3>
                  <div className="mt-3 space-y-2">
                    {selectedPerson.history.filter((item) => item.type !== "Ruta").length ? (
                      selectedPerson.history.filter((item) => item.type !== "Ruta").map((item, index) => (
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2" key={`${item.type}-${item.title}-${index}`}>
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold text-[#10223d]">{item.title}</p>
                            <span className="rounded bg-white px-2 py-1 text-xs text-slate-500">{item.type}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{item.date || "Sin fecha"}</p>
                          <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">Sin modulaciones o reubicaciones encontradas.</p>
                    )}
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

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/70 bg-white/88 p-5 shadow-sm backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}

function Avatar({ image, name, large = false }: { image?: string; name: string; large?: boolean }) {
  const size = large ? "h-20 w-20 text-2xl" : "h-12 w-12 text-base";
  return image ? (
    <img alt={name} className={`${size} shrink-0 rounded-lg object-cover ring-1 ring-slate-200`} src={image} />
  ) : (
    <div className={`${size} grid shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#10223d] to-[#7c3aed] font-semibold text-white`}>
      {initials(name)}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-slate-50 px-2 py-2">
      <p className="text-sm font-semibold text-[#10223d]">{value}</p>
      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400">{label}</p>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-[#10223d]">{value}</p>
    </div>
  );
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage may be full or blocked; the UI still keeps the in-memory change.
  }
}

function personKey(person: Pick<Person, "cc" | "contratista">) {
  return `${normalizeText(person.contratista)}:${String(person.cc || "").replace(/\D/g, "")}`.toLowerCase();
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
