"use client";

import { useEffect, useState } from "react";
import { LoginScreen } from "./components/LoginScreen";
import { PortalDashboard } from "./components/PortalDashboard";
import { clearRemoteCache } from "./lib/remoteStore";

type LoginForm = { email: string; password: string; remember: boolean };

export default function Home() {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => setIsLoggedIn(response.ok))
      .finally(() => setIsCheckingSession(false));
  }, []);

  async function handleLogin(form: LoginForm) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "No se pudo iniciar sesión.");
    clearRemoteCache();
    setIsLoggedIn(true);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearRemoteCache();
    setIsLoggedIn(false);
  }

  if (isCheckingSession) {
    return <main className="min-h-screen bg-[#f4f7fb]" />;
  }

  if (isLoggedIn) {
    return <PortalDashboard onLogout={handleLogout} />;
  }

  return <LoginScreen onLogin={handleLogin} />;
}
