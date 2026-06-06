const eurosFmt = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2
});
const eurosFmt0 = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0
});
const numFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

export function euros(n, { noCents = false } = {}) {
  if (n == null || isNaN(n)) return '—';
  return (noCents ? eurosFmt0 : eurosFmt).format(n);
}

export function signedEuros(n, opts) {
  if (n == null || isNaN(n)) return '—';
  return (n > 0 ? '+' : '') + euros(n, opts);
}

export function pct(n, { signed = false, digits = 2 } = {}) {
  if (n == null || isNaN(n)) return '—';
  const v = (n * 100).toFixed(digits).replace('.', ',');
  return `${signed && n > 0 ? '+' : ''}${v} %`;
}

export function num(n, digits = 2) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(n);
}

// Format compact pour axes de graphiques : 1 234 -> "1,2 k€", 1 000 000 -> "1 M€"
export function eurosCompact(n) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${num(n / 1e6, 1)} M€`;
  if (abs >= 1e3) return `${num(n / 1e3, abs >= 1e4 ? 0 : 1)} k€`;
  return `${num(n, 0)} €`;
}

export function horodatageRelatif(ts) {
  if (!ts) return null;
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return "à l'instant";
  if (sec < 3600) return `il y a ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `il y a ${Math.floor(sec / 3600)} h`;
  const d = new Date(ts);
  return `le ${d.getDate()}/${d.getMonth() + 1} à ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
