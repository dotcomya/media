import { useState } from 'preact/hooks';
import { formatClock } from '../lib/format';
import { vibrate } from '../lib/haptics';
import { TAGS, type Entry, type Tag } from '../model';
import { addEntry, useAppState } from '../store';
import { Icon } from './Icon';
import { TagButton } from './Tag';
import { VolumePicker } from './VolumePicker';

interface Props {
  now: number;
  /** Appelé juste après l'ajout, dans le même appui (pour lancer l'alarme). */
  onLogged: (entry: Entry) => void;
}

/** On coche ce qui vient de se passer (et le volume d'un biberon), puis « Valider » ajoute la ligne. */
export function Composer({ now, onLogged }: Props) {
  const { settings } = useAppState();
  const [selected, setSelected] = useState<Tag[]>([]);
  const [ml, setMl] = useState(settings.lastBottleMl);
  const bottle = selected.includes('bottle');

  const toggle = (tag: Tag) => {
    vibrate(10);
    if (tag === 'bottle' && !bottle) setMl(settings.lastBottleMl);
    setSelected((tags) => (tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]));
  };
  const validate = () => {
    const entry = addEntry(selected, bottle ? ml : undefined);
    setSelected([]);
    onLogged(entry);
  };

  return (
    <section class="composer" aria-label="Ajouter">
      <div class="composer-tags">
        {TAGS.map((tag) => (
          <TagButton key={tag} tag={tag} shape="cell" on={selected.includes(tag)} onClick={() => toggle(tag)} />
        ))}
      </div>
      {bottle && <VolumePicker ml={ml} onChange={setMl} />}
      <button type="button" class="action action-primary action-validate" disabled={!selected.length} onClick={validate}>
        <Icon name="check" size={22} />
        {selected.length ? `Valider à ${formatClock(now)}${bottle ? ` · ${ml} ml` : ''}` : 'Cochez, puis validez'}
      </button>
    </section>
  );
}
