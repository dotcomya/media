// Le réveil passe par un raccourci de l'app Raccourcis, créé une fois par le parent : un site web
// ne peut pas régler l'app Horloge lui-même, mais il peut lancer un raccourci en lui passant une
// valeur (schéma d'URL documenté par Apple). Le raccourci démarre un minuteur : il sonne comme une
// alarme et ne laisse rien derrière lui, alors qu'une alarme créée par Raccourcis reste dans la
// liste d'Horloge après avoir sonné (aucune action ne permet de la supprimer).

/** Nom exact du raccourci à créer dans l'app Raccourcis. */
export const ALARM_SHORTCUT = 'Réveil tétée';

/** Minutes jusqu'à `at`, arrondies, au moins 1. */
export function minutesUntil(at: number, now = Date.now()): number {
  return Math.max(1, Math.round((at - now) / 60_000));
}

/** « shortcuts://run-shortcut?name=R%C3%A9veil%20t%C3%A9t%C3%A9e&input=text&text=150 » */
export function alarmUrl(at: number, now = Date.now()): string {
  const params = `name=${encodeURIComponent(ALARM_SHORTCUT)}&input=text&text=${minutesUntil(at, now)}`;
  return `shortcuts://run-shortcut?${params}`;
}

/** Lance le raccourci ; à appeler pendant un appui (iOS n'ouvre une autre app que sur un geste). */
export function openAlarm(at: number): void {
  const link = Object.assign(document.createElement('a'), { href: alarmUrl(at), hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
}
