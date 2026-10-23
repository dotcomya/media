import { useNow } from '../hooks';
import { formatAgo, formatClock, formatRelativeDay } from '../lib/format';
import { HOUR, MINUTE, toDateTimeInput } from '../lib/time';

const SHIFTS = [
  { label: '−5 min', ms: 5 * MINUTE },
  { label: '−15 min', ms: 15 * MINUTE },
  { label: '−30 min', ms: 30 * MINUTE },
  { label: '−1 h', ms: HOUR },
];

interface Props {
  label: string;
  value: number;
  onChange: (ts: number) => void;
}

/**
 * Choix de l'heure par puces. Les décalages s'additionnent (−15 puis −15 = −30)
 * et l'heure obtenue est affichée en grand. Le sélecteur natif sert de dernier recours.
 */
export function TimeChips({ label, value, onChange }: Props) {
  const now = useNow(30_000);
  const set = (ts: number) => onChange(Math.min(ts, Date.now()));
  return (
    <div class="field">
      <span class="field-label">{label}</span>
      <div class="time-display">
        <strong>{formatClock(value)}</strong>
        <span>
          {formatRelativeDay(value, now)} · {formatAgo(now - value)}
        </span>
      </div>
      <div class="chips cols-3">
        <button type="button" class="chip" onClick={() => set(Date.now())}>
          Maintenant
        </button>
        {SHIFTS.map((shift) => (
          <button type="button" key={shift.label} class="chip" onClick={() => set(value - shift.ms)}>
            {shift.label}
          </button>
        ))}
        <label class="chip chip-picker">
          Choisir…
          <input
            type="datetime-local"
            value={toDateTimeInput(value)}
            max={toDateTimeInput(now)}
            onChange={(e) => {
              const ts = new Date(e.currentTarget.value).getTime();
              if (!Number.isNaN(ts)) set(ts);
            }}
          />
        </label>
      </div>
    </div>
  );
}
