/** Retour haptique quand le navigateur le permet (Android ; Safari iOS l'ignore). */
export function vibrate(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Certains navigateurs refusent hors geste utilisateur : sans conséquence.
  }
}
