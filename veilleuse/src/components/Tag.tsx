import { TAG_LABELS, type Tag } from '../model';
import { Icon, type IconName } from './Icon';

const TAG_ICONS: Record<Tag, IconName> = { feed: 'breast', bottle: 'bottle', pee: 'pee', poop: 'poop' };

interface ButtonProps {
  tag: Tag;
  on: boolean;
  onClick: () => void;
  /** Petite ligne sous le libellé, ex. « il y a 2 h 10 ». */
  sub?: string;
}

/** Étiquette à cocher : on coche ce qui s'est passé, puis on valide. */
export function TagButton({ tag, on, onClick, sub }: ButtonProps) {
  return (
    <button type="button" class={`tag-btn tone-${tag}${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}>
      <Icon name={TAG_ICONS[tag]} size={26} />
      <span class="tag-text">
        <strong>{TAG_LABELS[tag]}</strong>
        {sub && <small>{sub}</small>}
      </span>
      <span class="tag-check" aria-hidden="true">
        {on && <Icon name="check" size={16} />}
      </span>
    </button>
  );
}

/** Version compacte (icône seule) pour les journées chargées ; la légende est dans le résumé. */
export function TagDot({ tag }: { tag: Tag }) {
  return (
    <span class={`tag-dot tone-${tag}`} role="img" aria-label={TAG_LABELS[tag]} title={TAG_LABELS[tag]}>
      <Icon name={TAG_ICONS[tag]} size={15} />
    </span>
  );
}

/** Étiquette affichée dans la liste du jour. */
export function TagPill({ tag }: { tag: Tag }) {
  return (
    <span class={`pill tone-${tag}`}>
      <Icon name={TAG_ICONS[tag]} size={15} />
      {TAG_LABELS[tag]}
    </span>
  );
}
