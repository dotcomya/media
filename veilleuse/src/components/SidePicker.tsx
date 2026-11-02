import { vibrate } from '../lib/haptics';
import { SIDES, SIDE_LABELS, sortSides, type Side } from '../model';

/** Sein gauche, sein droit : l'un, l'autre ou les deux (facultatif). */
export function SidePicker({ sides, onChange }: { sides: Side[]; onChange: (sides: Side[]) => void }) {
  return (
    <div class="sides" role="group" aria-label="Sein">
      {SIDES.map((side) => {
        const on = sides.includes(side);
        return (
          <button
            type="button"
            key={side}
            class={`side${on ? ' on' : ''}`}
            aria-pressed={on}
            onClick={() => {
              vibrate(10);
              onChange(on ? sides.filter((s) => s !== side) : sortSides([...sides, side]));
            }}
          >
            {SIDE_LABELS[side]}
          </button>
        );
      })}
    </div>
  );
}
