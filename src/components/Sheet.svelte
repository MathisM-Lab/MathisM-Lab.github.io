<script>
  import Icon from './Icon.svelte';
  let { title = '', onClose, children } = $props();

  function onKey(e) { if (e.key === 'Escape') onClose?.(); }
</script>

<svelte:window onkeydown={onKey} />

<div
  class="backdrop"
  role="presentation"
  onclick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
>
  <div class="sheet" role="dialog" aria-modal="true" tabindex="-1">
    <div class="grabber"></div>
    <div class="head">
      <h2>{title}</h2>
      <button class="icon-btn" onclick={onClose} aria-label="Fermer"><Icon name="x" size={20} /></button>
    </div>
    <div class="body">
      {@render children?.()}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(4, 6, 9, 0.66);
    display: flex; align-items: flex-end; justify-content: center;
    animation: fade 0.18s ease-out;
  }
  .sheet {
    width: 100%; max-width: 560px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-top-left-radius: 22px;
    border-top-right-radius: 22px;
    padding: 10px 18px calc(20px + var(--safe-b));
    max-height: 92vh; overflow-y: auto;
    box-shadow: var(--shadow-sheet);
    animation: slide 0.22s cubic-bezier(0.32, 0.72, 0, 1);
  }
  .grabber {
    width: 36px; height: 4px; border-radius: 2px;
    background: var(--line-strong);
    margin: 0 auto 12px;
  }
  .head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 16px;
  }
  .body { display: flex; flex-direction: column; }
  @keyframes slide { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
</style>
