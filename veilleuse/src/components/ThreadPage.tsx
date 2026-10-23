import { useMemo, useState } from 'preact/hooks';
import { formatClock, formatSpan } from '../lib/format';
import { feedGaps } from '../lib/summary';
import { TAGS, isFeed, type Entry } from '../model';
import { useDay } from '../useDay';
import { Composer } from './Composer';
import { DayStrip } from './DayStrip';
import { EntrySheet } from './EntrySheet';
import { nextFeedInfo } from './NextFeed';
import { EmptyDay, PageBottom, PageHeader } from './PageParts';
import { Emoji } from './Tag';

/**
 * Proposition 2 — « Fil » : la journée comme un fil du temps. L'heure à gauche,
 * les emojis toujours à la même place, et la prochaine tétée en tête du fil.
 */
export function ThreadPage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const day = useDay();
  const [editing, setEditing] = useState<Entry | null>(null);
  const gaps = useMemo(() => feedGaps(day.entries), [day.entries]);
  const next = day.isToday ? nextFeedInfo(day.next, day.now) : null;

  return (
    <>
      <PageHeader day={day} onOpenSettings={onOpenSettings} />
      <DayStrip {...day.strip} />
      <div class="counts" aria-label="Résumé de la journée">
        {TAGS.map((tag) => (
          <span key={tag} class={`count tone-${tag}`}>
            <Emoji tag={tag} />
            {day.summary[tag]}
          </span>
        ))}
      </div>

      <div class="thread" {...day.swipe}>
        <ol class="thread-list">
          {next && (
            <li class={`thread-item thread-next${next.late ? ' is-late' : ''}`}>
              <span class="thread-time">{next.time}</span>
              <span class="thread-dot" />
              <span class="thread-next-body">
                <strong>{next.late ? '⏰ Tétée en retard' : '⏰ Prochaine tétée'}</strong>
                <span>{next.late ? next.span : next.relative}</span>
              </span>
            </li>
          )}
          {day.list.map((entry) => {
            const gap = gaps.get(entry.id);
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  class={`thread-item${isFeed(entry) ? ' is-feed' : ''}`}
                  onClick={() => setEditing(entry)}
                >
                  <span class="thread-time">{formatClock(entry.at)}</span>
                  <span class="thread-dot" />
                  <span class="slots">
                    {TAGS.map((tag) => (
                      <span key={tag} class="slot">
                        {entry.tags.includes(tag) && <Emoji tag={tag} />}
                      </span>
                    ))}
                  </span>
                  <span class="thread-note">{gap !== undefined && `écart ${formatSpan(gap)}`}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {!day.list.length && <EmptyDay day={day} />}
      </div>

      <PageBottom day={day}>
        <Composer entries={day.entries} now={day.now} layout="cards" />
      </PageBottom>
      {editing && <EntrySheet entry={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
