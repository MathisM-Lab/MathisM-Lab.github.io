<script>
  import { onMount } from 'svelte';
  import { app } from '../lib/store.svelte.js';
  import { euros, num, horodatageRelatif } from '../lib/format.js';
  import { actifsAgreges, rebalance } from '../lib/calc.js';
  import { setParam, addTransaction } from '../lib/db.js';
  import Icon from '../components/Icon.svelte';

  let investables = $derived(app.enveloppes.filter((e) => e.actifs?.length > 0));
  let envId = $state(null);
  $effect(() => { if (envId == null && investables.length) envId = investables[0].id; });
  let env = $derived(app.enveloppes.find((e) => e.id === envId));

  let montant = $state('');
  let resultat = $state(null);
  let enregistrement = $state(false);

  onMount(() => { app.rafraichirPrix(); });

  let positions = $derived(env ? actifsAgreges(env, app.transactions, app.prix) : []);

  // Paramètres de calcul (utilisés uniquement ici)
  async function maj(cle, valeur) { await setParam(cle, valeur); await app.reload(); }
  let fraisPct = $derived((app.params.fraisCourtage ?? 0.005) * 100);
  async function majFrais(v) { const n = Number(String(v).replace(',', '.')); if (Number.isFinite(n)) await maj('fraisCourtage', n / 100); }
  async function majOrdreMin(v) { const n = Number(String(v).replace(',', '.')); if (Number.isFinite(n)) await maj('ordreMinimum', n); }

  function calculer() {
    const m = Number(montant);
    if (!Number.isFinite(m) || m <= 0 || !env) { resultat = null; return; }
    const actifs = positions.map((a) => ({
      id: a.id,
      nom: a.nom,
      prix: a.prix,
      cible: (a.ciblePct ?? 0) / 100,
      valeurActuelle: a.partsTotales * a.prix
    }));
    resultat = rebalance({
      montantDisponible: m,
      fraisCourtage: app.params.fraisCourtage ?? 0.005,
      ordreMinimum: app.params.ordreMinimum ?? 200,
      actifs
    });
  }

  // Enregistre les achats calculés (parts > 0) comme transactions sur l'enveloppe
  // courante, puis bascule sur le Portefeuille. Les montants reprennent exactement
  // ceux affichés : hors frais = parts × prix, frais = coût affiché − hors frais.
  async function implementer() {
    if (!resultat || !env || enregistrement) return;
    const lignes = resultat.lignes.filter((l) => l.parts > 0);
    if (lignes.length === 0) return;
    enregistrement = true;
    try {
      const mois = app.moisCourant;
      for (const l of lignes) {
        const montantHorsFrais = l.parts * l.prix;
        await addTransaction({
          mois,
          actif: l.nom,
          actifId: l.id,
          enveloppe: env.id,
          parts: l.parts,
          montant: l.cout,
          montantHorsFrais,
          frais: l.cout - montantHorsFrais
        });
      }
      await app.reload();
      app.portefeuilleEnv = env.id;
      app.currentScreen = 'portefeuille';
    } finally {
      enregistrement = false;
    }
  }

</script>

<div class="screen">
  <div class="screen-head"><h1>Rééquilibrage{env ? ` ${env.nom}` : ''}</h1></div>

  {#if investables.length === 0}
    <div class="card"><p class="empty">Aucune enveloppe avec des actifs et cibles. Configure un PEA ou un CTO dans Réglages.</p></div>
  {:else}
    {#if investables.length > 1}
      <div class="seg" style="align-self:flex-start">
        {#each investables as e}
          <button class:on={e.id === envId} onclick={() => { envId = e.id; resultat = null; }}>{e.nom}</button>
        {/each}
      </div>
    {/if}

    <!-- Montant -->
    <div class="card">
      <div class="eyebrow" style="margin-bottom:10px">Montant à investir</div>
      <input class="input input-amount" type="number" inputmode="decimal" min="0" step="0.01"
             bind:value={montant} placeholder="0 €" />
    </div>

    <!-- Prix des parts (automatique) -->
    <div class="card card-flush">
      <div class="between" style="padding:16px 18px 6px">
        <div class="eyebrow">Prix des parts (auto)</div>
        <button class="icon-btn" style="border:0;background:transparent;width:auto;height:auto;color:var(--accent);font-weight:600;font-size:13px;gap:6px"
                onclick={() => app.rafraichirPrix()}>
          <Icon name="refresh" size={15} /> {app.refreshingPrices ? '…' : 'Actualiser'}
        </button>
      </div>
      {#each positions as a (a.id)}
        {@const mp = a.ticker ? app.prix.get(a.ticker) : null}
        <div class="prow">
          <div style="min-width:0">
            <div class="prow-nom">{a.nom}</div>
            <div class="prow-meta text-3">
              {#if !a.ticker}sans ticker · prix par défaut
              {:else if mp?.ok === false}cours indisponible · prix par défaut
              {:else if mp?.horodatage}{horodatageRelatif(mp.horodatage)}
              {:else}—{/if}
            </div>
          </div>
          <div class="prow-prix">{euros(a.prix)}</div>
        </div>
      {/each}
    </div>

    <!-- Paramètres de calcul -->
    <div class="card">
      <div class="eyebrow" style="margin-bottom:12px">Paramètres de calcul</div>
      <div class="rows">
        <div class="row">
          <span class="k">Frais de courtage</span>
          <div class="cluster"><input class="input mini" type="number" step="0.01" value={fraisPct.toFixed(2)}
            onchange={(e) => majFrais(e.currentTarget.value)} /><span class="text-3">%</span></div>
        </div>
        <div class="row">
          <span class="k">Ordre minimum</span>
          <div class="cluster"><input class="input mini" type="number" step="10" value={app.params.ordreMinimum ?? 200}
            onchange={(e) => majOrdreMin(e.currentTarget.value)} /><span class="text-3">€</span></div>
        </div>
      </div>
    </div>

    <button class="btn btn-primary btn-block btn-lg" onclick={calculer}>Calculer</button>

    <!-- Résultats -->
    {#if resultat}
      <div class="stack">
        {#each resultat.lignes as l (l.id)}
          <div class="card res" class:zero={l.parts === 0}>
            <div class="between">
              <div>
                <div class="res-nom">{l.nom}</div>
                <div class="text-3" style="font-size:12px;margin-top:2px">Cible {Math.round(l.cible * 100)} % · {euros(l.prix)}/part</div>
              </div>
              <div style="text-align:right">
                <div class="res-parts">{l.parts > 0 ? `${num(l.parts)} parts` : '—'}</div>
                <div class="amount text-2" style="font-size:13px">{euros(l.cout)}</div>
              </div>
            </div>
          </div>
        {/each}

        <div class="card">
          <div class="rows">
            <div class="row"><span class="k">Total dépensé</span><span class="v">{euros(resultat.totalDepense)}</span></div>
            <div class="row"><span class="k">Reste en espèces</span><span class="v">{euros(resultat.resteEspeces)}</span></div>
          </div>
        </div>

        {#if resultat.lignes.some((l) => l.parts > 0)}
          <button class="btn btn-primary btn-block btn-lg" onclick={implementer} disabled={enregistrement}>
            {enregistrement ? 'Enregistrement…' : 'Enregistrer ces transactions'}
          </button>
        {/if}

      </div>
    {/if}
  {/if}
</div>

<style>
  .prow { display: flex; align-items: center; gap: 12px; padding: 12px 18px; }
  .prow + .prow { border-top: 1px solid var(--line); }
  .prow-nom { font-weight: 600; font-size: 14px; }
  .prow-meta { font-size: 11.5px; margin-top: 2px; }
  .prow-prix { margin-left: auto; padding-left: 12px; font-weight: 650; font-size: 15px; font-variant-numeric: tabular-nums; }
  .mini { width: 92px; height: 40px; text-align: right; padding: 0 10px; }

  .res-nom { font-weight: 600; font-size: 15px; }
  .res-parts { font-weight: 650; font-size: 16px; font-variant-numeric: tabular-nums; }
  .res.zero { opacity: 0.55; }
</style>
