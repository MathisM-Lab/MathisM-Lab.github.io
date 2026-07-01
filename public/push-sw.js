// Importé par le service worker généré (vite-plugin-pwa).
// Reçoit les push même app fermée. Le service worker décide LUI-MÊME, en lisant
// la base locale (IndexedDB), s'il faut afficher le rappel : il relance tant que
// l'investissement du mois n'est pas saisi, puis s'arrête tout seul dès qu'il
// voit la transaction enregistrée. Il respecte aussi le jour / l'heure /
// l'intervalle réglés dans l'app.

const DB_NAME = 'monportefeuille';
const DATE_DEBUT_DEFAUT = '2026-04-01';

// Ouvre la base SANS imposer de version : on récupère le schéma existant tel quel
// (robuste si l'app fait évoluer sa version plus tard).
function ouvrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll(db, store) {
  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(store)) { resolve([]); return; }
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}

function putParam(db, cle, valeur) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('parametres', 'readwrite');
      tx.objectStore('parametres').put({ cle, valeur });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  });
}

function moisCourant(dateDebut, now) {
  const [y, m] = (dateDebut || DATE_DEBUT_DEFAUT).split('-').map(Number);
  return Math.max(0, (now.getFullYear() - y) * 12 + (now.getMonth() - (m - 1)));
}

// Décide s'il faut afficher le rappel, à partir de l'état local.
async function doitNotifier(now) {
  const db = await ouvrirDB();
  const [paramsRows, enveloppes, transactions] = await Promise.all([
    getAll(db, 'parametres'),
    getAll(db, 'enveloppes'),
    getAll(db, 'transactions')
  ]);
  const params = Object.fromEntries(paramsRows.map((r) => [r.cle, r.valeur]));

  // Rappels désactivés dans l'app -> rien.
  if (params.rappelActif === false) return false;
  // Aucune enveloppe -> rien à rappeler.
  if (!enveloppes.length) return false;

  const rappelJour = Number(params.rappelJour) || 1;
  const rappelHeure = params.rappelHeure || '09:00';
  const intervalH = Number(params.rappelIntervalHeures) || 2;

  // Jour du mois atteint ?
  if (now.getDate() < rappelJour) return false;
  // Heure atteinte ?
  const [hh, mm] = rappelHeure.split(':').map(Number);
  const seuil = new Date(now); seuil.setHours(hh || 0, mm || 0, 0, 0);
  if (now < seuil) return false;

  // Investissement du mois déjà saisi ? (chaque enveloppe a une transaction ce mois)
  const mois = moisCourant(params.dateDebut, now);
  const investies = new Set(
    transactions.filter((t) => (t.mois ?? null) === mois).map((t) => t.enveloppe)
  );
  const toutInvesti = enveloppes.every((e) => investies.has(e.id));
  if (toutInvesti) return false; // ← s'arrête tout seul

  // Anti-spam : respecte l'intervalle même si le serveur envoie plus souvent.
  const last = Number(params.mp_last_push) || 0;
  if (now.getTime() - last < intervalH * 3600 * 1000) return false;

  await putParam(db, 'mp_last_push', now.getTime());
  return true;
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = {}; }

    // Envoi de test (force=true) : on affiche TOUJOURS, sans tenir compte du
    // jour / de l'heure / de l'anti-spam. Sert à isoler un problème de livraison
    // Android d'un problème de logique.
    let afficher = true;
    if (!data.force) {
      // En cas d'erreur de lecture, on affiche quand même (on préfère un rappel
      // en trop à un rappel manqué).
      try { afficher = await doitNotifier(new Date()); } catch { afficher = true; }
    }
    if (!afficher) return;

    await self.registration.showNotification(data.title || 'MonPortefeuille', {
      body: data.body || 'Nouveau mois : pense à investir.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'rappel-mensuel',
      renotify: true,
      data: { url: data.url || '/' }
    });
  })());
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
