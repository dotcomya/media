import { useMemo, useState } from 'preact/hooks';
import { alarmUrl, openAlarm } from '../lib/alarm';
import { formatClock, formatIn, formatSpan } from '../lib/format';
import { dayStats, nextFeedByEntry } from '../lib/summary';
import { MINUTE } from '../lib/time';
import { TAGS, isFeed, type Entry } from '../model';
import { updateSettings, useAppState } from '../store';
import { useDay } from '../useDay';
import { AlarmSheet } from './AlarmSheet';
import { DayBilan } from './DayBilan';
import { Composer } from './Composer';
import { DayStrip } from './DayStrip';
import { EntrySheet } from './EntrySheet';
import { Icon } from './Icon';
import { LogoMark, Wordmark } from './Logo';
import { Emoji } from './Tag';
import { TimerSheet } from './TimerSheet';
import { ToastSlot } from './Toast';

/**
 * Une ligne = un moment avec bébé : l'heure, ce qui s'est passé, et l'heure du
 * prochain repas à ce moment-là (dernière tétée ou dernier biberon + 2 h 30).
 */
export function DayPage({ onOpenSettings, onOpenWeek }: { onOpenSettings: () => void; onOpenWeek: () => void }) {
  const day = useDay();
  const { settings, sync } = useAppState();
  const [editing, setEditing] = useState<Entry | null>(null);
  // Heure pour laquelle afficher le guide de l'alarme (premier réglage), sinon null.
  const [guideAt, setGuideAt] = useState<number | null>(null);
  // Un minuteur lancé plus tôt tourne encore : on montre comment l'arrêter avant d'en lancer un autre.
  const [conflict, setConflict] = useState<{ previous: number; at: number } | null>(null);
  const interval = settings.feedIntervalMin * MINUTE;
  const nextById = useMemo(() => nextFeedByEntry(day.entries, interval), [day.entries, interval]);
  const stats = useMemo(() => dayStats(day.entries, day.day), [day.entries, day.day]);
  // La ligne la plus récente, tous jours confondus : c'est elle qui dit quand nourrir bébé maintenant.
  const latestId = useMemo(
    () => day.entries.reduce<Entry | null>((latest, e) => (!latest || e.at > latest.at ? e : latest), null)?.id,
    [day.entries],
  );
  // Heure du prochain repas maintenant ; l'alarme n'a de sens que si elle est à venir.
  const nextAt = latestId ? nextById.get(latestId) : undefined;
  const alarmAt = nextAt !== undefined && nextAt > day.now ? nextAt : undefined;

  // Le minuteur précédent sonnera encore (à une autre heure) : il faudra l'arrêter à la main.
  const pendingTimer = (at: number): number | null => {
    const previous = settings.timerUntil;
    return previous !== null && previous > Date.now() + MINUTE && Math.abs(previous - at) > MINUTE ? previous : null;
  };
  const startAlarm = (at: number) => {
    if (!settings.alarmReady) return setGuideAt(at);
    const previous = pendingTimer(at);
    if (previous !== null) return setConflict({ previous, at });
    openAlarm(at);
    updateSettings({ timerUntil: at });
  };

  // Après chaque tétée ou biberon : réveil au prochain repas, dans le même appui que « Valider ».
  const onLogged = (entry: Entry) => {
    const at = entry.at + interval;
    // Saisie en retard dont le prochain repas est déjà passé : pas de réveil.
    if (!isFeed(entry) || !settings.autoAlarm || at <= Date.now()) return;
    startAlarm(at);
  };
  const syncWarn = sync.status === 'offline' || sync.status === 'error';

  return (
    <>
      <header class="topbar">
        <div class="topbar-brand">
          <LogoMark size={34} />
          <Wordmark />
        </div>
        {alarmAt !== undefined &&
          (settings.alarmReady && pendingTimer(alarmAt) === null ? (
            // Lien direct : sur iPhone, c'est le plus sûr pour ouvrir Raccourcis.
            <a
              class="head-pill head-alarm"
              href={alarmUrl(alarmAt)}
              aria-label={`Réveil à ${formatClock(alarmAt)}`}
              onClick={() => updateSettings({ timerUntil: alarmAt })}
            >
              <Icon name="alarm" size={17} />
              {formatClock(alarmAt)}
            </a>
          ) : (
            <button
              type="button"
              class="head-pill head-alarm"
              aria-label={`Réveil à ${formatClock(alarmAt)}`}
              onClick={() => startAlarm(alarmAt)}
            >
              <Icon name="alarm" size={17} />
              {formatClock(alarmAt)}
            </button>
          ))}
        <button type="button" class="head-icon" aria-label="Réglages" onClick={onOpenSettings}>
          <Icon name="settings" size={18} />
          {/* Partage actif : point vert ; serveur injoignable : point jaune (détail dans Réglages). */}
          {sync.family && <span class={`head-dot${syncWarn ? ' is-warn' : ''}`} />}
        </button>
      </header>

      <div class="day-title">
        <h1>{day.title}</h1>
        <DayBilan stats={stats} onOpen={onOpenWeek} />
      </div>

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
                        {tag === 'bottle' && entry.ml && <small class="slot-ml">{entry.ml}</small>}
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
          <Composer onLogged={onLogged} />
        ) : (
          <button type="button" class="action action-wide" onClick={day.backToToday}>
            Revenir à aujourd'hui
            <Icon name="next" size={22} />
          </button>
        )}
      </div>

      {editing && <EntrySheet entry={editing} onClose={() => setEditing(null)} />}
      {guideAt !== null && <AlarmSheet at={guideAt} onClose={() => setGuideAt(null)} />}
      {conflict && <TimerSheet {...conflict} onClose={() => setConflict(null)} />}
    </>
  );
}
