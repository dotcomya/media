import { useEffect, useState } from 'preact/hooks';
import { formatClock } from '../lib/format';
import { HOUR } from '../lib/time';
import type { ActiveFeed, Entry } from '../model';
import { cancelFeed, finishFeed, setFeedSides } from '../store';
import { Icon } from './Icon';
import { SidePicker } from './SidePicker';
import { Emoji } from './Tag';

const pad = (n: number) => String(n).padStart(2, '0');

/** « 12:34 », puis « 1:02:15 » au-delà d'une heure. */
function stopwatch(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const rest = `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return h ? `${h}:${rest}` : rest;
}

/**
 * Tétée chronométrée : remplace la zone de saisie tant qu'elle dure. Le temps est calculé
 * depuis l'heure de début enregistrée : il reste juste si l'app est fermée puis rouverte.
 */
export function FeedTimer({ active, onLogged }: { active: ActiveFeed; onLogged: (entry: Entry) => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = now - active.startedAt;

  return (
    <section class="composer feed-timer" aria-label="Tétée en cours">
      <div class="feed-timer-main">
        <div class="feed-timer-clock">
          <small>
            <Emoji tag="feed" size={15} /> Tétée depuis {formatClock(active.startedAt)}
          </small>
          <strong role="timer">{stopwatch(elapsed)}</strong>
        </div>
        <SidePicker sides={active.sides} onChange={setFeedSides} />
      </div>
      {elapsed > HOUR && <p class="hint feed-timer-hint">Plus d'une heure : oubli ? Terminez, puis touchez la ligne pour corriger la durée.</p>}
      <div class="composer-actions">
        <button type="button" class="action feed-timer-cancel" onClick={cancelFeed}>
          Annuler
        </button>
        <button
          type="button"
          class="action action-primary action-validate"
          onClick={() => {
            const entry = finishFeed();
            if (entry) onLogged(entry);
          }}
        >
          <Icon name="stop" size={20} />
          Terminer
        </button>
      </div>
    </section>
  );
}
