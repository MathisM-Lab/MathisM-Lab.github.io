<script>
  let { checked = $bindable(false), onchange } = $props();
  function toggle() { checked = !checked; onchange?.(checked); }
</script>

<button
  class="toggle"
  class:on={checked}
  role="switch"
  aria-checked={checked}
  aria-label="Activer/désactiver"
  onclick={toggle}
>
  <span class="knob"></span>
</button>

<style>
  .toggle {
    width: 46px; height: 28px;
    border-radius: var(--r-pill);
    background: var(--surface-3);
    border: 1px solid var(--line-strong);
    padding: 2px;
    transition: background 0.18s, border-color 0.18s;
    flex-shrink: 0;
  }
  .toggle.on { background: var(--accent); border-color: var(--accent); }
  .knob {
    display: block;
    width: 22px; height: 22px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.18s cubic-bezier(0.32, 0.72, 0, 1);
  }
  .toggle.on .knob { transform: translateX(18px); }
</style>
