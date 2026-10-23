import { BOTTLE_ML } from '../model';

/** Volume du biberon au curseur, de 10 en 10 ml ; le dernier volume donné est déjà réglé. */
export function VolumePicker({ ml, onChange }: { ml: number; onChange: (ml: number) => void }) {
  const fill = ((ml - BOTTLE_ML.min) / (BOTTLE_ML.max - BOTTLE_ML.min)) * 100;
  return (
    <label class="volume">
      <span class="volume-value">
        <strong>{ml}</strong> ml
      </span>
      <input
        id="bottle-ml"
        type="range"
        min={BOTTLE_ML.min}
        max={BOTTLE_ML.max}
        step={BOTTLE_ML.step}
        value={ml}
        aria-label="Volume du biberon, en ml"
        style={{ '--fill': `${fill}%` }}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
      />
    </label>
  );
}
