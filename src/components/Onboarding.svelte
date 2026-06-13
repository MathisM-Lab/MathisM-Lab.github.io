<script>
  import { setParam } from '../lib/db.js';
  import { DEFAULT_PARAMS } from '../lib/defaults.js';
  import { currentMonthStart } from '../lib/date.js';
  import { app } from '../lib/store.svelte.js';

  let { onFinish } = $props();

  let saving = $state(false);
  let err = $state('');

  async function finish() {
    err = '';
    saving = true;
    try {
      // Paramètres par défaut (modifiables ensuite dans Réglages).
      for (const [k, v] of Object.entries(DEFAULT_PARAMS)) {
        await setParam(k, v);
      }
      // Le suivi démarre au mois courant : aucun historique fictif.
      await setParam('dateDebut', currentMonthStart());
      await setParam('onboardingDone', true);
      // Aucune enveloppe ni transaction : l'utilisateur saisit tout lui-même.

      await app.reload();
      onFinish?.();
    } catch (e) {
      console.error(e);
      err = 'Erreur lors de la sauvegarde : ' + (e?.message ?? e);
    } finally {
      saving = false;
    }
  }
</script>

<div class="onboarding">
  <div class="wizard-card">
    <h2>Bienvenue</h2>
    <p class="text-2">
      Ton suivi démarre vierge. Crée tes enveloppes (PEA, Livret A, CTO…) puis ajoute
      tes transactions depuis la page Portefeuille. Tout est modifiable plus tard.
    </p>

    {#if err}
      <p style="color: var(--neg); margin-top: 12px;">{err}</p>
    {/if}

    <div class="actions">
      <button class="btn btn-primary btn-block btn-lg" onclick={finish} disabled={saving}>
        {saving ? 'Préparation…' : 'Commencer'}
      </button>
    </div>
  </div>
</div>

<style>
  .onboarding {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    padding-top: calc(env(safe-area-inset-top, 0px) + 16px);
  }

  .wizard-card {
    width: 100%;
    max-width: 480px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--r-card);
    padding: 24px;
    box-shadow: var(--shadow-pop);
  }

  h2 { margin-bottom: 8px; }

  .actions {
    margin-top: 24px;
  }
</style>
