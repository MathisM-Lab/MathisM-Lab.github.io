<script>
  // Confirmation d'une action irréversible : l'utilisateur doit recopier
  // exactement un code (sensible à la casse) avant que le bouton ne s'active.
  // S'insère dans n'importe quel conteneur (carte, Sheet, bloc inline).
  //   message      : préambule optionnel affiché avant la consigne de recopie
  //   mot          : code à recopier (par défaut un code aléatoire par ouverture)
  //   onConfirm    : appelé uniquement quand le code saisi correspond
  //   onCancel     : appelé au clic sur Annuler

  // Caractères sans ambiguïté visuelle (pas de 0/O, 1/l/I).
  function genererMot(n = 10) {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const arr = crypto.getRandomValues(new Uint32Array(n));
    let out = '';
    for (let i = 0; i < n; i++) out += chars[arr[i] % chars.length];
    return out;
  }

  let {
    mot = genererMot(),
    message = '',
    confirmLabel = 'Supprimer',
    cancelLabel = 'Annuler',
    onConfirm,
    onCancel
  } = $props();

  let texte = $state('');
  let ok = $derived(texte === mot);

  function confirmer() {
    if (ok) onConfirm?.();
  }
</script>

{#if message}
  <p class="text-2" style="font-size:13.5px;margin:0 0 10px">{message}</p>
{/if}
<p class="text-2" style="font-size:13.5px;margin:0 0 10px">
  Pour confirmer, recopie exactement <strong style="color:var(--text)">{mot}</strong> ci-dessous (respecte les majuscules).
</p>
<input class="input" type="text" bind:value={texte} placeholder={mot}
       autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
<div class="cluster" style="margin-top:12px;gap:10px">
  <button class="btn btn-secondary grow" onclick={onCancel}>{cancelLabel}</button>
  <button class="btn btn-danger grow" onclick={confirmer} disabled={!ok}>{confirmLabel}</button>
</div>
