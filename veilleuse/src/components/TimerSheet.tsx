import { alarmUrl } from '../lib/alarm';
import { formatClock } from '../lib/format';
import { updateSettings } from '../store';
import { Sheet } from './Sheet';

const pad = (n: number) => String(n).padStart(2, '0');

/** Temps restant comme l'affiche un minuteur de l'iPhone : « 23:10 » ou « 2:30:00 ». */
function countdown(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const rest = `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return h ? `${h}:${rest}` : rest;
}

/** Les deux minuteurs sur l'écran verrouillé ; la croix de celui à arrêter est entourée. */
function LockScreen({ stop, keep }: { stop: number; keep: number }) {
  const now = Date.now();
  const timer = (until: number, cancel: boolean) => (
    <div class="ios-live" key={until}>
      <span class="ios-live-icon">⏱</span>
      <span class="ios-live-time">{countdown(until - now)}</span>
      <span class="ios-live-btn">⏸</span>
      <span class={`ios-live-btn${cancel ? ' tap' : ''}`}>✕</span>
    </div>
  );
  // Dans l'ordre où l'iPhone les range : celui qui sonne le plus tôt en haut.
  const [first, second] = stop < keep ? [stop, keep] : [keep, stop];
  return (
    <div class="ios ios-lock" aria-hidden="true">
      {timer(first, first === stop)}
      {timer(second, second === stop)}
    </div>
  );
}

/**
 * Un minuteur lancé plus tôt tourne encore : l'iPhone ne laisse pas une app l'arrêter.
 * Avant d'en lancer un nouveau, on montre comment arrêter l'ancien.
 */
export function TimerSheet({ previous, at, onClose }: { previous: number; at: number; onClose: () => void }) {
  const earlier = previous < at;
  return (
    <Sheet
      title="Minuteur déjà en cours"
      onClose={onClose}
      footer={
        <>
          <button type="button" class="action" onClick={onClose}>
            Ne pas lancer
          </button>
          <a
            class="action action-primary action-stack"
            href={alarmUrl(at)}
            onClick={() => {
              updateSettings({ timerUntil: at });
              onClose();
            }}
          >
            Nouveau réveil
            <small>à {formatClock(at)}</small>
          </a>
        </>
      }
    >
      <p class="guide-text">
        Le minuteur de <strong>{formatClock(previous)}</strong> sonnera quand même : l'iPhone ne laisse pas Nous 3
        l'arrêter.
      </p>
      <LockScreen stop={previous} keep={at} />
      <p class="guide-text">
        Après avoir lancé le nouveau, allumez l'écran verrouillé et touchez <strong>✕</strong> sur le minuteur qui
        affiche <strong>{earlier ? 'le moins' : 'le plus'} de temps</strong> : c'est l'ancien.
      </p>
      <p class="guide-tip">
        Autre possibilité : app Horloge, onglet Minuteurs.
      </p>
    </Sheet>
  );
}
