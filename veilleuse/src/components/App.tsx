import { useEffect, useState } from 'preact/hooks';
import { useAppState } from '../store';
import { DialPage } from './DialPage';
import { SettingsSheet } from './SettingsSheet';
import { TablePage } from './TablePage';
import { ThreadPage } from './ThreadPage';

// Trois propositions de design à comparer ; chacune a son lien : …/#1, …/#2, …/#3.
const DESIGNS = [
  { id: '1', name: 'Tableau', Page: TablePage },
  { id: '2', name: 'Fil', Page: ThreadPage },
  { id: '3', name: 'Cadran', Page: DialPage },
] as const;
type DesignId = (typeof DESIGNS)[number]['id'];

const isDesign = (value: string | null): value is DesignId => DESIGNS.some((d) => d.id === value);

function initialDesign(): DesignId {
  const fromHash = location.hash.slice(1);
  if (isDesign(fromHash)) return fromHash;
  try {
    const stored = localStorage.getItem('design');
    if (isDesign(stored)) return stored;
  } catch {
    // Stockage indisponible : on garde la proposition 1.
  }
  return '1';
}

export function App() {
  const { ready } = useAppState();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [design, setDesign] = useState(initialDesign);

  useEffect(() => {
    const onHash = () => {
      const id = location.hash.slice(1);
      if (isDesign(id)) setDesign(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const choose = (id: DesignId) => {
    history.replaceState(null, '', `#${id}`);
    try {
      localStorage.setItem('design', id);
    } catch {
      // L'app installée se rouvrira sur la proposition 1.
    }
    setDesign(id);
  };

  // Tant que la base n'est pas lue, on n'affiche que le fond : pas de flash, pas de liste vide trompeuse.
  if (!ready) return <div class="app" />;

  const { Page } = DESIGNS.find((d) => d.id === design)!;
  return (
    <div class="app">
      <nav class="designs" aria-label="Propositions de design">
        {DESIGNS.map((d) => (
          <button
            type="button"
            key={d.id}
            class={d.id === design ? 'on' : ''}
            aria-pressed={d.id === design}
            onClick={() => choose(d.id)}
          >
            {d.id} · {d.name}
          </button>
        ))}
      </nav>
      <main class={`screen design-${design}`}>
        <Page onOpenSettings={() => setSettingsOpen(true)} />
      </main>
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
