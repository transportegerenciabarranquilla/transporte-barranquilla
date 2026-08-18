"use client";

import { useCallback, useEffect, useState } from "react";
import { LockKeyhole, ShieldAlert, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";

type Status = {
  state: { active: boolean; reason: string; activatedAt: string };
  canControl: boolean;
  configured: boolean;
};

export function SecurityLockdownGuard() {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/security/lockdown", { cache: "no-store" });
    if (!response.ok) return;
    const next = await response.json() as Status;
    setStatus(next);
    if (next.state.active && !next.canControl) {
      await fetch("/api/session/logout", { method: "POST" }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function changeLockdown(active: boolean) {
    if (active && !window.confirm("Esto cerrara el acceso de todos los demas usuarios. ¿Activar bloqueo de emergencia?")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/security/lockdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo cambiar el bloqueo.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cambiar el bloqueo.");
    } finally {
      setBusy(false);
    }
  }

  // La portada conserva el formulario de acceso como via de recuperacion
  // para la cuenta propietaria. El servidor rechaza cualquier otro correo
  // mientras el bloqueo siga activo.
  if (status?.state.active && !status.canControl && pathname !== "/") {
    return (
      <div className="fixed inset-0 z-[9999] grid place-items-center bg-[#071522] p-6 text-white">
        <section className="max-w-lg text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-400 text-[#071522]"><LockKeyhole size={30} /></span>
          <h1 className="mt-6 text-2xl font-black">Plataforma temporalmente bloqueada</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">Se activo el modo de seguridad. Tu sesion fue cerrada y no se puede acceder a la informacion hasta que el administrador reactive el servicio.</p>
        </section>
      </div>
    );
  }

  if (!status?.canControl) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[9998] flex max-w-sm items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
      {status.state.active ? <ShieldAlert className="text-red-600" size={22} /> : <ShieldCheck className="text-emerald-600" size={22} />}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black text-slate-900">Seguridad global</p>
        <p className="text-[10px] text-slate-500">{!status.configured ? "Falta instalar la tabla de seguridad" : status.state.active ? "Acceso bloqueado" : "Acceso habilitado"}</p>
        {message ? <p className="mt-1 text-[10px] font-semibold text-red-600">{message}</p> : null}
      </div>
      <button
        className={`rounded-lg px-3 py-2 text-[10px] font-black text-white disabled:opacity-50 ${status.state.active ? "bg-emerald-700" : "bg-red-700"}`}
        disabled={busy || !status.configured}
        onClick={() => void changeLockdown(!status.state.active)}
        type="button"
      >
        {busy ? "Procesando" : status.state.active ? "Reactivar" : "Bloquear"}
      </button>
    </div>
  );
}
