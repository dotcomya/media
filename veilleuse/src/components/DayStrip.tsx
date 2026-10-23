import { useLayoutEffect, useRef } from 'preact/hooks';
import { DAY, addDays } from '../lib/time';

const MIN_DAYS = 7;
const MAX_DAYS = 60;

interface Props {
  today: number;
  selected: number;
  /** Premier jour qui contient une saisie. */
  oldest: number;
  /** Jours qui contiennent au moins une saisie (minuit, en ms). */
  marked: Set<number>;
  onSelect: (day: number) => void;
}

/** Bandeau des jours, du plus ancien à aujourd'hui (à droite), à faire défiler du doigt. */
export function DayStrip({ today, selected, oldest, marked, onSelect }: Props) {
  const count = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round((today - oldest) / DAY) + 1));
  const days = Array.from({ length: count }, (_, i) => addDays(today, i - count + 1));
  const selectedRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [selected]);

  const label = (day: number) =>
    day === today
      ? 'Auj.'
      : day === addDays(today, -1)
        ? 'Hier'
        : new Date(day).toLocaleDateString('fr-FR', { weekday: 'short' });

  return (
    <nav class="strip" aria-label="Jours">
      {days.map((day) => (
        <button
          type="button"
          key={day}
          ref={day === selected ? selectedRef : undefined}
          class={`strip-day${day === selected ? ' on' : ''}${day === today ? ' is-today' : ''}`}
          aria-current={day === selected ? 'date' : undefined}
          onClick={() => onSelect(day)}
        >
          <span>{label(day)}</span>
          <strong>{new Date(day).getDate()}</strong>
          <i class={`dot${marked.has(day) ? '' : ' is-empty'}`} />
        </button>
      ))}
    </nav>
  );
}
