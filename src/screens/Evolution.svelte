<script>
  import { onMount } from 'svelte';
  import { app } from '../lib/store.svelte.js';
  import { euros, signedEuros, pct, eurosCompact } from '../lib/format.js';
  import { moisToLabelCourt, dateDebutToMonthInput, moisToMonthInput, monthInputToMois } from '../lib/date.js';
  import { projeteAuMois, mvtPrevuAuMois, tauxMensuelEnv } from '../lib/projection.js';
  import { estLivret } from '../lib/calc.js';
  import { saveEnveloppe, getEnveloppe } from '../lib/db.js';
  import LineChart from '../components/LineChart.svelte';
  import Icon from '../components/Icon.svelte';
  import Sheet from '../components/Sheet.svelte';
  import ConfirmRecopie from '../components/ConfirmRecopie.svelte';

  // Au démarrage de l'écran : télécharge l'historique mensuel des prix en arrière-plan.
  onMount(() => { app.rafraichirHistorique(); });

  // Plan d'épargne : paliers de versement par enveloppe { depuis: 'YYYY-MM', montant }.
  function paliersEnv(e) {
    return Array.isArray(e.paliers) ? e.paliers : [];
  }
  // Les saisies de paliers déclenchent des écritures asynchrones (save + reload).
  // Sans précaution, deux handlers qui se chevauchent (ex. blur d'un champ +
  // clic corbeille, ou deux montants édités d'affilée) liraient tous les deux la
  // même liste périmée et le dernier écraserait l'autre (« lost update » : un
  // palier supprimé qui réapparaît, ou un montant remis à zéro).
  // Parade : on sérialise les opérations dans une file, et chaque opération relit
  // l'état FRAIS de la base juste avant d'écrire.
  let fileEcriture = Promise.resolve();
  function mutatePaliers(envId, transformer) {
    fileEcriture = fileEcriture.then(async () => {
      const fresh = await getEnveloppe(envId);
      if (!fresh) return;
      let paliers = (Array.isArray(fresh.paliers) ? fresh.paliers : []).map((p) => ({ ...p }));
      paliers = transformer(paliers);
      // Tri chronologique pour l'affichage (l'each est indexé par `id` stable).
      paliers.sort((a, b) => (a.depuis < b.depuis ? -1 : a.depuis > b.depuis ? 1 : 0));
      await saveEnveloppe({ ...fresh, paliers });
      await app.reload();
    });
    return fileEcriture;
  }
  function ajouterPalier(env) {
    return mutatePaliers(env.id, (paliers) => {
      // Nouveau palier au mois suivant le dernier (donc en bas, chronologiquement).
      let depuis = dateDebutToMonthInput(app.params.dateDebut);
      if (paliers.length) {
        const dernier = paliers.reduce((max, p) => (p.depuis > max ? p.depuis : max), paliers[0].depuis);
        depuis = moisToMonthInput(monthInputToMois(dernier, app.params.dateDebut) + 1, app.params.dateDebut);
      }
      paliers.push({ id: crypto.randomUUID(), depuis, montant: 0 });
      return paliers;
    });
  }
  function majPalier(env, id, champ, valeur) {
    return mutatePaliers(env.id, (paliers) => {
      const cible = paliers.find((p) => p.id === id);
      if (!cible) return paliers;
      if (champ === 'montant') cible.montant = Number(String(valeur).replace(',', '.')) || 0;
      else cible.depuis = valeur;
      return paliers;
    });
  }
  function retirerPalier(env, id) {
    return mutatePaliers(env.id, (paliers) => paliers.filter((p) => p.id !== id));
  }

  // Confirmation de suppression de palier : recopie d'un code (ConfirmRecopie).
  let suppPalier = $state(null); // { env, id } | null

  function demanderSuppressionPalier(env, id) {
    suppPalier = { env, id };
  }

  async function confirmerSuppressionPalier() {
    if (!suppPalier) return;
    const { env, id } = suppPalier;
    suppPalier = null;
    await retirerPalier(env, id);
  }
  // Versement réellement prévu ce mois-ci (somme des paliers actifs), pour info.
  let totalMvtCourant = $derived(
    app.enveloppes.reduce((s, e) => s + mvtPrevuAuMois(e, app.moisCourant, app.params.dateDebut), 0)
  );

  // Horizon du graphique : curseur libre de 3 mois à 40 ans (480 mois).
  // La position est mémorisée d'une session à l'autre (localStorage).
  const HORIZON_MIN = 3, HORIZON_MAX = 480;
  function chargerHorizon() {
    const v = Number(localStorage.getItem('evo-horizon'));
    return Number.isFinite(v) && v >= HORIZON_MIN && v <= HORIZON_MAX ? v : 60;
  }
  let horizon = $state(chargerHorizon());
  $effect(() => { localStorage.setItem('evo-horizon', String(horizon)); });

  function labelHorizon(m) {
    if (m < 12) return `${m} mois`;
    const ans = Math.floor(m / 12), mois = m % 12;
    const a = `${ans} an${ans > 1 ? 's' : ''}`;
    return mois ? `${a} ${mois} mois` : a;
  }

  let serie = $derived(app.projection);
  let mc = $derived(app.moisCourant);
  let pat = $derived(app.patrimoine);

  // Valeur réelle d'une seule enveloppe au mois m.
  function valeurEnvAuMois(env, m) {
    if (estLivret(env)) {
      return app.transactions
        .filter((t) => t.enveloppe === env.id && (t.mois ?? 0) <= m)
        .reduce((s, t) => s + (t.montant ?? 0), 0);
    }
    let total = 0;
    for (const a of env.actifs ?? []) {
      const parts = app.transactions
        .filter((t) => t.enveloppe === env.id && t.actifId === a.id && (t.mois ?? 0) <= m)
        .reduce((s, t) => s + (t.parts ?? 0), 0);
      total += parts * prixActifAuMois(a, m);
    }
    return total;
  }

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

  // Projection "réelle" : part de la valeur actuelle réelle (par enveloppe) et applique
  // la stratégie prévue (paliers + rendements) à partir d'aujourd'hui vers l'avenir.
  let pointsProjectionReelle = $derived.by(() => {
    if (!aUnPlan) return [];
    const envsFiltrees = vue.envId == null
      ? app.enveloppes
      : app.enveloppes.filter((e) => e.id === vue.envId);
    const etats = envsFiltrees.map((e) => ({
      e,
      valeur: valeurEnvAuMois(e, mc),
      taux: tauxMensuelEnv(e, { rendementMensuel: app.params.rendementMensuel ?? 0.0056 })
    }));
    const points = [];
    for (let m = mc; m <= horizon; m++) {
      if (m > mc) {
        for (const s of etats) {
          s.valeur = s.valeur * (1 + s.taux) + mvtPrevuAuMois(s.e, m, app.params.dateDebut);
        }
      }
      points.push({ x: m, y: etats.reduce((sum, s) => sum + s.valeur, 0) });
    }
    return points;
  });

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
    if (aUnPlan) out.push({ name: 'Plan initial', color: 'var(--text-3)', dashed: true, points: proj });
    out.push({ name: 'Versé', color: '#9B7DFF', points: verse });
    out.push({ name: 'Valeur', color: 'var(--accent)', points: valeur });
    if (aUnPlan) out.push({ name: 'Projection', color: '#52C974', points: pointsProjectionReelle });
    return out;
  });

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
    <div class="horizon" style="margin-bottom:12px">
      <input class="horizon-range" type="range" min={HORIZON_MIN} max={HORIZON_MAX} step="1"
             bind:value={horizon} aria-label="Horizon du graphique" />
      <span class="horizon-val">{labelHorizon(horizon)}</span>
    </div>
    <LineChart {series} height={240}
      formatX={(m) => moisToLabelCourt(m, app.params.dateDebut)} formatY={eurosCompact} />
    <div class="ev-legend">
      {#each series as s}
        <span class="ev"><span class="dot" style="background:{s.color}"></span>{s.name}</span>
      {/each}
    </div>
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
              <button class="icon-btn palier-del" onclick={() => demanderSuppressionPalier(e, p.id)} aria-label="Retirer le palier">
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


{#if suppPalier}
  <Sheet title="Supprimer ce palier" onClose={() => (suppPalier = null)}>
    <ConfirmRecopie
      confirmLabel="Supprimer"
      onConfirm={confirmerSuppressionPalier}
      onCancel={() => (suppPalier = null)} />
  </Sheet>
{/if}

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

  .horizon { display: flex; align-items: center; gap: 12px; }
  .horizon-range {
    flex: 1; min-width: 0; accent-color: var(--accent); height: 24px;
    -webkit-appearance: none; appearance: none; background: transparent;
    border: 0; outline: 0;
  }
  .horizon-range:focus { outline: 0; }
  .horizon-range::-webkit-slider-runnable-track {
    height: 4px; border-radius: 2px; border: 0; background: var(--line);
  }
  .horizon-range::-moz-range-track {
    height: 4px; border-radius: 2px; border: 0; background: var(--line);
  }
  .horizon-range::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none; margin-top: -7px;
    width: 18px; height: 18px; border-radius: 50%; border: 0; background: var(--accent);
  }
  .horizon-range::-moz-range-thumb {
    width: 18px; height: 18px; border-radius: 50%; border: 0; background: var(--accent);
  }
  .horizon-val {
    flex-shrink: 0; min-width: 84px; text-align: right;
    font-weight: 650; font-size: 14px; font-variant-numeric: tabular-nums; letter-spacing: -0.02em;
  }

  .plan-env { padding: 12px 0; }
  .plan-env + .plan-env { border-top: 1px solid var(--line); }
  .plan-env-head { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; margin-bottom: 10px; }
  .palier { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .palier-lbl { font-size: 12px; flex-shrink: 0; }
  .palier-mois { flex: 1; height: 40px; padding: 0 10px; min-width: 0; font-size: 12px; }
  .palier-montant { width: 53px; height: 40px; text-align: right; padding: 0 10px; flex-shrink: 0; font-size: 12px; }
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
