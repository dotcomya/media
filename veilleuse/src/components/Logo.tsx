/**
 * Logo Nous 3 : deux parents et un bébé, blottis l'un contre l'autre. Un fin liseré de la
 * couleur du fond détache chaque forme de la précédente (même dessin que les icônes).
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg class="logo-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="24.6" cy="27.5" r="13.1" fill="var(--brand-terracotta)" />
      <circle cx="39.4" cy="27.5" r="14.5" fill="var(--logo-ground, var(--bg))" />
      <circle cx="39.4" cy="27.5" r="13.1" fill="var(--brand-peach)" />
      <circle cx="32" cy="42.6" r="9.4" fill="var(--logo-ground, var(--bg))" />
      <circle cx="32" cy="42.6" r="8" fill="var(--brand-sage)" />
    </svg>
  );
}

/** « nous3 », le 3 aux couleurs du logo. */
export function Wordmark() {
  return (
    <span class="wordmark" aria-label="Nous 3">
      nous<b>3</b>
    </span>
  );
}
