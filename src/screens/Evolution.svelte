<script>
  import { onMount } from 'svelte';
  import { app } from '../lib/store.svelte.js';
  import { euros, signedEuros, pct, eurosCompact } from '../lib/format.js';
  import { moisToLabelCourt, dateDebutToMonthInput, moisToMonthInput, monthInputToMois } from '../lib/date.js';
  import { projeteAuMois, evenementsProjection, mvtPrevuAuMois } from '../lib/projection.js';
  import { estLivret } from '../lib/calc.js';
  import { saveEnveloppe } from '../lib/db.js';
  import LineChart from '../components/LineChart.svelte';
  import Icon from '../components/Icon.svelte';

  // Au démarrage de l'écran : télécharge l'historique mensuel des prix en arrière-plan.
  onMount(() => { app.rafraichirHistorique(); });

  // Plan d'épargne : paliers de versement par enveloppe { depuis: 'YYYY-MM', montant }.
  function paliersEnv(e) {
    return Array.isArray(e.paliers) ? e.paliers : [];
  }
  async function persistPaliers(env, paliers) {
    // Tri chronologique pour l'affichage. L'each est indexé par `id` (stable),
    // donc réordonner ne désynchronise plus les champs de saisie.
    paliers.sort((a, b) => (a.depuis < b.depuis ? -1 : a.depuis > b.depuis ? 1 : 0));
    await saveEnveloppe({ ...$state.snapshot(env), paliers });
    await app.reload();
  }
  async function ajouterPalier(env) {
    const paliers = paliersEnv(env).map((p) => ({ ...p }));
    // Nouveau palier au mois suivant le dernier (donc en bas, chronologiquement).
    let depuis = dateDebutToMonthInput(app.params.dateDebut);
    if (paliers.length) {
      const dernier = paliers.reduce((max, p) => (p.depuis > max ? p.depuis : max), paliers[0].depuis);
      depuis = moisToMonthInput(monthInputToMois(dernier, app.params.dateDebut) + 1, app.params.dateDebut);
    }
    paliers.push({ id: crypto.randomUUID(), depuis, montant: 0 });
    await persistPaliers(env, paliers);
  }
  async function majPalier(env, id, champ, valeur) {
    const paliers = paliersEnv(env).map((p) => ({ ...p }));
    const cible = paliers.find((p) => p.id === id);
    if (!cible) return;
    if (champ === 'montant') cible.montant = Number(String(valeur).replace(',', '.')) || 0;
    else cible.depuis = valeur;
    await persistPaliers(env, paliers);
  }
  async function retirerPalier(env, id) {
    const paliers = paliersEnv(env).filter((p) => p.id !== id);
    await persistPaliers(env, paliers);
  }
  // Versement réellement prévu ce mois-ci (somme des paliers actifs), pour info.
  let totalMvtCourant = $derived(
    app.enveloppes.reduce((s, e) => s + mvtPrevuAuMois(e, app.moisCourant, app.params.dateDebut), 0)
  );

  const PERIODES = [
    { id: '3m', label: '3 mois', horizon: 3 },
    { id: '1an', label: '1 an', horizon: 12 },
    { id: '5ans', label: '5 ans', horizon: 60 },
    { id: '20ans', label: '20 ans', horizon: 240 }
  ];
  let periode = $state('5ans');
  let horizon = $derived(PERIODES.find((p) => p.id === periode).horizon);

  let serie = $derived(app.projection);
  let mc = $derived(app.moisCourant);
  let pat = $derived(app.patrimoine);

  // Vues par enveloppe (envId null = total)
  let vues = $derived.by(() => {
    const base = [{ key: 'total', label: 'Total', envId: null }];
    for (const e of app.enveloppes) {
      base.push({ key: `env-${e.id}`, label: e.nom, envId: e.id });
    }
    return base;
  });
  let vueKey = $state('total');
  let vue = $derived(vues.find((v) => v.key === vueKey) ?? vues[0]);

  // Argent réellement versé (cumul net des montants, ventes incluses).
  function verseCumuleAuMois(m, vueDef) {
    return app.transactions
      .filter((t) => (t.mois ?? 0) <= m && (vueDef.envId == null || t.enveloppe === vueDef.envId))
      .reduce((s, t) => s + (t.montant ?? 0), 0);
  }

  // Cours d'un actif au mois m : prix live pour le mois courant, sinon historique
  // mensuel (avec report du dernier cours connu), sinon prix par défaut saisi.
  function coursAuLabel(hist, label) {
    if (!hist) return null;
    if (hist[label] != null) return hist[label];
    let best = null, bestKey = null;
    for (const k in hist) {
      if (k <= label && (bestKey == null || k > bestKey)) { bestKey = k; best = hist[k]; }
    }
    return best;
  }
  function prixActifAuMois(a, m) {
    if (a.ticker) {
      if (m >= mc) {
        const live = app.prix.get(a.ticker)?.prix;
        if (live != null) return live;
      }
      const c = coursAuLabel(app.prixHistorique.get(a.ticker), moisToMonthInput(m, app.params.dateDebut));
      if (c != null) return c;
    }
    return a.prixDefaut ?? 0;
  }

  // Valeur de marché réelle au mois m : parts détenues × cours de ce mois-là.
  function valeurReelleAuMois(m, vueDef) {
    let total = 0;
    for (const env of app.enveloppes) {
      if (vueDef.envId != null && env.id !== vueDef.envId) continue;
      if (estLivret(env)) {
        total += app.transactions
          .filter((t) => t.enveloppe === env.id && (t.mois ?? 0) <= m)
          .reduce((s, t) => s + (t.montant ?? 0), 0);
      } else {
        for (const a of env.actifs ?? []) {
          const parts = app.transactions
            .filter((t) => t.enveloppe === env.id && t.actifId === a.id && (t.mois ?? 0) <= m)
            .reduce((s, t) => s + (t.parts ?? 0), 0);
          total += parts * prixActifAuMois(a, m);
        }
      }
    }
    return total;
  }

  function projAuMois(m, vueDef) {
    if (!serie[m]) return 0;
    return vueDef.envId == null ? serie[m].totalProjete : (serie[m].parEnv?.[vueDef.envId] ?? 0);
  }

  let aUnPlan = $derived(serie.length > 0 && serie[serie.length - 1].totalProjete > 0);

  let series = $derived.by(() => {
    const proj = [], verse = [], valeur = [];
    for (let m = 0; m <= horizon; m++) {
      proj.push({ x: m, y: projAuMois(m, vue) });
      if (m <= mc) {
        verse.push({ x: m, y: verseCumuleAuMois(m, vue) });
        valeur.push({ x: m, y: valeurReelleAuMois(m, vue) });
      }
    }
    const out = [];
    if (aUnPlan) out.push({ name: 'Plan', color: 'var(--text-3)', dashed: true, points: proj });
    out.push({ name: 'Versé', color: '#9B7DFF', points: verse });
    out.push({ name: 'Valeur', color: 'var(--accent)', points: valeur });
    return out;
  });

  let markers = $derived(evenementsProjection(serie).filter((e) => e.mois <= horizon));


  // Indicateurs
  let projeteMaintenant = $derived(projeteAuMois(serie, mc));
  let ecart = $derived(pat.valeurActuelle - projeteMaintenant);
</script>

<div class="screen">
  <div class="screen-head"><h1>Évolution</h1></div>

  <!-- Indicateurs clés -->
  <div class="kpis">
    <div class="kpi">
      <div class="eyebrow">Réel</div>
      <div class="kpi-v">{euros(pat.valeurActuelle, { noCents: true })}</div>
    </div>
    <div class="kpi">
      <div class="eyebrow">Projeté</div>
      <div class="kpi-v">{euros(projeteMaintenant, { noCents: true })}</div>
    </div>
    <div class="kpi">
      <div class="eyebrow">Écart</div>
      <div class="kpi-v" class:pos={ecart >= 0} class:neg={ecart < 0}>{signedEuros(ecart, { noCents: true })}</div>
    </div>
  </div>

  <!-- Graphique -->
  <div class="card">
    <div class="hscroll" style="margin-bottom:10px">
      {#each vues as v}
        <button class="chip" class:on={vueKey === v.key} onclick={() => (vueKey = v.key)}>{v.label}</button>
      {/each}
    </div>
    <div class="between" style="margin-bottom:12px">
      <div class="seg">
        {#each PERIODES as p}
          <button class:on={periode === p.id} onclick={() => (periode = p.id)}>{p.label}</button>
        {/each}
      </div>
    </div>
    <LineChart {series} {markers} height={240}
      formatX={(m) => moisToLabelCourt(m, app.params.dateDebut)} formatY={eurosCompact} />
    <div class="ev-legend">
      {#each series as s}
        <span class="ev"><span class="dot" style="background:{s.color}"></span>{s.name}</span>
      {/each}
    </div>
    {#if markers.length}
      <div class="ev-legend">
        {#each markers as ev}
          <span class="ev"><span class="dot" style="background:var(--neg)"></span>{moisToLabelCourt(ev.mois, app.params.dateDebut)} · {ev.label}</span>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Mon plan : paliers de versement mensuel -->
  <div class="card">
    <div class="eyebrow" style="margin-bottom:12px">Mon plan — versements mensuels</div>
    {#if app.enveloppes.length}
      {#each app.enveloppes as e (e.id)}
        <div class="plan-env">
          <div class="plan-env-head"><span class="dot" style="background:{e.couleur}"></span>{e.nom}</div>
          {#each paliersEnv(e) as p (p.id)}
            <div class="palier">
              <span class="text-3 palier-lbl">dès</span>
              <input class="input palier-mois" type="month" value={p.depuis}
                     onchange={(ev) => majPalier(e, p.id, 'depuis', ev.currentTarget.value)} />
              <input class="input palier-montant" type="number" step="10" min="0" value={p.montant}
                     onchange={(ev) => majPalier(e, p.id, 'montant', ev.currentTarget.value)} /><span class="text-3">€</span>
              <button class="icon-btn palier-del" onclick={() => retirerPalier(e, p.id)} aria-label="Retirer le palier">
                <Icon name="trash" size={15} />
              </button>
            </div>
          {/each}
          {#if paliersEnv(e).length === 0}
            <p class="text-3" style="font-size:12px;margin:0 0 8px">Aucun versement prévu.</p>
          {/if}
          <button class="palier-add" onclick={() => ajouterPalier(e)}>
            <Icon name="plus" size={15} /> Ajouter un palier
          </button>
        </div>
      {/each}
      <div class="rows" style="margin-top:6px">
        <div class="row"><span class="k">Versement prévu ce mois-ci</span><span class="v">{euros(totalMvtCourant, { noCents: true })}</span></div>
      </div>
      <p class="text-3" style="font-size:12.5px;margin:12px 0 0">
        Chaque palier s'applique à partir de son mois et reste valable jusqu'au palier suivant. Le rendement de projection se règle sur chaque enveloppe (Portefeuille).
      </p>
    {:else}
      <p class="empty">Aucune enveloppe. Crée-en une dans Portefeuille.</p>
    {/if}
  </div>

</div>

<style>
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .kpi { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px 12px; }
  .kpi-v { font-size: 17px; font-weight: 650; font-variant-numeric: tabular-nums; margin-top: 6px; letter-spacing: -0.02em; }

  .chip {
    flex-shrink: 0; padding: 8px 14px; border-radius: var(--r-pill);
    background: var(--surface-2); border: 1px solid var(--line);
    color: var(--text-2); font-weight: 600; font-size: 13px;
  }
  .chip.on { color: var(--text); border-color: var(--line-strong); background: var(--surface-3); }

  .plan-env { padding: 12px 0; }
  .plan-env + .plan-env { border-top: 1px solid var(--line); }
  .plan-env-head { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; margin-bottom: 10px; }
  .palier { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .palier-lbl { font-size: 12px; flex-shrink: 0; }
  .palier-mois { flex: 1; height: 40px; padding: 0 10px; min-width: 0; }
  .palier-montant { width: 78px; height: 40px; text-align: right; padding: 0 10px; flex-shrink: 0; }
  .palier-del { width: 34px; height: 34px; border: 0; background: transparent; color: var(--text-3); flex-shrink: 0; }
  .palier-add {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 12px; border-radius: var(--r-pill);
    background: var(--surface-2); border: 1px solid var(--line);
    color: var(--text-2); font-weight: 600; font-size: 13px;
  }

  .ev-legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
  .ev { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-3); }
</style>
