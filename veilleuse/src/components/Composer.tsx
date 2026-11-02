import { useState } from 'preact/hooks';
import { formatClock } from '../lib/format';
import { vibrate } from '../lib/haptics';
import { TAGS, type Entry, type Side, type Tag } from '../model';
import { addEntry, startFeed, useAppState } from '../store';
import { FeedTimer } from './FeedTimer';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { SidePicker } from './SidePicker';
import { TagButton } from './Tag';
import { TimeChips } from './TimeChips';
import { VolumePicker } from './VolumePicker';

interface Props {
  /** Appelé juste après l'ajout, dans le même appui (pour lancer le réveil). */
  onLogged: (entry: Entry) => void;
}

/**
 * On coche ce qui vient de se passer (le volume d'un biberon, le sein d'une tétée), puis
 * « Valider » ajoute la ligne, à l'heure actuelle ou à l'heure choisie dans le petit encart
 * « Heure ». Pour une tétée, « Chrono » lance plutôt un chronomètre jusqu'à « Terminer ».
 */
export function Composer({ onLogged }: Props) {
  const { settings } = useAppState();
  const [selected, setSelected] = useState<Tag[]>([]);
  const [ml, setMl] = useState(settings.lastBottleMl);
  // Heure choisie pour une saisie en retard ; null = maintenant.
  const [at, setAt] = useState<number | null>(null);
  const [choosingTime, setChoosingTime] = useState(false);
  const [sides, setSides] = useState<Side[]>([]);
  const bottle = selected.includes('bottle');
  const feed = selected.includes('feed');

  const toggle = (tag: Tag) => {
    vibrate(10);
    if (tag === 'bottle' && !bottle) setMl(settings.lastBottleMl);
    if (tag === 'feed') setSides([]);
    setSelected((tags) => (tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag]));
  };
  const reset = () => {
    setSelected([]);
    setSides([]);
    setAt(null);
  };
  const validate = () => {
    const entry = addEntry(selected, { ml: bottle ? ml : undefined, sides: feed ? sides : undefined }, at ?? Date.now());
    reset();
    onLogged(entry);
  };
  // Le chrono part de l'heure choisie : une tétée commencée il y a 5 min affiche déjà 05:00.
  const chrono = () => {
    startFeed(selected, sides, at ?? Date.now());
    reset();
  };

  if (settings.activeFeed) return <FeedTimer active={settings.activeFeed} onLogged={onLogged} />;

  return (
    <section class="composer" aria-label="Ajouter">
      <div class="composer-tags">
        {TAGS.map((tag) => (
          <TagButton key={tag} tag={tag} shape="cell" on={selected.includes(tag)} onClick={() => toggle(tag)} />
        ))}
      </div>
      {feed && (
        <div class="feed-row">
          <SidePicker sides={sides} onChange={setSides} />
          <button type="button" class="chrono" onClick={chrono}>
            <Icon name="play" size={18} />
            Chrono
          </button>
        </div>
      )}
      {bottle && <VolumePicker ml={ml} onChange={setMl} />}
      <div class="composer-actions">
        <button type="button" class={`when${at === null ? '' : ' is-set'}`} onClick={() => setChoosingTime(true)}>
          <small>{feed ? 'Début' : 'Heure'}</small>
          <strong>{at === null ? 'Maintenant' : formatClock(at)}</strong>
        </button>
        <button type="button" class="action action-primary action-validate" disabled={!selected.length} onClick={validate}>
          <Icon name="check" size={22} />
          {selected.length ? `Valider${bottle ? ` · ${ml} ml` : ''}` : 'Cochez, puis validez'}
        </button>
      </div>
      {choosingTime && (
        <Sheet
          title={feed ? 'Début de la tétée' : 'Heure de la saisie'}
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
