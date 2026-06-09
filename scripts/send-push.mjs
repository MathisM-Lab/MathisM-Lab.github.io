// Envoie le rappel mensuel par Web Push. Exécuté par GitHub Actions.
// Lit les secrets via les variables d'environnement.
import webpush from 'web-push';

const { VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, PUSH_SUBSCRIPTION } = process.env;

if (!VAPID_PUBLIC || !VAPID_PRIVATE || !PUSH_SUBSCRIPTION) {
  console.error('Secrets manquants : VAPID_PUBLIC, VAPID_PRIVATE et PUSH_SUBSCRIPTION sont requis.');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:mat2003mathis@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE);

// PUSH_SUBSCRIPTION peut contenir un abonnement ou un tableau d'abonnements.
const parsed = JSON.parse(PUSH_SUBSCRIPTION);
const abonnements = Array.isArray(parsed) ? parsed : [parsed];

const payload = JSON.stringify({
  title: 'MonPortefeuille',
  body: 'Nouveau mois : pense à investir et à valider tes enveloppes.',
  url: '/'
});

let ok = 0;
for (const sub of abonnements) {
  try {
    await webpush.sendNotification(sub, payload);
    ok++;
    console.log('Push envoyé :', (sub.endpoint || '').slice(0, 50), '…');
  } catch (e) {
    console.error('Échec pour un abonnement :', e.statusCode, e.body || e.message);
  }
}
console.log(`${ok}/${abonnements.length} push envoyé(s).`);
