import { getAllParams, getEnveloppes, getTransactions, getDB, deleteTransaction, setPrixHistorique } from './db.js';
import { refreshPrix, refreshHistorique } from './prices.js';
import { genererProjection } from './projection.js';
import { moisCourant as calcMoisCourant } from './date.js';
import { patrimoine, moisEstValide } from './calc.js';

function createAppState() {
  let params = $state({});
  let enveloppes = $state([]);
  let transactions = $state([]);
  let prix = $state(new Map());        // ticker -> { prix, horodatage, ok }
  let prixHistorique = $state(new Map()); // ticker -> { 'YYYY-MM': cours }
  let loaded = $state(false);
  let currentScreen = $state('dashboard');
  let refreshingPrices = $state(false);

  async function load() {
    const [p, env, tx] = await Promise.all([
      getAllParams(), getEnveloppes(), getTransactions()
    ]);
    // Migration de schéma sur données brutes (id stable d'actif + actifId sur
    // les transactions) avant de les exposer à l'UI.
    await migrer(env, tx);
    params = p; enveloppes = env; transactions = tx;
    // Nettoie les transactions orphelines (enveloppe supprimée) pour éviter
    // qu'elles soient comptées dans certains écrans mais pas dans d'autres.
    await prunerOrphelins();
    // Charge les prix en cache (sans réseau)
    await chargerPrixCache();
    await chargerHistoriqueCache();
    loaded = true;
  }

  // Donne un id permanent à chaque actif et rattache les transactions par cet id
  // (et non plus par le nom), pour que renommer un actif ne perde plus ses lignes.
  async function migrer(enveloppes, transactions) {
    const db = await getDB();
    for (const env of enveloppes) {
      let changed = false;
      if (Array.isArray(env.actifs)) {
        for (const a of env.actifs) {
          if (!a.id) { a.id = crypto.randomUUID(); changed = true; }
        }
      }
      // Id stable pour chaque palier (sinon l'UI indexe par position et les
      // valeurs se désynchronisent lors d'un tri/ajout/suppression).
      if (Array.isArray(env.paliers)) {
        for (const p of env.paliers) {
          if (!p.id) { p.id = crypto.randomUUID(); changed = true; }
        }
      }
      if (changed) await db.put('enveloppes', env);
    }
    const envById = new Map(enveloppes.map((e) => [e.id, e]));
    for (const t of transactions) {
      if (t.actifId) continue;
      const env = envById.get(t.enveloppe);
      if (!env || !Array.isArray(env.actifs) || env.actifs.length === 0) continue; // livret -> pas d'actifId
      const a = env.actifs.find((x) => x.nom === t.actif);
      if (a) { t.actifId = a.id; await db.put('transactions', t); }
    }
  }

  async function prunerOrphelins() {
    if (!enveloppes.length) return;
    const ids = new Set(enveloppes.map((e) => e.id));
    const orphelins = transactions.filter((t) => !ids.has(t.enveloppe));
    if (orphelins.length === 0) return;
    await Promise.all(orphelins.map((t) => deleteTransaction(t.id)));
    transactions = transactions.filter((t) => ids.has(t.enveloppe));
  }

  async function reload() { await load(); }

  async function chargerPrixCache() {
    const db = await getDB();
    const rows = await db.getAll('prixCache');
    const m = new Map();
    for (const r of rows) m.set(r.ticker, { prix: r.prix, horodatage: r.horodatage, ok: true });
    prix = m;
  }

  async function chargerHistoriqueCache() {
    const db = await getDB();
    const rows = await db.getAll('prixHistorique');
    const m = new Map();
    for (const r of rows) m.set(r.ticker, r.points);
    prixHistorique = m;
  }

  // Rafraîchit l'historique mensuel des prix (pour la courbe de valeur réelle).
  async function rafraichirHistorique() {
    const tickers = enveloppes.flatMap((e) => (e.actifs ?? []).map((a) => a.ticker)).filter(Boolean);
    if (tickers.length === 0) return;
    const res = await refreshHistorique(tickers);
    const m = new Map(prixHistorique);
    for (const [t, points] of res) {
      if (points) { m.set(t, points); await setPrixHistorique(t, points); }
    }
    prixHistorique = m;
  }

  // Rafraîchit les prix via réseau pour tous les tickers configurés.
  async function rafraichirPrix() {
    const tickers = enveloppes.flatMap((e) => (e.actifs ?? []).map((a) => a.ticker)).filter(Boolean);
    if (tickers.length === 0) return;
    refreshingPrices = true;
    try {
      const res = await refreshPrix(tickers);
      const m = new Map(prix);
      for (const [t, v] of res) {
        if (v.prix != null) m.set(t, v);
      }
      prix = m;
    } finally {
      refreshingPrices = false;
    }
  }

  return {
    get params() { return params; },
    get enveloppes() { return enveloppes; },
    get transactions() { return transactions; },
    get prix() { return prix; },
    get prixHistorique() { return prixHistorique; },
    get loaded() { return loaded; },
    get refreshingPrices() { return refreshingPrices; },
    get currentScreen() { return currentScreen; },
    set currentScreen(v) { currentScreen = v; },

    // Dérivés
    get moisCourant() { return calcMoisCourant(params.dateDebut); },
    get patrimoine() { return patrimoine(enveloppes, transactions, prix); },
    get projection() {
      return genererProjection({
        enveloppes,
        rendementMensuel: params.rendementMensuel ?? 0.0056,
        dateNaissance: params.dateNaissance,
        dateDebut: params.dateDebut
      });
    },
    get moisCourantValide() {
      return moisEstValide(enveloppes, transactions, calcMoisCourant(params.dateDebut));
    },

    load, reload, rafraichirPrix, rafraichirHistorique
  };
}

export const app = createAppState();
