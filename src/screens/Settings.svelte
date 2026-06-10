<script>
  import { onMount } from 'svelte';
  import { app } from '../lib/store.svelte.js';
  import { activerPush, pushSupporte, abonnementActuel } from '../lib/push.js';
  import { setParam, wipeAll, exportProfil, importProfil } from '../lib/db.js';
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

  // --- Notifications push (app fermée) ---
  let pushJson = $state('');
  let pushMsg = $state('');
  let pushAbonne = $state(false);
  onMount(async () => { if (pushSupporte()) pushAbonne = !!(await abonnementActuel()); });
  async function activerNotifsPush() {
    pushMsg = ''; pushJson = '';
    try {
      pushJson = await activerPush();
      pushAbonne = true;
      pushMsg = 'Abonnement créé. Copie le texte ci-dessous dans le secret GitHub PUSH_SUBSCRIPTION.';
    } catch (e) {
      pushMsg = e?.message ?? String(e);
    }
  }
  async function copierPush() {
    try { await navigator.clipboard.writeText(pushJson); pushMsg = 'Copié.'; }
    catch { pushMsg = 'Copie auto impossible — sélectionne le texte et copie-le à la main.'; }
  }

  let fileInput;
  let importMsg = $state('');
  let importErr = $state('');

  async function exporterProfil() {
    const payload = await exportProfil();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `monportefeuille-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function fichierChoisi(e) {
    importMsg = ''; importErr = '';
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = ''; // autorise à re-choisir le même fichier
    if (!file) return;
    // Restaurer remplace les données actuelles : on confirme si le profil n'est pas vide.
    const nonVide = app.transactions.length > 0 || app.enveloppes.length > 0;
    if (nonVide && !confirm('Importer remplacera tes données actuelles. Continuer ?')) return;
    try {
      const payload = JSON.parse(await file.text());
      await importProfil(payload);
      await app.reload();
      importMsg = 'Profil importé : tes données ont été restaurées.';
    } catch (err) {
      importErr = err?.message ?? String(err);
    }
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

  <!-- Rappel mensuel -->
  <section class="card">
    <div class="row" style="border:0;padding:0">
      <span class="k">Rappel mensuel</span>
      <Toggle checked={app.params.rappelActif ?? false} onchange={activerRappels} />
    </div>
    {#if app.params.rappelActif}
      <div class="rows">
        <div class="row">
          <span class="k">Jour</span>
          <div class="cluster">
            <span class="text-3">le</span>
            <input class="input mini" type="number" min="1" max="28" value={app.params.rappelJour ?? 1}
                   onchange={(e) => maj('rappelJour', Math.min(28, Math.max(1, Number(e.currentTarget.value) || 1)))} />
          </div>
        </div>
        <div class="row">
          <span class="k">Heure</span>
          <input class="input mini" type="time" value={app.params.rappelHeure ?? '09:00'}
                 onchange={(e) => maj('rappelHeure', e.currentTarget.value)} />
        </div>
        <div class="row">
          <span class="k">Relance</span>
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
          {permState === 'denied' ? 'Notifications bloquées par le navigateur — autorise-les dans les réglages du site.' : 'Autorisation requise.'}
          {#if permState !== 'denied'}
            <button class="link" onclick={async () => (permState = await demanderPermission())}>Autoriser</button>
          {/if}
        </p>
      {/if}
      {#if pushSupporte() && !pushAbonne}
        <button class="btn btn-secondary btn-block" style="margin-top:10px" onclick={activerNotifsPush}>
          <Icon name="bell" size={16} /> Activer aussi app fermée
        </button>
      {/if}
      {#if pushJson}
        <textarea class="input" readonly rows="4" value={pushJson}
                  style="margin-top:10px;font-size:11px;font-family:monospace;height:auto;resize:vertical"
                  onclick={(e) => e.currentTarget.select()}></textarea>
        <button class="btn btn-secondary btn-block" style="margin-top:8px" onclick={copierPush}>Copier l'abonnement</button>
      {/if}
      {#if pushMsg}<p class="text-3" style="font-size:12.5px;margin:10px 0 0">{pushMsg}</p>{/if}
    {/if}
  </section>

  <!-- Sauvegarde -->
  <section class="card">
    <div class="eyebrow" style="margin-bottom:12px">Sauvegarde</div>
    <button class="btn btn-secondary btn-block" onclick={exporterProfil}>
      <Icon name="download" size={17} /> Exporter tout mon profil
    </button>
    <button class="btn btn-secondary btn-block" style="margin-top:10px" onclick={() => fileInput.click()}>
      <Icon name="upload" size={17} /> Importer un profil
    </button>
    <input type="file" accept="application/json,.json" bind:this={fileInput} onchange={fichierChoisi} hidden />
    {#if importMsg}<p class="ok-note">{importMsg}</p>{/if}
    {#if importErr}<p class="neg" style="margin:10px 0 0;font-size:13px">{importErr}</p>{/if}
    <p class="text-3" style="font-size:12px;margin:10px 0 0">Le fichier contient toutes tes saisies (paramètres, enveloppes, transactions). Garde-le précieusement : c'est ta sauvegarde.</p>
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

  <p class="build">Version {__BUILD_ID__}</p>
</div>

<style>
  .mini { width: 92px; height: 40px; text-align: right; padding: 0 10px; }
  .mini.wide { width: 150px; text-align: left; }
  .warn-note {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    color: var(--warn); font-size: 12.5px; margin: 12px 0 0;
  }
  .link { color: var(--accent); font-weight: 600; text-decoration: underline; }
  .ok-note { color: #3FB950; font-size: 13px; margin: 10px 0 0; }
  section { scroll-margin-top: 20px; }
  .build { text-align: center; color: var(--text-3); font-size: 11.5px; margin: 4px 0 0; }
</style>
