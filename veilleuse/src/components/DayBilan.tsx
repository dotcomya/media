import { plural } from '../lib/share';
import type { DayStats } from '../lib/summary';
import { TAGS, TAG_LABELS } from '../model';
import { Icon } from './Icon';
import { Emoji } from './Tag';

/** Le bilan du jour affiché, d'un coup d'œil ; un appui ouvre les 7 derniers jours. */
export function DayBilan({ stats, onOpen }: { stats: DayStats; onOpen: () => void }) {
  const spoken = TAGS.map((tag) => plural(stats.counts[tag], TAG_LABELS[tag].toLowerCase())).join(', ');
  return (
    <button type="button" class="bilan" aria-label={`Bilan : ${spoken}. Voir les 7 derniers jours`} onClick={onOpen}>
      {TAGS.map((tag) => (
        <span key={tag} class={`bilan-item${stats.counts[tag] ? '' : ' is-zero'}`} aria-hidden="true">
          <Emoji tag={tag} size={14} />
          {stats.counts[tag]}
          {tag === 'bottle' && stats.ml > 0 && <small>{stats.ml} ml</small>}
        </span>
      ))}
      <Icon name="next" size={14} />
    </button>
  );
}
