import { openDB } from 'idb';

const DB_NAME = 'monportefeuille';
const DB_VERSION = 3;

let dbPromise;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('transactions')) {
          const s = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
          s.createIndex('mois', 'mois');
          s.createIndex('enveloppe', 'enveloppe');
          s.createIndex('actif', 'actif');
        }
        if (!db.objectStoreNames.contains('enveloppes')) {
          db.createObjectStore('enveloppes', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('parametres')) {
          db.createObjectStore('parametres', { keyPath: 'cle' });
        }
        if (!db.objectStoreNames.contains('moisValides')) {
          db.createObjectStore('moisValides', { keyPath: 'cle' });
        }
        if (!db.objectStoreNames.contains('prixCache')) {
          db.createObjectStore('prixCache', { keyPath: 'ticker' });
        }
        if (!db.objectStoreNames.contains('projection')) {
          db.createObjectStore('projection', { keyPath: 'mois' });
        }
        if (!db.objectStoreNames.contains('prixHistorique')) {
          db.createObjectStore('prixHistorique', { keyPath: 'ticker' });
        }
        if (!db.objectStoreNames.contains('prixHebdo')) {
          db.createObjectStore('prixHebdo', { keyPath: 'ticker' });
        }
      }
    });
  }
  return dbPromise;
}

// === Paramètres (clé/valeur) ===
export async function getParam(cle, defaultValue = null) {
  const db = await getDB();
  const row = await db.get('parametres', cle);
  return row ? row.valeur : defaultValue;
}

export async function setParam(cle, valeur) {
  const db = await getDB();
  await db.put('parametres', { cle, valeur });
}

export async function getAllParams() {
  const db = await getDB();
  const rows = await db.getAll('parametres');
  return Object.fromEntries(rows.map(r => [r.cle, r.valeur]));
}

// === Enveloppes ===
export async function getEnveloppes() {
  const db = await getDB();
  return db.getAll('enveloppes');
}

export async function getEnveloppe(id) {
  const db = await getDB();
  return db.get('enveloppes', id);
}

export async function saveEnveloppe(env) {
  const db = await getDB();
  return db.put('enveloppes', env);
}

export async function deleteEnveloppe(id) {
  const db = await getDB();
  // Suppression en cascade : on retire aussi les transactions de cette enveloppe
  // pour ne pas laisser de transactions "orphelines" en base.
  const tx = db.transaction(['enveloppes', 'transactions'], 'readwrite');
  await tx.objectStore('enveloppes').delete(id);
  const txStore = tx.objectStore('transactions');
  const cles = await txStore.index('enveloppe').getAllKeys(id);
  await Promise.all(cles.map((cle) => txStore.delete(cle)));
  await tx.done;
}

// === Transactions ===
export async function getTransactions() {
  const db = await getDB();
  return db.getAll('transactions');
}

export async function getTransactionsByEnveloppe(enveloppeId) {
  const db = await getDB();
  return db.getAllFromIndex('transactions', 'enveloppe', enveloppeId);
}

export async function addTransaction(tx) {
  const db = await getDB();
  const withDate = { ...tx, dateSaisie: tx.dateSaisie ?? new Date().toISOString() };
  return db.add('transactions', withDate);
}

export async function deleteTransaction(id) {
  const db = await getDB();
  await db.delete('transactions', id);
}

// === Prix cache ===
export async function getPrixCache(ticker) {
  const db = await getDB();
  return db.get('prixCache', ticker);
}

export async function setPrixCache(ticker, prix) {
  const db = await getDB();
  await db.put('prixCache', { ticker, prix, horodatage: Date.now() });
}

// === Historique de prix hebdomadaire (ticker -> { 'YYYY-MM-DD': cours }) ===
export async function getPrixHebdo(ticker) {
  const db = await getDB();
  return db.get('prixHebdo', ticker);
}

export async function setPrixHebdo(ticker, points, derniereMAJ) {
  const db = await getDB();
  await db.put('prixHebdo', { ticker, points, derniereMAJ });
}

export async function getAllPrixHebdo() {
  const db = await getDB();
  return db.getAll('prixHebdo');
}

// === Historique de prix mensuel (ticker -> { 'YYYY-MM': cours }) ===
export async function getAllPrixHistorique() {
  const db = await getDB();
  return db.getAll('prixHistorique');
}

export async function setPrixHistorique(ticker, points) {
  const db = await getDB();
  await db.put('prixHistorique', { ticker, points, horodatage: Date.now() });
}

// === Projection ===
export async function getProjection() {
  const db = await getDB();
  return db.getAll('projection');
}

export async function setProjectionBatch(rows) {
  const db = await getDB();
  const tx = db.transaction('projection', 'readwrite');
  await Promise.all(rows.map(r => tx.store.put(r)));
  await tx.done;
}

// === Export / Import du profil ===
// Stores contenant les données SAISIES par l'utilisateur (à sauvegarder).
// Les caches (prixCache, prixHistorique) en sont volontairement exclus : ils se
// reconstruisent seuls via le réseau. Pour ajouter une future fonctionnalité,
// il suffira d'ajouter son store ici : les anciens fichiers resteront lisibles.
export const STORES_PROFIL = ['parametres', 'enveloppes', 'transactions'];
export const PROFIL_SCHEMA = 1;

export async function exportProfil() {
  const db = await getDB();
  const data = {};
  for (const s of STORES_PROFIL) data[s] = await db.getAll(s);
  return {
    app: 'MonPortefeuille',
    type: 'profil',
    schema: PROFIL_SCHEMA,
    exportedAt: new Date().toISOString(),
    data
  };
}

// Restaure un profil. Ne touche QUE les stores connus présents dans le fichier :
// - un store absent du fichier est laissé tel quel (vieux fichier -> donnée
//   manquante simplement non importée) ;
// - un store inconnu dans le fichier est ignoré (fichier d'une version récente).
export async function importProfil(payload) {
  const data = payload?.data;
  if (!data || typeof data !== 'object') throw new Error('Fichier invalide.');
  if (payload.app && payload.app !== 'MonPortefeuille') {
    throw new Error('Ce fichier ne provient pas de MonPortefeuille.');
  }
  const db = await getDB();
  const stores = STORES_PROFIL.filter((s) => Array.isArray(data[s]));
  if (stores.length === 0) throw new Error('Aucune donnée reconnue dans le fichier.');
  const tx = db.transaction(stores, 'readwrite');
  for (const s of stores) {
    const store = tx.objectStore(s);
    await store.clear();
    for (const row of data[s]) await store.put(row);
  }
  await tx.done;
}

// === Reset complet (debug / paramètres) ===
export async function wipeAll() {
  const db = await getDB();
  const stores = ['transactions', 'enveloppes', 'parametres', 'moisValides', 'prixCache', 'projection', 'prixHistorique', 'prixHebdo'];
  const tx = db.transaction(stores, 'readwrite');
  await Promise.all(stores.map(s => tx.objectStore(s).clear()));
  await tx.done;
}
