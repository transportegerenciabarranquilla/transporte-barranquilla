"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AssistantWidget } from "./AssistantWidget";
import { Icon } from "./Icon";
import { WelcomeCharacter } from "./WelcomeCharacter";

const modules = [
  { id: 1, title: "Seguimiento", href: "/seguimiento" },
  { id: 2, title: "Modulación", href: "/modulacion" },
];

export function PortalDashboard({ onLogout }: { onLogout: () => void }) {
  const [showWelcome, setShowWelcome] = useState(true);
  const router = useRouter();

  function closeWelcome() {
    setShowWelcome(false);
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-md bg-[#f5bd19] text-[#10223d]">
              <Icon name="building" />
            </div>
            <div>
              <p className="text-base font-semibold uppercase tracking-[0.16em] text-[#10223d]">Bavaria</p>
              <p className="text-sm text-slate-500">Portal web</p>
            </div>
          </div>

          <button
            className="grid h-10 w-10 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-[#10223d]"
            onClick={() => {
              onLogout();
            }}
            type="button"
            aria-label="Cerrar sesion"
          >
            <Icon name="logout" />
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:py-12">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">Panel principal</p>
            <h2 className="text-2xl font-semibold text-[#10223d]">Modulos disponibles</h2>
          </div>
          <span className="rounded-md bg-[#e9f3ff] px-3 py-2 text-sm font-medium text-[#10223d]">{modules.length} módulos</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((module) => (
            <button
              key={module.id}
              type="button"
              onClick={() => {
                if (module.href) router.push(module.href);
              }}
              className={`group flex min-h-36 flex-col justify-between rounded-lg border p-5 text-left transition ${
                module.title
                  ? "border-[#f5bd19] bg-white shadow-[0_16px_45px_rgba(245,189,25,0.18)] hover:-translate-y-1"
                  : "border-slate-200 bg-white/75 hover:border-slate-300"
              }`}
            >
              <span
                className={`grid h-11 w-11 place-items-center rounded-md ${
                  module.title ? "bg-[#f5bd19] text-[#10223d]" : "bg-slate-100 text-slate-400"
                }`}
              >
                <Icon name="module" />
              </span>

              <span>
                <span className={`block h-7 text-lg font-semibold ${module.title ? "text-[#10223d]" : "text-transparent"}`}>
                  {module.title || "Modulo"}
                </span>
                <span className={`mt-2 block h-2 rounded-full ${module.title ? "w-24 bg-[#0f7c58]" : "w-16 bg-slate-200"}`} />
              </span>
            </button>
          ))}
        </div>
      </section>

      {showWelcome ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#10223d]/35 px-5 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-[0_24px_90px_rgba(16,34,61,0.24)] sm:p-8">
            <button
              className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-[#10223d]"
              onClick={closeWelcome}
              type="button"
              aria-label="Cerrar bienvenida"
            >
              <Icon name="close" />
            </button>

            <div className="grid items-center gap-6 md:grid-cols-[250px_1fr]">
              <WelcomeCharacter />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#0f7c58]">Acceso concedido</p>
                <h1 className="mt-3 text-3xl font-semibold leading-tight text-[#10223d] sm:text-4xl">
                  Bienvenido a tu portal web Bavaria
                </h1>
                <p className="mt-4 text-base leading-7 text-slate-600">
                  Aqui podras encontrar un mundo de posibilidades para consultar, organizar y avanzar con las
                  herramientas de tu equipo.
                </p>
                <button
                  className="mt-6 rounded-md bg-[#f5bd19] px-5 py-3 text-sm font-semibold text-[#10223d] transition hover:bg-[#e6a400]"
                  onClick={closeWelcome}
                  type="button"
                >
                  Empezar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <AssistantWidget />
    </main>
  );
}
