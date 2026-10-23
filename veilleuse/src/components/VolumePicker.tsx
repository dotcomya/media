import { BOTTLE_VOLUMES } from '../model';

/** Volume du biberon en un appui : le dernier volume donné est déjà sélectionné. */
export function VolumePicker({ ml, onChange }: { ml: number; onChange: (ml: number) => void }) {
  return (
    <div class="volumes" role="group" aria-label="Volume du biberon">
      {BOTTLE_VOLUMES.map((volume) => (
        <button
          type="button"
          key={volume}
          class={`chip chip-volume${volume === ml ? ' on' : ''}`}
          aria-pressed={volume === ml}
          onClick={() => onChange(volume)}
        >
          <strong>{volume}</strong>
          <small>ml</small>
        </button>
      ))}
    </div>
  );
}
