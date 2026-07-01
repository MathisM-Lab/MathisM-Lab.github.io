// Données par défaut pour le premier lancement, issues de la spec.

export const DEFAULT_PARAMS = {
  fraisCourtage: 0.005,
  ordreMinimum: 200,
  rendementMensuel: 0.0056,
  rappelActif: false,       // interrupteur on/off ; le planning est figé dans le cron GitHub
  onboardingDone: false,
  nomUtilisateur: 'Mathis',
  dateNaissance: '2003-10-02',
  dateDebut: '2026-04-01'   // remplacé par le mois courant à la fin de l'onboarding
};

export const DEFAULT_ENVELOPPES = [
  {
    nom: 'PEA',
    type: 'PEA',
    couleur: '#3D7DFF',
    paliers: [],
    actifs: [
      { nom: 'S&P 500',                  ticker: '', ciblePct: 60, prixDefaut: 33.0022 },
      { nom: 'STOXX Europe 600',         ticker: '', ciblePct: 30, prixDefaut: 20.405  },
      { nom: 'MSCI Emerging Markets',    ticker: '', ciblePct: 10, prixDefaut: 36.932  }
    ]
  },
  {
    nom: 'Livret A',
    type: 'Livret A',
    couleur: '#16C784',
    paliers: [],
    actifs: []
  }
];

// Palette d'enveloppes (sélection à la création) et palette d'actifs (camemberts).
export const ENVELOPPE_PALETTE = ['#3D7DFF', '#16C784', '#F0A92B', '#9B7DFF', '#FF8A5B', '#5BC0EB', '#EA3943'];
export const ASSET_PALETTE     = ['#3D7DFF', '#16C784', '#F0A92B', '#9B7DFF', '#FF8A5B', '#5BC0EB', '#E879A6'];

export const TYPES_ENVELOPPE = ['PEA', 'CTO', 'Assurance-vie', 'Livret A', 'SCPI', 'PER', 'Crypto', 'Autre'];

// Types d'enveloppe gérés par actifs avec cibles de rééquilibrage.
export function aDesActifs(type) {
  return type === 'PEA' || type === 'CTO' || type === 'Assurance-vie' || type === 'Crypto';
}
