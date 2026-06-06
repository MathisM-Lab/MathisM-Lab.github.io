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

export function genererProjection({
  enveloppes = [],
  rendementMensuel = 0.0056,
  rendementLivretMensuel = TAUX_LIVRET_MENSUEL,
  dateNaissance = null,
  dateDebut = undefined,
  maxMois = 365
} = {}) {
  // Taux mensuel d'une enveloppe : son rendement annuel propre s'il est défini,
  // sinon le défaut selon le type (investissement ou livret).
  const tauxMensuel = (e) => {
    const raw = e.rendementAnnuelPct;
    const annuel = raw === '' || raw == null ? null : Number(raw);
    if (annuel != null && Number.isFinite(annuel)) return (1 + annuel / 100) ** (1 / 12) - 1;
    return aDesActifs(e.type) ? rendementMensuel : rendementLivretMensuel;
  };

  // Prépare l'état de chaque enveloppe.
  const etats = enveloppes.map((e) => ({
    id: e.id,
    nom: e.nom,
    paliers: paliersDe(e, dateDebut),
    taux: tauxMensuel(e),
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

// Valeur projetée d'une enveloppe précise pour un mois donné.
export function projeteEnveloppeAuMois(serie, envId, mois) {
  if (!serie?.length) return 0;
  const clamp = Math.max(0, Math.min(mois, serie.length - 1));
  return serie[clamp]?.parEnv?.[envId] ?? 0;
}

// Y a-t-il une projection définie (au moins un versement prévu) ?
export function aUneProjection(serie) {
  return !!serie?.length && serie[serie.length - 1].totalProjete > 0;
}

// Plus d'événements ponctuels en dur : conservé pour compatibilité d'import.
export function evenementsProjection() {
  return [];
}
