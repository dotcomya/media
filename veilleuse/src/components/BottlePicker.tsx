const PRESETS = [30, 60, 90, 120, 150, 180];
const STEP = 10;
const MIN = 10;
const MAX = 400;

interface Props {
  ml: number;
  onChange: (ml: number) => void;
}

export function BottlePicker({ ml, onChange }: Props) {
  const set = (value: number) => onChange(Math.min(MAX, Math.max(MIN, value)));
  return (
    <div class="bottle-picker">
      <div class="stepper">
        <button type="button" class="step-btn" onClick={() => set(ml - STEP)} aria-label="Moins 10 ml">
          −10
        </button>
        <output class="stepper-value">
          {ml} <small>ml</small>
        </output>
        <button type="button" class="step-btn" onClick={() => set(ml + STEP)} aria-label="Plus 10 ml">
          +10
        </button>
      </div>
      <div class="chips cols-3">
        {PRESETS.map((preset) => (
          <button
            type="button"
            key={preset}
            class={`chip chip-lg${preset === ml ? ' on' : ''}`}
            aria-pressed={preset === ml}
            onClick={() => set(preset)}
          >
            {preset} ml
          </button>
        ))}
      </div>
    </div>
  );
}
