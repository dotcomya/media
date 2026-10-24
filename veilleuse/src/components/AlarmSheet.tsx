import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ALARM_SHORTCUT, alarmUrl } from '../lib/alarm';
import { formatClock, formatSpan } from '../lib/format';
import { MINUTE } from '../lib/time';
import { updateSettings, useAppState } from '../store';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { N, ScreenDone, ScreenNew, ScreenOpen, ScreenRename, ScreenSearch, ScreenVariable } from './ShortcutScreens';

// On repasse souvent par l'app Raccourcis entre deux étapes : on retient où on en était.
const STEP_KEY = 'nous3.guideStep';

function savedStep(): number {
  try {
    return Number(localStorage.getItem(STEP_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveStep(step: number): void {
  try {
    localStorage.setItem(STEP_KEY, String(step));
  } catch {
    // Pas de stockage : on reprendra à la première étape.
  }
}

function CopyName() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ALARM_SHORTCUT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Presse-papiers refusé : le nom reste affiché en gras, à taper.
    }
  };
  return (
    <button type="button" class="action guide-btn" onClick={copy}>
      <Icon name={copied ? 'check' : 'copy'} size={20} />
      {copied ? 'Nom copié' : `Copier le nom « ${ALARM_SHORTCUT} »`}
    </button>
  );
}

/** Repli si la variable reste introuvable : une durée fixe, celle réglée entre deux repas. */
function FixedDuration() {
  const { feedIntervalMin } = useAppState().settings;
  return (
    <p class="guide-tip">
      Introuvable ? Tapez <strong>{feedIntervalMin}</strong> à la place : le réveil sonnera{' '}
      {formatSpan(feedIntervalMin * MINUTE)} après chaque saisie (un peu tard si vous notez un repas en retard).
    </p>
  );
}

interface Step {
  title: string;
  art: ComponentChildren;
  body: ComponentChildren;
}

const STEPS: Step[] = [
  {
    title: "Ouvrez l'app Raccourcis",
    art: <ScreenNew />,
    body: (
      <>
        <p class="guide-text">
          Touchez le bouton ci-dessous. Dans Raccourcis, touchez le <strong>+</strong> en haut à droite.
        </p>
        <a class="action guide-btn" href="shortcuts://">
          Ouvrir Raccourcis
        </a>
        <p class="guide-tip">Revenez ici après chaque étape : glissez le bas de l'écran vers la droite.</p>
      </>
    ),
  },
  {
    title: 'Donnez-lui son nom',
    art: <ScreenRename />,
    body: (
      <>
        <p class="guide-text">
          Copiez d'abord le nom avec le bouton ci-dessous. Puis, dans Raccourcis : <N n={1} /> touchez{' '}
          <strong>Nouveau raccourci</strong> en haut, <N n={2} /> <strong>Renommer</strong>. Effacez, collez, puis{' '}
          <strong>OK</strong>.
        </p>
        <CopyName />
        <p class="guide-tip">
          Le nom doit être exactement <strong>{ALARM_SHORTCUT}</strong>, avec les accents.
        </p>
      </>
    ),
  },
  {
    title: 'Ajoutez le minuteur',
    art: <ScreenSearch />,
    body: (
      <p class="guide-text">
        <N n={1} /> Touchez la barre de recherche en bas et tapez <strong>minuteur</strong>. <N n={2} /> Touchez{' '}
        <strong>Lancer un minuteur</strong>.
      </p>
    ),
  },
  {
    title: 'Réglez la durée',
    art: <ScreenVariable />,
    body: (
      <>
        <p class="guide-text">
          <N n={1} /> Touchez le mot gris <strong>Durée</strong>. Un clavier s'ouvre :{' '}
          <strong>ne tapez pas de chiffre</strong>. <N n={2} /> Faites glisser la barre juste au-dessus du clavier vers
          la gauche, et touchez <strong>Entrée du raccourci</strong>.
        </p>
        <FixedDuration />
      </>
    ),
  },
  {
    title: 'Vérifiez et enregistrez',
    art: <ScreenDone />,
    body: (
      <>
        <p class="guide-text">
          Le bloc doit afficher <strong>Entrée du raccourci</strong> et <strong>minute</strong>, en bleu. Touchez{' '}
          <strong>‹</strong> en haut à gauche (ou <strong>OK</strong>) : c'est enregistré.
        </p>
        <p class="guide-tip">Si un bloc « Recevoir… » est apparu au-dessus, laissez-le tel quel.</p>
      </>
    ),
  },
  {
    title: 'Essayez',
    art: <ScreenOpen />,
    body: (
      <>
        <p class="guide-text">
          Touchez <strong>Essayer</strong>, puis <strong>Ouvrir</strong> si l'iPhone le demande. Un minuteur
          d'1 minute démarre. Revenez ici : s'il sonne, c'est gagné.
        </p>
        <a class="action guide-btn" href={alarmUrl(Date.now() + MINUTE)}>
          <Icon name="alarm" size={20} />
          Essayer : sonne dans 1 min
        </a>
        <p class="guide-tip">
          Raccourcis ne trouve pas le raccourci ? Le nom n'est pas exactement le même : revoyez l'étape 2.
        </p>
      </>
    ),
  },
];

/**
 * Premier réveil : guide pas à pas pour créer, une fois, le raccourci qui démarre
 * le minuteur de l'iPhone. Les fois suivantes, l'app le lance directement.
 */
export function AlarmSheet({ at, onClose }: { at: number; onClose: () => void }) {
  const [step, setStep] = useState(() => Math.min(savedStep(), STEPS.length - 1));
  useEffect(() => saveStep(step), [step]);
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  // Après un repas noté en retard, le prochain peut être déjà passé : pas de minuteur alors.
  const upcoming = at > Date.now();

  const finish = () => {
    updateSettings(upcoming ? { alarmReady: true, timerUntil: at } : { alarmReady: true });
    saveStep(0);
    onClose();
  };

  const back =
    step === 0 ? (
      <button type="button" class="action" onClick={onClose}>
        Plus tard
      </button>
    ) : (
      <button type="button" class="action" onClick={() => setStep(step - 1)}>
        <Icon name="back" size={20} />
        Retour
      </button>
    );

  const forward = !last ? (
    <button type="button" class="action action-primary" onClick={() => setStep(step + 1)}>
      Suivant
      <Icon name="next" size={20} />
    </button>
  ) : upcoming ? (
    <a class="action action-primary action-stack" href={alarmUrl(at)} onClick={finish}>
      Terminé
      <small>réveil à {formatClock(at)}</small>
    </a>
  ) : (
    <button type="button" class="action action-primary" onClick={finish}>
      Terminé
    </button>
  );

  return (
    <Sheet
      title="Créer le réveil"
      onClose={onClose}
      footer={
        <>
          {back}
          {forward}
        </>
      }
    >
      <div class="guide-progress">
        <span>
          Étape {step + 1} sur {STEPS.length}
        </span>
        <span class="guide-dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <i key={i} class={i <= step ? 'on' : undefined} />
          ))}
        </span>
      </div>
      {step === 0 && (
        <p class="guide-tip guide-intro">
          Une seule fois, 2 minutes. Ensuite, chaque tétée ou biberon fait sonner l'iPhone à l'heure du prochain repas,
          même en mode silencieux, sans laisser d'alarmes en trop.
        </p>
      )}
      <h3 class="guide-title">{current.title}</h3>
      {current.art}
      {current.body}
    </Sheet>
  );
}
