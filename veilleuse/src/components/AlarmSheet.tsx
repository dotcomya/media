import { ALARM_SHORTCUT, alarmUrl } from '../lib/alarm';
import { formatClock } from '../lib/format';
import { updateSettings } from '../store';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

/**
 * Premier appui sur « Alarme » : explique comment créer, une fois, le raccourci
 * qui règle l'alarme de l'iPhone. Les fois suivantes, le bouton le lance directement.
 */
export function AlarmSheet({ at, onClose }: { at: number; onClose: () => void }) {
  const time = formatClock(at);
  return (
    <Sheet
      title={`Alarme à ${time}`}
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
          C'est fait : alarme à {time}
        </a>
        </>
      }
    >
      <p class="hint">
        L'alarme de l'iPhone sonne fort, même en mode silencieux. Pour que Veilleuse puisse la régler, créez une seule
        fois ce raccourci (1 minute) :
      </p>
      <ol class="steps">
        <li>
          Ouvrez l'app <strong>Raccourcis</strong> et touchez <strong>+</strong>.
        </li>
        <li>
          Touchez le nom en haut et appelez le raccourci exactement <strong>{ALARM_SHORTCUT}</strong>.
        </li>
        <li>
          Touchez <strong>Ajouter une action</strong>, cherchez <strong>dates</strong> et choisissez l'action qui obtient
          les dates à partir de l'entrée. Réglez son entrée sur <strong>Entrée du raccourci</strong>.
        </li>
        <li>
          Ajoutez une deuxième action : cherchez <strong>alarme</strong> et choisissez <strong>Créer une alarme</strong>.
          Pour l'heure, choisissez la variable <strong>Dates</strong> ; comme libellé, écrivez <strong>Tétée</strong>.
        </li>
        <li>
          Touchez <strong>OK</strong>, revenez ici et touchez le bouton ci-dessous.
        </li>
      </ol>
      <p class="hint">
        Ensuite, c'est automatique : à chaque tétée ou biberon validé, l'iPhone ouvre Raccourcis (confirmez la première
        fois) et l'alarme du prochain repas apparaît dans Horloge. Réglages permet de couper l'alarme automatique.
      </p>
    </Sheet>
  );
}
