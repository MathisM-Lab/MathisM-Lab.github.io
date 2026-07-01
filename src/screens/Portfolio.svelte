<script>
  import { onMount } from 'svelte';
  import { app } from '../lib/store.svelte.js';
  import { euros, signedEuros, pct, num, horodatageRelatif } from '../lib/format.js';
  import { moisToLabel } from '../lib/date.js';
  import { actifsAgreges, enveloppeAgregee, estLivret } from '../lib/calc.js';
  import { srriColor } from '../lib/srri.js';
  import { deleteTransaction, deleteEnveloppe } from '../lib/db.js';
  import TransactionForm from '../components/TransactionForm.svelte';
  import EnvelopeForm from '../components/EnvelopeForm.svelte';
  import Icon from '../components/Icon.svelte';
  import ConfirmRecopie from '../components/ConfirmRecopie.svelte';

  let selId = $state(null);
  let showForm = $state(false);
  let editing = $state(undefined); // undefined = fermé, null = nouvelle, objet = édition

  // Suppression d'enveloppe : confirmation par recopie d'un code (ConfirmRecopie).
  let suppEnv = $state(null); // enveloppe en cours de suppression, ou null

  $effect(() => {
    // Présélection demandée par un autre écran (ex. rééquilibrage), consommée une fois.
    if (app.portefeuilleEnv != null) {
      selId = app.portefeuilleEnv;
      app.portefeuilleEnv = null;
    } else if (selId == null && app.enveloppes.length) {
      selId = app.enveloppes[0].id;
    }
  });

  onMount(() => { app.rafraichirPrix(); app.rafraichirHebdo(); });

  let env = $derived(app.enveloppes.find((e) => e.id === selId));
  let livret = $derived(env ? estLivret(env) : false);
  let actifs = $derived(env && !livret ? actifsAgreges(env, app.transactions, app.prix) : []);
  let agg = $derived(env ? enveloppeAgregee(env, app.transactions, app.prix) : null);
  // Cache local : sans ça, chaque accès à `app.srri` recalcule toute la matrice
  // SRRI (plusieurs fois par rendu via les accès dans le markup).
  let srri = $derived(app.srri);
  let envSRRI = $derived(env ? srri.parEnveloppe.get(env.id) : null);

  let txEnv = $derived(
    app.transactions.filter((t) => t.enveloppe === selId).sort((a, b) => (b.mois ?? 0) - (a.mois ?? 0) || (b.id ?? 0) - (a.id ?? 0))
  );

  function majPrix(actif) {
    if (!actif.ticker) return null;
    return app.prix.get(actif.ticker);
  }

  async function supprimer(id) {
    if (!confirm('Supprimer cette transaction ?')) return;
    await deleteTransaction(id);
    await app.reload();
  }

  function demanderSuppression(e) {
    suppEnv = e;
  }

  async function confirmerSuppression() {
    if (!suppEnv) return;
    const id = suppEnv.id;
    await deleteEnveloppe(id);
    if (selId === id) selId = null;
    suppEnv = null;
    await app.reload();
  }
</script>

<div class="screen">
  <div class="screen-head">
    <h1>Portefeuille</h1>
  </div>

  <!-- Onglets enveloppes -->
  <div class="hscroll">
    {#each app.enveloppes as e}
      <button class="tab" class:on={e.id === selId} onclick={() => (selId = e.id)}>
        <span class="dot" style="background:{e.couleur}"></span>{e.nom}
      </button>
    {/each}
    <button class="tab tab-add" onclick={() => (editing = null)}>
      <Icon name="plus" size={15} /> Ajouter
    </button>
  </div>

  {#if env}
    <div class="env-actions">
      <button class="env-act" onclick={() => (editing = env)}><Icon name="pencil" size={15} /> Modifier l'enveloppe</button>
      <button class="env-act danger" onclick={() => demanderSuppression(env)}><Icon name="trash" size={15} /> Supprimer</button>
    </div>

    {#if suppEnv && suppEnv.id === env.id}
      <div class="card supp-card">
        <div class="eyebrow neg" style="margin-bottom:10px">Supprimer « {env.nom} »</div>
        <ConfirmRecopie
          message="Action irréversible : l'enveloppe et toutes ses transactions seront supprimées."
          confirmLabel="Tout supprimer"
          onConfirm={confirmerSuppression}
          onCancel={() => (suppEnv = null)} />
      </div>
    {/if}

    {#if livret}
      <div class="card">
        <div class="eyebrow">Solde {env.nom}</div>
        <div class="display" style="margin-top:6px">{euros(agg.valeurActuelle, { noCents: true })}</div>
      </div>
    {:else}
      {#each actifs as a (a.id)}
        {@const mp = majPrix(a)}
        {@const actifSRRI = srri.parActif.get(a.id)}
        <div class="card">
          <div class="between" style="align-items:flex-start">
            <div style="min-width:0">
              <h3>{a.nom}</h3>
              <div class="px text-3">
                {num(a.partsTotales)} parts × {euros(a.prix)}
                {#if a.ticker}
                  {#if mp?.ok === false}
                    <span class="neg">· non actualisé</span>
                  {:else if mp?.horodatage}
                    <span>· {horodatageRelatif(mp.horodatage)}</span>
                  {/if}
                {:else}
                  <span class="text-3">· prix manuel</span>
                {/if}
              </div>
              {#if actifSRRI}
                <div class="srri-badge" style="--srri-c:{srriColor(actifSRRI.srri)}">
                  SRRI {actifSRRI.srri} · σ {pct(actifSRRI.vol, { digits: 1 })}
                </div>
              {/if}
            </div>
            <div style="text-align:right">
              <div class="amount" style="font-size:19px;font-weight:650">{euros(a.valeur)}</div>
              <div class="delta" class:pos={a.plusValue >= 0} class:neg={a.plusValue < 0} style="font-size:12.5px;justify-content:flex-end">
                {signedEuros(a.plusValue)} · {pct(a.plusValuePct, { signed: true })}
              </div>
            </div>
          </div>

          <div class="repart">
            <div class="track">
              <div class="fill" style="width:{Math.min(100, a.repartActuelle * 100)}%"></div>
              <div class="cible" style="left:{a.ciblePct}%"></div>
            </div>
            <div class="between" style="font-size:11.5px;margin-top:6px">
              <span class="text-2">Actuel {pct(a.repartActuelle, { digits: 1 })}</span>
              <span class="text-3">Cible {a.ciblePct} %</span>
            </div>
          </div>
        </div>
      {/each}

      <!-- Synthèse -->
      <div class="card">
        <div class="eyebrow" style="margin-bottom:6px">Synthèse {env.nom}</div>
        <div class="rows">
          <div class="row"><span class="k">Total versé <span class="text-3">(FC)</span></span><span class="v">{euros(agg.verseTotal)}</span></div>
          <div class="row"><span class="k">Total versé <span class="text-3">(HF)</span></span><span class="v">{euros(agg.verseTotalHF)}</span></div>
          <div class="row"><span class="k">Valeur actuelle</span><span class="v">{euros(agg.valeurActuelle)}</span></div>
          <div class="row">
            <span class="k">Plus-value</span>
            <span class="v" class:pos={agg.plusValue >= 0} class:neg={agg.plusValue < 0}>
              {signedEuros(agg.plusValue)} · {pct(agg.plusValuePct, { signed: true })}
            </span>
          </div>
          {#if envSRRI}
            <div class="row">
              <span class="k">Risque enveloppe</span>
              <span class="v">
                <span class="srri-inline" style="color:{srriColor(envSRRI.srri)}">SRRI {envSRRI.srri}</span>
                · σ {pct(envSRRI.vol, { digits: 1 })}
              </span>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Journal -->
    <div class="card card-flush">
      <div class="jr-head"><div class="eyebrow">Transactions</div></div>
      {#if txEnv.length}
        <div class="jr-scroll" class:scrollable={txEnv.length > 4}>
          {#each txEnv as t (t.id)}
            <div class="jr">
              <div style="min-width:0">
                <div class="jr-actif">{env?.actifs?.find((a) => a.id === t.actifId)?.nom ?? t.actif}</div>
                <div class="jr-meta text-3">
                  {moisToLabel(t.mois ?? 0, app.params.dateDebut)}
                  {#if t.parts != null}· {num(t.parts)} parts{/if}
                </div>
              </div>
              <div class="amount jr-montant">{euros(t.montant)}</div>
              <button class="icon-btn jr-del" onclick={() => supprimer(t.id)} aria-label="Supprimer">
                <Icon name="trash" size={16} />
              </button>
            </div>
          {/each}
        </div>
      {:else}
        <p class="empty">Aucune transaction dans cette enveloppe.</p>
      {/if}
    </div>
  {/if}
</div>

<button class="fab" onclick={() => (showForm = true)} aria-label="Ajouter une transaction">
  <Icon name="plus" size={22} /> <span>Ajouter une transaction</span>
</button>

{#if showForm}
  <TransactionForm onClose={() => (showForm = false)} prefill={{ enveloppeId: selId }} />
{/if}

{#if editing !== undefined}
  <EnvelopeForm enveloppe={editing} onClose={() => (editing = undefined)} />
{/if}

<style>
  .tab {
    display: inline-flex; align-items: center; gap: 8px;
    flex-shrink: 0; padding: 9px 15px;
    border-radius: var(--r-pill);
    background: var(--surface); border: 1px solid var(--line);
    color: var(--text-2); font-weight: 600; font-size: 13.5px;
    transition: color 0.15s, border-color 0.15s;
  }
  .tab.on { color: var(--text); border-color: var(--line-strong); background: var(--surface-2); }
  .tab-add { color: var(--text-3); }

  .env-actions { display: flex; gap: 10px; }
  .env-act {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 13px; border-radius: var(--r-pill);
    background: var(--surface); border: 1px solid var(--line);
    color: var(--text-2); font-weight: 600; font-size: 13px;
  }
  .env-act.danger { color: var(--neg); }

  .supp-card { border-color: rgba(234, 57, 67, 0.25); }

  .px { font-size: 12px; margin-top: 3px; }

  .srri-badge {
    display: inline-block; margin-top: 6px;
    padding: 2px 8px; border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--srri-c) 15%, transparent);
    color: var(--srri-c);
    font-size: 11.5px; font-weight: 600;
  }
  .srri-inline { font-weight: 650; }

  .repart { margin-top: 14px; }
  .track { position: relative; height: 8px; background: var(--surface-2); border-radius: var(--r-pill); }
  .fill { height: 100%; border-radius: var(--r-pill); background: var(--accent); transition: width 0.4s; }
  .cible { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--text); border-radius: 1px; transform: translateX(-1px); }

  .jr-head { padding: 16px 18px 6px; }
  /* Affiche ~4 transactions, le reste accessible en faisant défiler ce bloc. */
  .jr-scroll.scrollable {
    max-height: 268px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--line-strong) transparent;
  }
  .jr-scroll.scrollable::-webkit-scrollbar { width: 6px; }
  .jr-scroll.scrollable::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 3px; }
  .jr-scroll.scrollable::-webkit-scrollbar-track { background: transparent; }
  .jr { display: flex; align-items: center; gap: 12px; padding: 12px 18px; }
  .jr + .jr { border-top: 1px solid var(--line); }
  .jr-actif { font-weight: 600; font-size: 14px; }
  .jr-meta { font-size: 12px; margin-top: 2px; }
  .jr-montant { margin-left: auto; font-weight: 600; }
  .jr-del { width: 32px; height: 32px; border: 0; background: transparent; color: var(--text-3); }

  .fab {
    position: fixed; right: 18px;
    bottom: calc(var(--nav-h) + var(--safe-b) + 18px);
    height: 52px; padding: 0 20px; border-radius: var(--r-pill);
    background: var(--accent); color: #fff;
    display: inline-flex; align-items: center; gap: 8px;
    font-weight: 600; font-size: 15px;
    box-shadow: var(--shadow-pop); z-index: 50;
    transition: transform 0.1s;
  }
  .fab:active { transform: scale(0.96); }
</style>
