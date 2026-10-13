<script>
  import { onMount } from 'svelte';
  import { app } from '../lib/store.svelte.js';
  import { euros, num, pct, horodatageRelatif } from '../lib/format.js';
  import { actifsAgreges, rebalanceGlobal, fraisCourtageLigne, minAchatEnveloppe } from '../lib/calc.js';
  import { addTransaction } from '../lib/db.js';
  import Icon from '../components/Icon.svelte';

  onMount(() => { app.rafraichirPrix(); });

  // Toutes les enveloppes à actifs, tous types confondus (PEA, CTO, Assurance-vie,
  // Crypto…) participent au même calcul global — plus de sous-page par enveloppe.
  let enveloppesInvest = $derived(app.enveloppes.filter((e) => e.actifs?.length > 0));

  let sommePoids = $derived(enveloppesInvest.reduce((s, e) => s + (Number(e.poidsCible) || 0), 0));
  let poidsOk = $derived(Math.abs(sommePoids - 100) <= 0.5);

  // Liste à plat de toutes les lignes (actif + enveloppe propriétaire), avec la
  // cible globale (poids de l'enveloppe × cible de l'actif dans l'enveloppe) et
  // les frais/minimum propres à CETTE enveloppe (barème réel, cf. calc.js).
  let lignesBrutes = $derived.by(() => {
    const out = [];
    for (const env of enveloppesInvest) {
      const poidsEnv = (Number(env.poidsCible) || 0) / 100;
      const minAchat = minAchatEnveloppe(env);
      for (const a of actifsAgreges(env, app.transactions, app.prix)) {
        out.push({
          id: a.id,
          enveloppeId: env.id,
          enveloppeNom: env.nom,
          enveloppeCouleur: env.couleur,
          nom: a.nom,
          ticker: a.ticker,
          prix: a.prix,
          valeurActuelle: a.valeur,
          ciblePctEnv: a.ciblePct ?? 0,
          cibleGlobale: poidsEnv * ((a.ciblePct ?? 0) / 100),
          minAchat,
          frais: (montant) => fraisCourtageLigne(env, a, montant)
        });
      }
    }
    return out;
  });
  let ligneParId = $derived(new Map(lignesBrutes.map((l) => [l.id, l])));

  let montant = $state('');
  let resultat = $state(null);
  let enregistrement = $state(false);

  function calculer() {
    const m = Number(montant);
    if (!Number.isFinite(m) || m <= 0 || lignesBrutes.length === 0) { resultat = null; return; }
    resultat = rebalanceGlobal({ montantDisponible: m, lignes: lignesBrutes });
  }

  // Enregistre les achats calculés (parts > 0) comme transactions, sur l'enveloppe
  // propriétaire de chaque ligne (potentiellement plusieurs enveloppes à la fois),
  // puis bascule sur le Portefeuille. Montants repris tels qu'affichés : hors
  // frais = parts × prix, frais = coût affiché − hors frais.
  async function implementer() {
    if (!resultat || enregistrement) return;
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
          enveloppe: l.enveloppeId,
          parts: l.parts,
          montant: l.cout,
          montantHorsFrais,
          frais: l.cout - montantHorsFrais
        });
      }
      await app.reload();
      app.currentScreen = 'portefeuille';
    } finally {
      enregistrement = false;
    }
  }
</script>

<div class="screen">
  <div class="screen-head"><h1>Rééquilibrage</h1></div>

  {#if enveloppesInvest.length === 0}
    <div class="card"><p class="empty">Aucune enveloppe avec des actifs et cibles. Configure un PEA ou un CTO dans Réglages.</p></div>
  {:else}
    {#if sommePoids === 0}
      <div class="card"><p class="empty">Règle d'abord le « Poids cible dans le patrimoine total » de chaque enveloppe dans Réglages (ex. PEA 50 %, CTO 30 %, Assurance-vie 20 %) pour activer le calcul.</p></div>
    {:else if !poidsOk}
      <p class="text-3" style="font-size:12.5px">Poids cibles entre enveloppes : {sommePoids} % (vise 100 % — réglable dans Réglages).</p>
    {/if}

    <!-- Montant -->
    <div class="card">
      <div class="eyebrow" style="margin-bottom:10px">Montant à investir</div>
      <input class="input input-amount" type="number" inputmode="decimal" min="0" step="0.01"
             bind:value={montant} placeholder="0 €" />
    </div>

    <!-- Prix des parts (automatique), groupés par enveloppe -->
    <div class="card card-flush">
      <div class="between" style="padding:16px 18px 6px">
        <div>
          <div class="eyebrow">Prix des parts (auto, HF)</div>
          {#if app.derniereMajPrix}
            <div class="text-3" style="font-size:11px;margin-top:2px">Mis à jour {horodatageRelatif(app.derniereMajPrix)}</div>
          {/if}
        </div>
        <button class="icon-btn" style="border:0;background:transparent;width:auto;height:auto;color:var(--accent);font-weight:600;font-size:13px;gap:6px"
                onclick={() => app.rafraichirPrix({ force: true })}>
          <Icon name="refresh" size={15} /> {app.refreshingPrices ? '…' : 'Actualiser'}
        </button>
      </div>
      {#each enveloppesInvest as env (env.id)}
        <div class="env-label" style="--c:{env.couleur}">{env.nom} · {Number(env.poidsCible) || 0} %</div>
        {#each lignesBrutes.filter((l) => l.enveloppeId === env.id) as a (a.id)}
          {@const mp = a.ticker ? app.prix.get(a.ticker) : null}
          <div class="prow">
            <div style="min-width:0">
              <div class="prow-nom">{a.nom} · {a.ciblePctEnv} %</div>
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
      {/each}
    </div>

    <button class="btn btn-primary btn-block btn-lg" onclick={calculer}>Calculer</button>

    <!-- Résultats -->
    {#if resultat}
      <div class="stack">
        {#each resultat.lignes as l (l.id)}
          {@const brute = ligneParId.get(l.id)}
          <div class="card res" class:zero={l.parts === 0}>
            <div class="between">
              <div>
                <div class="res-env" style="--c:{brute?.enveloppeCouleur}">{brute?.enveloppeNom}</div>
                <div class="res-nom">{l.nom}</div>
                <div class="text-3" style="font-size:12px;margin-top:2px">Cible {pct(l.cibleGlobale, { digits: 1 })} du total · {euros(l.prix)}/part (HF)</div>
              </div>
              <div style="text-align:right">
                <div class="res-parts">{l.parts > 0 ? `${num(l.parts)} parts` : '—'}</div>
                <div class="amount text-2" style="font-size:13px">{euros(l.cout)} <span class="text-3" style="font-size:11px;font-weight:400">(FC)</span></div>
              </div>
            </div>
          </div>
        {/each}

        <div class="card">
          <div class="rows">
            <div class="row"><span class="k">Total dépensé (FC)</span><span class="v">{euros(resultat.totalDepense)}</span></div>
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
  .env-label { padding: 10px 18px 2px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--c, var(--text-3)); }
  .prow { display: flex; align-items: center; gap: 12px; padding: 10px 18px; }
  .prow + .prow { border-top: 1px solid var(--line); }
  .prow-nom { font-weight: 600; font-size: 14px; }
  .prow-meta { font-size: 11.5px; margin-top: 2px; }
  .prow-prix { margin-left: auto; padding-left: 12px; font-weight: 650; font-size: 15px; font-variant-numeric: tabular-nums; }

  .res-env { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--c, var(--text-3)); margin-bottom: 2px; }
  .res-nom { font-weight: 600; font-size: 15px; }
  .res-parts { font-weight: 650; font-size: 16px; font-variant-numeric: tabular-nums; }
  .res.zero { opacity: 0.55; }
</style>
