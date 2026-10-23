import { formatClock, formatIn, formatSpan } from '../lib/format';
import { FEED_INTERVAL_MS, type NextFeed } from '../lib/summary';
import { TAG_EMOJI } from '../model';

export interface NextFeedInfo {
  /** « 18:05 » */
  time: string;
  /** « dans 1 h 12 » ou « 12 min de retard » */
  relative: string;
  /** Attente ou retard seul : « 1 h 12 ». */
  span: string;
  late: boolean;
  /** « 🍼 15:35 » : dernier repas. */
  last: string;
  /** Part du délai de 2 h 30 déjà écoulée (0 à 1). */
  progress: number;
}

export function nextFeedInfo(next: NextFeed | null, now: number): NextFeedInfo | null {
  if (!next) return null;
  const late = now >= next.at;
  const emoji = next.last.tags.includes('feed') ? TAG_EMOJI.feed : TAG_EMOJI.bottle;
  return {
    time: formatClock(next.at),
    relative: late ? `${formatSpan(now - next.at)} de retard` : formatIn(next.at - now),
    span: formatSpan(Math.abs(now - next.at)),
    late,
    last: `${emoji} ${formatClock(next.last.at)}`,
    progress: Math.min(1, Math.max(0, (now - next.last.at) / FEED_INTERVAL_MS)),
  };
}

/** Bandeau « Prochaine tétée vers 18:05 — dans 1 h 12 » (proposition 1). */
export function NextFeedBanner({ next, now }: { next: NextFeed | null; now: number }) {
  const info = nextFeedInfo(next, now);
  if (!info) {
    return (
      <div class="next">
        <span class="next-emoji">⏰</span>
        <div class="next-main">
          <span class="next-label">Prochaine tétée</span>
          <span class="next-hint">Cochez une tétée ou un biberon pour la calculer.</span>
        </div>
      </div>
    );
  }
  return (
    <div class={`next${info.late ? ' is-late' : ''}`}>
      <span class="next-emoji">⏰</span>
      <div class="next-main">
        <span class="next-label">Prochaine tétée</span>
        <strong class="next-time">vers {info.time}</strong>
      </div>
      <div class="next-side">
        <strong class="next-in">{info.relative}</strong>
        <small>dernière {info.last}</small>
      </div>
    </div>
  );
}
