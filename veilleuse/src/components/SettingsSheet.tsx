import { useState } from 'preact/hooks';
import { allItems } from '../db';
import { toCsv } from '../lib/csv';
import { daySummaryText, shareFile, shareText } from '../lib/share';
import { MINUTE, startOfDay } from '../lib/time';
import { formatSpan } from '../lib/format';
import { FEED_INTERVALS_MIN, SEX_LABELS, isEntry, type Sex, type Weight } from '../model';
import { toDateValue } from '../lib/growth';
import { getTheme, setTheme, type Theme } from '../lib/theme';
import { showToast, updateProfile, updateSettings, useAppState } from '../store';
import { Icon } from './Icon';
import { LogoMark, Wordmark } from './Logo';
import { SharingSection } from './SharingSection';
import { Sheet } from './Sheet';

async function exportCsv(): Promise<void> {
  const items = await allItems();
  const csv = toCsv(items.filter(isEntry), items.filter((item): item is Weight => item.kind === 'weight'));
  const date = new Date().toISOString().slice(0, 10);
  const file = new File([csv], `nous3-${date}.csv`, { type: 'text/csv' });
  const result = await shareFile(file);
  if (result === 'downloaded') showToast('Fichier CSV téléchargé');
}

async function shareToday(entries: Parameters<typeof daySummaryText>[0], babyName: string): Promise<void> {
  const result = await shareText('Résumé de la journée', daySummaryText(entries, startOfDay(Date.now()), babyName));
  if (result === 'copied') showToast('Résumé copié, prêt à coller');
}

interface Props {
  onClose: () => void;
  onOpenWeek: () => void;
  onOpenWeight: () => void;
}

export function SettingsSheet({ onClose, onOpenWeek, onOpenWeight }: Props) {
  const { settings, entries, persisted, sync, profile } = useAppState();
  const [theme, setThemeState] = useState(getTheme);
  const chooseTheme = (value: Theme) => {
    setTheme(value);
    setThemeState(value);
  };

  return (
    <Sheet title="Réglages" onClose={onClose}>
      <div class="brand">
        <LogoMark size={44} />
        <div>
          <Wordmark />
          <p>Le carnet tout doux de notre trio.</p>
        </div>
      </div>

      <div class="field">
        <span class="field-label">Bébé</span>
        <input
          class="input"
          type="text"
          key={profile.babyName}
          defaultValue={profile.babyName}
          placeholder="Prénom (facultatif)"
          aria-label="Prénom du bébé"
          autocomplete="off"
          enterkeyhint="done"
          onChange={(e) => updateProfile({ babyName: e.currentTarget.value.trim() })}
        />
        <BabyFields />
        {sync.family && <p class="hint">Partagé avec le téléphone de l’autre parent.</p>}
      </div>

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

      <SharingSection />

      <div class="field">
        <span class="field-label">Temps entre deux repas</span>
        <div class="chips cols-5">
          {FEED_INTERVALS_MIN.map((min) => (
            <button
              type="button"
              key={min}
              class={`chip${profile.feedIntervalMin === min ? ' on' : ''}`}
              aria-pressed={profile.feedIntervalMin === min}
              onClick={() => updateProfile({ feedIntervalMin: min })}
            >
              {formatSpan(min * MINUTE)}
            </button>
          ))}
        </div>
        <p class="hint">
          Sert à l'heure du prochain repas et au réveil.
        </p>
      </div>

      <div class="field">
        <span class="field-label">Réveil après chaque tétée ou biberon</span>
        <div class="chips cols-2">
          <button
            type="button"
            class={`chip chip-lg${settings.autoAlarm ? ' on' : ''}`}
            aria-pressed={settings.autoAlarm}
            onClick={() => updateSettings({ autoAlarm: true })}
          >
            <Icon name="alarm" size={22} /> Oui
          </button>
          <button
            type="button"
            class={`chip chip-lg${settings.autoAlarm ? '' : ' on'}`}
            aria-pressed={!settings.autoAlarm}
            onClick={() => updateSettings({ autoAlarm: false })}
          >
            Non
          </button>
        </div>
        <button
          type="button"
          class="action"
          onClick={() => {
            updateSettings({ alarmReady: false });
            showToast('Le guide s’affichera au prochain réveil');
          }}
        >
          <Icon name="alarm" />
          Revoir le guide du raccourci
        </button>
      </div>

      <div class="field">
        <span class="field-label">Données</span>
        <button type="button" class="action" onClick={onOpenWeek}>
          <Icon name="chart" />
          Bilan des 7 derniers jours
        </button>
        <button type="button" class="action" onClick={onOpenWeight}>
          <Icon name="growth" />
          Courbe de poids
        </button>
        <button
          type="button"
          class="action"
          onClick={() => shareToday(entries, profile.babyName.trim()).catch(() => showToast('Partage indisponible'))}
        >
          <Icon name="share" />
          Partager le résumé d'aujourd'hui
        </button>
        <button
          type="button"
          class="action"
          onClick={() => exportCsv().catch(() => showToast("L'export a échoué"))}
        >
          <Icon name="download" />
          Exporter tout en CSV
        </button>
        <p class="hint">
          {entries.length} entrée{entries.length > 1 ? 's' : ''}, gardée{entries.length > 1 ? 's' : ''} sur ce téléphone
          {sync.family ? ' et partagée' + (entries.length > 1 ? 's' : '') + ' avec l’autre parent.' : ' uniquement.'}{' '}
          {persisted
            ? 'Stockage protégé : le navigateur ne l’effacera pas pour faire de la place.'
            : 'Installez l’app sur l’écran d’accueil pour protéger ce stockage.'}
        </p>
      </div>
    </Sheet>
  );
}

/** Date de naissance et sexe : pour placer bébé sur les courbes de poids de l'OMS. */
export function BabyFields() {
  const { profile } = useAppState();
  const today = toDateValue(Date.now());
  return (
    <>
      <label class="date-field">
        <span>Né(e) le</span>
        <input
          class="input"
          type="date"
          max={today}
          value={profile.birthDate ?? ''}
          aria-label="Date de naissance"
          onChange={(e) => e.currentTarget.value && updateProfile({ birthDate: e.currentTarget.value })}
        />
      </label>
      <div class="chips cols-2" role="group" aria-label="Sexe (les courbes de l'OMS diffèrent)">
        {(['girl', 'boy'] as Sex[]).map((sex) => (
          <button
            type="button"
            key={sex}
            class={`chip${profile.sex === sex ? ' on' : ''}`}
            aria-pressed={profile.sex === sex}
            onClick={() => updateProfile({ sex })}
          >
            {SEX_LABELS[sex]}
          </button>
        ))}
      </div>
    </>
  );
}
