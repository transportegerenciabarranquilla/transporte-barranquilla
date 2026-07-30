"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, BarChart3, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";

export default function GraficasPage() {
  const router = useRouter();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    fetch("/api/session/session", { cache: "no-store" })
      .then(async (response) => {
        const body = response.ok ? await response.json().catch(() => null) : null;
        setAccess(body?.session && !body.session.isPeople ? "allowed" : "denied");
      })
      .catch(() => setAccess("denied"));
  }, []);

  if (access === "checking") return <main className="min-h-screen bg-[#f4f7fb]" />;

  if (access === "denied") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f7fb] px-5">
        <section className="max-w-md rounded-lg border border-red-100 bg-white p-6 text-center shadow-sm">
          <ShieldAlert className="mx-auto text-red-600" size={28} />
          <h1 className="mt-3 text-xl font-semibold text-[#10223d]">Modulo no disponible</h1>
          <p className="mt-2 text-sm text-slate-500">Graficas esta disponible para las cuentas de contratistas.</p>
          <button className="mt-5 rounded-md bg-[#10223d] px-4 py-2 text-sm font-semibold text-white" onClick={() => router.push("/")} type="button">
            Volver
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-4 sm:px-8">
          <button aria-label="Volver al portal" className="grid h-10 w-10 place-items-center rounded-md text-[#10223d] hover:bg-slate-100" onClick={() => router.push("/")} type="button">
            <ArrowLeft size={19} />
          </button>
          <span className="grid h-11 w-11 place-items-center rounded-md bg-blue-50 text-blue-700">
            <BarChart3 size={22} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Modulo operativo</p>
            <h1 className="text-2xl font-semibold text-[#10223d]">Graficas</h1>
          </div>
        </div>
      </header>
    </main>
  );
}
