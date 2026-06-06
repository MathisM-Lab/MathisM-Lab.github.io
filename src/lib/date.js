// Helpers de dates. Le "mois" est un numéro entier depuis dateDebut (mois 0).

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export const DATE_DEBUT = '2026-04-01'; // mois 0 = avril 2026

function parseDebut(dateDebut = DATE_DEBUT) {
  const [y, m] = dateDebut.split('-').map(Number);
  return { y, m: m - 1 }; // m 0-indexé
}

export function moisToDate(mois, dateDebut = DATE_DEBUT) {
  const { y, m } = parseDebut(dateDebut);
  return new Date(y, m + mois, 1);
}

export function moisToLabel(mois, dateDebut = DATE_DEBUT) {
  const d = moisToDate(mois, dateDebut);
  return `${MOIS_COURTS[d.getMonth()]} ${d.getFullYear()}`;
}

export function moisToLabelCourt(mois, dateDebut = DATE_DEBUT) {
  const d = moisToDate(mois, dateDebut);
  return `${MOIS_COURTS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

// Mois courant = nombre de mois entre dateDebut et aujourd'hui.
export function moisCourant(dateDebut = DATE_DEBUT, now = new Date()) {
  const { y, m } = parseDebut(dateDebut);
  return Math.max(0, (now.getFullYear() - y) * 12 + (now.getMonth() - m));
}

export function ageAuMois(mois, dateNaissance, dateDebut = DATE_DEBUT) {
  if (!dateNaissance) return null;
  const d = moisToDate(mois, dateDebut);
  const [ny, nm, nd] = dateNaissance.split('-').map(Number);
  let age = d.getFullYear() - ny;
  if (d.getMonth() + 1 < nm || (d.getMonth() + 1 === nm && d.getDate() < (nd || 1))) age--;
  return age;
}

// Mois où l'utilisateur atteint un âge donné (premier mois de cet âge).
export function moisPourAge(ageCible, dateNaissance, dateDebut = DATE_DEBUT, maxMois = 365) {
  if (!dateNaissance) return null;
  for (let m = 0; m <= maxMois; m++) {
    if (ageAuMois(m, dateNaissance, dateDebut) >= ageCible) return m;
  }
  return null;
}

export function ageAujourdhui(dateNaissance, now = new Date()) {
  if (!dateNaissance) return null;
  const [ny, nm, nd] = dateNaissance.split('-').map(Number);
  let age = now.getFullYear() - ny;
  if (now.getMonth() + 1 < nm || (now.getMonth() + 1 === nm && now.getDate() < (nd || 1))) age--;
  return age;
}

export function dateCourteFr(d = new Date()) {
  return `${d.getDate()} ${MOIS_COURTS[d.getMonth()]} ${d.getFullYear()}`;
}

// Premier jour du mois courant au format 'YYYY-MM-01' (date de début par défaut).
export function currentMonthStart(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

// 'YYYY-MM-01' -> 'YYYY-MM' pour un <input type="month">, et l'inverse.
export function dateDebutToMonthInput(dateDebut = DATE_DEBUT) {
  return (dateDebut ?? DATE_DEBUT).slice(0, 7);
}
export function monthInputToDateDebut(value) {
  return `${value}-01`;
}

// Numéro de mois (offset depuis dateDebut) <-> 'YYYY-MM' pour un <input type="month">.
export function moisToMonthInput(mois, dateDebut = DATE_DEBUT) {
  const d = moisToDate(mois, dateDebut);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function monthInputToMois(value, dateDebut = DATE_DEBUT) {
  const { y, m } = parseDebut(dateDebut);
  const [yy, mm] = value.split('-').map(Number);
  return Math.max(0, (yy - y) * 12 + ((mm - 1) - m));
}
