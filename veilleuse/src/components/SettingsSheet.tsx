import { useState } from 'preact/hooks';
import { allEvents } from '../db';
import { toCsv } from '../lib/csv';
import { shareFile } from '../lib/share';
import { getTheme, setTheme, type Theme } from '../lib/theme';
import { showToast, updateSettings, useAppState } from '../store';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

async function exportCsv(): Promise<void> {
  const csv = toCsv(await allEvents());
  const date = new Date().toISOString().slice(0, 10);
  const file = new File([csv], `veilleuse-${date}.csv`, { type: 'text/csv' });
  const result = await shareFile(file);
  if (result === 'downloaded') showToast('Fichier CSV téléchargé');
}

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { settings, events, persisted } = useAppState();
  const [theme, setThemeState] = useState(getTheme);
  const chooseTheme = (value: Theme) => {
    setTheme(value);
    setThemeState(value);
  };

  return (
    <Sheet title="Réglages" onClose={onClose}>
      <label class="field">
        <span class="field-label">Prénom du bébé (facultatif)</span>
        <input
          class="input"
          type="text"
          value={settings.babyName}
          placeholder="Prénom"
          autocomplete="off"
          enterkeyhint="done"
          onInput={(e) => updateSettings({ babyName: e.currentTarget.value })}
        />
      </label>

      <div class="field">
        <span class="field-label">Affichage</span>
        <div class="chips cols-2">
          <button type="button" class={`chip chip-lg${theme === 'dark' ? ' on' : ''}`} aria-pressed={theme === 'dark'} onClick={() => chooseTheme('dark')}>
            <Icon name="moon" size={22} /> Sombre
          </button>
          <button type="button" class={`chip chip-lg${theme === 'light' ? ' on' : ''}`} aria-pressed={theme === 'light'} onClick={() => chooseTheme('light')}>
            <Icon name="sun" size={22} /> Clair
          </button>
        </div>
      </div>

      <div class="field">
        <span class="field-label">Données</span>
        <button
          type="button"
          class="action"
          onClick={() => exportCsv().catch(() => showToast("L'export a échoué"))}
        >
          <Icon name="download" />
          Exporter tout en CSV
        </button>
        <p class="hint">
          {events.length} entrée{events.length > 1 ? 's' : ''}, gardée{events.length > 1 ? 's' : ''} sur ce téléphone uniquement.{' '}
          {persisted
            ? 'Stockage protégé : le navigateur ne l’effacera pas pour faire de la place.'
            : 'Installez l’app sur l’écran d’accueil pour protéger ce stockage.'}
        </p>
      </div>
    </Sheet>
  );
}
