"use client";

import { Bell, Download, Share, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function decodeVapidKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0));
}

export function PwaManager() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setNotificationPermission("Notification" in window && "serviceWorker" in navigator && "PushManager" in window ? Notification.permission : "unsupported");
    navigator.serviceWorker?.register("/sw.js").catch(() => undefined);

    const refreshSession = () => {
      fetch("/api/session/session", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : null)
        .then((body) => setIsAdmin(Boolean(body?.session?.isAdmin)))
        .catch(() => undefined);
    };
    refreshSession();
    const sessionInterval = window.setInterval(refreshSession, 15_000);
    window.addEventListener("focus", refreshSession);

    const receivePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const markInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", receivePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", receivePrompt);
      window.removeEventListener("appinstalled", markInstalled);
      window.removeEventListener("focus", refreshSession);
      window.clearInterval(sessionInterval);
    };
  }, []);

  async function installApp() {
    if (isIos() && !isStandalone()) {
      setShowIosGuide(true);
      return;
    }
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  }

  async function enableNotifications() {
    setBusy(true);
    setMessage("Preparando el dispositivo…");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        throw new Error("Este navegador no admite notificaciones push.");
      }
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== "granted") throw new Error("Debes permitir las notificaciones en la configuración del navegador.");

      setMessage("Verificando la configuración del servidor…");
      const keyResponse = await fetch("/api/push/public-key", { cache: "no-store", signal: controller.signal });
      const keyBody = await keyResponse.json().catch(() => ({}));
      if (!keyResponse.ok || !keyBody.publicKey) throw new Error(keyBody.error || "Falta configurar la clave pública de notificaciones.");

      setMessage("Registrando este dispositivo…");
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("El service worker no respondió. Cierra la aplicación y vuelve a abrirla.")), 10_000)),
      ]);
      const previous = await registration.pushManager.getSubscription();
      const subscription = previous || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(keyBody.publicKey),
      });
      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se pudo guardar la suscripción.");
      setMessage("Notificaciones administrativas activadas.");
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === "AbortError"
        ? "La sincronización tardó demasiado. Revisa la conexión y vuelve a intentarlo."
        : error instanceof Error ? error.message : "No se pudieron activar las notificaciones.");
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  function close() {
    setDismissed(true);
  }

  if (!isAdmin || dismissed) return null;

  return (
    <aside className="fixed bottom-4 right-4 z-[80] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-950/20">
      <button aria-label="Cerrar" className="absolute right-3 top-3 text-slate-400 hover:text-slate-700" onClick={close} type="button"><X size={18} /></button>
      <div className="flex gap-3 pr-7">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#10223d] text-white"><Smartphone size={21} /></span>
        <div>
          <p className="font-bold text-[#10223d]">Torre Control en tu celular</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">Instala la aplicación y recibe únicamente alertas administrativas relevantes.</p>
        </div>
      </div>
      {showIosGuide ? (
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
          <p className="flex items-center gap-2 font-bold"><Share size={15} /> En iPhone</p>
          <p className="mt-1">En Safari pulsa Compartir → Agregar a inicio. Después abre la aplicación instalada y activa las notificaciones.</p>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {!installed && (installPrompt || isIos()) ? (
          <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#10223d] px-3 text-xs font-bold text-white" onClick={() => void installApp()} type="button"><Download size={15} /> Instalar aplicación</button>
        ) : null}
        {notificationPermission !== "unsupported" && (!isIos() || installed) ? (
          <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-500 px-3 text-xs font-bold text-slate-950 disabled:opacity-60" disabled={busy} onClick={() => void enableNotifications()} type="button"><Bell size={15} /> {busy ? "Sincronizando…" : notificationPermission === "granted" ? "Sincronizar avisos" : "Activar avisos"}</button>
        ) : null}
      </div>
      {message ? <p className={`mt-2 text-xs font-semibold ${message.startsWith("Notificaciones") ? "text-emerald-700" : busy ? "text-blue-700" : "text-red-600"}`}>{message}</p> : null}
    </aside>
  );
}
