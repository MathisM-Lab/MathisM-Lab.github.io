// Notifications push « app fermée ».
//
// Principe : le navigateur s'abonne à un service de push (via la clé VAPID
// publique ci-dessous). L'abonnement obtenu est envoyé une fois à GitHub
// (secret PUSH_SUBSCRIPTION). Une tâche planifiée (GitHub Actions, mensuelle)
// envoie alors le rappel, que le service worker affiche même app fermée.
//
// Le message du push est générique : le serveur n'a pas accès à tes données
// (elles restent sur le téléphone). Le détail s'affiche en ouvrant l'app.

const VAPID_PUBLIC = 'BEDByjk1dbL6hitIMwMi1Z5y4ZVW9PafMysoaQAuf4Fit0Xt8pzk3yfZvnttZD2ZwBbSev28aUgKE5VczVp13I8';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupporte() {
  return 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
}

export async function abonnementActuel() {
  if (!pushSupporte()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// Active le push et renvoie l'abonnement au format JSON (à copier dans le secret).
export async function activerPush() {
  if (!pushSupporte()) throw new Error('Push non supporté par ce navigateur.');
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Autorisation refusée (débloque les notifications dans les réglages du navigateur).');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
    });
  }
  return JSON.stringify(sub);
}

export async function desactiverPush() {
  const sub = await abonnementActuel();
  if (sub) await sub.unsubscribe();
}
