/* Service worker de l'espace vendeur Amachia : alertes « Nouvelle commande » reçues même navigateur fermé
   ou téléphone verrouillé (notification système avec son et vibration). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data && event.data.text() }; }
  const title = d.title || "🔔 Nouvelle commande — Amachia";
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body: d.body || "Ouvrez vos commandes pour la préparer.",
      icon: "/icon-192.png",
      badge: "/favicon-32.png",
      tag: d.tag || "amashia-new-order",
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: [600, 200, 600, 200, 600, 200, 900, 400, 600, 200, 600],
      timestamp: Date.now(),
      data: { url: d.url || "/dashboard/commandes" },
      actions: [{ action: "open", title: "Voir la commande" }],
    });
    // Espace vendeur ouvert dans un onglet : on lui demande aussi de lancer la sonnerie en boucle.
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    wins.forEach((w) => w.postMessage({ type: "amashia-new-order" }));
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/dashboard/commandes", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) { await w.focus(); try { await w.navigate(url); } catch { /* ignore */ } return; }
    }
    await self.clients.openWindow(url);
  })());
});

// Application installable (téléphone et ordinateur) : le réseau reste la source, rien n'est mis en cache.
self.addEventListener("fetch", () => {});
