import { useState } from 'preact/hooks';
import { formatClock } from '../lib/format';
import { TAGS, type Entry } from '../model';
import { useDay } from '../useDay';
import { Composer } from './Composer';
import { DayStrip } from './DayStrip';
import { EntrySheet } from './EntrySheet';
import { NextFeedBanner } from './NextFeed';
import { EmptyDay, PageBottom, PageHeader } from './PageParts';
import { Emoji } from './Tag';

/**
 * Proposition 1 — « Tableau » : un carnet de suivi. Une colonne par étiquette,
 * totaux du jour en tête, et les cases à cocher alignées sous les mêmes colonnes.
 */
export function TablePage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const day = useDay();
  const [editing, setEditing] = useState<Entry | null>(null);

  return (
    <>
      <PageHeader day={day} onOpenSettings={onOpenSettings} />
      <DayStrip {...day.strip} />
      {day.isToday && <NextFeedBanner next={day.next} now={day.now} />}

      <div class="table" {...day.swipe}>
        <div class="table-row table-head">
          <span class="table-time">Heure</span>
          {TAGS.map((tag) => (
            <span key={tag} class={`table-cell tone-${tag}`}>
              <Emoji tag={tag} />
              <strong>{day.summary[tag]}</strong>
            </span>
          ))}
        </div>
        <div class="table-body">
          {day.list.length ? (
            day.list.map((entry) => (
              <button type="button" key={entry.id} class="table-row" onClick={() => setEditing(entry)}>
                <span class="table-time">{formatClock(entry.at)}</span>
                {TAGS.map((tag) => (
                  <span key={tag} class="table-cell">
                    {entry.tags.includes(tag) ? <Emoji tag={tag} /> : <i class="table-empty" />}
                  </span>
                ))}
              </button>
            ))
          ) : (
            <EmptyDay day={day} />
          )}
        </div>
      </div>

      <PageBottom day={day}>
        <Composer entries={day.entries} now={day.now} layout="columns" />
      </PageBottom>
      {editing && <EntrySheet entry={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
