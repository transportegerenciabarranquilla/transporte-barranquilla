"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Icon } from "./Icon";

const modules = [
  {
    id: 1,
    title: "Seguimiento",
    href: "/seguimiento",
    detail: "Rutas, avance y alertas",
    tone: "from-[#10223d] to-[#1264ff]",
    accent: "border-l-[#1264ff]",
  },
  {
    id: 2,
    title: "Modulacion",
    href: "/modulacion",
    detail: "Refusal y gestion comercial",
    tone: "from-[#0f7c58] to-[#00b8d9]",
    accent: "border-l-[#0f7c58]",
  },
  {
    id: 3,
    title: "Jornada laboral",
    href: "/jornada-laboral",
    detail: "Relevos y alertas SIF",
    tone: "from-[#f5bd19] to-[#ff7a1a]",
    accent: "border-l-[#f5bd19]",
  },
];

const peopleModule = {
  id: 4,
  title: "Personas",
  href: "/personas",
  detail: "Trabajadores, fotos e historial operativo",
  tone: "from-[#7c3aed] to-[#00b8d9]",
  accent: "border-l-[#7c3aed]",
};

export function PortalDashboard({
  onLogout,
  isAdmin = false,
  isPeople = false,
  contractor = "",
}: {
  onLogout: () => void;
  isAdmin?: boolean;
  isPeople?: boolean;
  contractor?: string;
}) {
  const router = useRouter();
  const canSeeJornada = isAdmin || contractor === "Logisticos";
  const baseModules = canSeeJornada ? modules : modules.filter((module) => module.href !== "/jornada-laboral");
  const visibleModules = isPeople ? [peopleModule] : isAdmin ? [{ ...baseModules[0], href: "/admin" }, ...baseModules.slice(1)] : baseModules;
  const sessionLabel = isPeople ? "People Transporte" : isAdmin ? "Administrador" : contractor || "Operacion en tiempo real";
  const heroTitle = isPeople ? "Gestion de personas por contratista" : `Gestion central para ${isAdmin ? "toda la operacion" : sessionLabel}`;
  const heroCopy = isPeople
    ? "Consulta trabajadores, fotos de reconocimiento e historial operativo de Logisticos, Surti Cervezas y Punto Corona."
    : "Accede rapido a los modulos activos sin pantallas de bienvenida ni cruces entre contratistas.";

  return (
    <main className="min-h-screen text-slate-900">
      <header className="sticky top-0 z-30 border-b border-white/50 bg-white/78 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-md bg-gradient-to-br from-[#f5bd19] to-[#00b8d9] text-[#10223d] shadow-lg shadow-cyan-500/15">
              <Icon name="building" />
            </div>
            <div>
              <p className="text-base font-semibold uppercase tracking-[0.16em] text-[#10223d]">Torre Control</p>
              <p className="text-sm text-slate-500">{sessionLabel}</p>
            </div>
          </div>

          <button
            aria-label="Cerrar sesion"
            className="grid h-10 w-10 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-[#10223d]"
            onClick={onLogout}
            type="button"
          >
            <Icon name="logout" />
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 overflow-hidden rounded-lg border border-white/70 bg-white/86 p-5 shadow-[0_22px_70px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:p-6"
          initial={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.35 }}
        >
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#1264ff]">Panel operativo</p>
              <h1 className="mt-2 max-w-3xl text-balance text-3xl font-semibold leading-tight text-[#10223d] sm:text-4xl">
                {heroTitle}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{heroCopy}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Sesion activa</p>
              <p className="mt-1 text-2xl font-semibold text-[#10223d]">{visibleModules.length}</p>
              <p className="text-sm text-slate-500">modulos disponibles</p>
            </div>
          </div>
        </motion.div>

        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">Panel principal</p>
            <h2 className="text-2xl font-semibold text-[#10223d]">Modulos disponibles</h2>
          </div>
          <span className="rounded-md border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm font-semibold text-[#07556b]">{visibleModules.length} modulos</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleModules.map((module, index) => (
            <motion.button
              animate={{ opacity: 1, y: 0 }}
              className={`group flex min-h-28 items-center gap-4 rounded-lg border border-slate-200 bg-white/88 p-4 text-left shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white ${module.accent} border-l-4`}
              initial={{ opacity: 0, y: 14 }}
              key={module.id}
              onClick={() => router.push(module.href)}
              transition={{ delay: 0.05 * index, duration: 0.28 }}
              type="button"
            >
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-md bg-gradient-to-br text-white shadow-lg ${module.tone}`}>
                <Icon name="module" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-semibold text-[#10223d]">{module.title}</span>
                <span className="mt-1 block text-sm text-slate-500">{module.detail}</span>
              </span>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-400 transition group-hover:border-[#1264ff]/30 group-hover:bg-[#1264ff]/8 group-hover:text-[#1264ff]">
                <Icon name="arrow" />
              </span>
            </motion.button>
          ))}
        </div>
      </section>
    </main>
  );
}
