/** Durée d'une tétée au curseur, en minutes ; 0 = non notée. */
const MAX_MIN = 90;

export function DurationPicker({ minutes, onChange }: { minutes: number; onChange: (minutes: number) => void }) {
  return (
    <label class="volume tone-feed">
      <span class="volume-value">{minutes ? <><strong>{minutes}</strong> min</> : 'Durée ?'}</span>
      <input
        id="feed-minutes"
        type="range"
        min={0}
        max={MAX_MIN}
        step={1}
        value={minutes}
        aria-label="Durée de la tétée, en minutes"
        style={{ '--fill': `${(minutes / MAX_MIN) * 100}%` }}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
      />
    </label>
  );
}
