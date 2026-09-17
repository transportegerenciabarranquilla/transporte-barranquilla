"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function ExitTvButton() {
  const router = useRouter();

  async function exitTv() {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // La navegación sigue disponible aunque el navegador rechace salir de pantalla completa.
      }
    }
    router.push("/admin");
  }

  return (
    <button
      aria-label="Salir del modo TV y volver al seguimiento global"
      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-100 2xl:text-sm"
      onClick={() => void exitTv()}
      title="Volver a la vista global de transportistas"
      type="button"
    >
      <LogOut size={17} />
      Salir TV
    </button>
  );
}
