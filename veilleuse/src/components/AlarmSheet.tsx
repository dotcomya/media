import { ALARM_SHORTCUT, alarmUrl } from '../lib/alarm';
import { formatClock } from '../lib/format';
import { updateSettings } from '../store';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

/**
 * Premier réveil : explique comment créer, une fois, le raccourci qui démarre le
 * minuteur de l'iPhone. Les fois suivantes, l'app le lance directement.
 */
export function AlarmSheet({ at, onClose }: { at: number; onClose: () => void }) {
  const time = formatClock(at);
  return (
    <Sheet
      title={`Réveil à ${time}`}
      onClose={onClose}
      footer={
        <>
        <button type="button" class="action" onClick={onClose}>
          Plus tard
        </button>
        <a
          class="action action-primary"
          href={alarmUrl(at)}
          onClick={() => {
            updateSettings({ alarmReady: true });
            onClose();
          }}
        >
          <Icon name="alarm" size={22} />
          C'est fait : réveil à {time}
        </a>
        </>
      }
    >
      <p class="hint">
        Pour vous réveiller à l'heure du prochain repas, Nous 3 démarre un minuteur de l'iPhone : il sonne comme une
        alarme, même en mode silencieux, et ne laisse aucune alarme en trop dans Horloge. Créez une seule fois ce
        raccourci (1 minute) :
      </p>
      <ol class="steps">
        <li>
          Ouvrez l'app <strong>Raccourcis</strong> et touchez <strong>+</strong>.
        </li>
        <li>
          Touchez le nom en haut et appelez le raccourci exactement <strong>{ALARM_SHORTCUT}</strong>.
        </li>
        <li>
          Touchez <strong>Ajouter une action</strong>, cherchez <strong>minuteur</strong> et choisissez{' '}
          <strong>Démarrer le minuteur</strong>.
        </li>
        <li>
          Touchez la durée, choisissez la variable <strong>Entrée du raccourci</strong>, et l'unité{' '}
          <strong>minutes</strong>.
        </li>
        <li>
          Touchez <strong>OK</strong>, revenez ici et touchez le bouton ci-dessous.
        </li>
      </ol>
      <p class="hint">
        Ensuite, c'est automatique : à chaque tétée ou biberon validé, l'iPhone ouvre Raccourcis (confirmez la première
        fois) et le minuteur part jusqu'au prochain repas. Si un ancien minuteur tourne encore, arrêtez-le depuis
        l'écran verrouillé. Réglages permet de couper le réveil automatique.
      </p>
    </Sheet>
  );
}
