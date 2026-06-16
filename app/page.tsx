"use client";

import { useEffect, useState } from "react";
import { LoginScreen } from "./components/LoginScreen";
import { PortalDashboard } from "./components/PortalDashboard";

export default function Home() {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setIsLoggedIn(sessionStorage.getItem("bavaria.demo.session") === "active");
      setIsCheckingSession(false);
    });
  }, []);

  function handleLogin() {
    sessionStorage.setItem("bavaria.demo.session", "active");
    setIsLoggedIn(true);
  }

  function handleLogout() {
    sessionStorage.removeItem("bavaria.demo.session");
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
