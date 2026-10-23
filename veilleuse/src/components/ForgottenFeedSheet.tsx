import { useState } from 'preact/hooks';
import { useNow } from '../hooks';
import { capitalize, formatAgo, formatClock, formatRelativeDay, sideName } from '../lib/format';
import { MINUTE, toDateTimeInput } from '../lib/time';
import { breastData, type Side } from '../model';
import { addEvent } from '../store';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

const AGO_MINUTES = [15, 30, 45, 60, 90, 120];

interface Props {
  side: Side;
  /** Valeur de départ du sélecteur « Autre heure… ». */
  defaultAt: number;
  onClose: () => void;
}

/**
 * Tétée oubliée en deux pressions : le sein, puis l'heure. La durée n'est pas
 * demandée et reste « non notée » (0) ; on peut la compléter en touchant l'entrée.
 */
export function ForgottenFeedSheet({ side, defaultAt, onClose }: Props) {
  const now = useNow(30_000);
  const [custom, setCustom] = useState<number | null>(null);
  const save = (at: number) => {
    addEvent(breastData([side], 0, 0), at, `Tétée sein ${sideName(side)} enregistrée`);
    onClose();
  };

  return (
    <Sheet
      title={`Oubli · sein ${sideName(side)}`}
      onClose={onClose}
      footer={
        custom !== null && (
          <button type="button" class="action action-primary action-giant" onClick={() => save(custom)}>
            <Icon name="check" size={28} />
            Enregistrer à {formatClock(custom)}
          </button>
        )
      }
    >
      <p class="hint">La tétée a commencé…</p>
      <div class="chips cols-2">
        {AGO_MINUTES.map((minutes) => {
          const at = now - minutes * MINUTE;
          return (
            <button type="button" key={minutes} class="chip chip-lg chip-ago" onClick={() => save(at)}>
              {capitalize(formatAgo(minutes * MINUTE))}
              <small>à {formatClock(at)}</small>
            </button>
          );
        })}
      </div>
      <label class={`chip chip-lg chip-picker chip-wide${custom !== null ? ' on' : ''}`}>
        {custom === null ? 'Autre heure…' : `${formatClock(custom)} · ${formatRelativeDay(custom, now)}`}
        <input
          type="datetime-local"
          value={toDateTimeInput(custom ?? defaultAt)}
          max={toDateTimeInput(now)}
          onChange={(e) => {
            const ts = new Date(e.currentTarget.value).getTime();
            if (!Number.isNaN(ts)) setCustom(Math.min(ts, Date.now()));
          }}
        />
      </label>
    </Sheet>
  );
}
