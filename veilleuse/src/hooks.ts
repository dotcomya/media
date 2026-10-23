import { useEffect, useState } from 'preact/hooks';

/** Heure courante, rafraîchie toutes les `intervalMs` et au retour au premier plan. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);
  return now;
}
