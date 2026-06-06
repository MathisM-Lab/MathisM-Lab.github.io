<script>
  // Barre de progression horizontale avec marqueur optionnel.
  // value : valeur remplie. max : borne. marker : valeur d'un repère (ex. projection).
  let { value = 0, max = 1, marker = null, color = 'var(--accent)', height = 10 } = $props();

  let pctFill = $derived(Math.max(0, Math.min(1, max > 0 ? value / max : 0)));
  let pctMarker = $derived(marker != null && max > 0 ? Math.max(0, Math.min(1, marker / max)) : null);
</script>

<div class="track" style="height:{height}px">
  <div class="fill" style="width:{pctFill * 100}%;background:{color}"></div>
  {#if pctMarker != null}
    <div class="marker" style="left:{pctMarker * 100}%"></div>
  {/if}
</div>

<style>
  .track {
    position: relative;
    width: 100%;
    background: var(--surface-2);
    border-radius: var(--r-pill);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: var(--r-pill);
    transition: width 0.4s cubic-bezier(0.32, 0.72, 0, 1);
  }
  .marker {
    position: absolute; top: -3px; bottom: -3px;
    width: 2px; border-radius: 1px;
    background: var(--text);
    transform: translateX(-1px);
    overflow: visible;
  }
</style>
