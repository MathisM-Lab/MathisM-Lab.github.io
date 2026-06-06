<script>
  import { app } from '../lib/store.svelte.js';
  import { setParam, wipeAll } from '../lib/db.js';
  import { moisToLabel, dateDebutToMonthInput, monthInputToDateDebut } from '../lib/date.js';
  import { demanderPermission, notificationsSupportees } from '../lib/notifications.js';
  import Toggle from '../components/Toggle.svelte';
  import Icon from '../components/Icon.svelte';

  let permState = $state(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');

  async function maj(cle, valeur) { await setParam(cle, valeur); await app.reload(); }

  // Date de début du suivi : verrouillée dès qu'il existe des transactions, car
  // les mois sont stockés en décalage par rapport à cette date.
  let dateVerrouillee = $derived(app.transactions.length > 0);
  async function majDateDebut(value) {
    if (dateVerrouillee) return;
    if (value) await maj('dateDebut', monthInputToDateDebut(value));
  }

  async function activerRappels(on) {
    if (on) {
      const p = await demanderPermission();
      permState = p;
    }
    await maj('rappelActif', on);
  }

  function exporterCSV() {
    const nomEnv = (id) => app.enveloppes.find((e) => e.id === id)?.nom ?? '';
    const lignes = [['Mois', 'Actif', 'Enveloppe', 'Parts', 'Montant']];
    for (const t of [...app.transactions].sort((a, b) => (a.mois ?? 0) - (b.mois ?? 0))) {
      lignes.push([t.mois ?? '', t.actif ?? '', nomEnv(t.enveloppe), t.parts ?? '', (t.montant ?? '').toString().replace('.', ',')]);
    }
    const csv = lignes.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'monportefeuille-transactions.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Reset sécurisé : il faut recopier exactement une chaîne fixe de 10 caractères
  // mêlant minuscules et majuscules (comparaison sensible à la casse).
  const MOT_RESET = 'aXkQpZmRvT';
  let resetOuvert = $state(false);
  let resetTexte = $state('');
  let resetOk = $derived(resetTexte === MOT_RESET);

  async function reset() {
    if (!resetOk) return;
    await wipeAll();
    location.reload();
  }
</script>

<div class="screen">
  <div class="screen-head"><h1>Réglages</h1></div>

  <!-- Profil -->
  <section class="card">
    <div class="eyebrow" style="margin-bottom:12px">Profil</div>
    <div class="rows">
      <div class="row">
        <span class="k">Prénom</span>
        <input class="input mini wide" type="text" value={app.params.nomUtilisateur ?? ''}
               placeholder="Ton prénom" onchange={(e) => maj('nomUtilisateur', e.currentTarget.value.trim())} />
      </div>
      <div class="row">
        <span class="k">Date de naissance</span>
        <input class="input mini wide" type="date" value={app.params.dateNaissance ?? ''}
               onchange={(e) => maj('dateNaissance', e.currentTarget.value || null)} />
      </div>
      <div class="row">
        <span class="k">Début du suivi</span>
        <input class="input mini wide" type="month" value={dateDebutToMonthInput(app.params.dateDebut)}
               disabled={dateVerrouillee} onchange={(e) => majDateDebut(e.currentTarget.value)} />
      </div>
      {#if dateVerrouillee}
        <p class="text-3" style="font-size:12px;margin:2px 0 0">Verrouillé : des transactions sont enregistrées sur cette base de mois.</p>
      {/if}
      <div class="row"><span class="k">Mois en cours</span><span class="v">{moisToLabel(app.moisCourant, app.params.dateDebut)} (n°{app.moisCourant + 1})</span></div>
    </div>
  </section>

  <!-- Rappels -->
  <section class="card">
    <div class="eyebrow" style="margin-bottom:12px">Rappels mensuels</div>
    <div class="row" style="border:0;padding-top:0">
      <span class="k">Activer les rappels</span>
      <Toggle checked={app.params.rappelActif ?? false} onchange={activerRappels} />
    </div>
    {#if app.params.rappelActif}
      <div class="rows">
        <div class="row">
          <span class="k">Jour du mois</span>
          <div class="cluster">
            <span class="text-3">le</span>
            <input class="input mini" type="number" min="1" max="28" value={app.params.rappelJour ?? 1}
                   onchange={(e) => maj('rappelJour', Math.min(28, Math.max(1, Number(e.currentTarget.value) || 1)))} />
          </div>
        </div>
        <div class="row">
          <span class="k">Heure du rappel</span>
          <input class="input mini" type="time" value={app.params.rappelHeure ?? '09:00'}
                 onchange={(e) => maj('rappelHeure', e.currentTarget.value)} />
        </div>
        <div class="row">
          <span class="k">Relance toutes les</span>
          <div class="seg">
            {#each [1, 2, 4] as h}
              <button class:on={(app.params.rappelIntervalHeures ?? 2) === h} onclick={() => maj('rappelIntervalHeures', h)}>{h} h</button>
            {/each}
          </div>
        </div>
      </div>
      {#if notificationsSupportees() && permState !== 'granted'}
        <p class="warn-note">
          <Icon name="alert-triangle" size={14} />
          {permState === 'denied' ? 'Notifications bloquées par le navigateur — autorise-les dans les réglages du site.' : 'Autorisation des notifications requise.'}
          {#if permState !== 'denied'}
            <button class="link" onclick={async () => (permState = await demanderPermission())}>Autoriser</button>
          {/if}
        </p>
      {/if}
    {/if}
  </section>

  <!-- Export -->
  <section class="card">
    <div class="eyebrow" style="margin-bottom:12px">Données</div>
    <button class="btn btn-secondary btn-block" onclick={exporterCSV} disabled={app.transactions.length === 0}>
      <Icon name="download" size={17} /> Exporter mes transactions (CSV)
    </button>
  </section>

  <!-- Zone danger -->
  <section class="card" style="border-color:rgba(234,57,67,0.25)">
    <div class="eyebrow neg" style="margin-bottom:12px">Zone dangereuse</div>
    {#if !resetOuvert}
      <button class="btn btn-danger btn-block" onclick={() => { resetOuvert = true; resetTexte = ''; }}>
        Réinitialiser toutes les données
      </button>
    {:else}
      <p class="text-2" style="font-size:13.5px;margin:0 0 10px">
        Action irréversible. Pour confirmer, recopie exactement <strong style="color:var(--text)">{MOT_RESET}</strong> ci-dessous (respecte les majuscules).
      </p>
      <input class="input" type="text" bind:value={resetTexte} placeholder={MOT_RESET} autocomplete="off"
             autocapitalize="off" autocorrect="off" spellcheck="false" />
      <div class="cluster" style="margin-top:12px;gap:10px">
        <button class="btn btn-secondary grow" onclick={() => { resetOuvert = false; resetTexte = ''; }}>Annuler</button>
        <button class="btn btn-danger grow" onclick={reset} disabled={!resetOk}>Tout effacer</button>
      </div>
    {/if}
  </section>
</div>

<style>
  .mini { width: 92px; height: 40px; text-align: right; padding: 0 10px; }
  .mini.wide { width: 150px; text-align: left; }
  .warn-note {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    color: var(--warn); font-size: 12.5px; margin: 12px 0 0;
  }
  .link { color: var(--accent); font-weight: 600; text-decoration: underline; }
  section { scroll-margin-top: 20px; }
</style>
