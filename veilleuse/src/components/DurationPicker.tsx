import { MINUTE } from '../lib/time';

const PRESETS = [5, 10, 15, 20, 30];
const MAX_MINUTES = 180;

interface Props {
  label: string;
  ms: number;
  onChange: (ms: number) => void;
}

/** Durée en minutes, réglable sans clavier : préréglages et ±1 min. */
export function DurationPicker({ label, ms, onChange }: Props) {
  const minutes = Math.round(ms / MINUTE);
  const set = (value: number) => onChange(Math.min(MAX_MINUTES, Math.max(0, value)) * MINUTE);
  return (
    <div class="field">
      <div class="duration-head">
        <span class="field-label">{label}</span>
        <div class="stepper stepper-sm">
          <button type="button" class="step-btn" onClick={() => set(minutes - 1)} aria-label="Moins 1 minute">
            −1
          </button>
          <output class="stepper-value">
            {minutes} <small>min</small>
          </output>
          <button type="button" class="step-btn" onClick={() => set(minutes + 1)} aria-label="Plus 1 minute">
            +1
          </button>
        </div>
      </div>
      <div class="chips cols-5" aria-label="Durée en minutes">
        {PRESETS.map((preset) => (
          <button
            type="button"
            key={preset}
            class={`chip${preset === minutes ? ' on' : ''}`}
            aria-pressed={preset === minutes}
            onClick={() => set(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}
