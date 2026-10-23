import { useMemo, useState } from 'preact/hooks';
import { formatClock, formatSpan } from '../lib/format';
import { feedGaps, type DaySummary } from '../lib/summary';
import { TAGS, type Entry } from '../model';
import { useDay } from '../useDay';
import { Composer } from './Composer';
import { DayStrip } from './DayStrip';
import { EntrySheet } from './EntrySheet';
import { nextFeedInfo, type NextFeedInfo } from './NextFeed';
import { EmptyDay, PageBottom, PageHeader } from './PageParts';
import { Emoji } from './Tag';

const RING = 2 * Math.PI * 44;

/**
 * Proposition 3 — « Cadran » : la prochaine tétée en grand, avec un anneau qui se
 * remplit pendant les 2 h 30 ; la journée dessous, en liste sobre.
 */
export function DialPage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const day = useDay();
  const [editing, setEditing] = useState<Entry | null>(null);
  const gaps = useMemo(() => feedGaps(day.entries), [day.entries]);
  const next = nextFeedInfo(day.next, day.now);

  return (
    <>
      <PageHeader day={day} onOpenSettings={onOpenSettings} />
      <DayStrip {...day.strip} />
      <section class={`dial${next?.late ? ' is-late' : ''}`}>
        {day.isToday && (
          <div class="dial-ring" aria-hidden="true">
            <svg viewBox="0 0 100 100">
              <circle class="dial-track" cx="50" cy="50" r="44" />
              <circle class="dial-progress" cx="50" cy="50" r="44" stroke-dasharray={`${(next?.progress ?? 0) * RING} ${RING}`} />
            </svg>
            <span class="dial-center">
              <strong>{next?.time ?? '--:--'}</strong>
              <small>prochaine</small>
            </span>
          </div>
        )}
        <div class="dial-info">
          {day.isToday && <DialText next={next} />}
          <Counts summary={day.summary} />
        </div>
      </section>

      <div class="list-card" {...day.swipe}>
        {day.list.length ? (
          day.list.map((entry) => {
            const gap = gaps.get(entry.id);
            return (
              <button type="button" key={entry.id} class="list-row" onClick={() => setEditing(entry)}>
                <span class="list-time">{formatClock(entry.at)}</span>
                <span class="slots">
                  {TAGS.map((tag) => (
                    <span key={tag} class="slot">
                      {entry.tags.includes(tag) && <Emoji tag={tag} />}
                    </span>
                  ))}
                </span>
                <span class="list-note">{gap !== undefined && `écart ${formatSpan(gap)}`}</span>
              </button>
            );
          })
        ) : (
          <EmptyDay day={day} />
        )}
      </div>

      <PageBottom day={day}>
        <Composer entries={day.entries} now={day.now} layout="round" />
      </PageBottom>
      {editing && <EntrySheet entry={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function DialText({ next }: { next: NextFeedInfo | null }) {
  if (!next) return <p class="dial-hint">Cochez une tétée ou un biberon : l'heure de la prochaine s'affichera ici.</p>;
  return (
    <>
      <span class="dial-label">Prochaine tétée</span>
      <strong class="dial-in">{next.relative}</strong>
      <span class="dial-last">
        dernière {next.last}
      </span>
    </>
  );
}

function Counts({ summary }: { summary: DaySummary }) {
  return (
    <div class="dial-counts" aria-label="Résumé de la journée">
      {TAGS.map((tag) => (
        <span key={tag} class={`tone-${tag}`}>
          <Emoji tag={tag} size={17} />
          {summary[tag]}
        </span>
      ))}
    </div>
  );
}
