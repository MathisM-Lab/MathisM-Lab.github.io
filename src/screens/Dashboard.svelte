<script>
  import { app } from '../lib/store.svelte.js';
  import { euros, signedEuros, pct } from '../lib/format.js';
  import { moisToLabel } from '../lib/date.js';
  import { projeteAuMois, aUneProjection } from '../lib/projection.js';
  import { moisEstValide, enveloppesInvestiesAuMois } from '../lib/calc.js';
  import { ASSET_PALETTE } from '../lib/defaults.js';
  import { srriColor } from '../lib/srri.js';
  import DonutChart from '../components/DonutChart.svelte';
  import Gauge from '../components/Gauge.svelte';
  import Calendar from '../components/Calendar.svelte';
  import Icon from '../components/Icon.svelte';

  let vueRepart = $state('enveloppes'); // 'enveloppes' | 'actifs'

  let pat = $derived(app.patrimoine);
  let mc = $derived(app.moisCourant);
  let serie = $derived(app.projection);

  let valeur = $derived(pat.valeurActuelle);
  let aUnPlan = $derived(aUneProjection(serie));
  let projeteMaintenant = $derived(projeteAuMois(serie, mc));
  let ecart = $derived(valeur - projeteMaintenant);
  let ecartPct = $derived(projeteMaintenant > 0 ? ecart / projeteMaintenant : 0);

  let investiCeMois = $derived(
    app.transactions.filter((t) => (t.mois ?? null) === mc).reduce((s, t) => s + (t.montant ?? 0), 0)
  );

  let valide = $derived(moisEstValide(app.enveloppes, app.transactions, mc));
  let globalSRRI = $derived(app.srri.global);
  let manquantes = $derived(
    enveloppesInvestiesAuMois(app.enveloppes, app.transactions, mc).filter((x) => !x.investie).map((x) => x.enveloppe.nom)
  );

  // Camembert
  let segmentsEnv = $derived(
    pat.parEnveloppe
      .filter((e) => e.valeurActuelle > 0)
      .map((e) => ({ label: e.enveloppe.nom, value: e.valeurActuelle, color: e.enveloppe.couleur }))
  );
  let segmentsActifs = $derived.by(() => {
    const out = [];
    let idx = 0;
    for (const pe of pat.parEnveloppe) {
      const env = pe.enveloppe;
      if (!env.actifs?.length) {
        if (pe.valeurActuelle > 0) out.push({ label: env.nom, value: pe.valeurActuelle, color: ASSET_PALETTE[idx++ % ASSET_PALETTE.length] });
        continue;
      }
      for (const a of env.actifs) {
        const parts = app.transactions.filter((t) => t.enveloppe === env.id && t.actifId === a.id).reduce((s, t) => s + (t.parts ?? 0), 0);
        const prix = (a.ticker && app.prix.get(a.ticker)?.prix) || a.prixDefaut || 0;
        const v = parts * prix;
        if (v > 0) out.push({ label: a.nom, value: v, color: ASSET_PALETTE[idx % ASSET_PALETTE.length] });
        idx++;
      }
    }
    return out;
  });

  function statusOf(m) {
    if (m > mc) return 'futur';
    if (m === mc) return valide ? 'valide' : 'encours';
    return moisEstValide(app.enveloppes, app.transactions, m) ? 'valide' : 'manque';
  }

  function ouvrirMois() { app.currentScreen = 'portefeuille'; }
</script>

<div class="screen">
  <!-- Statut du mois -->
  <button class="status" class:ok={valide} onclick={ouvrirMois}>
    {#if valide}
      <span class="badge badge-pos"><Icon name="check-circle" size={15} /> Mois validé</span>
      <span class="status-sub">{moisToLabel(mc, app.params.dateDebut)} · tout est investi</span>
    {:else}
      <span class="badge badge-warn"><Icon name="bell" size={15} /> En attente</span>
      <span class="status-sub">{manquantes.length ? manquantes.join(' · ') : moisToLabel(mc, app.params.dateDebut)}</span>
    {/if}
    <Icon name="chevron-right" size={18} />
  </button>

  <!-- Patrimoine total -->
  <div class="card">
    <div class="eyebrow">Patrimoine total</div>
    <div class="display" style="margin:6px 0 10px">{euros(valeur, { noCents: true })}</div>
    <div class="cluster" style="gap:14px;flex-wrap:wrap">
      <span class="delta" class:pos={pat.plusValue >= 0} class:neg={pat.plusValue < 0}>
        <Icon name={pat.plusValue >= 0 ? 'arrow-up-right' : 'arrow-down-right'} size={15} />
        {signedEuros(pat.plusValue)} · {pct(pat.plusValuePct, { signed: true })}
      </span>
    </div>
    <div class="rows" style="margin-top:14px">
      <div class="row"><span class="k">Total versé <span class="text-3">(FC)</span></span><span class="v">{euros(pat.verseTotal)}</span></div>
      <div class="row"><span class="k">Total versé <span class="text-3">(HF)</span></span><span class="v">{euros(pat.verseTotalHF)}</span></div>
      <div class="row"><span class="k">Investi ce mois</span><span class="v">{euros(investiCeMois)}</span></div>
      {#if globalSRRI}
        <div class="row">
          <span class="k">Risque portefeuille</span>
          <span class="v">
            <span style="font-weight:650;color:{srriColor(globalSRRI.srri)}">SRRI {globalSRRI.srri}</span>
            · σ {pct(globalSRRI.vol, { digits: 1 })}
          </span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Projection vs Réalité (uniquement si un plan est défini) -->
  {#if aUnPlan}
    <div class="card">
      <div class="between" style="margin-bottom:12px">
        <div class="eyebrow">Projection vs réalité</div>
        <span class="delta" class:pos={ecart >= 0} class:neg={ecart < 0} style="font-size:13px">
          {signedEuros(ecart)} · {pct(ecartPct, { signed: true })}
        </span>
      </div>
      <Gauge value={valeur} max={Math.max(valeur, projeteMaintenant) * 1.15 || 1} marker={projeteMaintenant} />
      <div class="between" style="margin-top:8px;font-size:12px">
        <span class="text-3">Réalité {euros(valeur, { noCents: true })}</span>
        <span class="text-3">Plan {euros(projeteMaintenant, { noCents: true })}</span>
      </div>
    </div>
  {/if}

  <!-- Répartition -->
  <div class="card">
    <div class="between" style="margin-bottom:14px">
      <div class="eyebrow">Répartition</div>
      <div class="seg">
        <button class:on={vueRepart === 'enveloppes'} onclick={() => (vueRepart = 'enveloppes')}>Enveloppes</button>
        <button class:on={vueRepart === 'actifs'} onclick={() => (vueRepart = 'actifs')}>Actifs</button>
      </div>
    </div>
    {#if (vueRepart === 'enveloppes' ? segmentsEnv : segmentsActifs).length}
      <DonutChart segments={vueRepart === 'enveloppes' ? segmentsEnv : segmentsActifs} centerLabel="Total" />
    {:else}
      <p class="empty">Aucune position pour l'instant.</p>
    {/if}
  </div>

  <!-- Calendrier -->
  <div class="card">
    <div class="eyebrow" style="margin-bottom:12px">Calendrier d'investissement</div>
    <Calendar moisCourant={mc} {statusOf} count={12} dateDebut={app.params.dateDebut} />
  </div>
</div>

<style>
  .status {
    display: flex; align-items: center; gap: 12px;
    width: 100%; text-align: left;
    padding: 14px 16px;
    background: var(--surface); border: 1px solid var(--line);
    border-radius: var(--r-card);
  }
  .status :global(.chevron) { margin-left: auto; }
  .status-sub { flex: 1; color: var(--text-2); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status > :global(svg:last-child) { color: var(--text-3); flex-shrink: 0; }
</style>
