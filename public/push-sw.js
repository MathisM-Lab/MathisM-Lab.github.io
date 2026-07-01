// Importé par le service worker généré (vite-plugin-pwa).
// Reçoit les push même app fermée.
//
// Répartition des rôles :
//  - Le "QUAND" (jours 1-3, ~9h->21h, toutes les 2h) est géré par le cron GitHub
//    (.github/workflows/push.yml). Le serveur envoie "à l'aveugle".
//  - Le "FAUT-IL AFFICHER" est décidé ICI, sur le téléphone, en lisant la base
//    locale (IndexedDB) : on ne rappelle que tant que le "plan du mois" (les
//    enveloppes dont un versement est prévu ce mois-ci, via les paliers) n'a pas
//    ses transactions. Dès que le plan est fait, ça s'arrête tout seul. Aucune
//    donnée ne quitte le téléphone.

const DB_NAME = 'monportefeuille';
const DATE_DEBUT_DEFAUT = '2026-04-01';
const ANTI_SPAM_MS = 90 * 60 * 1000; // évite un doublon si le cron envoie 2 fois de suite

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

function parseDebut(dateDebut) {
  const [y, m] = (dateDebut || DATE_DEBUT_DEFAUT).split('-').map(Number);
  return { y, m: m - 1 }; // m 0-indexé
}

function moisCourant(dateDebut, now) {
  const { y, m } = parseDebut(dateDebut);
  return Math.max(0, (now.getFullYear() - y) * 12 + (now.getMonth() - m));
}

function monthInputToMois(value, dateDebut) {
  const { y, m } = parseDebut(dateDebut);
  const [yy, mm] = value.split('-').map(Number);
  return Math.max(0, (yy - y) * 12 + ((mm - 1) - m));
}

// Versement prévu d'une enveloppe à un mois donné (dernier palier dont mois <=
// cible). Réplique la logique de src/lib/projection.js (mvtPrevuAuMois).
function mvtPrevuAuMois(enveloppe, mois, dateDebut) {
  const paliers = (Array.isArray(enveloppe && enveloppe.paliers) ? enveloppe.paliers : [])
    .filter((p) => p && p.depuis)
    .map((p) => ({ mois: monthInputToMois(p.depuis, dateDebut), montant: Number(p.montant) || 0 }))
    .sort((a, b) => a.mois - b.mois);
  let montant = 0;
  for (const p of paliers) { if (p.mois <= mois) montant = p.montant; else break; }
  return montant;
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

  // Rappels désactivés dans l'app (interrupteur on/off) -> rien.
  if (params.rappelActif === false) return false;
  if (!enveloppes.length) return false;

  // Plan du mois = enveloppes dont un versement est prévu ce mois-ci (paliers > 0).
  // C'est exactement la liste "Ce mois-ci" de l'écran d'accueil.
  const mois = moisCourant(params.dateDebut, now);
  const planIds = enveloppes
    .filter((e) => mvtPrevuAuMois(e, mois, params.dateDebut) > 0)
    .map((e) => e.id);
  if (!planIds.length) return false; // rien de prévu ce mois-ci

  // Chaque enveloppe du plan a-t-elle sa transaction ce mois-ci ?
  const investies = new Set(
    transactions.filter((t) => (t.mois ?? null) === mois).map((t) => t.enveloppe)
  );
  const planFait = planIds.every((id) => investies.has(id));
  if (planFait) return false; // plan accompli -> s'arrête tout seul

  // Anti-doublon (le cron rythme déjà les envois toutes les 2h).
  const last = Number(params.mp_last_push) || 0;
  if (now.getTime() - last < ANTI_SPAM_MS) return false;

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
