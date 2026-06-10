// Importé par le service worker généré (vite-plugin-pwa).
// Reçoit les push même quand l'app est fermée et affiche la notification.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const titre = data.title || 'MonPortefeuille';
  const options = {
    body: data.body || 'Nouveau mois : pense à investir.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'rappel-mensuel',
    renotify: true,
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(titre, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
