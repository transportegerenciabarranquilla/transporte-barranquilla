const CACHE_NAME = "torre-control-shell-v1";
const STATIC_ASSETS = ["/favicon.jpeg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

// Nunca se guardan páginas autenticadas ni respuestas de API.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (!STATIC_ASSETS.includes(url.pathname)) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

self.addEventListener("push", (event) => {
  const fallback = { title: "Torre Control", body: "Tienes una alerta operativa.", url: "/admin" };
  let data = fallback;
  try { data = { ...fallback, ...(event.data?.json() || {}) }; }
  catch { data = { ...fallback, body: event.data?.text() || fallback.body }; }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/favicon.jpeg",
    badge: "/favicon.jpeg",
    tag: data.tag || "admin-operational-summary",
    renotify: Boolean(data.renotify),
    data: { url: data.url || "/admin" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || "/admin", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url === destination);
    return existing ? existing.focus() : self.clients.openWindow(destination);
  }));
});
