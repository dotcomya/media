import { useState } from 'preact/hooks';
import { useAppState } from '../store';
import { DayView } from './DayView';
import { FeedMode } from './FeedMode';
import { Home } from './Home';
import { Icon } from './Icon';
import { SettingsSheet } from './SettingsSheet';

type Tab = 'home' | 'day';

export function App() {
  const { ready, activeFeed } = useAppState();
  const [tab, setTab] = useState<Tab>('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = () => setSettingsOpen(true);

  // Tant que la base n'est pas lue, on n'affiche que le fond : pas de flash, pas de faux « Pas encore ».
  if (!ready) return <div class="app" />;

  return (
    <div class="app">
      <main class="screen">
        {tab === 'day' ? (
          <DayView onOpenSettings={openSettings} onOpenFeed={() => setTab('home')} />
        ) : activeFeed ? (
          <FeedMode feed={activeFeed} />
        ) : (
          <Home onOpenSettings={openSettings} />
        )}
      </main>

      <nav class="tabbar" aria-label="Onglets">
        <button type="button" class={tab === 'home' ? 'on' : ''} aria-current={tab === 'home'} onClick={() => setTab('home')}>
          <Icon name={activeFeed ? 'breast' : 'home'} />
          {activeFeed ? 'Tétée en cours' : 'Accueil'}
          {activeFeed && tab !== 'home' && <span class="live-dot" aria-hidden="true" />}
        </button>
        <button type="button" class={tab === 'day' ? 'on' : ''} aria-current={tab === 'day'} onClick={() => setTab('day')}>
          <Icon name="day" />
          Journée
        </button>
      </nav>

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
