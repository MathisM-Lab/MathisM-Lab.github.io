<script>
  import Icon from './Icon.svelte';

  let { current, onSelect } = $props();

  const items = [
    { id: 'dashboard',    label: 'Accueil',      icon: 'home' },
    { id: 'portefeuille', label: 'Portefeuille', icon: 'wallet' },
    { id: 'reequilibrage', label: 'Équilibrer',  icon: 'scale' },
    { id: 'evolution',    label: 'Évolution',    icon: 'trending-up' },
    { id: 'parametres',   label: 'Réglages',     icon: 'settings' }
  ];
</script>

<nav class="bottom-nav">
  {#each items as item}
    <button
      class="nav-item"
      class:active={current === item.id}
      onclick={() => onSelect(item.id)}
      aria-label={item.label}
    >
      <span class="icon"><Icon name={item.icon} size={22} stroke={2} /></span>
      <span class="label">{item.label}</span>
    </button>
  {/each}
</nav>

<style>
  .bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: calc(var(--nav-height) + var(--safe-bottom));
    padding-bottom: var(--safe-bottom);
    background: var(--bg-elevated);
    border-top: 1px solid var(--border);
    display: flex;
    z-index: 100;
    backdrop-filter: blur(8px);
  }

  .nav-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: var(--text-faint);
    transition: color 0.15s;
  }

  .nav-item.active {
    color: var(--accent-2);
  }

  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .label {
    font-size: 11px;
    font-weight: 500;
  }
</style>
