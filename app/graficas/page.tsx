"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";

export default function GraficasPage() {
  const router = useRouter();
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    fetch("/api/session/session", { cache: "no-store" })
      .then(async (response) => {
        const body = response.ok ? await response.json().catch(() => null) : null;
        if (body?.session?.isAdmin) {
          router.replace("/admin/graficas");
          return;
        }
        setAccess("denied");
      })
      .catch(() => setAccess("denied"));
  }, [router]);

  if (access === "checking") return <main className="grid min-h-screen place-items-center bg-[#f4f7fb]"><div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><LoaderCircle className="animate-spin" size={18} />Abriendo graficas administrativas...</div></main>;

  if (access === "denied") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f7fb] px-5">
        <section className="max-w-md rounded-lg border border-red-100 bg-white p-6 text-center shadow-sm">
          <ShieldAlert className="mx-auto text-red-600" size={28} />
          <h1 className="mt-3 text-xl font-semibold text-[#10223d]">Modulo no disponible</h1>
          <p className="mt-2 text-sm text-slate-500">Graficas administrativas esta disponible exclusivamente para administradores.</p>
          <button className="mt-5 rounded-md bg-[#10223d] px-4 py-2 text-sm font-semibold text-white" onClick={() => router.push("/")} type="button">
            Volver
          </button>
        </section>
      </main>
    );
  }
  return null;
}
