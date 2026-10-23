import { useState } from 'preact/hooks';
import { formatClock } from '../lib/format';
import { vibrate } from '../lib/haptics';
import { TAGS, type Entry, type Tag } from '../model';
import { addEntry, useAppState } from '../store';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { TagButton } from './Tag';
import { TimeChips } from './TimeChips';
import { VolumePicker } from './VolumePicker';

interface Props {
  /** Appelé juste après l'ajout, dans le même appui (pour lancer le réveil). */
  onLogged: (entry: Entry) => void;
}

/**
 * On coche ce qui vient de se passer (et le volume d'un biberon), puis « Valider » ajoute
 * la ligne, à l'heure actuelle ou à l'heure choisie dans le petit encart « Heure ».
 */
export function Composer({ onLogged }: Props) {
  const { settings } = useAppState();
  const [selected, setSelected] = useState<Tag[]>([]);
  const [ml, setMl] = useState(settings.lastBottleMl);
  // Heure choisie pour une saisie en retard ; null = maintenant.
  const [at, setAt] = useState<number | null>(null);
  const [choosingTime, setChoosingTime] = useState(false);
  const bottle = selected.includes('bottle');

  const toggle = (tag: Tag) => {
    vibrate(10);
    if (tag === 'bottle' && !bottle) setMl(settings.lastBottleMl);
    setSelected((tags) => (tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]));
  };
  const validate = () => {
    const entry = addEntry(selected, bottle ? ml : undefined, at ?? Date.now());
    setSelected([]);
    setAt(null);
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
      <div class="composer-actions">
        <button type="button" class={`when${at === null ? '' : ' is-set'}`} onClick={() => setChoosingTime(true)}>
          <small>Heure</small>
          <strong>{at === null ? 'Maintenant' : formatClock(at)}</strong>
        </button>
        <button type="button" class="action action-primary action-validate" disabled={!selected.length} onClick={validate}>
          <Icon name="check" size={22} />
          {selected.length ? `Valider${bottle ? ` · ${ml} ml` : ''}` : 'Cochez, puis validez'}
        </button>
      </div>
      {choosingTime && (
        <Sheet
          title="Heure de la saisie"
          onClose={() => setChoosingTime(false)}
          footer={
            <button type="button" class="action action-primary" onClick={() => setChoosingTime(false)}>
              <Icon name="check" size={22} />
              OK
            </button>
          }
        >
          <TimeChips label="C'était à" value={at ?? Date.now()} onChange={(ts) => setAt(Date.now() - ts < 60_000 ? null : ts)} />
        </Sheet>
      )}
    </section>
  );
}
