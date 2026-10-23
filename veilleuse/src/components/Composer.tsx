import { useState } from 'preact/hooks';
import { formatClock } from '../lib/format';
import { vibrate } from '../lib/haptics';
import { TAGS, type Tag } from '../model';
import { addEntry } from '../store';
import { Icon } from './Icon';
import { TagButton } from './Tag';

/** On coche ce qui vient de se passer, puis « Valider » ajoute une ligne horodatée. */
export function Composer({ now }: { now: number }) {
  const [selected, setSelected] = useState<Tag[]>([]);

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
      <div class="composer-tags">
        {TAGS.map((tag) => (
          <TagButton key={tag} tag={tag} shape="cell" on={selected.includes(tag)} onClick={() => toggle(tag)} />
        ))}
      </div>
      <button type="button" class="action action-primary action-validate" disabled={!selected.length} onClick={validate}>
        <Icon name="check" size={22} />
        {selected.length ? `Valider à ${formatClock(now)}` : 'Cochez, puis validez'}
      </button>
    </section>
  );
}
