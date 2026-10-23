import { useMemo, useState } from 'preact/hooks';
import { formatAgo, formatClock } from '../lib/format';
import { vibrate } from '../lib/haptics';
import { lastByTag } from '../lib/summary';
import { TAGS, type Entry, type Tag } from '../model';
import { addEntry } from '../store';
import { Icon } from './Icon';
import { TagButton } from './Tag';

interface Props {
  entries: Entry[];
  now: number;
  /**
   * columns : 4 cases alignées sous les colonnes du tableau (proposition 1) ;
   * cards : 2 × 2 cartes avec « il y a… » (proposition 2) ;
   * round : 4 ronds sur une ligne (proposition 3).
   */
  layout: 'columns' | 'cards' | 'round';
}

/** On coche ce qui vient de se passer, puis « Valider » crée une saisie horodatée. */
export function Composer({ entries, now, layout }: Props) {
  const [selected, setSelected] = useState<Tag[]>([]);
  const last = useMemo(() => lastByTag(entries), [entries]);

  const toggle = (tag: Tag) => {
    vibrate(10);
    setSelected((tags) => (tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]));
  };
  const validate = () => {
    addEntry(selected);
    setSelected([]);
  };

  return (
    <section class={`composer composer-${layout}`} aria-label="Ajouter">
      <div class="composer-tags">
        {layout === 'columns' && (
          <div class="composer-now">
            <strong>{formatClock(now)}</strong>
            <small>maintenant</small>
          </div>
        )}
        {TAGS.map((tag) => {
          const at = last[tag];
          return (
            <TagButton
              key={tag}
              tag={tag}
              shape={layout === 'cards' ? 'card' : layout === 'columns' ? 'cell' : 'round'}
              on={selected.includes(tag)}
              onClick={() => toggle(tag)}
              sub={layout === 'cards' ? (at === undefined ? 'pas encore' : formatAgo(now - at)) : undefined}
            />
          );
        })}
      </div>
      <button type="button" class="action action-primary action-validate" disabled={!selected.length} onClick={validate}>
        <Icon name="check" size={22} />
        {selected.length ? `Valider à ${formatClock(now)}` : 'Cochez, puis validez'}
      </button>
    </section>
  );
}
