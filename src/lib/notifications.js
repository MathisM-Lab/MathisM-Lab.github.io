// Gestion de la permission de notification.
//
// Le rappel mensuel est désormais assuré UNIQUEMENT par le push (voir push.js et
// public/push-sw.js), qui fonctionne même app fermée. L'ancien « rappel local »
// (qui ne se déclenchait qu'à l'ouverture de l'app) a été retiré : il n'apportait
// rien pour un rappel censé arriver sans ouvrir l'app, et brouillait le diagnostic.
// On ne garde ici que ce dont l'écran Réglages a besoin.

export function notificationsSupportees() {
  return typeof Notification !== 'undefined';
}

export async function demanderPermission() {
  if (!notificationsSupportees()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}
