import { openDB } from 'idb';

const DB_NAME = 'monportefeuille';
const DB_VERSION = 3;

let dbPromise;

// Demande au navigateur de conserver durablement les données (anti-éviction
// automatique : mémoire saturée, longue inactivité). Sans effet si déjà accordé
// ou non supporté. Ne protège PAS d'un effacement manuel par l'utilisateur.
// Renvoie true si le stockage est (ou devient) persistant.
export async function demanderPersistance() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

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
        if (!db.objectStoreNames.contains('prixCache')) {
          db.createObjectStore('prixCache', { keyPath: 'ticker' });
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
// Clés techniques écrites par le service worker (push) : à exclure des paramètres
// exposés à l'app et de l'export de profil.
const estCleTechnique = (cle) => typeof cle === 'string' && cle.startsWith('mp_');

export async function setParam(cle, valeur) {
  const db = await getDB();
  await db.put('parametres', { cle, valeur });
}

export async function getAllParams() {
  const db = await getDB();
  const rows = await db.getAll('parametres');
  return Object.fromEntries(rows.filter((r) => !estCleTechnique(r.cle)).map(r => [r.cle, r.valeur]));
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
export async function setPrixHebdo(ticker, points, derniereMAJ) {
  const db = await getDB();
  await db.put('prixHebdo', { ticker, points, derniereMAJ });
}

export async function getAllPrixHebdo() {
  const db = await getDB();
  return db.getAll('prixHebdo');
}

// === Historique de prix mensuel (ticker -> { 'YYYY-MM': cours }) ===
export async function setPrixHistorique(ticker, points) {
  const db = await getDB();
  await db.put('prixHistorique', { ticker, points, horodatage: Date.now() });
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
  // N'exporte pas les clés techniques (écrites par le service worker push).
  if (Array.isArray(data.parametres)) {
    data.parametres = data.parametres.filter((r) => !estCleTechnique(r.cle));
  }
  return {
    app: 'MonPortefeuille',
    type: 'profil',
    schema: PROFIL_SCHEMA,
    exportedAt: new Date().toISOString(),
    data
  };
}

// Restaure un profil. Ne touche QUE les stores connus présents dans le fichier
// (un store absent est laissé tel quel ; un store inconnu est ignoré). Un fichier
// plus ANCIEN reste toujours importable : les nouveautés restent simplement vierges.
//
// Sécurités :
//  - refus d'un fichier issu d'une version PLUS RÉCENTE de l'app (schema inconnu),
//    plutôt que d'injecter des données qu'on ne saurait pas interpréter ;
//  - validation légère de la forme (tableaux d'objets, enveloppes nommées) ;
//  - remplacement atomique : si une écriture échoue, IndexedDB annule tout et les
//    données actuelles restent intactes.
//
// Renvoie le décompte par store importé, ex. { enveloppes: 3, transactions: 42 }.
export async function importProfil(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Fichier illisible ou vide.');
  if (payload.app && payload.app !== 'MonPortefeuille') {
    throw new Error("Ce fichier ne provient pas de MonPortefeuille.");
  }
  const schema = Number(payload.schema);
  if (Number.isFinite(schema) && schema > PROFIL_SCHEMA) {
    throw new Error("Ce fichier vient d'une version plus récente de l'app. Mets l'application à jour avant d'importer.");
  }
  const data = payload.data;
  if (!data || typeof data !== 'object') throw new Error('Aucune donnée reconnue dans le fichier.');

  const stores = STORES_PROFIL.filter((s) => Array.isArray(data[s]));
  if (stores.length === 0) throw new Error('Aucune donnée reconnue dans le fichier.');

  // Validation légère : chaque store présent doit être un tableau d'objets.
  for (const s of stores) {
    if (!data[s].every((row) => row && typeof row === 'object')) {
      throw new Error(`Données « ${s} » corrompues dans le fichier.`);
    }
  }
  // Garde-fou métier : une enveloppe doit au moins porter un nom.
  if (Array.isArray(data.enveloppes) && !data.enveloppes.every((e) => typeof e.nom === 'string')) {
    throw new Error('Le fichier contient des enveloppes invalides.');
  }

  const db = await getDB();
  const tx = db.transaction(stores, 'readwrite');
  const counts = {};
  for (const s of stores) {
    const store = tx.objectStore(s);
    store.clear();
    for (const row of data[s]) store.put(row);
    counts[s] = data[s].length;
  }
  await tx.done; // rejette (et annule tout) si une écriture a échoué
  return counts;
}

// === Reset complet (debug / paramètres) ===
export async function wipeAll() {
  const db = await getDB();
  // Ne vide que les stores réellement présents (robuste après évolution du schéma).
  const stores = [...db.objectStoreNames];
  if (stores.length === 0) return;
  const tx = db.transaction(stores, 'readwrite');
  await Promise.all(stores.map(s => tx.objectStore(s).clear()));
  await tx.done;
}
