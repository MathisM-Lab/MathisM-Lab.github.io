<script>
  // Mini-courbe. `values` = tableau de nombres. Responsive via viewBox.
  let { values = [], color = 'var(--accent)', height = 48, fill = true, strokeWidth = 2 } = $props();

  const W = 100;
  let path = $derived(buildPath(values, W, height));
  let area = $derived(fill ? `${path} L ${W} ${height} L 0 ${height} Z` : '');
  let uid = `sl-${Math.random().toString(36).slice(2, 8)}`;

  function buildPath(vals, w, h) {
    if (!vals || vals.length < 2) return '';
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const pad = 3;
    const usableH = h - pad * 2;
    return vals
      .map((v, i) => {
        const x = (i / (vals.length - 1)) * w;
        const y = pad + (1 - (v - min) / span) * usableH;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  }
</script>

<svg viewBox="0 0 {W} {height}" preserveAspectRatio="none" style="width:100%;height:{height}px;display:block">
  {#if fill && area}
    <defs>
      <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color={color} stop-opacity="0.18" />
        <stop offset="100%" stop-color={color} stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d={area} fill="url(#{uid})" stroke="none" />
  {/if}
  <path d={path} fill="none" stroke={color} stroke-width={strokeWidth}
        stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
</svg>
