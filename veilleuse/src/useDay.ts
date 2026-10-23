import { useMemo, useRef, useState } from 'preact/hooks';
import { useNow } from './hooks';
import { formatDate, formatDayTitle } from './lib/format';
import { daySummaryText, shareText } from './lib/share';
import { entriesOfDay, nextFeed, summarizeDay } from './lib/summary';
import { DAY, addDays, startOfDay } from './lib/time';
import { showToast, useAppState } from './store';

const SWIPE_PX = 60;

/** Tout ce dont une page « jour » a besoin : jour affiché, navigation, saisies, prochaine tétée. */
export function useDay() {
  const { entries, settings } = useAppState();
  const now = useNow(15_000);
  // Décalage en jours par rapport à aujourd'hui : reste juste si l'app reste ouverte après minuit.
  const [offset, setOffset] = useState(0);

  const today = startOfDay(now);
  const day = addDays(today, offset);
  const list = useMemo(() => entriesOfDay(entries, day), [entries, day]);
  const summary = useMemo(() => summarizeDay(entries, day), [entries, day]);
  const next = useMemo(() => nextFeed(entries), [entries]);
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

  // Balayage horizontal : vers la gauche = jour suivant, vers la droite = veille.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swipe = {
    onTouchStart: (e: TouchEvent) => {
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd: (e: TouchEvent) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start) return;
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
    },
  };

  const share = async () => {
    try {
      const result = await shareText('Résumé de la journée', daySummaryText(entries, day, settings.babyName.trim()));
      if (result === 'copied') showToast('Résumé copié, prêt à coller');
    } catch {
      showToast('Partage indisponible sur ce navigateur');
    }
  };

  return {
    entries,
    now,
    day,
    isToday: offset === 0,
    backToToday: () => setOffset(0),
    list,
    summary,
    next,
    swipe,
    share,
    title: formatDayTitle(day, now),
    // « Aujourd'hui » et « Hier » gagnent la date en sous-titre ; les autres jours l'ont déjà dans le titre.
    subtitle: [offset > -2 ? formatDate(day) : '', settings.babyName.trim()].filter(Boolean).join(' · '),
    strip: {
      today,
      selected: day,
      oldest,
      marked,
      onSelect: (d: number) => setOffset(Math.min(0, Math.round((d - today) / DAY))),
    },
  };
}

export type DayState = ReturnType<typeof useDay>;
