import { useMemo, useState } from 'preact/hooks';
import { alarmUrl } from '../lib/alarm';
import { formatClock, formatIn, formatSpan } from '../lib/format';
import { nextFeedByEntry } from '../lib/summary';
import { TAGS, type Entry } from '../model';
import { useAppState } from '../store';
import { useDay } from '../useDay';
import { AlarmSheet } from './AlarmSheet';
import { Composer } from './Composer';
import { DayStrip } from './DayStrip';
import { EntrySheet } from './EntrySheet';
import { Icon } from './Icon';
import { Emoji } from './Tag';
import { ToastSlot } from './Toast';

/**
 * Une ligne = un moment avec bébé : l'heure, ce qui s'est passé, et l'heure du
 * prochain repas à ce moment-là (dernière tétée ou dernier biberon + 2 h 30).
 */
export function DayPage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const day = useDay();
  const { settings } = useAppState();
  const [editing, setEditing] = useState<Entry | null>(null);
  const [alarmGuide, setAlarmGuide] = useState(false);
  const nextById = useMemo(() => nextFeedByEntry(day.entries), [day.entries]);
  // La ligne la plus récente, tous jours confondus : c'est elle qui dit quand nourrir bébé maintenant.
  const latestId = useMemo(
    () => day.entries.reduce<Entry | null>((latest, e) => (!latest || e.at > latest.at ? e : latest), null)?.id,
    [day.entries],
  );
  // Heure du prochain repas maintenant ; l'alarme n'a de sens que si elle est à venir.
  const nextAt = latestId ? nextById.get(latestId) : undefined;
  const alarmAt = nextAt !== undefined && nextAt > day.now ? nextAt : undefined;

  return (
    <>
      <header class="topbar">
        <div class="topbar-title">
          <h1>{day.title}</h1>
          {day.subtitle && <p class="topbar-sub">{day.subtitle}</p>}
        </div>
        {alarmAt !== undefined &&
          (settings.alarmReady ? (
            <a class="head-btn head-alarm" href={alarmUrl(alarmAt)}>
              <Icon name="alarm" size={20} />
              Alarme {formatClock(alarmAt)}
            </a>
          ) : (
            <button type="button" class="head-btn head-alarm" onClick={() => setAlarmGuide(true)}>
              <Icon name="alarm" size={20} />
              Alarme {formatClock(alarmAt)}
            </button>
          ))}
        <button type="button" class="head-btn" onClick={onOpenSettings}>
          <Icon name="settings" size={20} />
          Réglages
        </button>
      </header>

      <DayStrip {...day.strip} />

      <div class="log" {...day.swipe}>
        <div class="log-row log-head" aria-hidden="true">
          <span>Heure</span>
          <span>Quoi</span>
          <span>Prochain repas</span>
        </div>
        <div class="log-body">
          {day.list.length ? (
            day.list.map((entry) => {
              const next = nextById.get(entry.id);
              const current = entry.id === latestId;
              const late = next !== undefined && day.now >= next;
              return (
                <button
                  type="button"
                  key={entry.id}
                  class={`log-row${current ? ' is-current' : ''}${current && late ? ' is-late' : ''}`}
                  onClick={() => setEditing(entry)}
                >
                  <span class="log-time">{formatClock(entry.at)}</span>
                  <span class="slots">
                    {TAGS.map((tag) => (
                      <span key={tag} class="slot">
                        {entry.tags.includes(tag) && <Emoji tag={tag} />}
                      </span>
                    ))}
                  </span>
                  <span class="log-next">
                    {next === undefined ? (
                      <small>—</small>
                    ) : (
                      <>
                        <strong>{formatClock(next)}</strong>
                        {current && (
                          <small>{late ? `en retard de ${formatSpan(day.now - next)}` : formatIn(next - day.now)}</small>
                        )}
                      </>
                    )}
                  </span>
                </button>
              );
            })
          ) : (
            <p class="empty">{day.isToday ? "Rien pour l'instant aujourd'hui." : "Rien d'enregistré ce jour-là."}</p>
          )}
        </div>
      </div>

      <div class="bottom">
        <div class="toast-anchor">
          <ToastSlot />
        </div>
        {day.isToday ? (
          <Composer now={day.now} />
        ) : (
          <button type="button" class="action action-wide" onClick={day.backToToday}>
            Revenir à aujourd'hui
            <Icon name="next" size={22} />
          </button>
        )}
      </div>

      {editing && <EntrySheet entry={editing} onClose={() => setEditing(null)} />}
      {alarmGuide && alarmAt !== undefined && <AlarmSheet at={alarmAt} onClose={() => setAlarmGuide(false)} />}
    </>
  );
}
