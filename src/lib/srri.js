// Calcul du SRRI (1-7) selon la méthodologie ESMA/UCITS.
// Rendements hebdomadaires sur 5 ans (260 semaines), volatilité annualisée × √52.

import { estLivret } from './calc.js';
import { prixActif } from './calc.js';

// Seuils de volatilité annualisée → palier SRRI (ESMA guidelines).
const SEUILS = [0, 0.005, 0.02, 0.05, 0.10, 0.15, 0.25, Infinity];

// Volatilité annualisée approximative au centre de chaque bande SRRI.
const SRI_MIDPOINTS = [0, 0.0025, 0.0125, 0.035, 0.075, 0.125, 0.20, 0.30];

export function srriDepuisVol(vol) {
  for (let i = 1; i < SEUILS.length; i++) {
    if (vol < SEUILS[i]) return i;
  }
  return 7;
}

export function volDepuisSRI(sri) {
  return SRI_MIDPOINTS[Math.max(1, Math.min(7, sri))] ?? null;
}

export function srriColor(srri) {
  if (srri <= 2) return '#4CAF50';
  if (srri === 3) return '#8BC34A';
  if (srri === 4) return '#FFC107';
  if (srri === 5) return '#FF9800';
  return '#F44336';
}

// Rendements hebdomadaires étiquetés par date depuis { 'YYYY-MM-DD': prix }.
function rendementsParDate(points) {
  const dates = Object.keys(points).sort();
  const out = {};
  for (let i = 1; i < dates.length; i++) {
    const p0 = points[dates[i - 1]];
    const p1 = points[dates[i]];
    if (p0 > 0 && p1 != null) out[dates[i]] = (p1 - p0) / p0;
  }
  return out;
}

function stddev(values) {
  const n = values.length;
  if (n < 4) return null;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

// Covariance entre deux séries de rendements étiquetées par date (intersection).
function covAlignee(rA, rB) {
  const dates = Object.keys(rA).filter((d) => rB[d] != null);
  const n = dates.length;
  if (n < 4) return 0;
  const a = dates.map((d) => rA[d]);
  const b = dates.map((d) => rB[d]);
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  return a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0) / (n - 1);
}

// SRRI et volatilité d'un actif depuis ses prix hebdomadaires.
// Renvoie { srri, vol, nSemaines } ou null si données insuffisantes.
export function srriActif(pointsHebdo) {
  if (!pointsHebdo) return null;
  const rParDate = rendementsParDate(pointsHebdo);
  const rArr = Object.values(rParDate);
  const sigma = stddev(rArr);
  if (sigma == null) return null;
  const vol = sigma * Math.sqrt(52);
  return { srri: srriDepuisVol(vol), vol, nSemaines: rArr.length };
}

// Volatilité annualisée d'un portefeuille d'actifs.
// actifs : [{ poids, pointsHebdo?, volManuelle? }]
//   pointsHebdo → actifs avec ticker (matrice de covariance calculée)
//   volManuelle → σ annuelle (0 pour livrets, midpoint SRI pour SCPI)
//   Les actifs sans données (pointsHebdo absent et volManuelle null) sont ignorés.
// Formule : σ_p = √(wᵀ Σ w), Σ en variance hebdomadaire, × √52 pour annualiser.
export function srriPortefeuille(actifs) {
  const valides = actifs.filter((a) => a.poids > 0 && (a.pointsHebdo || a.volManuelle != null));
  if (!valides.length) return null;

  const total = valides.reduce((s, a) => s + a.poids, 0);
  const items = valides.map((a) => ({ ...a, poids: a.poids / total }));
  const rSeries = items.map((a) => (a.pointsHebdo ? rendementsParDate(a.pointsHebdo) : null));

  let varianceHebdo = 0;
  const n = items.length;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const wi = items[i].poids;
      const wj = items[j].poids;
      if (rSeries[i] && rSeries[j]) {
        // Les deux ont un historique : covariance alignée sur dates communes.
        varianceHebdo += wi * wj * covAlignee(rSeries[i], rSeries[j]);
      } else if (i === j && !rSeries[i]) {
        // Actif sans historique (livret σ=0 ou SCPI vol manuelle) : variance propre seulement.
        const v = items[i].volManuelle ?? 0;
        varianceHebdo += wi * wi * (v * v / 52);
      }
      // Cross-terme entre actif avec et sans historique → corrélation supposée 0.
    }
  }

  const vol = Math.sqrt(Math.max(0, varianceHebdo * 52));
  return { srri: srriDepuisVol(vol), vol };
}

// Calcule le SRRI de chaque actif, de chaque enveloppe et du portefeuille global.
// Renvoie { parActif: Map<actifId, {srri,vol}>, parEnveloppe: Map<envId, {srri,vol}|null>, global: {srri,vol}|null }
export function calculerSRRI(enveloppes, prixMap, transactions, prixHebdo) {
  const parActif = new Map();
  const parEnveloppe = new Map();
  const tousActifsGlobal = [];
  let valeurTotale = 0;

  // Pré-agrégation en une seule passe (évite un filter() par actif/enveloppe).
  // actifId est un UUID unique par actif : on peut l'utiliser seul comme clé.
  const partsParActif = new Map();
  const montantParEnv = new Map();
  for (const t of transactions) {
    if (t.actifId != null) {
      partsParActif.set(t.actifId, (partsParActif.get(t.actifId) ?? 0) + (t.parts ?? 0));
    }
    montantParEnv.set(t.enveloppe, (montantParEnv.get(t.enveloppe) ?? 0) + (t.montant ?? 0));
  }

  for (const env of enveloppes) {
    if (estLivret(env)) {
      const valeurEnv = montantParEnv.get(env.id) ?? 0;
      parEnveloppe.set(env.id, { srri: 1, vol: 0 });
      if (valeurEnv > 0) {
        tousActifsGlobal.push({ poids: valeurEnv, pointsHebdo: null, volManuelle: 0 });
        valeurTotale += valeurEnv;
      }
      continue;
    }

    const actifsEnv = [];
    for (const actif of env.actifs ?? []) {
      const parts = partsParActif.get(actif.id) ?? 0;
      const valeur = parts * prixActif(actif, prixMap);

      const points = actif.ticker ? prixHebdo.get(actif.ticker)?.points : null;
      let actifSRRI = null;

      if (points && Object.keys(points).length >= 4) {
        actifSRRI = srriActif(points);
      } else if (actif.vev != null && String(actif.vev).trim() !== '') {
        const vol = Number(actif.vev) / 100;
        if (Number.isFinite(vol) && vol >= 0) actifSRRI = { srri: srriDepuisVol(vol), vol };
      } else if (actif.sri != null && actif.sri >= 1 && actif.sri <= 7) {
        const vol = volDepuisSRI(Number(actif.sri));
        actifSRRI = { srri: Number(actif.sri), vol };
      }

      if (actifSRRI) parActif.set(actif.id, actifSRRI);
      actifsEnv.push({ poids: valeur, pointsHebdo: points ?? null, volManuelle: actifSRRI && !points ? actifSRRI.vol : null });
      valeurTotale += valeur;
    }

    const valeurEnv = actifsEnv.reduce((s, a) => s + a.poids, 0);
    parEnveloppe.set(env.id, valeurEnv > 0 ? srriPortefeuille(actifsEnv) : null);
    tousActifsGlobal.push(...actifsEnv);
  }

  const global = valeurTotale > 0 ? srriPortefeuille(tousActifsGlobal) : null;
  return { parActif, parEnveloppe, global };
}
