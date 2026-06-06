<script>
  import { untrack } from 'svelte';
  import { saveEnveloppe } from '../lib/db.js';
  import { app } from '../lib/store.svelte.js';
  import { TYPES_ENVELOPPE, ENVELOPPE_PALETTE, aDesActifs } from '../lib/defaults.js';
  import Sheet from './Sheet.svelte';
  import Icon from './Icon.svelte';

  let { enveloppe = null, onClose } = $props();

  const vide = { nom: '', type: 'PEA', couleur: ENVELOPPE_PALETTE[0], rendementAnnuelPct: '', paliers: [], actifs: [] };
  // En édition, `enveloppe` est un proxy réactif Svelte -> $state.snapshot (structuredClone planterait).
  const source = untrack(() => enveloppe);
  let form = $state(source ? $state.snapshot(source) : structuredClone(vide));
  let err = $state('');
  let saving = $state(false);

  let gereActifs = $derived(aDesActifs(form.type));
  let totalCible = $derived(form.actifs.reduce((s, a) => s + Number(a.ciblePct || 0), 0));

  function ajouterActif() {
    form.actifs = [...form.actifs, { id: crypto.randomUUID(), nom: '', ticker: '', ciblePct: 0, prixDefaut: 0 }];
  }
  function retirerActif(i) {
    form.actifs = form.actifs.filter((_, idx) => idx !== i);
  }

  async function enregistrer() {
    err = '';
    if (!form.nom.trim()) return (err = 'Donne un nom à l\'enveloppe.');
    // Un seul PEA et un seul Livret A au maximum.
    if (form.type === 'PEA' || form.type === 'Livret A') {
      if (app.enveloppes.some((e) => e.type === form.type && e.id !== form.id)) {
        return (err = `Tu as déjà une enveloppe ${form.type}. Un seul ${form.type} est autorisé.`);
      }
    }
    if (gereActifs && form.actifs.length) {
      if (form.actifs.some((a) => !a.nom.trim())) return (err = 'Chaque actif doit avoir un nom.');
      if (Math.abs(totalCible - 100) > 0.01) return (err = `La somme des cibles doit être 100 % (actuellement ${totalCible} %).`);
    }
    // Empêche de supprimer un actif auquel des transactions sont rattachées.
    if (source && Array.isArray(source.actifs)) {
      const idsRestants = new Set(form.actifs.map((a) => a.id).filter(Boolean));
      const perdus = source.actifs
        .filter((a) => a.id && !idsRestants.has(a.id))
        .filter((a) => app.transactions.some((t) => t.enveloppe === source.id && t.actifId === a.id));
      if (perdus.length) {
        return (err = `Impossible de supprimer ${perdus.map((a) => a.nom).join(', ')} : des transactions y sont rattachées.`);
      }
    }
    if (!gereActifs) form.actifs = [];
    saving = true;
    try {
      await saveEnveloppe($state.snapshot(form));
      await app.reload();
      onClose?.();
    } catch (e) {
      err = e?.message ?? String(e);
    } finally {
      saving = false;
    }
  }
</script>

<Sheet title={enveloppe ? 'Modifier l\'enveloppe' : 'Nouvelle enveloppe'} {onClose}>
  <div class="field">
    <label class="label" for="ef-nom">Nom</label>
    <input class="input" id="ef-nom" bind:value={form.nom} placeholder="Ex. PEA, CTO, Livret A…" />
  </div>

  <div class="field">
    <label class="label" for="ef-type">Type</label>
    <select class="input" id="ef-type" bind:value={form.type}>
      {#each TYPES_ENVELOPPE as t}<option value={t}>{t}</option>{/each}
    </select>
  </div>

  <div class="field">
    <span class="label">Couleur</span>
    <div class="swatches">
      {#each ENVELOPPE_PALETTE as c}
        <button class="sw" class:on={form.couleur === c} style="background:{c}"
                onclick={() => (form.couleur = c)} aria-label="Couleur"></button>
      {/each}
    </div>
  </div>

  <div class="field">
    <label class="label" for="ef-rdt">Rendement annuel projeté (%)</label>
    <input class="input" id="ef-rdt" type="number" step="0.1" bind:value={form.rendementAnnuelPct}
           placeholder={gereActifs ? 'Ex. 7' : 'Ex. 2,4'} />
    <p class="text-3" style="font-size:12px;margin:6px 0 0">Sert uniquement à la courbe « Plan ». Laisse vide pour la valeur par défaut du type.</p>
  </div>

  {#if gereActifs}
    <div class="between" style="margin:6px 0 10px">
      <span class="label" style="margin:0">Actifs · cible {totalCible} %</span>
      <button class="btn btn-secondary" style="height:36px;padding:0 12px" onclick={ajouterActif}>
        <Icon name="plus" size={16} /> Actif
      </button>
    </div>
    {#each form.actifs as a, i (a.id)}
      <div class="actif">
        <div class="actif-top">
          <input class="input" style="flex:1" bind:value={form.actifs[i].nom} placeholder="Nom (ex. S&P 500)" />
          <button class="icon-btn" style="border:0;background:transparent;color:var(--text-3)" onclick={() => retirerActif(i)} aria-label="Retirer">
            <Icon name="trash" size={16} />
          </button>
        </div>
        <div class="actif-row">
          <input class="input" bind:value={form.actifs[i].ticker} placeholder="Ticker (ex. CW8.PA)" />
          <div class="cible-wrap">
            <input class="input" type="number" min="0" max="100" bind:value={form.actifs[i].ciblePct} />
            <span class="text-3">%</span>
          </div>
        </div>
      </div>
    {/each}
    {#if form.actifs.length === 0}
      <p class="empty" style="padding:12px">Ajoute les actifs de cette enveloppe.</p>
    {/if}
  {/if}

  {#if err}<p class="neg" style="margin:10px 0 0">{err}</p>{/if}

  <button class="btn btn-primary btn-block btn-lg" style="margin-top:18px" onclick={enregistrer} disabled={saving}>
    {saving ? 'Enregistrement…' : 'Enregistrer'}
  </button>
</Sheet>

<style>
  .swatches { display: flex; gap: 10px; flex-wrap: wrap; }
  .sw { width: 34px; height: 34px; border-radius: 50%; border: 2px solid transparent; transition: transform 0.1s; }
  .sw.on { border-color: var(--text); transform: scale(1.1); }

  .actif { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--r-md); padding: 12px; margin-bottom: 10px; }
  .actif-top { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
  .actif-row { display: flex; gap: 8px; }
  .actif-row .input:first-child { flex: 1; }
  .cible-wrap { display: flex; align-items: center; gap: 6px; }
  .cible-wrap .input { width: 76px; text-align: right; }
</style>
