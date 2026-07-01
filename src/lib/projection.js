// Génère la série de projection "plan" mois 0 → maxMois.
//
// Modèle simple et transparent, entièrement saisi par l'utilisateur. Chaque
// enveloppe a une suite de "paliers" de versement : { depuis: 'YYYY-MM', montant }.
// Un palier s'applique à partir de son mois et reste valable jusqu'à ce qu'un
// palier plus récent prenne le relais (pas de date de fin). Avant le premier
// palier, le versement est 0. À chaque mois on compose la valeur de chaque
// enveloppe (rendement mensuel pour les enveloppes d'investissement, taux livret
// pour les autres) puis on ajoute le versement prévu de ce mois-là. Le modèle
// part de 0 : sans palier défini, la courbe "plan" reste à 0.

import { aDesActifs } from './defaults.js';
import { ageAuMois, monthInputToMois } from './date.js';

const TAUX_LIVRET_MENSUEL = 0.002; // ~2,4 %/an pour les enveloppes type Livret

// Paliers d'une enveloppe, convertis en offsets de mois et triés.
export function paliersDe(enveloppe, dateDebut) {
  const raw = Array.isArray(enveloppe?.paliers) ? enveloppe.paliers : [];
  return raw
    .filter((p) => p && p.depuis)
    .map((p) => ({ mois: monthInputToMois(p.depuis, dateDebut), montant: Number(p.montant) || 0 }))
    .sort((a, b) => a.mois - b.mois);
}

// Versement prévu d'une enveloppe à un mois donné (dernier palier dont mois <= cible).
export function mvtPrevuAuMois(enveloppe, mois, dateDebut) {
  let montant = 0;
  for (const p of paliersDe(enveloppe, dateDebut)) {
    if (p.mois <= mois) montant = p.montant;
    else break;
  }
  return montant;
}

// Taux mensuel d'une enveloppe. Pour les enveloppes à actifs, c'est la moyenne
// des rendements par actif pondérée par les cibles (un fonds euros à 2 % et un
// ETF à 6 % ne se moyennent pas à la main). Repli : rendement d'enveloppe s'il
// existe (compat. données antérieures au rendement par actif), sinon défaut du
// type. Source unique, réutilisée par la projection "plan" et "réelle".
export function tauxMensuelEnv(e, {
  rendementMensuel = 0.0056,
  rendementLivretMensuel = TAUX_LIVRET_MENSUEL
} = {}) {
  const parse = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const mensuel = (annuel) => (1 + annuel / 100) ** (1 / 12) - 1;

  const envAnnuel = parse(e.rendementAnnuelPct);

  if (aDesActifs(e.type)) {
    const actifs = Array.isArray(e.actifs) ? e.actifs : [];
    let poidsTotal = 0, sommePondere = 0, aUnRendementActif = false;
    for (const a of actifs) {
      const poids = Number(a.ciblePct) || 0;
      if (poids <= 0) continue;
      // Rendement propre de l'actif, sinon repli sur celui de l'enveloppe.
      const actifAnnuel = parse(a.rendementAnnuelPct);
      const annuel = actifAnnuel != null ? actifAnnuel : envAnnuel;
      if (annuel == null) continue;
      if (actifAnnuel != null) aUnRendementActif = true;
      poidsTotal += poids;
      sommePondere += poids * annuel;
    }
    if (poidsTotal > 0 && aUnRendementActif) return mensuel(sommePondere / poidsTotal);
    if (envAnnuel != null) return mensuel(envAnnuel);
    return rendementMensuel;
  }

  if (envAnnuel != null) return mensuel(envAnnuel);
  return rendementLivretMensuel;
}

export function genererProjection({
  enveloppes = [],
  rendementMensuel = 0.0056,
  rendementLivretMensuel = TAUX_LIVRET_MENSUEL,
  dateNaissance = null,
  dateDebut = undefined,
  maxMois = 365
} = {}) {
  // Prépare l'état de chaque enveloppe.
  const etats = enveloppes.map((e) => ({
    id: e.id,
    nom: e.nom,
    paliers: paliersDe(e, dateDebut),
    taux: tauxMensuelEnv(e, { rendementMensuel, rendementLivretMensuel }),
    valeur: 0
  }));

  const mvtAuMois = (paliers, mois) => {
    let montant = 0;
    for (const p of paliers) { if (p.mois <= mois) montant = p.montant; else break; }
    return montant;
  };

  const serie = [];
  for (let mois = 0; mois <= maxMois; mois++) {
    const parEnv = {};
    let total = 0;
    for (const s of etats) {
      if (mois > 0) s.valeur *= (1 + s.taux);
      s.valeur += mvtAuMois(s.paliers, mois);
      parEnv[s.id] = s.valeur;
      total += s.valeur;
    }
    serie.push({
      mois,
      age: ageAuMois(mois, dateNaissance, dateDebut),
      parEnv,
      totalProjete: total
    });
  }
  return serie;
}

// Valeur projetée (totale) pour un mois donné.
export function projeteAuMois(serie, mois) {
  if (!serie?.length) return 0;
  const clamp = Math.max(0, Math.min(mois, serie.length - 1));
  return serie[clamp]?.totalProjete ?? 0;
}

// Y a-t-il une projection définie (au moins un versement prévu) ?
export function aUneProjection(serie) {
  return !!serie?.length && serie[serie.length - 1].totalProjete > 0;
}
