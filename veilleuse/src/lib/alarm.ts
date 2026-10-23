// L'alarme de l'iPhone se règle par un raccourci de l'app Raccourcis, créé une fois par
// le parent : un site web ne peut pas créer d'alarme lui-même, mais il peut lancer un
// raccourci en lui passant l'heure (schéma d'URL documenté par Apple).
import { formatClock } from './format';

/** Nom exact du raccourci à créer dans l'app Raccourcis. */
export const ALARM_SHORTCUT = 'Alarme tétée';

/** « shortcuts://run-shortcut?name=Alarme%20t%C3%A9t%C3%A9e&input=text&text=21%3A06 » */
export function alarmUrl(at: number): string {
  const params = `name=${encodeURIComponent(ALARM_SHORTCUT)}&input=text&text=${encodeURIComponent(formatClock(at))}`;
  return `shortcuts://run-shortcut?${params}`;
}
