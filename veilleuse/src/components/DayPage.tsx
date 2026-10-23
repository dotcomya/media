import { useMemo, useRef, useState } from 'preact/hooks';
import { useNow } from '../hooks';
import { formatClock, formatDate, formatDayTitle } from '../lib/format';
import { daySummaryText, shareText, summaryParts } from '../lib/share';
import { entriesOfDay, summarizeDay } from '../lib/summary';
import { DAY, addDays, startOfDay } from '../lib/time';
import type { Entry } from '../model';
import { showToast, useAppState } from '../store';
import { Composer } from './Composer';
import { DayStrip } from './DayStrip';
import { EntrySheet } from './EntrySheet';
import { Icon } from './Icon';
import { TagDot, TagPill } from './Tag';
import { ToastSlot } from './Toast';

const SWIPE_PX = 60;
// À partir de 9 saisies, la liste passe sur deux colonnes compactes pour tenir sans défiler.
const DENSE_FROM = 9;

/** L'app tient en une page : un jour, ce qui s'y est passé, et la saisie en bas. */
export function DayPage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { entries, settings } = useAppState();
  const now = useNow(15_000);
  // Décalage en jours par rapport à aujourd'hui : reste juste si l'app reste ouverte après minuit.
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Entry | null>(null);

  const today = startOfDay(now);
  const day = addDays(today, offset);
  const list = useMemo(() => entriesOfDay(entries, day), [entries, day]);
  const summary = useMemo(() => summarizeDay(entries, day), [entries, day]);
  const { oldest, marked } = useMemo(() => {
    const marked = new Set<number>();
    let oldest = today;
    for (const entry of entries) {
      const d = startOfDay(entry.at);
      marked.add(d);
      oldest = Math.min(oldest, d);
    }
    return { oldest, marked };
  }, [entries, today]);

  const go = (delta: number) => setOffset((o) => Math.min(0, o + delta));
  const dense = list.length >= DENSE_FROM;

  // Balayage horizontal sur la liste : vers la gauche = jour suivant, vers la droite = veille.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
  };

  const share = async () => {
    try {
      const result = await shareText('Résumé de la journée', daySummaryText(entries, day, settings.babyName.trim()));
      if (result === 'copied') showToast('Résumé copié, prêt à coller');
    } catch {
      showToast('Partage indisponible sur ce navigateur');
    }
  };

  const title = formatDayTitle(day, now);
  // « Aujourd'hui » et « Hier » gagnent la date en sous-titre ; les autres jours l'ont déjà dans le titre.
  const subtitle = [offset > -2 ? formatDate(day) : '', settings.babyName.trim()].filter(Boolean).join(' · ');

  return (
    <>
      <header class="topbar">
        <div class="topbar-title">
          <h1>{title}</h1>
          {subtitle && <p class="topbar-sub">{subtitle}</p>}
        </div>
        <button type="button" class="head-btn" onClick={share}>
          <Icon name="share" size={20} />
          Partager
        </button>
        <button type="button" class="head-btn" onClick={onOpenSettings}>
          <Icon name="settings" size={20} />
          Réglages
        </button>
      </header>

      <DayStrip
        today={today}
        selected={day}
        oldest={oldest}
        marked={marked}
        onSelect={(d) => setOffset(Math.min(0, Math.round((d - today) / DAY)))}
      />

      <p class="summary" aria-label="Résumé de la journée">
        {summaryParts(summary).map((part) => (
          <span key={part.tag} class={`summary-part tone-${part.tag}${summary[part.tag] ? '' : ' is-zero'}`}>
            {part.text}
          </span>
        ))}
      </p>

      <div class="timeline-wrap" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {list.length ? (
          <ol
            class={`timeline${dense ? ' is-dense' : ''}`}
            // Remplissage colonne par colonne : on lit les heures de haut en bas, puis à droite.
            style={dense ? { gridTemplateRows: `repeat(${Math.ceil(list.length / 2)}, auto)` } : undefined}
          >
            {list.map((entry) => (
              <li key={entry.id}>
                <button type="button" class="entry" onClick={() => setEditing(entry)}>
                  <span class="entry-time">{formatClock(entry.at)}</span>
                  <span class="entry-tags">
                    {entry.tags.map((tag) => (dense ? <TagDot key={tag} tag={tag} /> : <TagPill key={tag} tag={tag} />))}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p class="empty">{offset === 0 ? "Rien pour l'instant aujourd'hui." : "Rien d'enregistré ce jour-là."}</p>
        )}
        {list.length > 0 && list.length < 6 && <p class="hint">Touchez une ligne pour la corriger.</p>}
      </div>

      <div class="bottom">
        <div class="toast-anchor">
          <ToastSlot />
        </div>
        {offset === 0 ? (
          <Composer entries={entries} now={now} />
        ) : (
          <button type="button" class="action action-wide" onClick={() => setOffset(0)}>
            Revenir à aujourd'hui
            <Icon name="next" size={22} />
          </button>
        )}
      </div>

      {editing && <EntrySheet entry={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
