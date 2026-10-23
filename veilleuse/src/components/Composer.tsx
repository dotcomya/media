import { useMemo, useState } from 'preact/hooks';
import { formatAgo, formatClock } from '../lib/format';
import { vibrate } from '../lib/haptics';
import { lastByTag } from '../lib/summary';
import { TAGS, type Entry, type Tag } from '../model';
import { addEntry } from '../store';
import { Icon } from './Icon';
import { TagButton } from './Tag';

/** On coche ce qui vient de se passer (tétée, pipi…), puis « Valider » crée une saisie horodatée. */
export function Composer({ entries, now }: { entries: Entry[]; now: number }) {
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
    <section class="composer" aria-label="Ajouter">
      <div class="tag-grid">
        {TAGS.map((tag) => {
          const at = last[tag];
          return (
            <TagButton
              key={tag}
              tag={tag}
              on={selected.includes(tag)}
              onClick={() => toggle(tag)}
              sub={at === undefined ? 'pas encore' : formatAgo(now - at)}
            />
          );
        })}
      </div>
      <button type="button" class="action action-primary action-validate" disabled={!selected.length} onClick={validate}>
        <Icon name="check" size={24} />
        {selected.length ? `Valider · ${formatClock(now)}` : 'Cochez, puis validez'}
      </button>
    </section>
  );
}
