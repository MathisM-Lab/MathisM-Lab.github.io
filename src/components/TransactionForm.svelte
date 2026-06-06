<script>
  import { untrack } from 'svelte';
  import { addTransaction } from '../lib/db.js';
  import { app } from '../lib/store.svelte.js';
  import { estLivret } from '../lib/calc.js';
  import { moisToMonthInput, monthInputToMois } from '../lib/date.js';
  import Sheet from './Sheet.svelte';

  let { onClose, prefill = null, onSaved } = $props();

  let mois = $state(untrack(() => prefill?.mois ?? app.moisCourant));
  let enveloppeId = $state(untrack(() => prefill?.enveloppeId ?? app.enveloppes[0]?.id ?? null));
  let actifId = $state(untrack(() => prefill?.actifId ?? null));
  let parts = $state(untrack(() => prefill?.parts ?? ''));
  let montant = $state(untrack(() => prefill?.montant ?? ''));
  let sens = $state('achat'); // 'achat' (versement) | 'vente' (retrait)
  let saving = $state(false);
  let err = $state('');

  let enveloppe = $derived(app.enveloppes.find((e) => e.id === enveloppeId));
  let actifs = $derived(enveloppe?.actifs ?? []);
  let livret = $derived(enveloppe ? estLivret(enveloppe) : false);

  $effect(() => {
    if (!livret && actifs.length && !actifs.some((a) => a.id === actifId)) actifId = actifs[0].id;
  });

  async function submit(e) {
    e.preventDefault();
    err = '';
    if (enveloppeId == null) return (err = 'Choisis une enveloppe.');
    const m = Number(montant);
    if (!Number.isFinite(m) || m <= 0) return (err = 'Montant invalide.');
    const p = livret ? null : Number(parts);
    if (!livret && (!Number.isFinite(p) || p <= 0)) return (err = 'Nombre de parts invalide.');
    const signe = sens === 'vente' ? -1 : 1;
    const actif = livret ? (enveloppe?.nom ?? '') : (actifs.find((a) => a.id === actifId)?.nom ?? '');
    saving = true;
    try {
      await addTransaction({
        mois: Number(mois),
        actif,
        actifId: livret ? null : actifId,
        enveloppe: enveloppeId,
        parts: p == null ? null : signe * p,
        montant: signe * m
      });
      await app.reload();
      onSaved?.();
      onClose?.();
    } catch (e2) {
      err = e2?.message ?? String(e2);
    } finally {
      saving = false;
    }
  }
</script>

<Sheet title="Nouvelle transaction" {onClose}>
  <form onsubmit={submit}>
    <div class="field">
      <span class="label">Sens</span>
      <div class="seg">
        <button type="button" class:on={sens === 'achat'} onclick={() => (sens = 'achat')}>{livret ? 'Dépôt' : 'Achat'}</button>
        <button type="button" class:on={sens === 'vente'} onclick={() => (sens = 'vente')}>{livret ? 'Retrait' : 'Vente'}</button>
      </div>
    </div>

    <div class="field">
      <label class="label" for="tf-mois">Mois</label>
      <input class="input" id="tf-mois" type="month"
             value={moisToMonthInput(Number(mois) || 0, app.params.dateDebut)}
             onchange={(e) => (mois = monthInputToMois(e.currentTarget.value, app.params.dateDebut))} />
    </div>

    <div class="field">
      <label class="label" for="tf-env">Enveloppe</label>
      <select class="input" id="tf-env" bind:value={enveloppeId}>
        {#each app.enveloppes as e}<option value={e.id}>{e.nom}</option>{/each}
      </select>
    </div>

    {#if !livret}
      <div class="field">
        <label class="label" for="tf-actif">Actif</label>
        <select class="input" id="tf-actif" bind:value={actifId}>
          {#each actifs as a}<option value={a.id}>{a.nom}</option>{/each}
        </select>
      </div>
      <div class="field">
        <label class="label" for="tf-parts">Nombre de parts {sens === 'vente' ? 'vendues' : ''}</label>
        <input class="input" id="tf-parts" type="number" min="0" step="0.0001" bind:value={parts} placeholder="Ex. 12" />
      </div>
    {/if}

    <div class="field">
      <label class="label" for="tf-montant">{sens === 'vente' ? 'Montant total reçu (€)' : 'Montant total payé (€)'}</label>
      <input class="input" id="tf-montant" type="number" min="0" step="0.01" bind:value={montant} placeholder="Ex. 386,74" />
    </div>

    {#if err}<p class="neg" style="margin:0 0 12px">{err}</p>{/if}

    <button type="submit" class="btn btn-primary btn-block btn-lg" disabled={saving}>
      {saving ? 'Enregistrement…' : 'Valider'}
    </button>
  </form>
</Sheet>
