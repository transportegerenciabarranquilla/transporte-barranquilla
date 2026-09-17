"use client";

import { useEffect, useState } from "react";
import { LoginScreen } from "./components/LoginScreen";
import { PortalDashboard } from "./components/PortalDashboard";
import { cacheContractor } from "./lib/contractorBranding";
import { clearRemoteCache } from "./lib/remoteStore";

type LoginForm = { email: string; password: string; remember: boolean };
type SessionState = { email: string; contractor: string; isAdmin?: boolean; isPeople?: boolean } | null;

export default function Home() {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [session, setSession] = useState<SessionState>(null);
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    async function checkSession() {
      try {
        const response = await fetch("/api/session/session", { cache: "no-store", signal: controller.signal });
        if (response.status === 401) {
          if (disposed) return;
          setSession(null);
          setIsLoggedIn(false);
          cacheContractor("");
        } else {
          if (!response.ok) throw new Error("Session service unavailable");
          const body = await response.json();
          if (!body?.session?.email || !body?.session?.contractor) throw new Error("Invalid session response");
          if (disposed) return;
          setSession(body.session);
          setIsLoggedIn(true);
          cacheContractor(body.session.contractor);
        }
        setSessionError("");
        setIsCheckingSession(false);
      } catch {
        if (disposed) return;
        setSessionError("No se pudo comprobar tu sesión por un problema de conexión. Reintentaremos automáticamente.");
        retry = setTimeout(() => void checkSession(), 10_000);
      }
    }
    void checkSession();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(retry);
    };
  }, []);

  async function handleLogin(form: LoginForm) {
    const response = await fetch("/api/session/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "No se pudo iniciar sesión.");
    clearRemoteCache();
    cacheContractor(body.contractor);
    setSession({ email: body.email, contractor: body.contractor, isAdmin: body.isAdmin, isPeople: body.isPeople });
    setIsLoggedIn(true);
  }

  async function handleLogout() {
    await fetch("/api/session/logout", { method: "POST" });
    clearRemoteCache();
    cacheContractor("");
    setSession(null);
    setIsLoggedIn(false);
  }

  if (isCheckingSession) {
    return <main className="grid min-h-screen place-items-center bg-[#f4f7fb] p-6">
      <div role="status" className="max-w-md rounded-2xl bg-white p-6 text-center text-slate-700 shadow-sm">
        <h1 className="text-lg font-bold">{sessionError ? "Conexión temporalmente interrumpida" : "Comprobando sesión"}</h1>
        {sessionError && <p className="mt-3 text-sm">{sessionError}</p>}
      </div>
    </main>;
  }

  if (isLoggedIn) {
    return (
      <PortalDashboard
        onLogout={handleLogout}
        isAdmin={Boolean(session?.isAdmin)}
        isPeople={Boolean(session?.isPeople)}
        contractor={session?.contractor || ""}
      />
    );
  }

  return <LoginScreen onLogin={handleLogin} sessionError={sessionError} />;
}
