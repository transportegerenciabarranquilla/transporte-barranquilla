"use client";

import { KeyRound, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";
import { clearApplicationData, getPinRecord, savePinRecord } from "../lib/db";
import { createPinRecord, isValidPin, verifyPin } from "../lib/security";
import type { PinRecord } from "../lib/types";

const SESSION_KEY = "control-td-unlocked";

export function PinGate({ children }: { children: (lock: () => void) => ReactNode }) {
  const [state, setState] = useState<"loading" | "setup" | "locked" | "unlocked">("loading");
  const [record, setRecord] = useState<PinRecord | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPinRecord()
      .then((stored) => {
        setRecord(stored);
        setState(stored ? (sessionStorage.getItem(SESSION_KEY) === "1" ? "unlocked" : "locked") : "setup");
      })
      .catch(() => {
        setError("No fue posible consultar el PIN en la base de datos.");
        setState("setup");
      });
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (state === "setup") {
        if (!isValidPin(pin)) throw new Error("El PIN debe contener entre 4 y 8 dígitos.");
        if (pin !== confirmPin) throw new Error("Los PIN no coinciden.");
        const nextRecord = await createPinRecord(pin);
        await savePinRecord(nextRecord);
        setRecord(nextRecord);
      } else if (!record || !(await verifyPin(pin, record))) {
        throw new Error("PIN incorrecto.");
      }
      sessionStorage.setItem(SESSION_KEY, "1");
      setPin("");
      setConfirmPin("");
      setState("unlocked");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible validar el PIN.");
    } finally {
      setBusy(false);
    }
  }

  function lock() {
    sessionStorage.removeItem(SESSION_KEY);
    setPin("");
    setState("locked");
  }

  async function resetApplication() {
    if (!window.confirm("Se eliminarán el PIN y todos los cortes guardados en Supabase. ¿Deseas continuar?")) return;
    setBusy(true);
    setError("");
    try {
      await clearApplicationData();
      sessionStorage.removeItem(SESSION_KEY);
      setRecord(null);
      setPin("");
      setConfirmPin("");
      setState("setup");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible borrar los datos de Supabase.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "unlocked") return <>{children(lock)}</>;

  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <section className="panel w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-br from-[#2d1b4e] via-[#44266f] to-[#6d3eb5] px-7 py-9 text-white">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
            {state === "setup" ? <ShieldCheck size={24} /> : <LockKeyhole size={23} />}
          </span>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-orange-200">Control operativo en la nube</p>
          <h1 className="mt-2 text-2xl font-bold">Control  de tripulaciones</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            {state === "setup" ? "Crea el PIN que protegerá los cortes en Supabase." : "Ingresa el PIN para consultar los cortes guardados."}
          </p>
        </div>

        <form className="space-y-4 p-7" onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-slate-700">
            PIN
            <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 focus-within:border-rose-400 focus-within:ring-2 focus-within:ring-rose-100">
              <KeyRound className="text-slate-400" size={17} />
              <input
                autoFocus
                className="w-full bg-transparent text-base tracking-[0.25em] outline-none"
                inputMode="numeric"
                maxLength={8}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                type="password"
                value={pin}
              />
            </span>
          </label>

          {state === "setup" ? (
            <label className="block text-sm font-semibold text-slate-700">
              Confirmar PIN
              <input
                className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 tracking-[0.25em] outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                inputMode="numeric"
                maxLength={8}
                onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                type="password"
                value={confirmPin}
              />
            </label>
          ) : null}

          {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p> : null}

          <button
            className="h-11 w-full rounded-lg bg-[#ed6a5a] text-sm font-bold text-white shadow-sm transition hover:bg-[#d95749] disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={busy || state === "loading"}
            type="submit"
          >
            {busy ? "Validando…" : state === "setup" ? "Crear PIN y entrar" : state === "loading" ? "Cargando…" : "Desbloquear"}
          </button>

          {state === "locked" ? (
            <button className="flex w-full items-center justify-center gap-2 text-xs font-semibold text-slate-500 hover:text-red-600" onClick={resetApplication} type="button">
              <Trash2 size={14} /> Olvidé el PIN: borrar datos de Supabase
            </button>
          ) : (
            <p className="text-center text-xs leading-5 text-slate-500">El PIN y los cortes se guardan en las tablas TD de Supabase.</p>
          )}
        </form>
      </section>
    </main>
  );
}
