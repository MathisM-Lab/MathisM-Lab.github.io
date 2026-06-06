// Récupération des prix via l'endpoint chart non-officiel de Yahoo Finance.
// L'appel direct est bloqué par CORS dans le navigateur : on passe par des proxies
// publics, avec repli sur le prix en cache + saisie manuelle en cas d'échec.

import { setPrixCache, getPrixCache } from './db.js';

const YAHOO = (ticker) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;

const YAHOO_HIST = (ticker) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=10y`;

// Stratégies de contournement CORS, essayées dans l'ordre.
const PROXIES = [
  {
    name: 'allorigins',
    url: (target) => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
    extract: async (res) => {
      const data = await res.json();
      return JSON.parse(data.contents);
    }
  },
  {
    name: 'corsproxy',
    url: (target) => `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
    extract: async (res) => res.json()
  },
  {
    name: 'direct',
    url: (target) => target,
    extract: async (res) => res.json()
  }
];

function extractPrice(json) {
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  const prix = meta?.regularMarketPrice;
  if (typeof prix === 'number' && isFinite(prix)) {
    return { prix, devise: meta?.currency ?? 'EUR' };
  }
  return null;
}

// Récupère un prix unique. Renvoie { prix, source } ou lève une erreur.
export async function fetchPrix(ticker) {
  const target = YAHOO(ticker);
  let lastErr;
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy.url(target), { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await proxy.extract(res);
      const parsed = extractPrice(json);
      if (parsed) return { ...parsed, source: proxy.name };
      throw new Error('Prix introuvable dans la réponse');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('Échec de récupération');
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
  const target = YAHOO_HIST(ticker);
  let lastErr;
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy.url(target), { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await proxy.extract(res);
      const points = extractHistorique(json);
      if (points) return points;
      throw new Error('Historique introuvable dans la réponse');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('Échec de récupération');
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
