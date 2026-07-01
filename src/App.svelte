<script>
  import { onMount } from 'svelte';
  import { app } from './lib/store.svelte.js';
  import { demanderPersistance } from './lib/db.js';
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

  onMount(async () => {
    // Demande un stockage persistant (anti-effacement automatique). Sans attente :
    // ne doit pas retarder l'affichage.
    demanderPersistance();
    await app.load();
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
