import { useState } from 'preact/hooks';
import { useAppState } from '../store';
import { DayPage } from './DayPage';
import { SettingsSheet } from './SettingsSheet';

export function App() {
  const { ready } = useAppState();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Tant que la base n'est pas lue, on n'affiche que le fond : pas de flash, pas de liste vide trompeuse.
  if (!ready) return <div class="app" />;

  return (
    <div class="app">
      <main class="screen">
        <DayPage onOpenSettings={() => setSettingsOpen(true)} />
      </main>
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
