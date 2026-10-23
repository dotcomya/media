import { useState } from 'preact/hooks';
import { useNow } from '../hooks';
import { feedTimes, isLongFeed, isPaused, otherSide, type ActiveFeed } from '../lib/feeding';
import { formatChrono, formatClock, formatDuration, sideName } from '../lib/format';
import { HOUR } from '../lib/time';
import type { Side } from '../model';
import { discardActiveFeed, finishActiveFeed, logDiaper, switchFeedSide, toggleFeedPause } from '../store';
import { DurationPicker } from './DurationPicker';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { ToastSlot } from './Toast';

/** Écran de tétée en cours. Le temps affiché est recalculé depuis les horodatages persistés. */
export function FeedMode({ feed }: { feed: ActiveFeed }) {
  const now = useNow(500);
  const [adjusting, setAdjusting] = useState(false);
  const times = feedTimes(feed, now);
  const paused = isPaused(feed);

  const finish = () => (isLongFeed(feed, Date.now()) ? setAdjusting(true) : finishActiveFeed());

  return (
    <>
      <header class="topbar">
        <div>
          <h1>Tétée en cours</h1>
          <p class="topbar-sub">Début à {formatClock(feed.startedAt)}</p>
        </div>
        <button type="button" class="text-btn" onClick={discardActiveFeed}>
          <Icon name="close" size={20} />
          Abandonner
        </button>
      </header>

      <section class={`chrono${paused ? ' is-paused' : ''}`} aria-label="Chrono">
        <div class="chrono-side">
          Sein {sideName(feed.side)}
          {paused && <span class="chrono-pause"> · en pause {formatChrono(times.pausedMs)}</span>}
        </div>
        <div class={`chrono-main${times.currentMs >= HOUR ? ' is-long' : ''}`} role="timer">
          {formatChrono(times.currentMs)}
        </div>
        <div class="chrono-sides">
          <SideTime side="L" ms={times.leftMs} active={feed.side === 'L'} />
          <SideTime side="R" ms={times.rightMs} active={feed.side === 'R'} />
        </div>
        <div class="chrono-total">Total au sein {formatChrono(times.totalMs)}</div>
      </section>

      <div class="spacer">
        <ToastSlot />
      </div>

      <section class="actions" aria-label="Commandes de la tétée">
        {paused && (
          <div class="pause-diapers">
            <span class="field-label">Change pendant la pause ?</span>
            <div class="row">
              <button type="button" class="chip tone-pee" onClick={() => logDiaper(true, false)}>
                <Icon name="pee" size={20} /> Pipi
              </button>
              <button type="button" class="chip tone-poop" onClick={() => logDiaper(false, true)}>
                <Icon name="poop" size={20} /> Caca
              </button>
              <button type="button" class="chip tone-both" onClick={() => logDiaper(true, true)}>
                Pipi + caca
              </button>
            </div>
          </div>
        )}
        <button type="button" class="action action-tall tone-breast" onClick={switchFeedSide}>
          <Icon name="swap" size={28} />
          Changer de sein → {sideName(otherSide(feed.side))}
        </button>
        <div class="row">
          <button type="button" class="action action-tall" onClick={toggleFeedPause}>
            <Icon name={paused ? 'play' : 'pause'} size={28} />
            {paused ? 'Reprendre' : 'Pause'}
          </button>
          <button type="button" class="action action-tall action-primary" onClick={finish}>
            <Icon name="check" size={28} />
            Terminer
          </button>
        </div>
      </section>

      {adjusting && <AdjustSheet feed={feed} onClose={() => setAdjusting(false)} />}
    </>
  );
}

function SideTime({ side, ms, active }: { side: Side; ms: number; active: boolean }) {
  return (
    <div class={`side-time${active ? ' is-active' : ''}`}>
      <span>{side === 'L' ? 'Gauche' : 'Droit'}</span>
      <strong>{formatChrono(ms)}</strong>
    </div>
  );
}

/** Tétée de plus de 60 min : le chrono a souvent été oublié, on propose de corriger. */
function AdjustSheet({ feed, onClose }: { feed: ActiveFeed; onClose: () => void }) {
  const [measured] = useState(() => feedTimes(feed, Date.now()));
  const [leftMs, setLeftMs] = useState(measured.leftMs);
  const [rightMs, setRightMs] = useState(measured.rightMs);
  const used = new Set(feed.sides);

  return (
    <Sheet
      title={`Tétée de ${formatDuration(measured.totalMs)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" class="action" onClick={() => finishActiveFeed()}>
            Garder tel quel
          </button>
          <button type="button" class="action action-primary" onClick={() => finishActiveFeed({ leftMs, rightMs })}>
            <Icon name="check" size={24} />
            Valider
          </button>
        </>
      }
    >
      <p class="hint">Chrono oublié ? Corrigez la durée passée à chaque sein.</p>
      {used.has('L') && <DurationPicker label="Sein gauche" ms={leftMs} onChange={setLeftMs} />}
      {used.has('R') && <DurationPicker label="Sein droit" ms={rightMs} onChange={setRightMs} />}
      <p class="hint">Total corrigé : {formatDuration(leftMs + rightMs)}</p>
    </Sheet>
  );
}
