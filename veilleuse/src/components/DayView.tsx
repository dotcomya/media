import { useMemo, useRef, useState } from 'preact/hooks';
import { useNow } from '../hooks';
import { feedTimes, suggestedSide } from '../lib/feeding';
import { diaperLabel, formatChrono, formatClock, formatDate, formatDayTitle, formatDuration, sideLetter, sideName } from '../lib/format';
import { daySummaryText, shareText } from '../lib/share';
import { eventsOfDay, summarizeDay } from '../lib/summary';
import { addDays, startOfDay } from '../lib/time';
import { breastData, type AppEvent, type BreastEvent, type EventData } from '../model';
import { showToast, useAppState } from '../store';
import { EditSheet } from './EditSheet';
import { Icon, type IconName } from './Icon';
import { Sheet } from './Sheet';
import { ToastSlot } from './Toast';
import { TopBar } from './TopBar';

type Editing = { event: AppEvent } | { draft: EventData; defaultAt: number } | null;

const SWIPE_PX = 60;

export function DayView({ onOpenSettings, onOpenFeed }: { onOpenSettings: () => void; onOpenFeed: () => void }) {
  const { events, activeFeed, settings } = useAppState();
  const now = useNow(30_000);
  // Décalage en jours par rapport à aujourd'hui : reste juste si l'app reste ouverte après minuit.
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Editing>(null);
  const [choosing, setChoosing] = useState(false);

  const today = startOfDay(now);
  const day = addDays(today, offset);
  const list = useMemo(() => eventsOfDay(events, day), [events, day]);
  const summary = useMemo(() => summarizeDay(events, day), [events, day]);

  const go = (delta: number) => setOffset((o) => Math.min(0, o + delta));

  // Balayage horizontal : vers la gauche = jour suivant, vers la droite = veille.
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

  // Un oubli ajouté depuis un jour passé est daté de ce jour-là, à l'heure actuelle.
  const defaultAt = Math.min(Date.now(), day + (Date.now() - today));
  const addPastFeed = () => {
    const breastEvents = events.filter((e): e is BreastEvent => e.type === 'breast');
    const side = suggestedSide(breastEvents) ?? 'L';
    setEditing({ draft: breastData([side], side === 'L' ? 10 * 60_000 : 0, side === 'R' ? 10 * 60_000 : 0), defaultAt });
  };
  const addOther = (draft: EventData) => {
    setChoosing(false);
    setEditing({ draft, defaultAt });
  };

  const share = async () => {
    const text = daySummaryText(events, day, settings.babyName.trim());
    try {
      const result = await shareText('Résumé de la journée', text);
      if (result === 'copied') showToast('Résumé copié, prêt à coller');
    } catch {
      showToast('Partage indisponible sur ce navigateur');
    }
  };

  const title = formatDayTitle(day, now);

  return (
    <>
      <TopBar title={title} subtitle={offset > -2 ? formatDate(day) : undefined} onOpenSettings={onOpenSettings} />

      <section class="tiles" aria-label="Résumé de la journée">
        <Tile label="Tétées" value={summary.feeds} />
        <Tile label="Au sein" value={formatDuration(summary.breastMs)} />
        <Tile label={`${summary.bottles} biberon${summary.bottles > 1 ? 's' : ''}`} value={`${summary.bottleMl} ml`} />
        <Tile label="Pipis" value={summary.pees} />
        <Tile label="Cacas" value={summary.poops} />
        <Tile label="Couches" value={summary.diapers} />
      </section>

      <div class="timeline-wrap" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {list.length > 0 && <p class="hint">Touchez une entrée pour la modifier.</p>}
        <ol class="timeline">
          {offset === 0 && activeFeed && (
            <li>
              <button type="button" class="entry entry-live" onClick={onOpenFeed}>
                <span class="entry-time">{formatClock(activeFeed.startedAt)}</span>
                <span class="entry-icon tone-breast">
                  <Icon name="breast" />
                </span>
                <span class="entry-text">
                  <strong>Tétée en cours</strong>
                  <small>
                    sein {sideName(activeFeed.side)} · {formatChrono(feedTimes(activeFeed, now).totalMs)}
                  </small>
                </span>
              </button>
            </li>
          )}
          {list.map((event) => (
            <li key={event.id}>
              <Entry event={event} onClick={() => setEditing({ event })} />
            </li>
          ))}
        </ol>
        {list.length === 0 && !(offset === 0 && activeFeed) && <p class="empty">Rien d'enregistré ce jour-là.</p>}
        <div class="toast-float">
          <ToastSlot />
        </div>
      </div>

      <nav class="daynav" aria-label="Changer de jour">
        <button type="button" class="chip" onClick={() => go(-1)}>
          <Icon name="prev" size={20} /> Veille
        </button>
        <button type="button" class="chip" disabled={offset === 0} onClick={() => setOffset(0)}>
          Aujourd'hui
        </button>
        <button type="button" class="chip" disabled={offset === 0} onClick={() => go(1)}>
          Lendemain <Icon name="next" size={20} />
        </button>
      </nav>

      <section class="row day-actions" aria-label="Actions">
        <button type="button" class="action action-col tone-breast" onClick={addPastFeed}>
          <Icon name="plus" />
          Tétée passée
        </button>
        <button type="button" class="action action-col" onClick={() => setChoosing(true)}>
          <Icon name="plus" />
          Autre oubli
        </button>
        <button type="button" class="action action-col" onClick={share}>
          <Icon name="share" />
          Partager
        </button>
      </section>

      {choosing && (
        <Sheet title="Ajouter un oubli" onClose={() => setChoosing(false)}>
          <div class="chips cols-2">
            <ChooserButton icon="bottle" tone="bottle" label="Biberon" onClick={() => addOther({ type: 'bottle', ml: settings.lastBottleMl })} />
            <ChooserButton icon="pee" tone="pee" label="Pipi" onClick={() => addOther({ type: 'diaper', pee: true, poop: false })} />
            <ChooserButton icon="poop" tone="poop" label="Caca" onClick={() => addOther({ type: 'diaper', pee: false, poop: true })} />
            <ChooserButton icon="diaper" tone="both" label="Pipi + caca" onClick={() => addOther({ type: 'diaper', pee: true, poop: true })} />
          </div>
        </Sheet>
      )}
      {editing && <EditSheet {...editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div class="tile">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ChooserButton({ icon, tone, label, onClick }: { icon: IconName; tone: string; label: string; onClick: () => void }) {
  return (
    <button type="button" class={`action action-col tone-${tone}`} onClick={onClick}>
      <Icon name={icon} size={28} />
      {label}
    </button>
  );
}

function describe(event: AppEvent): { icon: IconName; tone: string; title: string; detail?: string } {
  switch (event.type) {
    case 'breast': {
      const detail =
        event.sides.length === 1
          ? `sein ${sideName(event.sides[0])} · ${formatDuration(event.durationMs)}`
          : `${[...new Set(event.sides)].map((s) => `${sideLetter(s)} ${formatDuration(s === 'L' ? event.leftMs : event.rightMs)}`).join(' → ')} · ${formatDuration(event.durationMs)}`;
      return { icon: 'breast', tone: 'breast', title: 'Tétée', detail };
    }
    case 'bottle':
      return { icon: 'bottle', tone: 'bottle', title: 'Biberon', detail: `${event.ml} ml` };
    case 'diaper':
      return {
        icon: event.poop ? 'poop' : 'pee',
        tone: event.pee && event.poop ? 'both' : event.poop ? 'poop' : 'pee',
        title: diaperLabel(event.pee, event.poop),
      };
  }
}

function Entry({ event, onClick }: { event: AppEvent; onClick: () => void }) {
  const { icon, tone, title, detail } = describe(event);
  return (
    <button type="button" class="entry" onClick={onClick}>
      <span class="entry-time">{formatClock(event.at)}</span>
      <span class={`entry-icon tone-${tone}`}>
        <Icon name={icon} />
      </span>
      <span class="entry-text">
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </span>
    </button>
  );
}
