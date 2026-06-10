// Agrégats de portefeuille + algorithme de rééquilibrage (2 passages).
// `prixOf(actif)` renvoie le prix unitaire courant d'un actif.

export function estLivret(enveloppe) {
  return enveloppe.type === 'Livret A' || !enveloppe.actifs || enveloppe.actifs.length === 0;
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

// Patrimoine réel à la fin d'un mois donné, en se basant uniquement sur les
// versements (cost basis) cumulés jusqu'à ce mois — sert de série "réalité".
export function patrimoineVerseAuMois(enveloppes, transactions, mois) {
  return transactions
    .filter((t) => (t.mois ?? 0) <= mois)
    .reduce((s, t) => s + (t.montant ?? 0), 0);
}

// ---- Rééquilibrage : algorithme à 2 passages ----
// actifs : [{ nom, prix, cible (fraction 0..1), valeurActuelle }]
export function rebalance({ montantDisponible, fraisCourtage = 0.005, ordreMinimum = 200, actifs }) {
  const facteur = (prix) => prix * (1 + fraisCourtage);
  const portfolioTotal = actifs.reduce((s, a) => s + (a.valeurActuelle ?? 0), 0);
  const budgetNet = montantDisponible / (1 + fraisCourtage);

  // Manque par actif puis classement par manque décroissant (rang).
  const avecManque = actifs.map((a) => ({
    ...a,
    manque: Math.max(0, (portfolioTotal + budgetNet) * a.cible - (a.valeurActuelle ?? 0))
  }));
  const ordre = [...avecManque].sort((x, y) => y.manque - x.manque);

  // Passage 1 — combler les manques.
  const p1 = new Map();
  let sommeP1 = 0;
  ordre.forEach((a, i) => {
    const rang = i + 1;
    const budgetRestant = budgetNet - sommeP1;
    const budgetNormal = Math.min(a.manque, budgetRestant);
    const partsNormal = Math.floor(budgetNormal / facteur(a.prix));
    const passeNormal = partsNormal * a.prix >= ordreMinimum;

    let parts;
    if (passeNormal) {
      parts = partsNormal;
    } else if (rang === 1) {
      // Secours : aucun autre actif acheté encore -> tout le budget restant.
      const p = Math.floor(budgetRestant / facteur(a.prix));
      parts = p * a.prix >= ordreMinimum ? p : 0;
    } else {
      parts = 0;
    }
    const cout = parts * facteur(a.prix);
    p1.set(a.nom, parts);
    sommeP1 += cout;
  });

  // Passage 2 — redistribution du budget résiduel.
  const budgetResiduel = budgetNet - sommeP1;
  const p2 = new Map();
  let sommeP2 = 0;
  ordre.forEach((a) => {
    const budgetRestant = budgetResiduel - sommeP2;
    const alloc = budgetRestant * a.cible;
    let parts = Math.floor(alloc / facteur(a.prix));
    if (parts * a.prix < ordreMinimum) parts = 0;
    p2.set(a.nom, parts);
    sommeP2 += parts * facteur(a.prix);
  });

  // Totaux par actif (dans l'ordre d'origine).
  const lignes = actifs.map((a) => {
    const partsP1 = p1.get(a.nom) ?? 0;
    const partsP2 = p2.get(a.nom) ?? 0;
    const parts = partsP1 + partsP2;
    const cout = parts * facteur(a.prix);
    return { nom: a.nom, prix: a.prix, cible: a.cible, partsP1, partsP2, parts, cout };
  });

  const totalDepense = lignes.reduce((s, l) => s + l.cout, 0);
  const resteEspeces = montantDisponible - totalDepense;
  return { lignes, totalDepense, resteEspeces, budgetNet, portfolioTotal };
}

// ---- Validation des mois ----
// Un mois est "validé" si chaque enveloppe a au moins une transaction ce mois-là.
export function enveloppesInvestiesAuMois(enveloppes, transactions, mois) {
  const ids = new Set(
    transactions.filter((t) => (t.mois ?? null) === mois).map((t) => t.enveloppe)
  );
  return enveloppes.map((e) => ({ enveloppe: e, investie: ids.has(e.id) }));
}

export function moisEstValide(enveloppes, transactions, mois) {
  if (!enveloppes.length) return false;
  return enveloppesInvestiesAuMois(enveloppes, transactions, mois).every((x) => x.investie);
}
