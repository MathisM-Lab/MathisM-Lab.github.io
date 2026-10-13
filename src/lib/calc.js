// Agrégats de portefeuille + algorithme de rééquilibrage (2 passages).
// `prixOf(actif)` renvoie le prix unitaire courant d'un actif.

import { mvtPrevuAuMois } from './projection.js';
import { MIN_ACHAT_DEFAUT, aDesActifs } from './defaults.js';

export function estLivret(enveloppe) {
  return enveloppe.type === 'Livret A' || !enveloppe.actifs || enveloppe.actifs.length === 0;
}

// Barème de courtage BoursoBank (ETF, PEA) : 0,50 % (plafond légal) appliqué
// d'office sous 398 € et au-delà de 500 € ; palier 1,99 € fixe entre les deux
// (le plus rentable). Seuils fixes, non paramétrables.
export function fraisCourtagePEA(montant) {
  const fixe = montant >= 398 && montant <= 500;
  return { frais: fixe ? 1.99 : montant * 0.005, fixe };
}

// Barème de courtage Saxo Investor (ETF, CTO, compte Classic) : 0,08 % du
// montant avec un minimum de 2 € par ordre, + 0,25 % de frais de change si
// l'actif cote dans une devise étrangère (hors €). Seuils fixes.
export function fraisCourtageSaxoCTO(montant, deviseEtrangere = false) {
  // Pas d'ordre, pas de frais : le minimum de 2 € ne s'applique qu'à un achat réel.
  if (!(montant > 0)) return { frais: 0, courtage: 0, change: 0 };
  const courtage = Math.max(2, montant * 0.0008);
  const change = deviseEtrangere ? montant * 0.0025 : 0;
  return { frais: courtage + change, courtage, change };
}

// Montant minimum par achat d'une enveloppe : sa propre valeur enregistrée,
// sinon le défaut par type (tant qu'elle n'a jamais été réenregistrée depuis
// l'ajout de ce champ -> évite qu'une enveloppe non réouverte en Réglages
// reste sans minimum).
export function minAchatEnveloppe(enveloppe) {
  return Number(enveloppe.montantMinAchat) || MIN_ACHAT_DEFAUT[enveloppe.type] || 0;
}

export function prixActif(actif, prixMap) {
  // prixMap : ticker -> { prix }. Repli sur prixDefaut puis 0.
  const live = actif.ticker ? prixMap?.get?.(actif.ticker)?.prix : null;
  return (live ?? actif.prixDefaut ?? 0);
}

export function actifsAgreges(enveloppe, transactions, prixMap) {
  const byId = new Map();
  for (const a of enveloppe.actifs) {
    byId.set(a.id, { ...a, partsTotales: 0, verseTotal: 0, verseTotalHF: 0 });
  }
  for (const tx of transactions) {
    if (tx.enveloppe !== enveloppe.id) continue;
    const e = byId.get(tx.actifId);
    if (!e) continue;
    e.partsTotales += tx.parts ?? 0;
    e.verseTotal += tx.montant ?? 0;                         // frais compris
    e.verseTotalHF += tx.montantHorsFrais ?? tx.montant ?? 0; // hors frais
  }
  const valeurEnv = [...byId.values()].reduce(
    (s, a) => s + a.partsTotales * prixActif(a, prixMap), 0
  );
  return [...byId.values()].map((a) => {
    const prix = prixActif(a, prixMap);
    const valeur = a.partsTotales * prix;
    const plusValue = valeur - a.verseTotal;
    return {
      ...a,
      prix,
      valeur,
      plusValue,
      plusValuePct: a.verseTotal > 0 ? plusValue / a.verseTotal : 0,
      repartActuelle: valeurEnv > 0 ? valeur / valeurEnv : 0
    };
  });
}

export function enveloppeAgregee(enveloppe, transactions, prixMap) {
  if (estLivret(enveloppe)) {
    const txEnv = transactions.filter((t) => t.enveloppe === enveloppe.id);
    const verseTotal = txEnv.reduce((s, t) => s + (t.montant ?? 0), 0);
    const verseTotalHF = txEnv.reduce((s, t) => s + (t.montantHorsFrais ?? t.montant ?? 0), 0);
    return { verseTotal, verseTotalHF, valeurActuelle: verseTotal, plusValue: 0, plusValuePct: 0 };
  }
  const actifs = actifsAgreges(enveloppe, transactions, prixMap);
  const verseTotal = actifs.reduce((s, a) => s + a.verseTotal, 0);
  const verseTotalHF = actifs.reduce((s, a) => s + a.verseTotalHF, 0);
  const valeurActuelle = actifs.reduce((s, a) => s + a.valeur, 0);
  const plusValue = valeurActuelle - verseTotal;
  return {
    verseTotal,
    verseTotalHF,
    valeurActuelle,
    plusValue,
    plusValuePct: verseTotal > 0 ? plusValue / verseTotal : 0
  };
}

export function patrimoine(enveloppes, transactions, prixMap) {
  let verseTotal = 0, verseTotalHF = 0, valeurActuelle = 0;
  const parEnveloppe = enveloppes.map((env) => {
    const a = enveloppeAgregee(env, transactions, prixMap);
    verseTotal += a.verseTotal;
    verseTotalHF += a.verseTotalHF;
    valeurActuelle += a.valeurActuelle;
    return { enveloppe: env, ...a };
  });
  const plusValue = valeurActuelle - verseTotal;
  return {
    verseTotal,
    verseTotalHF,
    valeurActuelle,
    plusValue,
    plusValuePct: verseTotal > 0 ? plusValue / verseTotal : 0,
    parEnveloppe
  };
}

// Frais d'un ordre sur une ligne donnée, selon le barème réel de son enveloppe
// (PEA : palier fixe BoursoBank · CTO : barème Saxo + change · Assurance-vie :
// 0 € · autres : % manuel de l'enveloppe).
export function fraisCourtageLigne(enveloppe, actif, montant) {
  if (enveloppe.type === 'PEA') return fraisCourtagePEA(montant).frais;
  if (enveloppe.type === 'CTO') return fraisCourtageSaxoCTO(montant, actif?.deviseEtrangere).frais;
  if (enveloppe.type === 'Assurance-vie') return 0;
  return montant * (Number(enveloppe.fraisPct) || 0) / 100;
}

// ---- Rééquilibrage global (toutes enveloppes à actifs confondues), 2 passages ----
// lignes : [{ id, enveloppeId, nom, prix, cibleGlobale (fraction 0..1),
//             valeurActuelle, minAchat (€, 0 = aucun), frais(montant)->€ }]
// Les frais ne sont plus un simple %, donc on calcule ligne par ligne combien de
// parts entières tiennent dans un budget (coût = montant + frais(montant), qui
// croît avec le nombre de parts pour tous nos barèmes -> recherche dichotomique).
export function rebalanceGlobal({ montantDisponible, lignes }) {
  const coutLigne = (l, nParts) => {
    const montant = nParts * l.prix;
    return montant + l.frais(montant);
  };
  const maxParts = (l, budget) => {
    if (!(budget > 0) || !(l.prix > 0)) return 0;
    let lo = 0, hi = Math.floor(budget / l.prix) + 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (coutLigne(l, mid) <= budget) lo = mid; else hi = mid - 1;
    }
    return lo;
  };

  const portfolioTotal = lignes.reduce((s, l) => s + (l.valeurActuelle ?? 0), 0);

  // Manque par ligne puis classement par manque décroissant (rang).
  const avecManque = lignes.map((l) => ({
    ...l,
    manque: Math.max(0, (portfolioTotal + montantDisponible) * l.cibleGlobale - (l.valeurActuelle ?? 0))
  }));
  const ordre = [...avecManque].sort((x, y) => y.manque - x.manque);

  // Passage 1 — combler les manques.
  const p1 = new Map();
  let budgetRestant = montantDisponible;
  ordre.forEach((l, i) => {
    const rang = i + 1;
    const cible = Math.min(l.manque, budgetRestant);
    let nParts = maxParts(l, cible);
    const passe = nParts * l.prix >= l.minAchat;
    if (!passe) {
      if (rang === 1) {
        // Secours : aucune autre ligne achetée encore -> tout le budget restant.
        nParts = maxParts(l, budgetRestant);
        if (nParts * l.prix < l.minAchat) nParts = 0;
      } else {
        nParts = 0;
      }
    }
    p1.set(l.id, nParts);
    budgetRestant -= coutLigne(l, nParts);
  });

  // Passage 2 — redistribution du résiduel au prorata des cibles.
  const p2 = new Map();
  let budgetResiduel = budgetRestant;
  ordre.forEach((l) => {
    let nParts = maxParts(l, budgetResiduel * l.cibleGlobale);
    if (nParts * l.prix < l.minAchat) nParts = 0;
    p2.set(l.id, nParts);
    budgetResiduel -= coutLigne(l, nParts);
  });

  // Totaux par ligne (dans l'ordre d'origine).
  const resultLignes = lignes.map((l) => {
    const parts = (p1.get(l.id) ?? 0) + (p2.get(l.id) ?? 0);
    const cout = coutLigne(l, parts);
    return { id: l.id, enveloppeId: l.enveloppeId, nom: l.nom, prix: l.prix, cibleGlobale: l.cibleGlobale, parts, cout };
  });

  const totalDepense = resultLignes.reduce((s, l) => s + l.cout, 0);
  const resteEspeces = montantDisponible - totalDepense;
  return { lignes: resultLignes, totalDepense, resteEspeces, portfolioTotal };
}

// ---- Validation des mois ----
// Une enveloppe n'est "attendue" un mois donné que si le plan prévoit un
// versement ce mois-là (palier actif > 0). Les enveloppes sans versement prévu
// (ex. une assurance-vie alimentée ponctuellement) ne comptent pas. Le Livret
// A (et autres enveloppes sans actifs) a son propre palier individuel. Les
// enveloppes à actifs (PEA, CTO, Assurance-vie, Crypto…) partagent un seul
// palier groupé (`paliersGroupe`, cf. projection.js) : le mois compte comme
// investi pour le groupe dès qu'AU MOINS UNE d'entre elles a une transaction
// ce mois-là (c'est le Rééquilibrage qui décide laquelle).
export function enveloppesInvestiesAuMois(enveloppes, transactions, mois, dateDebut, paliersGroupe = []) {
  const ids = new Set(
    transactions.filter((t) => (t.mois ?? null) === mois).map((t) => t.enveloppe)
  );
  const out = enveloppes
    .filter((e) => !aDesActifs(e.type) && mvtPrevuAuMois(e, mois, dateDebut) > 0)
    .map((e) => ({ enveloppe: e, investie: ids.has(e.id) }));
  const envGroupe = enveloppes.filter((e) => aDesActifs(e.type));
  if (envGroupe.length && mvtPrevuAuMois({ paliers: paliersGroupe }, mois, dateDebut) > 0) {
    out.push({ enveloppe: null, groupe: envGroupe, investie: envGroupe.some((e) => ids.has(e.id)) });
  }
  return out;
}

// Un mois est "validé" si chaque enveloppe (et le groupe) *attendu* ce mois-là
// a une transaction. Un mois sans aucun versement prévu est considéré comme
// validé (rien à faire).
export function moisEstValide(enveloppes, transactions, mois, dateDebut, paliersGroupe = []) {
  if (!enveloppes.length) return false;
  return enveloppesInvestiesAuMois(enveloppes, transactions, mois, dateDebut, paliersGroupe).every((x) => x.investie);
}
