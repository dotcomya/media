import { useMemo, useRef, useState } from 'preact/hooks';
import { useNow } from '../hooks';
import { suggestedSide } from '../lib/feeding';
import { diaperLabel, formatAgo, formatClock, formatSides, sideLetter } from '../lib/format';
import type { AppEvent, BottleEvent, BreastEvent, DiaperEvent, Side } from '../model';
import { logDiaper, startFeedOn, useAppState } from '../store';
import { BottleSheet } from './BottleSheet';
import { Icon, type IconName } from './Icon';
import { ToastSlot } from './Toast';
import { TopBar } from './TopBar';

interface Latest {
  breast?: BreastEvent;
  bottle?: BottleEvent;
  diaper?: DiaperEvent;
}

function latestByType(events: AppEvent[]): Latest {
  const latest: Record<string, AppEvent> = {};
  for (const e of events) if (!latest[e.type] || e.at > latest[e.type].at) latest[e.type] = e;
  return latest as Latest;
}

export function Home({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { events, settings } = useAppState();
  const now = useNow(15_000);
  const [bottleOpen, setBottleOpen] = useState(false);
  const latest = useMemo(() => latestByType(events), [events]);
  const next = useMemo(() => suggestedSide(latest.breast ? [latest.breast] : []), [latest.breast]);

  // Un double appui involontaire sur une couche ne crée pas deux entrées.
  const lastTap = useRef({ key: '', at: 0 });
  const diaper = (pee: boolean, poop: boolean) => {
    const key = `${pee}${poop}`;
    if (lastTap.current.key === key && Date.now() - lastTap.current.at < 1200) return;
    lastTap.current = { key, at: Date.now() };
    logDiaper(pee, poop);
  };

  return (
    <>
      <TopBar title={settings.babyName.trim() || 'Veilleuse'} onOpenSettings={onOpenSettings} />

      <section class="status" aria-label="Derniers événements">
        <StatusRow
          icon="breast"
          tone="breast"
          label="Dernière tétée"
          event={latest.breast}
          detail={latest.breast && formatSides(latest.breast.sides)}
          now={now}
        />
        <StatusRow
          icon="bottle"
          tone="bottle"
          label="Dernier biberon"
          event={latest.bottle}
          detail={latest.bottle && `${latest.bottle.ml} ml`}
          now={now}
        />
        <StatusRow
          icon="diaper"
          tone="pee"
          label="Dernière couche"
          event={latest.diaper}
          detail={latest.diaper && diaperLabel(latest.diaper.pee, latest.diaper.poop).toLowerCase()}
          now={now}
        />
      </section>

      <div class="spacer">
        <ToastSlot />
      </div>

      <section class="actions" aria-label="Enregistrer">
        <div class="row">
          <BreastButton side="L" next={next === 'L'} />
          <BreastButton side="R" next={next === 'R'} />
        </div>
        <button type="button" class="action tone-bottle" onClick={() => setBottleOpen(true)}>
          <Icon name="bottle" size={28} />
          Biberon
        </button>
        <div class="row">
          <button type="button" class="action action-col tone-pee" onClick={() => diaper(true, false)}>
            <Icon name="pee" size={28} />
            Pipi
          </button>
          <button type="button" class="action action-col tone-poop" onClick={() => diaper(false, true)}>
            <Icon name="poop" size={28} />
            Caca
          </button>
          <button type="button" class="action action-col tone-both" onClick={() => diaper(true, true)}>
            <span class="icon-pair">
              <Icon name="pee" size={22} />
              <Icon name="poop" size={22} />
            </span>
            Pipi + caca
          </button>
        </div>
      </section>

      {bottleOpen && <BottleSheet onClose={() => setBottleOpen(false)} />}
    </>
  );
}

interface StatusRowProps {
  icon: IconName;
  tone: string;
  label: string;
  event?: AppEvent;
  detail?: string;
  now: number;
}

function StatusRow({ icon, tone, label, event, detail, now }: StatusRowProps) {
  return (
    <div class={`status-row tone-${tone}`}>
      <Icon name={icon} size={28} />
      <div class="status-text">
        <div class="status-head">
          <span class="status-label">{label}</span>
          {detail && <span class="status-detail">{detail}</span>}
        </div>
        {event ? (
          <div class="status-value">
            {formatAgo(now - event.at)}
            <span class="status-clock"> · {formatClock(event.at)}</span>
          </div>
        ) : (
          <div class="status-value status-empty">Pas encore</div>
        )}
      </div>
    </div>
  );
}

function BreastButton({ side, next }: { side: Side; next: boolean }) {
  return (
    <button
      type="button"
      class={`action action-col action-tall tone-breast${next ? ' is-next' : ''}`}
      onClick={() => startFeedOn(side)}
    >
      {next && <span class="badge">Prochain</span>}
      <Icon name="breast" size={30} />
      Sein {sideLetter(side)}
    </button>
  );
}
