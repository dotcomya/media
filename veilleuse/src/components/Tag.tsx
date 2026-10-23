import { TAG_EMOJI, TAG_LABELS, type Tag } from '../model';
import { Icon } from './Icon';

/** Emoji d'une étiquette, lu par les lecteurs d'écran sous son nom. */
export function Emoji({ tag, size }: { tag: Tag; size?: number }) {
  return (
    <span class="emoji" role="img" aria-label={TAG_LABELS[tag]} style={size ? { fontSize: `${size}px` } : undefined}>
      {TAG_EMOJI[tag]}
    </span>
  );
}

interface ButtonProps {
  tag: Tag;
  on: boolean;
  onClick: () => void;
  /** Petite ligne sous le libellé, ex. « il y a 2 h 10 ». */
  sub?: string;
  /** Forme : carte (emoji à gauche), case (emoji au-dessus) ou rond. */
  shape?: 'card' | 'cell' | 'round';
}

/** Étiquette à cocher : on coche ce qui s'est passé, puis on valide. */
export function TagButton({ tag, on, onClick, sub, shape = 'card' }: ButtonProps) {
  return (
    <button
      type="button"
      class={`tag-btn tag-${shape} tone-${tag}${on ? ' on' : ''}`}
      aria-pressed={on}
      aria-label={TAG_LABELS[tag]}
      onClick={onClick}
    >
      <span class="tag-emoji" aria-hidden="true">
        {TAG_EMOJI[tag]}
      </span>
      <span class="tag-text" aria-hidden="true">
        <strong>{TAG_LABELS[tag]}</strong>
        {sub && <small>{sub}</small>}
      </span>
      <span class="tag-check" aria-hidden="true">
        {on && <Icon name="check" size={shape === 'card' ? 16 : 12} />}
      </span>
    </button>
  );
}
