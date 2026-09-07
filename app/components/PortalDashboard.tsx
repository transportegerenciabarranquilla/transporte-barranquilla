"use client";

import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import type { CSSProperties } from "react";
import styles from "./portal.module.css";
import { Truck, PackageCheck, Clock3, Users, Route, CalendarCheck, Timer, BriefcaseBusiness, Star, ChartColumn, ClipboardCheck, Phone, MapPinned, MessageSquareWarning, ReceiptText, BedDouble, LayoutGrid, type LucideIcon } from "lucide-react";

const moduleIcons: Record<number, LucideIcon> = { 1: Truck, 2: PackageCheck, 3: Clock3, 4: Users, 5: Route, 6: CalendarCheck, 7: Timer, 8: BriefcaseBusiness, 9: Star, 10: ChartColumn, 11: Timer, 12: ClipboardCheck, 13: Phone, 14: MapPinned, 15: MessageSquareWarning, 16: ReceiptText, 17: MapPinned, 18: BedDouble, 19: ChartColumn };
const modulePalette: Record<number, [string, string]> = { 1: ["#2563eb", "#eff6ff"], 2: ["#0d9488", "#f0fdfa"], 3: ["#b77912", "#fffbeb"], 5: ["#16835d", "#ecfdf5"], 12: ["#0284c7", "#f0f9ff"], 13: ["#7c3aed", "#f5f3ff"], 15: ["#be3455", "#fff1f2"], 19: ["#087e96", "#ecfeff"] };
import { Icon } from "./Icon";
import { GlobalOperationsSearch } from "./GlobalOperationsSearch";
import { getPortalHeroCopy, getPortalSessionLabel, getVisiblePortalModules } from "./portalModules";

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
  const reduceMotion = useReducedMotion();
  const visibleModules = getVisiblePortalModules({ contractor, isAdmin, isPeople });
  const sessionLabel = getPortalSessionLabel({ contractor, isAdmin, isPeople });
  const heroTitle = isPeople ? "Gestion de personas por contratista" : `Gestion central para ${contractor === "Admin Arenosa" ? "CD Arenosa" : isAdmin ? "toda la operacion" : sessionLabel}`;
  const heroCopy = getPortalHeroCopy(isPeople);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#eaf0f7] via-[#f6f8fc] to-[#f6f8fc] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-[#243b55] bg-[#10223d] shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-cyan-200 ring-1 ring-white/15">
              <Icon name="building" />
            </div>
            <div>
              <p className="text-base font-semibold uppercase tracking-[0.16em] text-white">Torre Control</p>
              <p className="text-sm text-slate-300">{sessionLabel}</p>
            </div>
          </div>

          <button
            aria-label="Cerrar sesion"
            className="grid h-10 w-10 place-items-center shrink-0 rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-300"
            onClick={onLogout}
            type="button"
          >
            <Icon name="logout" />
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-5 sm:px-8 lg:py-7">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className={`${styles.hero} mb-6 overflow-hidden rounded-2xl p-5 sm:p-7`}
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          transition={{ duration: 0.35 }}
        >
          <svg aria-hidden="true" className={styles.routes} viewBox="0 0 360 180" fill="none"><path d="M0 140H90Q120 140 120 110V70Q120 40 150 40H360M35 180V120Q35 95 60 95H230Q260 95 260 65V0" stroke="#67e8f9" strokeWidth="2" strokeDasharray="5 5"/><circle cx="120" cy="95" r="9" fill="#67e8f9"/><circle cx="260" cy="40" r="7" fill="#fbbf24"/></svg>
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Panel operativo</p>
              <h1 className="mt-2 max-w-3xl text-balance text-2xl font-semibold leading-tight text-white sm:text-3xl">
                {heroTitle}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{heroCopy}</p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/5 px-5 py-4 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Sesion activa</p>
              <p className="mt-1 text-3xl font-semibold text-white">{visibleModules.length}</p>
              <p className="text-sm text-slate-300">módulos disponibles</p>
            </div>
          </div>
        </motion.div>

        <GlobalOperationsSearch isAdmin={isAdmin} />

        <div className="mb-4 mt-6 flex items-end justify-between gap-4 border-b border-slate-200/70 pb-4">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Tu espacio de trabajo</p>
            <h2 className="text-xl font-semibold tracking-tight text-[#10223d] sm:text-2xl">Módulos disponibles</h2>
          </div>
          <span className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">{visibleModules.length} módulos</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {visibleModules.map((module, index) => (
            <motion.button
              animate={{ opacity: 1, y: 0 }}
              className={`${styles.card} group relative flex min-h-28 min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-slate-200/80 border-l-[3px] bg-gradient-to-br from-white via-white to-slate-50/80 p-4 text-left shadow-[0_3px_12px_rgba(15,23,42,0.035)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(15,23,42,0.09)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 motion-reduce:transform-none sm:gap-4 sm:px-5 ${module.accent}`}
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              style={{ "--accent": (modulePalette[module.id] || ["#475569"])[0], "--soft": (modulePalette[module.id] || ["", "#f1f5f9"])[1] } as CSSProperties}
              whileTap={reduceMotion ? undefined : { scale: 0.985 }}
              key={module.id}
              onClick={() => router.push(module.href)}
              transition={{ delay: 0.05 * index, duration: 0.28 }}
              type="button"
            >
              <span className={`${styles.moduleIcon} grid h-12 w-12 shrink-0 place-items-center rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ring-1 ring-inset ring-black/[0.025] transition duration-200 group-hover:scale-105 motion-reduce:transform-none sm:h-14 sm:w-14 `}>
                <ModuleIcon id={module.id} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold tracking-tight text-[#10223d] sm:text-lg">{module.title}</span>
                <span className="mt-1 block text-xs leading-5 text-[#52647a]">{module.detail}</span>
              </span>
              <span className={`${styles.arrow} grid h-8 w-8 shrink-0 place-items-center rounded-full opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100 motion-reduce:transform-none `}>
                <Icon name="arrow" />
              </span>
            </motion.button>
          ))}
        </div>
      </section>
    </main>
  );
}

function ModuleIcon({ id }: { id: number }) {
  const Glyph = moduleIcons[id] || LayoutGrid;
  return <Glyph size={22} strokeWidth={1.8} aria-hidden="true" />;
}
