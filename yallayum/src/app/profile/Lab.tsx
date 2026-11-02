// Banc d'essai : rejouer en un geste les états que la recette doit couvrir
// (heure de nuit, position refusée, hors ligne, grande police, fidélité,
// liens profonds) et voir exactement ce que la mesure d'audience enverrait.

import { LOYALTY_PARTNERS } from '../../data/demo';
import { Icon } from '../../ui/Icon';
import { Modal, Switch } from '../../ui/bits';
import { useStore } from '../store';
import { closeOverlay, nextParisTime, openPage, resetDemo, runSearch, setEnv, simulateScan, store, toast, type GpsMode } from '../state';

const TIMES: { label: string; weekday: number; time: string }[] = [
  { label: 'Mardi 12:30', weekday: 2, time: '12:30' },
  { label: 'Vendredi 23:30', weekday: 5, time: '23:30' },
  { label: 'Samedi 00:30', weekday: 6, time: '00:30' },
  { label: 'Samedi 01:45', weekday: 6, time: '01:45' },
  { label: 'Dimanche 10:00', weekday: 7, time: '10:00' },
];

const GPS: { id: GpsMode; label: string }[] = [
  { id: 'simulated', label: 'Simulée (République)' },
  { id: 'real', label: 'Réelle' },
  { id: 'denied', label: 'Refusée' },
  { id: 'unavailable', label: 'Indisponible' },
  { id: 'imprecise', label: 'Imprécise (± 1,8 km)' },
];

export function Lab() {
  const env = useStore(store, (s) => s.env);
  const events = useStore(store, (s) => s.events);
  const consent = useStore(store, (s) => s.consent);

  return (
    <Modal title="Banc d’essai" onClose={closeOverlay} full>
      <div class="notice info">
        <Icon name="beaker" />
        <span>Réglages de démonstration : ils simulent des situations réelles sans toucher aux données.</span>
      </div>

      <section class="field-group">
        <h3>Heure</h3>
        <div class="wrap-chips">
          <button type="button" class="chip flat" aria-pressed={!env.fixedTime} onClick={() => setEnv({ fixedTime: undefined, fixedLabel: undefined })}>
            Maintenant
          </button>
          {TIMES.map((t) => (
            <button
              key={t.label}
              type="button"
              class="chip flat"
              aria-pressed={env.fixedLabel === t.label}
              onClick={() => {
                setEnv({ fixedTime: nextParisTime(t.weekday, t.time), fixedLabel: t.label });
                toast(`Il est ${t.label.toLowerCase()} à Paris.`);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section class="field-group">
        <h3>Position</h3>
        <div class="wrap-chips">
          {GPS.map((g) => (
            <button key={g.id} type="button" class="chip flat" aria-pressed={env.gps === g.id} onClick={() => setEnv({ gps: g.id })}>
              {g.label}
            </button>
          ))}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: '0.8125rem', color: 'var(--ink-3)' }}>Puis touche « Autour de moi » sur la carte.</p>
      </section>

      <section class="field-group">
        <h3>Réseau</h3>
        <div class="seg" role="group" aria-label="Réseau">
          <button type="button" aria-pressed={env.network === 'online'} onClick={() => setEnv({ network: 'online' })}>
            En ligne
          </button>
          <button type="button" aria-pressed={env.network === 'offline'} onClick={() => setEnv({ network: 'offline' })}>
            Hors ligne
          </button>
        </div>
      </section>

      <section class="field-group">
        <h3>Accessibilité</h3>
        <div class="seg" role="group" aria-label="Taille du texte">
          {[1, 1.3, 1.6, 2].map((s) => (
            <button key={s} type="button" aria-pressed={env.textScale === s} onClick={() => setEnv({ textScale: s })}>
              {Math.round(s * 100)} %
            </button>
          ))}
        </div>
        <div class="switch-row">
          <span class="grow">Réduire les animations</span>
          <Switch checked={env.reducedMotion} onChange={(v) => setEnv({ reducedMotion: v })} label="Réduire les animations" />
        </div>
      </section>

      <section class="field-group">
        <h3>Fidélité</h3>
        <div class="wrap-chips">
          <button type="button" class="chip flat" onClick={() => (store.get().loyalty.activated ? simulateScan(LOYALTY_PARTNERS[0].id, 'fresh') : toast('Active d’abord la carte dans Avantages.'))}>
            Scan valide
          </button>
          <button type="button" class="chip flat" onClick={() => simulateScan(LOYALTY_PARTNERS[0].id, 'replay')}>
            Rescanner le même code
          </button>
          <button type="button" class="chip flat" onClick={() => simulateScan(LOYALTY_PARTNERS[1].id, 'expired')}>
            Code expiré
          </button>
          <button type="button" class="chip flat" onClick={() => simulateScan(LOYALTY_PARTNERS[1].id, 'fresh')}>
            Autre partenaire
          </button>
        </div>
      </section>

      <section class="field-group">
        <h3>Liens profonds</h3>
        <div class="rows">
          {[
            ['les-braises-de-belleville', 'Fiche normale'],
            ['kebab-royal-oberkampf', 'Fermé définitivement'],
            ['seoul-fried-ancienne-adresse', 'A déménagé'],
            ['seoul-fried-paris', 'Ancienne adresse web'],
            ['nour', 'Fermé temporairement'],
            ['spot-en-preparation', 'Brouillon (non publié)'],
            ['n-existe-pas', 'Introuvable'],
          ].map(([slug, label]) => (
            <button
              key={slug}
              type="button"
              class="row"
              onClick={() => {
                closeOverlay();
                openPage({ kind: 'link', id: slug });
              }}
            >
              <Icon name="external" />
              <span class="grow">
                {label}
                <span class="small">yallayum.app/r/{slug}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section class="field-group">
        <h3>Mesure d’audience ({events.length})</h3>
        <div class="switch-row">
          <span class="grow">
            Consentement « analytics »
            <span class="small">Sans lui, seuls les événements d’audience exemptés partent.</span>
          </span>
          <Switch checked={consent.analytics} onChange={(v) => store.set({ consent: { ...consent, analytics: v, decided: true } })} label="Consentement analytics" />
        </div>
        <div class="lab-log" aria-label="Journal des événements">
          {events.length === 0
            ? 'Aucun événement. Ouvre une fiche, lance une recherche…'
            : events
                .slice(0, 40)
                .map((e) => `${e.at.slice(11, 16)}  ${e.name} v${e.version} [${e.regime}]  ${JSON.stringify(e.props)}`)
                .join('\n')}
        </div>
      </section>

      <div class="stack">
        <button type="button" class="btn btn-secondary" onClick={() => runSearch()}>
          <Icon name="refresh" /> Relancer la recherche
        </button>
        <button type="button" class="btn btn-ghost" onClick={resetDemo}>
          Réinitialiser la démo
        </button>
      </div>
    </Modal>
  );
}
