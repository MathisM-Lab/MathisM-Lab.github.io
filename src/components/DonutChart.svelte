<script>
  import { euros, pct } from '../lib/format.js';

  // segments : [{ label, value, color }]
  let { segments = [], size = 168, thickness = 18, centerLabel = '', legend = true } = $props();

  let total = $derived(segments.reduce((s, x) => s + Math.max(0, x.value), 0));
  let r = $derived((size - thickness) / 2);
  let c = $derived(2 * Math.PI * r);
  let cx = $derived(size / 2);

  let active = $state(null);

  let arcs = $derived.by(() => {
    let acc = 0;
    return segments
      .filter((s) => s.value > 0)
      .map((s) => {
        const frac = total > 0 ? s.value / total : 0;
        const seg = { ...s, frac, dash: frac * c, offset: -acc * c };
        acc += frac;
        return seg;
      });
  });

  let centerValue = $derived(active ? euros(active.value, { noCents: true }) : euros(total, { noCents: true }));
  let centerSub = $derived(active ? `${active.label} · ${pct(active.frac)}` : centerLabel);
</script>

<div class="donut">
  <svg width={size} height={size} viewBox="0 0 {size} {size}">
    <circle {cx} cy={cx} {r} fill="none" stroke="var(--surface-2)" stroke-width={thickness} />
    {#each arcs as a (a.label)}
      <circle
        role="button" aria-label={a.label} tabindex="-1"
        {cx} cy={cx} {r} fill="none"
        stroke={a.color}
        stroke-width={active && active.label === a.label ? thickness + 3 : thickness}
        stroke-dasharray="{a.dash} {c - a.dash}"
        stroke-dashoffset={a.offset}
        stroke-linecap="butt"
        transform="rotate(-90 {cx} {cx})"
        style="transition:stroke-width 0.15s;cursor:pointer"
        onpointerenter={() => (active = a)}
        onpointerdown={() => (active = a)}
        onpointerleave={() => (active = null)}
      />
    {/each}
    <text x={cx} y={cx - 4} text-anchor="middle" class="c-val">{centerValue}</text>
    <text x={cx} y={cx + 15} text-anchor="middle" class="c-sub">{centerSub}</text>
  </svg>

  {#if legend}
    <div class="legend">
      {#each arcs as a (a.label)}
        <button class="leg-row" class:dim={active && active.label !== a.label}
                onpointerenter={() => (active = a)} onpointerleave={() => (active = null)}>
          <span class="dot" style="background:{a.color}"></span>
          <span class="leg-name">{a.label}</span>
          <span class="leg-pct">{pct(a.frac, { digits: 1 })}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .donut { display: flex; align-items: center; gap: var(--s5); }
  svg { flex-shrink: 0; }
  .c-val { fill: var(--text); font-size: 19px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
  .c-sub { fill: var(--text-3); font-size: 10.5px; }
  .legend { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .leg-row {
    display: flex; align-items: center; gap: 9px;
    padding: 7px 0; text-align: left; width: 100%;
    transition: opacity 0.15s;
  }
  .leg-row + .leg-row { border-top: 1px solid var(--line); }
  .leg-row.dim { opacity: 0.4; }
  .leg-name { flex: 1; font-size: 13.5px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .leg-pct { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
