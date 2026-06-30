"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10 text-slate-900">
      <section className="glass-panel w-full max-w-xl rounded-lg p-6 text-center sm:p-8">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-md bg-red-50 text-red-600">
          <AlertTriangle size={26} />
        </span>
        <h1 className="mt-5 text-2xl font-semibold text-[#10223d]">Algo no cargo bien</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          La vista encontro un error inesperado. Puedes intentar recargar el modulo sin perder el resto del portal.
        </p>
        <button
          className="tech-button mt-6 inline-flex h-11 items-center gap-2 rounded-md px-5 text-sm font-semibold"
          onClick={reset}
          type="button"
        >
          <RefreshCw size={17} />
          Reintentar
        </button>
        {error.digest ? <p className="mt-4 text-xs text-slate-400">Codigo: {error.digest}</p> : null}
      </section>
    </main>
  );
}

