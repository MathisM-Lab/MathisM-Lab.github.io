// Rappels mensuels d'investissement.
//
// Sans serveur, une PWA ne peut pas être réveillée en arrière-plan de façon fiable
// (les push nécessitent un backend). On adopte donc une stratégie pragmatique :
// vérification à chaque ouverture / retour au premier plan de l'app, plus une
// relance programmée tant que l'app reste ouverte. C'est suffisant pour un usage
// perso ; la limite (pas de notif si l'app est totalement fermée plusieurs jours)
// est assumée.

import { enveloppesInvestiesAuMois } from './calc.js';
import { moisCourant } from './date.js';

const LAST_NOTIF_KEY = 'mp_last_notif';
let timer = null;

export function notificationsSupportees() {
  return typeof Notification !== 'undefined';
}

export async function demanderPermission() {
  if (!notificationsSupportees()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

export function messageManque(enveloppes, transactions, mois) {
  const manquantes = enveloppesInvestiesAuMois(enveloppes, transactions, mois)
    .filter((x) => !x.investie)
    .map((x) => x.enveloppe.nom);
  if (manquantes.length === 0) return null;
  return manquantes.map((n) => `${n} non validé`).join(' · ');
}

async function afficher(titre, corps) {
  if (!notificationsSupportees() || Notification.permission !== 'granted') return;
  const options = {
    body: corps,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'rappel-mensuel',
    renotify: true
  };
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) reg.showNotification(titre, options);
    else new Notification(titre, options);
  } catch {
    try { new Notification(titre, options); } catch { /* ignore */ }
  }
}

// Déclenche une notification de test immédiate (ignore jour/heure/anti-spam).
// Renvoie un statut lisible pour diagnostiquer sur l'appareil.
export async function testerNotification() {
  if (!notificationsSupportees()) return 'Notifications non supportées par ce navigateur.';
  const perm = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (perm !== 'granted') return 'Autorisation refusée (à débloquer dans les réglages du navigateur).';
  await afficher('Test MonPortefeuille', 'Si tu vois ce message, les notifications fonctionnent.');
  return 'ok';
}

function heureRappelAtteinte(rappelHeure, now = new Date()) {
  const [h, m] = (rappelHeure ?? '09:00').split(':').map(Number);
  const seuil = new Date(now);
  seuil.setHours(h, m, 0, 0);
  return now >= seuil;
}

// Le rappel ne se déclenche qu'à partir du jour du mois choisi (ex. le 1er).
function jourRappelAtteint(rappelJour, now = new Date()) {
  return now.getDate() >= (rappelJour ?? 1);
}

// Vérifie l'état et notifie si nécessaire. À appeler à l'ouverture / au focus.
export async function verifierEtNotifier({ params, enveloppes, transactions }) {
  if (!params?.rappelActif) return;
  if (!notificationsSupportees() || Notification.permission !== 'granted') return;
  if (!jourRappelAtteint(params.rappelJour)) return;
  if (!heureRappelAtteinte(params.rappelHeure)) return;

  const mois = moisCourant(params.dateDebut);
  const corps = messageManque(enveloppes, transactions, mois);
  if (!corps) return; // tout est validé

  // Anti-spam : pas plus d'une notif par intervalle configuré.
  const intervalleMs = (params.rappelIntervalHeures ?? 2) * 3600 * 1000;
  const last = Number(localStorage.getItem(LAST_NOTIF_KEY) || 0);
  if (Date.now() - last < intervalleMs) return;

  await afficher('Investissement du mois en attente', corps);
  localStorage.setItem(LAST_NOTIF_KEY, String(Date.now()));
}

// Programme une relance pendant que l'app reste ouverte.
export function programmerRelance(getState) {
  arreterRelance();
  const tick = async () => {
    const state = getState();
    const intervalleMs = (state.params?.rappelIntervalHeures ?? 2) * 3600 * 1000;
    await verifierEtNotifier(state);
    timer = setTimeout(tick, Math.min(intervalleMs, 3600 * 1000)); // au plus toutes les heures
  };
  timer = setTimeout(tick, 60 * 1000);
}

export function arreterRelance() {
  if (timer) { clearTimeout(timer); timer = null; }
}
