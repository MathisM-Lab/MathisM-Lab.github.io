<script>
  import { moisToLabelCourt } from '../lib/date.js';

  // statusOf(mois) -> 'valide' | 'manque' | 'encours' | 'futur'
  let { moisCourant = 0, statusOf, count = 12, dateDebut } = $props();

  let cells = $derived.by(() => {
    const start = Math.max(0, moisCourant - (count - 1));
    const end = Math.max(moisCourant, start + count - 1);
    const out = [];
    for (let m = start; m <= end; m++) {
      out.push({ mois: m, status: statusOf?.(m) ?? 'futur', label: moisToLabelCourt(m, dateDebut) });
    }
    return out;
  });
</script>

<div class="cal">
  {#each cells as c (c.mois)}
    <div class="cell {c.status}" title={c.label}>
      <span class="m">{c.label}</span>
    </div>
  {/each}
</div>

<style>
  .cal {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }
  .cell {
    aspect-ratio: 1.35;
    border-radius: 10px;
    border: 1px solid var(--line);
    background: var(--surface-2);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 600;
    color: var(--text-3);
    position: relative;
  }
  .cell .m { font-variant-numeric: tabular-nums; }

  .cell.valide { background: var(--pos-soft); border-color: rgba(22,199,132,0.3); color: var(--pos); }
  .cell.manque { background: var(--neg-soft); border-color: rgba(234,57,67,0.3); color: var(--neg); }
  .cell.encours { background: var(--warn-soft); border-color: rgba(240,169,43,0.35); color: var(--warn); }
  .cell.futur { opacity: 0.55; }
</style>
