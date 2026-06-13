<script>
  import { eurosCompact } from '../lib/format.js';

  // series : [{ name, color, dashed?, points: [{x, y}] }]
  let {
    series = [],
    height = 220,
    formatY = eurosCompact,
    formatX = (x) => String(x)
  } = $props();

  let w = $state(0);
  const padL = 46, padR = 12, padT = 14, padB = 24;

  let plotW = $derived(Math.max(0, w - padL - padR));
  let plotH = $derived(Math.max(0, height - padT - padB));

  let allPts = $derived(series.flatMap((s) => s.points ?? []));
  let xMin = $derived(allPts.length ? Math.min(...allPts.map((p) => p.x)) : 0);
  let xMax = $derived(allPts.length ? Math.max(...allPts.map((p) => p.x)) : 1);
  let yMaxRaw = $derived(allPts.length ? Math.max(...allPts.map((p) => p.y)) : 1);
  let yMin = 0;
  let yMax = $derived(yMaxRaw === yMin ? yMin + 1 : yMaxRaw + (yMaxRaw - yMin) * 0.08);

  const sx = (x) => padL + ((x - xMin) / ((xMax - xMin) || 1)) * plotW;
  const sy = (y) => padT + (1 - (y - yMin) / ((yMax - yMin) || 1)) * plotH;

  function pathFor(points) {
    if (!points?.length) return '';
    return points.map((p, i) => `${i ? 'L' : 'M'} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  }

  // Lignes de grille horizontales
  let yTicks = $derived.by(() => {
    const n = 4;
    return Array.from({ length: n + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / n);
  });
  let xTicks = $derived.by(() => {
    const n = 4;
    return Array.from({ length: n + 1 }, (_, i) => xMin + ((xMax - xMin) * i) / n);
  });

  // Interaction
  let active = $state(null); // { x, items: [{name,color,y}] }
  let hoverX = $state(null);

  function onMove(e) {
    if (!plotW) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
    const xVal = xMin + ((px - padL) / plotW) * (xMax - xMin);
    const clamped = Math.max(xMin, Math.min(xMax, xVal));
    const items = series
      .map((s) => {
        if (!s.points?.length) return null;
        let best = s.points[0], bd = Infinity;
        for (const p of s.points) {
          const d = Math.abs(p.x - clamped);
          if (d < bd) { bd = d; best = p; }
        }
        return { name: s.name, color: s.color, y: best.y, x: best.x };
      })
      .filter(Boolean);
    if (!items.length) return;
    hoverX = items[0].x;
    active = { x: items[0].x, items };
  }
  function onLeave() { active = null; hoverX = null; }

  let tooltipLeft = $derived(active ? Math.min(Math.max(sx(hoverX), padL + 4), w - 120) : 0);
</script>

<div class="wrap" bind:clientWidth={w} style="height:{height}px">
  {#if w > 0}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <svg width={w} {height} role="img" aria-label="Graphique"
         onpointermove={onMove} onpointerdown={onMove} onpointerleave={onLeave}
         ontouchmove={onMove} ontouchstart={onMove} ontouchend={onLeave}
         style="touch-action:pan-y">
      <!-- grille + labels Y -->
      {#each yTicks as t}
        <line x1={padL} x2={w - padR} y1={sy(t)} y2={sy(t)} stroke="var(--line)" stroke-width="1" />
        <text x={padL - 8} y={sy(t) + 3} text-anchor="end" class="axis">{formatY(t)}</text>
      {/each}
      <!-- labels X -->
      {#each xTicks as t}
        <text x={sx(t)} y={height - 6} text-anchor="middle" class="axis">{formatX(Math.round(t))}</text>
      {/each}

      <!-- séries -->
      {#each series as s}
        <path d={pathFor(s.points)} fill="none" stroke={s.color} stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"
              stroke-dasharray={s.dashed ? '6 5' : 'none'} />
      {/each}

      <!-- curseur interactif -->
      {#if active}
        <line x1={sx(hoverX)} x2={sx(hoverX)} y1={padT} y2={height - padB}
              stroke="var(--text-3)" stroke-width="1" />
        {#each active.items as it}
          <circle cx={sx(it.x)} cy={sy(it.y)} r="4" fill="var(--bg)" stroke={it.color} stroke-width="2.5" />
        {/each}
      {/if}
    </svg>

    {#if active}
      <div class="tip" style="left:{tooltipLeft}px">
        <div class="tip-x">{formatX(active.x)}</div>
        {#each active.items as it}
          <div class="tip-row">
            <span class="dot" style="background:{it.color}"></span>
            <span class="tip-name">{it.name}</span>
            <span class="tip-val">{formatY(it.y)}</span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .wrap { position: relative; width: 100%; }
  svg { display: block; }
  .axis { fill: var(--text-3); font-size: 10px; font-variant-numeric: tabular-nums; }
  .tip {
    position: absolute; top: 6px;
    background: var(--surface-3);
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    padding: 8px 10px;
    pointer-events: none;
    min-width: 110px;
    box-shadow: var(--shadow-pop);
  }
  .tip-x { font-size: 11px; color: var(--text-3); margin-bottom: 5px; }
  .tip-row { display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .tip-row + .tip-row { margin-top: 3px; }
  .tip-name { color: var(--text-2); flex: 1; }
  .tip-val { font-variant-numeric: tabular-nums; font-weight: 600; }
  .tip .dot { width: 7px; height: 7px; }
</style>
