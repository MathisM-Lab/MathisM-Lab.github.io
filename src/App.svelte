<script>
  import { onMount, onDestroy } from 'svelte';
  import { app } from './lib/store.svelte.js';
  import { verifierEtNotifier, programmerRelance, arreterRelance } from './lib/notifications.js';
  import BottomNav from './components/BottomNav.svelte';
  import Onboarding from './components/Onboarding.svelte';
  import Dashboard from './screens/Dashboard.svelte';
  import Portfolio from './screens/Portfolio.svelte';
  import Rebalance from './screens/Rebalance.svelte';
  import Evolution from './screens/Evolution.svelte';
  import Settings from './screens/Settings.svelte';

  const ECRANS = {
    dashboard: Dashboard,
    portefeuille: Portfolio,
    reequilibrage: Rebalance,
    evolution: Evolution,
    parametres: Settings
  };
  let Courant = $derived(ECRANS[app.currentScreen] ?? Dashboard);

  function etat() {
    return { params: app.params, enveloppes: app.enveloppes, transactions: app.transactions };
  }
  function onVisible() {
    if (document.visibilityState === 'visible') verifierEtNotifier(etat());
  }

  onMount(async () => {
    await app.load();
    if (app.params.onboardingDone) {
      verifierEtNotifier(etat());
      programmerRelance(etat);
      document.addEventListener('visibilitychange', onVisible);
    }
  });
  onDestroy(() => {
    arreterRelance();
    document.removeEventListener('visibilitychange', onVisible);
  });
</script>

{#if !app.loaded}
  <div class="splash"><div class="spinner"></div></div>
{:else if !app.params.onboardingDone}
  <Onboarding onFinish={() => app.reload()} />
{:else}
  <main><Courant /></main>
  <BottomNav current={app.currentScreen} onSelect={(id) => (app.currentScreen = id)} />
{/if}

<style>
  main { flex: 1; display: flex; flex-direction: column; }
  .splash { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
</style>
