// Récupération des prix via l'endpoint chart non-officiel de Yahoo Finance.
// L'appel direct est bloqué par CORS dans le navigateur : on passe par des proxies
// publics, avec repli sur le prix en cache + saisie manuelle en cas d'échec.

import { setPrixCache, getPrixCache } from './db.js';

const YAHOO = (ticker) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;

const YAHOO_HIST = (ticker) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=10y`;

const YAHOO_HEBDO_FULL = (ticker) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1wk&range=5y`;

const YAHOO_HEBDO_DELTA = (ticker, depuisMs) => {
  const p1 = Math.floor(depuisMs / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1wk&period1=${p1}&period2=${p2}`;
};

// Stratégies de contournement CORS, essayées dans l'ordre. `allorigins` est
// le seul qui fonctionne réellement dans un navigateur (corsproxy.io exige
// désormais une clé API ; un appel direct est toujours bloqué par CORS côté
// navigateur, inutile de le tenter -> pas de 2e entrée ici). Il est flaky
// (erreurs 522 intermittentes côté proxy), d'où le retry avant d'abandonner.
const PROXIES = [
  {
    name: 'allorigins',
    tentatives: 2,
    url: (target) => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
    extract: async (res) => {
      const data = await res.json();
      return JSON.parse(data.contents);
    }
  }
];

function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractPrice(json) {
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  const prix = meta?.regularMarketPrice;
  if (typeof prix === 'number' && isFinite(prix)) {
    return { prix, devise: meta?.currency ?? 'EUR' };
  }
  return null;
}

// Essaie chaque proxy dans l'ordre (avec retries pour les plus flaky comme
// allorigins), jusqu'à obtenir une réponse exploitable par `valider`. Lève la
// dernière erreur si tout échoue.
async function fetchViaProxies(target, valider) {
  let lastErr;
  for (const proxy of PROXIES) {
    const tentatives = proxy.tentatives ?? 1;
    for (let essai = 0; essai < tentatives; essai++) {
      if (essai > 0) await attendre(400);
      try {
        const res = await fetch(proxy.url(target), { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await proxy.extract(res);
        const result = valider(json);
        if (result != null) return { result, source: proxy.name };
        throw new Error('Donnée introuvable dans la réponse');
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr ?? new Error('Échec de récupération');
}

// Récupère un prix unique. Renvoie { prix, source } ou lève une erreur.
export async function fetchPrix(ticker) {
  const { result, source } = await fetchViaProxies(YAHOO(ticker), extractPrice);
  return { ...result, source };
}

// Construit { 'YYYY-MM': cours } à partir d'une réponse "chart" mensuelle.
function extractHistorique(json) {
  const result = json?.chart?.result?.[0];
  const ts = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  const adj = result?.indicators?.adjclose?.[0]?.adjclose;
  const close = adj ?? quote?.close;
  if (!Array.isArray(ts) || !Array.isArray(close)) return null;
  const out = {};
  for (let i = 0; i < ts.length; i++) {
    const c = close[i];
    if (c == null || !isFinite(c)) continue;
    const d = new Date(ts[i] * 1000);
    out[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] = c;
  }
  return Object.keys(out).length ? out : null;
}

// Historique mensuel d'un ticker -> { 'YYYY-MM': cours }. Lève en cas d'échec.
export async function fetchHistorique(ticker) {
  const { result } = await fetchViaProxies(YAHOO_HIST(ticker), extractHistorique);
  return result;
}

// Construit { 'YYYY-MM-DD': cours } à partir d'une réponse chart hebdomadaire.
function extractHebdo(json) {
  const result = json?.chart?.result?.[0];
  const ts = result?.timestamp;
  const quote = result?.indicators?.quote?.[0];
  const adj = result?.indicators?.adjclose?.[0]?.adjclose;
  const close = adj ?? quote?.close;
  if (!Array.isArray(ts) || !Array.isArray(close)) return null;
  const out = {};
  for (let i = 0; i < ts.length; i++) {
    const c = close[i];
    if (c == null || !isFinite(c)) continue;
    const d = new Date(ts[i] * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out[key] = c;
  }
  return Object.keys(out).length ? out : null;
}

async function fetchHebdoBrut(ticker, url) {
  const { result } = await fetchViaProxies(url, extractHebdo);
  return result;
}

const CINQ_ANS_MS = 5 * 365.25 * 24 * 3600 * 1000;
const SEPT_JOURS_MS = 7 * 24 * 3600 * 1000;
// Chevauchement de 3 semaines pour éviter les trous lors du fetch delta.
const OVERLAP_MS = 3 * 7 * 24 * 3600 * 1000;

// Met à jour les prix hebdomadaires de plusieurs tickers de façon incrémentale.
// cacheActuel : Map<ticker, { points, derniereMAJ }> — l'état actuel en mémoire.
// Renvoie une Map<ticker, { points, derniereMAJ }> pour les tickers mis à jour ou à jour.
export async function refreshHebdo(tickers, cacheActuel) {
  const uniques = [...new Set(tickers.filter(Boolean))];
  const out = new Map();
  await Promise.all(uniques.map(async (ticker) => {
    try {
      const cache = cacheActuel.get(ticker);
      // Cache frais (< 7 jours) : on ne refetch pas.
      if (cache?.derniereMAJ && Date.now() - cache.derniereMAJ < SEPT_JOURS_MS) {
        out.set(ticker, cache);
        return;
      }

      let points = cache?.points ? { ...cache.points } : {};
      const dates = Object.keys(points).sort();
      let nouveaux;

      if (dates.length === 0) {
        // Premier fetch : récupère les 5 dernières années complètes.
        nouveaux = await fetchHebdoBrut(ticker, YAHOO_HEBDO_FULL(ticker));
      } else {
        // Fetch delta depuis le dernier point connu (avec chevauchement de 3 semaines).
        const depuisMs = new Date(dates[dates.length - 1]).getTime() - OVERLAP_MS;
        nouveaux = await fetchHebdoBrut(ticker, YAHOO_HEBDO_DELTA(ticker, depuisMs));
      }

      if (nouveaux) Object.assign(points, nouveaux);

      // Élague les points antérieurs à 5 ans.
      const limite = new Date(Date.now() - CINQ_ANS_MS).toISOString().slice(0, 10);
      for (const date of Object.keys(points)) {
        if (date < limite) delete points[date];
      }

      if (Object.keys(points).length > 0) {
        out.set(ticker, { points, derniereMAJ: Date.now() });
      }
    } catch {
      // En cas d'erreur réseau, on conserve le cache existant sans mettre à jour derniereMAJ.
      const cache = cacheActuel.get(ticker);
      if (cache) out.set(ticker, cache);
    }
  }));
  return out;
}

// Rafraîchit l'historique de plusieurs tickers. Ne lève jamais : tickers en échec absents.
export async function refreshHistorique(tickers) {
  const uniques = [...new Set(tickers.filter(Boolean))];
  const out = new Map();
  await Promise.all(
    uniques.map(async (ticker) => {
      try {
        out.set(ticker, await fetchHistorique(ticker));
      } catch { /* ignore : repli sur le cache au niveau appelant */ }
    })
  );
  return out;
}

// Rafraîchit une liste de tickers, met à jour le cache, renvoie une map
// ticker -> { prix, horodatage, ok, erreur? }. Ne lève jamais : agrège les statuts.
export async function refreshPrix(tickers) {
  const uniques = [...new Set(tickers.filter(Boolean))];
  const out = new Map();
  await Promise.all(
    uniques.map(async (ticker) => {
      try {
        const { prix } = await fetchPrix(ticker);
        await setPrixCache(ticker, prix);
        out.set(ticker, { prix, horodatage: Date.now(), ok: true });
      } catch (e) {
        const cached = await getPrixCache(ticker);
        out.set(ticker, {
          prix: cached?.prix ?? null,
          horodatage: cached?.horodatage ?? null,
          ok: false,
          erreur: e?.message ?? String(e)
        });
      }
    })
  );
  return out;
}
