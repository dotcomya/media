import { useState } from 'preact/hooks';
import { useAppState } from '../store';
import { DayPage } from './DayPage';
import { DemoBanner } from './DemoBanner';
import { SettingsSheet } from './SettingsSheet';
import { WeekSheet } from './WeekSheet';
import { WeightSheet } from './WeightSheet';

export function App() {
  const { ready } = useAppState();
  const [sheet, setSheet] = useState<'settings' | 'week' | 'weight' | null>(null);

  // Tant que la base n'est pas lue, on n'affiche que le fond : pas de flash, pas de liste vide trompeuse.
  if (!ready) return <div class="app" />;

  return (
    <div class="app">
      {import.meta.env.VITE_DEMO && <DemoBanner />}
      <main class="screen">
        <DayPage
          onOpenSettings={() => setSheet('settings')}
          onOpenWeek={() => setSheet('week')}
          onOpenWeight={() => setSheet('weight')}
        />
      </main>
      {sheet === 'settings' && (
        <SettingsSheet onClose={() => setSheet(null)} onOpenWeek={() => setSheet('week')} onOpenWeight={() => setSheet('weight')} />
      )}
      {sheet === 'week' && <WeekSheet onClose={() => setSheet(null)} />}
      {sheet === 'weight' && <WeightSheet onClose={() => setSheet(null)} />}
    </div>
  );
}
