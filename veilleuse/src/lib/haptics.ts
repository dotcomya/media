/** Retour haptique quand le navigateur le permet (Android ; Safari iOS l'ignore). */
export function vibrate(pattern: number | number[] = 15): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Certains navigateurs lèvent une erreur hors geste utilisateur : sans conséquence.
  }
}
