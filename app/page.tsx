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
    fetch("/api/session/session", { cache: "no-store" })
      .then(async (response) => {
        setIsLoggedIn(response.ok);
        const body = response.ok ? await response.json().catch(() => null) : null;
        setSession(body?.session ?? null);
        cacheContractor(body?.session?.contractor || "");
      })
      .catch(() => {
        setSessionError("No se pudo validar la sesion. Revisa la conexion e intenta nuevamente.");
        setIsLoggedIn(false);
      })
      .finally(() => setIsCheckingSession(false));
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
    return <main className="min-h-screen bg-[#f4f7fb]" />;
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
