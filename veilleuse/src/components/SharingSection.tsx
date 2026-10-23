import { useState } from 'preact/hooks';
import { formatClock } from '../lib/format';
import { shareText } from '../lib/share';
import { joinFamily, leaveFamily, syncNow } from '../sync/engine';
import { newFamilyCode, normalizeFamilyCode } from '../sync/merge';
import { syncAvailable } from '../sync/remote';
import { showToast, useAppState } from '../store';
import { Icon } from './Icon';

const STATUS: Record<string, string> = {
  syncing: 'Synchronisation…',
  offline: 'Hors ligne : les saisies partiront au retour du réseau.',
  error: 'Le serveur ne répond pas ; nouvel essai dans un instant.',
};

/** Partager le suivi avec l'autre parent : un code famille, et les deux téléphones voient les mêmes lignes. */
export function SharingSection() {
  const { sync } = useAppState();
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const valid = normalizeFamilyCode(code);

  const start = async (family: string) => {
    await joinFamily(family);
    setJoining(false);
    setCode('');
  };

  const sendCode = async (family: string) => {
    const text = `Code de partage Nous 3 : ${family}\nDans Nous 3 : Réglages → « J'ai reçu un code ».`;
    try {
      if ((await shareText('Partager Nous 3', text)) === 'copied') showToast('Code copié, prêt à envoyer');
    } catch {
      showToast('Recopiez le code affiché');
    }
  };

  return (
    <div class="field">
      <span class="field-label">Partage avec l'autre parent</span>
      {!syncAvailable ? (
        <p class="hint">
          Le partage entre parents n'est pas encore branché sur cette version : il reste à créer le serveur gratuit.
        </p>
      ) : sync.family ? (
        <>
          <p class="family-code" aria-label="Code de partage">
            {sync.family}
          </p>
          <p class="hint">
            {sync.status === 'ok' && sync.lastSyncAt
              ? `Partagé : les deux téléphones voient les mêmes lignes. Synchronisé à ${formatClock(sync.lastSyncAt)}.`
              : (STATUS[sync.status] ?? 'Partagé : les deux téléphones voient les mêmes lignes.')}
          </p>
          <button type="button" class="action" onClick={() => sendCode(sync.family!)}>
            <Icon name="share" />
            Envoyer le code à l'autre parent
          </button>
          <button type="button" class="action" onClick={() => void syncNow()}>
            Synchroniser maintenant
          </button>
          <button type="button" class="action action-danger" onClick={() => void leaveFamily()}>
            Arrêter le partage sur ce téléphone
          </button>
        </>
      ) : (
        <>
          <p class="hint">Avec un code commun, maman et papa voient et complètent les mêmes lignes, chacun sur son téléphone.</p>
          <button type="button" class="action" onClick={() => void start(newFamilyCode())}>
            Créer un code de partage
          </button>
          {joining ? (
            <div class="join">
              <input
                id="family-code"
                class="input"
                type="text"
                value={code}
                placeholder="XXXX-XXXX-XXXX"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck={false}
                aria-label="Code reçu"
                onInput={(e) => setCode(e.currentTarget.value)}
              />
              <button type="button" class="action action-primary" disabled={!valid} onClick={() => valid && void start(valid)}>
                Rejoindre
              </button>
            </div>
          ) : (
            <button type="button" class="action" onClick={() => setJoining(true)}>
              J'ai reçu un code
            </button>
          )}
        </>
      )}
    </div>
  );
}
